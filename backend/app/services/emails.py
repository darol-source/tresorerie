"""Rappels automatiques par e-mail aux clients ayant une creance impayee."""
import html
import logging
import smtplib
import ssl
import threading
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import Client, RappelEmail, TypeFacture
from ..schemas import FactureOut
from .factures import factures_ouvertes

log = logging.getLogger("rappels")
_arret = threading.Event()


# ---------------------------------------------------------------- configuration
def calendrier() -> list[int]:
    try:
        offsets = sorted({int(x) for x in settings.rappels_calendrier.split(",") if x.strip()})
    except ValueError:
        offsets = [-3, 0, 1, 7, 15]
    return offsets or [-3, 0, 1, 7, 15]


def smtp_configure() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def etape_courante(jours_depuis_echeance: int, offsets: list[int]) -> int | None:
    """Derniere etape du calendrier atteinte (None si trop tot). Les etapes manquees ne sont pas rejouees."""
    atteintes = [o for o in offsets if o <= jours_depuis_echeance]
    return max(atteintes) if atteintes else None


def _ar(valeur) -> str:
    return f"{Decimal(str(valeur)):,.0f}".replace(",", " ") + " Ar"


def _date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


# ---------------------------------------------------------------- contenu
def construire(f: FactureOut, client: Client, etape: int) -> tuple[str, str, str]:
    """Retourne (objet, texte, html). etape < 0 : avant echeance ; 0 : jour J ; > 0 : retard."""
    ech = _date(f.date_echeance)
    if etape < 0:
        jours = (f.date_echeance - date.today()).days
        objet = f"Rappel : facture {f.reference} à échéance le {ech}"
        intro = f"Nous vous rappelons que la facture ci-dessous arrive à échéance le {ech}" + (f" (dans {jours} jour(s))." if jours > 0 else ".")
        cloture = "Nous vous remercions de bien vouloir procéder à son règlement dans les délais."
    elif etape == 0:
        objet = f"Facture {f.reference} : échéance aujourd'hui"
        intro = "La facture ci-dessous arrive à échéance aujourd'hui."
        cloture = "Nous vous remercions de bien vouloir procéder à son règlement."
    else:
        objet = f"Facture {f.reference} en retard de paiement ({f.jours_retard} jour(s))"
        intro = (f"Sauf erreur de notre part, la facture ci-dessous, échue le {ech}, reste impayée à ce jour "
                 f"({f.jours_retard} jour(s) de retard).")
        cloture = ("Nous vous remercions de bien vouloir régulariser cette situation rapidement. "
                   "Si vous avez déjà effectué ce paiement, merci de ne pas tenir compte de ce message.")

    lignes = [
        ("Facture", f.reference), ("Date de la facture", _date(f.date_facture)), ("Échéance", ech),
        ("Montant de la facture", _ar(f.montant)), ("Déjà réglé", _ar(f.montant_paye)), ("Reste à payer", _ar(f.reste)),
    ]
    signature = "\n".join(x for x in (settings.societe_nom, settings.societe_contact) if x)
    texte = (f"Bonjour {client.nom_client},\n\n{intro}\n\n"
             + "\n".join(f"{k} : {v}" for k, v in lignes)
             + f"\n\n{cloture}\n\nCordialement,\n{signature}\n")
    e = html.escape
    corps = "".join(f"<tr><td style='padding:4px 12px 4px 0;color:#555'>{e(k)}</td><td><b>{e(v)}</b></td></tr>" for k, v in lignes)
    page = (f"<div style='font-family:Arial,sans-serif;font-size:14px;color:#222'><p>Bonjour {e(client.nom_client)},</p>"
            f"<p>{e(intro)}</p><table>{corps}</table><p>{e(cloture)}</p>"
            f"<p>Cordialement,<br>{e(settings.societe_nom)}<br>{e(settings.societe_contact)}</p></div>")
    return objet, texte, page


# ---------------------------------------------------------------- envoi
def destination(email_client: str) -> tuple[str, str]:
    """(adresse reelle d'envoi, prefixe d'objet). En mode test, tout part vers l'adresse de test."""
    if settings.email_test_destinataire:
        return settings.email_test_destinataire, "[TEST] "
    return email_client, ""


def _transport(msg: EmailMessage) -> None:
    if settings.smtp_tls == "ssl":
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30,
                              context=ssl.create_default_context()) as s:
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as s:
        if settings.smtp_tls == "starttls":
            s.starttls(context=ssl.create_default_context())
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


