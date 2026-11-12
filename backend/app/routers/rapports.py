from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import (Categorie, CompteTresorerie, MouvementTresorerie, Statut, TypeFacture,
                      TypeMouvement, Utilisateur)
from ..services import exports
from ..services.factures import factures_ouvertes
from ..services.tresorerie import D, somme_mouvements
from . import mouvements as r_mouvements

router = APIRouter(prefix="/rapports", tags=["Rapports et exports"])
ENC, DEC = TypeMouvement.ENCAISSEMENT, TypeMouvement.DECAISSEMENT
FORMAT = Query("xlsx", alias="format", pattern="^(xlsx|pdf|csv)$")


def pct(a: Decimal, b: Decimal):
    return round(float((a - b) / b * 100), 2) if b else None


def par_categorie(db: Session, type_mv: TypeMouvement, debut: date, fin: date) -> list[dict]:
    M = MouvementTresorerie
    lignes = db.execute(
        select(Categorie.libelle_categorie, func.sum(M.montant))
        .join(Categorie, Categorie.id_categorie == M.id_categorie)
        .where(M.statut == Statut.VALIDE, M.type_mouvement == type_mv,
               M.date_mouvement >= debut, M.date_mouvement <= fin)
        .group_by(Categorie.libelle_categorie).order_by(func.sum(M.montant).desc())).all()
    total = sum((D(m) for _, m in lignes), Decimal("0"))
    return [{"categorie": n, "montant": D(m), "pourcentage": round(float(D(m) / total * 100), 2) if total else 0.0}
            for n, m in lignes]


def calculer_rapport(db: Session, debut: date, fin: date) -> dict:
    if debut > fin:
        raise HTTPException(400, "Periode invalide")
    si_total = sum((D(c.solde_initial) for c in db.scalars(
        select(CompteTresorerie).where(CompteTresorerie.actif.is_(True)))), Decimal("0"))
    veille = debut - timedelta(days=1)
    sip = si_total + somme_mouvements(db, ENC, fin=veille) - somme_mouvements(db, DEC, fin=veille)
    trp, tdp = somme_mouvements(db, ENC, debut=debut, fin=fin), somme_mouvements(db, DEC, debut=debut, fin=fin)
    sfp = sip + trp - tdp
    duree = (fin - debut).days + 1
    prec_fin = veille
    prec_debut = prec_fin - timedelta(days=duree - 1)
    rec_prec, dep_prec = somme_mouvements(db, ENC, debut=prec_debut, fin=prec_fin), somme_mouvements(db, DEC, debut=prec_debut, fin=prec_fin)
    return {
        "debut": debut, "fin": fin, "solde_initial": sip, "total_recettes": trp, "total_depenses": tdp,
        "solde_final": sfp, "variation_tresorerie": sfp - sip,
        "periode_precedente": {"debut": prec_debut, "fin": prec_fin, "recettes": rec_prec, "depenses": dep_prec},
        "variation_recettes_pct": pct(trp, rec_prec), "variation_depenses_pct": pct(tdp, dep_prec),
        "recettes_par_categorie": par_categorie(db, ENC, debut, fin),
        "depenses_par_categorie": par_categorie(db, DEC, debut, fin),
    }


@router.get("/periode")
def rapport_periode(debut: date, fin: date, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return calculer_rapport(db, debut, fin)


@router.get("/periode/export")
def exporter_rapport(debut: date, fin: date, fmt: str = FORMAT, db: Session = Depends(get_db), _=Depends(get_current_user)):
    r = calculer_rapport(db, debut, fin)
    pc = lambda v: "n/a" if v is None else f"{v} %"
    sections = [
        ("Indicateurs", ["Indicateur", "Valeur"], [
            ["Solde initial de la periode", r["solde_initial"]], ["Total des recettes", r["total_recettes"]],
            ["Total des depenses", r["total_depenses"]], ["Solde final de la periode", r["solde_final"]],
            ["Variation de tresorerie", r["variation_tresorerie"]],
            ["Evolution des recettes vs periode precedente", pc(r["variation_recettes_pct"])],
            ["Evolution des depenses vs periode precedente", pc(r["variation_depenses_pct"])],
        ]),
        ("Recettes par categorie", ["Categorie", "Montant", "%"],
         [[c["categorie"], c["montant"], c["pourcentage"]] for c in r["recettes_par_categorie"]]),
        ("Depenses par categorie", ["Categorie", "Montant", "%"],
         [[c["categorie"], c["montant"], c["pourcentage"]] for c in r["depenses_par_categorie"]]),
    ]
    return exports.reponse(fmt, "Rapport de tresorerie", sections, f"rapport_{debut}_{fin}", f"Periode du {debut} au {fin}")


@router.get("/mouvements/export")
def exporter_mouvements(date_debut: date | None = None, date_fin: date | None = None,
                        type_mouvement: TypeMouvement | None = None, statut: Statut | None = None,
                        id_compte: int | None = None, id_categorie: int | None = None, q: str | None = None,
                        fmt: str = FORMAT, db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    lignes = r_mouvements.lister(
        date_debut=date_debut, date_fin=date_fin, type_mouvement=type_mouvement, statut=statut,
        id_compte=id_compte, id_categorie=id_categorie, id_client=None, id_fournisseur=None, q=q,
        skip=0, limit=5000, db=db, _=user)
    entetes = ["Date", "Reference", "Libelle", "Type", "Categorie", "Compte", "Mode", "Montant", "Statut", "Saisi par"]
    data = [[m.date_mouvement, m.reference, m.libelle, m.type_mouvement.value, m.categorie_libelle, m.compte_libelle,
             m.mode_libelle, D(m.montant), m.statut.value, m.utilisateur_nom] for m in lignes]
    return exports.reponse(fmt, "Journal des mouvements", [("Mouvements", entetes, data)], "mouvements")


@router.get("/factures/export")
def exporter_factures(type_facture: TypeFacture | None = None, fmt: str = FORMAT,
                      db: Session = Depends(get_db), _=Depends(get_current_user)):
    ouvertes = [f for f in factures_ouvertes(db) if not type_facture or f.type_facture == type_facture]
    entetes = ["Reference", "Type", "Tiers", "Echeance", "Montant", "Paye", "Reste", "Jours de retard"]
    data = [[f.reference, f.type_facture.value, f.tiers_nom, f.date_echeance, D(f.montant), f.montant_paye, f.reste,
             f.jours_retard] for f in ouvertes]
    titre = "Etat des creances et dettes" if not type_facture else (
        "Etat des creances" if type_facture == TypeFacture.CREANCE else "Etat des dettes")
    return exports.reponse(fmt, titre, [("Factures ouvertes", entetes, data)], "factures_ouvertes")
