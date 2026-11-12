import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ADMIN, COMPTABLE, DG, RF, ROLES_VALIDATION, get_current_user, require_roles
from ..models import (CompteTresorerie, LigneReleve, MouvementTresorerie, Rapprochement,
                      Statut, StatutRapprochement, Transfert, TypeMouvement, Utilisateur)
from ..schemas import RapprochementIn, RapprochementOut, ValidationRapprochementIn
from ..services.tresorerie import D, solde_compte

router = APIRouter(prefix="/rapprochements", tags=["Rapprochement bancaire et controle de caisse"])
ROLES_RAPPRO = (ADMIN, DG, RF, COMPTABLE)
TOLERANCE_JOURS = 3


def charger(db: Session, id_rapprochement: int) -> Rapprochement:
    r = db.get(Rapprochement, id_rapprochement)
    if not r:
        raise HTTPException(404, "Rapprochement introuvable")
    return r


def operations_compte(db: Session, id_compte: int, apres: date | None, jusqua: date) -> list[dict]:
    """Operations validees du compte (montants signes) dans la fenetre ]apres ; jusqua]."""
    M, T = MouvementTresorerie, Transfert
    stmt = select(M).where(M.statut == Statut.VALIDE, M.id_compte == id_compte, M.date_mouvement <= jusqua)
    if apres:
        stmt = stmt.where(M.date_mouvement > apres)
    ops = [{"type": "MOUVEMENT", "id": m.id_mouvement, "date": m.date_mouvement, "reference": m.reference,
            "libelle": m.libelle, "montant": D(m.montant) if m.type_mouvement == TypeMouvement.ENCAISSEMENT else -D(m.montant)}
           for m in db.scalars(stmt).unique()]
    stmt = select(T).where(T.statut == Statut.VALIDE, or_(T.id_compte_source == id_compte, T.id_compte_destination == id_compte),
                           T.date_transfert <= jusqua)
    if apres:
        stmt = stmt.where(T.date_transfert > apres)
    ops += [{"type": "TRANSFERT", "id": t.id_transfert, "date": t.date_transfert, "reference": t.reference,
             "libelle": t.motif or "Transfert", "montant": -D(t.montant) if t.id_compte_source == id_compte else D(t.montant)}
            for t in db.scalars(stmt).unique()]
    return ops


def fenetre(db: Session, r: Rapprochement) -> date | None:
    return db.scalar(select(func.max(Rapprochement.date_rapprochement)).where(
        Rapprochement.id_compte == r.id_compte, Rapprochement.statut == StatutRapprochement.VALIDE,
        Rapprochement.date_rapprochement < r.date_rapprochement))


def parse_montant(texte: str) -> Decimal:
    return Decimal(texte.strip().replace("\u00a0", "").replace(" ", "").replace(",", "."))