def envoyer(a: str, objet: str, texte: str, page: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"] = formataddr((settings.societe_nom, settings.smtp_from))
    msg["To"] = a
    msg["Subject"] = objet
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    if settings.smtp_reply_to:
        msg["Reply-To"] = settings.smtp_reply_to
    msg.set_content(texte)
    if page:
        msg.add_alternative(page, subtype="html")
    _transport(msg)


# ---------------------------------------------------------------- planification
def planifier(db: Session, aujourdhui: date | None = None) -> tuple[list[dict], list[dict]]:
    """Rappels a envoyer maintenant et creances ignorees (client sans e-mail). N'envoie rien."""
    aujourdhui = aujourdhui or date.today()
    offsets = calendrier()
    a_envoyer, ignores = [], []
    for f in factures_ouvertes(db):
        if f.type_facture != TypeFacture.CREANCE or not f.id_client:
            continue
        etape = etape_courante((aujourdhui - f.date_echeance).days, offsets)
        if etape is None:
            continue
        cle = f"{f.id_facture}:S{etape}"
        if db.scalar(select(RappelEmail.id_rappel).where(RappelEmail.cle_unique == cle)):
            continue  # deja envoye (ou en cours d'envoi) pour cette etape
        client = db.get(Client, f.id_client)
        if not client or not client.actif:
            continue
        email = (client.email or "").strip()
        if "@" not in email:
            ignores.append({"id_facture": f.id_facture, "reference": f.reference, "client": client.nom_client,
                            "raison": "Client sans adresse e-mail valide"})
            continue
        objet, texte, page = construire(f, client, etape)
        reel, prefixe = destination(email)
        a_envoyer.append({"id_facture": f.id_facture, "reference": f.reference, "client": client.nom_client,
                          "email": email, "envoye_a": reel, "etape": etape, "cle": cle,
                          "objet": prefixe + objet, "texte": texte, "html": page})
    return a_envoyer, ignores


def envoyer_rappels(db: Session, items: list[dict], id_utilisateur: int | None = None) -> list[dict]:
    resultats = []
    for it in items[: settings.rappels_max_par_execution]:
        ligne = RappelEmail(id_facture=it["id_facture"], type_rappel="AUTO", etape=it["etape"], destinataire=it["email"],
                            envoye_a=it["envoye_a"], objet=it["objet"][:255], statut="EN_COURS",
                            cle_unique=it["cle"], id_utilisateur=id_utilisateur)
        db.add(ligne)
        try:
            db.commit()  # la contrainte d'unicite garantit qu'un seul processus envoie ce rappel
        except IntegrityError:
            db.rollback()
            continue
        erreur = None
        try:
            envoyer(it["envoye_a"], it["objet"], it["texte"], it["html"])
            ligne.statut = "ENVOYE"
        except Exception as e:  # SMTP, reseau, adresse invalide...
            erreur = str(e)[:250]
            ligne.statut, ligne.erreur, ligne.cle_unique = "ECHEC", erreur, None  # liberee : nouvel essai possible
            log.warning("Echec rappel %s : %s", it["reference"], e.__class__.__name__)
        db.commit()
        resultats.append({"reference": it["reference"], "client": it["client"], "email": it["envoye_a"],
                          "statut": ligne.statut, "erreur": erreur})
        if settings.rappels_pause_secondes:
            time.sleep(settings.rappels_pause_secondes)
    return resultats


def envoyer_manuel(db: Session, id_facture: int, id_utilisateur: int) -> RappelEmail:
    if not smtp_configure():
        raise HTTPException(400, "L'envoi d'e-mails n'est pas configure (SMTP_HOST et SMTP_FROM dans .env)")
    f = next((x for x in factures_ouvertes(db) if x.id_facture == id_facture), None)
    if not f:
        raise HTTPException(404, "Facture introuvable ou deja soldee")
    if f.type_facture != TypeFacture.CREANCE:
        raise HTTPException(400, "Un rappel ne concerne que les creances clients")
    client = db.get(Client, f.id_client)
    email = (client.email or "").strip() if client else ""
    if "@" not in email:
        raise HTTPException(400, "Ce client n'a pas d'adresse e-mail : ajoutez-la dans Clients et fournisseurs")
    jours = (date.today() - f.date_echeance).days
    etape = -1 if jours < 0 else 0 if jours == 0 else 1
    objet, texte, page = construire(f, client, etape)
    reel, prefixe = destination(email)
    ligne = RappelEmail(id_facture=id_facture, type_rappel="MANUEL", etape=etape, destinataire=email, envoye_a=reel,
                        objet=(prefixe + objet)[:255], statut="EN_COURS", id_utilisateur=id_utilisateur)
    db.add(ligne)
    db.commit()
    try:
        envoyer(reel, prefixe + objet, texte, page)
        ligne.statut = "ENVOYE"
        db.commit()
    except Exception as e:
        ligne.statut, ligne.erreur = "ECHEC", str(e)[:250]
        db.commit()
        raise HTTPException(502, f"Envoi impossible : {e.__class__.__name__}. Verifiez la configuration SMTP.")
    return ligne


# ---------------------------------------------------------------- planificateur quotidien
def _executer_auto() -> None:
    if not smtp_configure():
        log.warning("Rappels automatiques actives mais SMTP non configure")
        return
    with SessionLocal() as db:
        items, _ = planifier(db)
        envoyer_rappels(db, items)


def demarrer_planificateur() -> threading.Thread | None:
    """Lance une tache de fond : une passe 1 minute apres le demarrage, puis chaque jour a RAPPELS_HEURE."""
    if not settings.rappels_auto:
        return None
    _arret.clear()

    def boucle():
        if _arret.wait(60):
            return
        while not _arret.is_set():
            try:
                _executer_auto()
            except Exception:
                log.exception("Erreur dans les rappels automatiques")
            maintenant = datetime.now()
            prochain = maintenant.replace(hour=settings.rappels_heure, minute=0, second=0, microsecond=0)
            if prochain <= maintenant:
                prochain += timedelta(days=1)
            if _arret.wait((prochain - maintenant).total_seconds()):
                return

    t = threading.Thread(target=boucle, daemon=True, name="rappels-email")
    t.start()
    return t


def arreter_planificateur() -> None:
    _arret.set()