def parse_date(texte: str) -> date:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(texte.strip(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Date illisible : {texte}")


@router.get("", response_model=list[RapprochementOut])
def lister(id_compte: int | None = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(Rapprochement).order_by(Rapprochement.date_rapprochement.desc(), Rapprochement.id_rapprochement.desc())
    if id_compte:
        stmt = stmt.where(Rapprochement.id_compte == id_compte)
    return db.scalars(stmt).unique().all()


@router.post("", response_model=RapprochementOut, status_code=201)
def creer(data: RapprochementIn, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(*ROLES_RAPPRO))):
    compte = db.get(CompteTresorerie, data.id_compte)
    if not compte or not compte.actif:
        raise HTTPException(400, "Compte inexistant ou inactif")
    comptable = solde_compte(db, compte, jusqua=data.date_rapprochement)
    r = Rapprochement(
        id_compte=data.id_compte, date_rapprochement=data.date_rapprochement,
        solde_reference=data.solde_reference, solde_comptable=comptable,
        ecart=D(data.solde_reference) - comptable,  # EC = reel - theorique ; EB = releve - comptable
        commentaire=data.commentaire, id_utilisateur=user.id_utilisateur,
    )
    db.add(r)
    db.commit()
    return charger(db, r.id_rapprochement)


@router.post("/{id_rapprochement}/releve", response_model=dict)
async def importer_releve(id_rapprochement: int, fichier: UploadFile = File(...), db: Session = Depends(get_db),
                          _=Depends(require_roles(*ROLES_RAPPRO))):
    """CSV avec colonnes date;libelle;montant (montant positif = entree, negatif = sortie)."""
    r = charger(db, id_rapprochement)
    if r.statut == StatutRapprochement.VALIDE:
        raise HTTPException(400, "Rapprochement deja valide")
    brut = await fichier.read(2 * 1024 * 1024 + 1)
    if len(brut) > 2 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (2 Mo maximum)")
    try:
        texte = brut.decode("utf-8-sig")
    except UnicodeDecodeError:
        texte = brut.decode("latin-1")
    delimiteur = ";" if texte.split("\n", 1)[0].count(";") else ","
    lecteur = csv.DictReader(io.StringIO(texte), delimiter=delimiteur)
    if not lecteur.fieldnames or not {"date", "libelle", "montant"} <= {h.strip().lower() for h in lecteur.fieldnames}:
        raise HTTPException(400, "Colonnes attendues : date;libelle;montant")
    lignes = []
    for i, brute in enumerate(lecteur, start=2):
        ligne = {k.strip().lower(): (v or "") for k, v in brute.items() if k}
        try:
            lignes.append(LigneReleve(id_rapprochement=id_rapprochement, date_operation=parse_date(ligne["date"]),
                                      libelle=ligne["libelle"][:255], montant=parse_montant(ligne["montant"])))
        except (ValueError, InvalidOperation) as e:
            raise HTTPException(400, f"Ligne {i} invalide : {e}")

    operations = operations_compte(db, r.id_compte, fenetre(db, r), r.date_rapprochement)
    pris: set[tuple[str, int]] = set()
    for l in lignes:  # correspondance : meme montant signe, date a +/- 3 jours, la plus proche gagne
        candidats = [o for o in operations if (o["type"], o["id"]) not in pris and o["montant"] == l.montant
                     and abs((o["date"] - l.date_operation).days) <= TOLERANCE_JOURS]
        if candidats:
            meilleur = min(candidats, key=lambda o: abs((o["date"] - l.date_operation).days))
            l.type_correspondance, l.id_correspondance = meilleur["type"], meilleur["id"]
            pris.add((meilleur["type"], meilleur["id"]))
    db.execute(delete(LigneReleve).where(LigneReleve.id_rapprochement == id_rapprochement))
    db.add_all(lignes)
    db.commit()
    return {"lignes_importees": len(lignes), "rapprochees": len(pris), "non_rapprochees": len(lignes) - len(pris)}


@router.get("/{id_rapprochement}")
def detail(id_rapprochement: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    r = charger(db, id_rapprochement)
    lignes = db.scalars(select(LigneReleve).where(LigneReleve.id_rapprochement == id_rapprochement)
                        .order_by(LigneReleve.date_operation)).all()
    pris = {(l.type_correspondance, l.id_correspondance) for l in lignes if l.type_correspondance}
    operations = operations_compte(db, r.id_compte, fenetre(db, r), r.date_rapprochement)
    ops_non = [o for o in operations if (o["type"], o["id"]) not in pris]
    releve_non = [l for l in lignes if not l.type_correspondance]
    return {
        "rapprochement": RapprochementOut.model_validate(r),
        "lignes_releve": [{"id_ligne": l.id_ligne, "date": l.date_operation, "libelle": l.libelle,
                           "montant": l.montant, "rapprochee": bool(l.type_correspondance)} for l in lignes],
        "releve_non_rapproche": [{"date": l.date_operation, "libelle": l.libelle, "montant": l.montant} for l in releve_non],
        "operations_non_rapprochees": ops_non,
        "nombre_non_rapprochees": len(releve_non) + len(ops_non),
    }


@router.post("/{id_rapprochement}/valider", response_model=RapprochementOut)
def valider(id_rapprochement: int, data: ValidationRapprochementIn, db: Session = Depends(get_db),
            _=Depends(require_roles(*ROLES_VALIDATION))):
    r = charger(db, id_rapprochement)
    if r.statut == StatutRapprochement.VALIDE:
        raise HTTPException(400, "Deja valide")
    commentaire = data.commentaire or r.commentaire
    if r.anomalie and not commentaire:
        raise HTTPException(400, "Un ecart non nul doit etre justifie par un commentaire")
    r.commentaire = commentaire
    r.statut = StatutRapprochement.VALIDE
    db.commit()
    return r
