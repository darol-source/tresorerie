from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import (Categorie, CompteTresorerie, MouvementTresorerie, Statut, TypeMouvement)
from ..services.factures import totaux_creances_dettes
from ..services.tresorerie import D, somme_mouvements, solde_compte
from ..schemas import MouvementOut

router = APIRouter(prefix="/dashboard", tags=["Tableau de bord"])

ENC, DEC = TypeMouvement.ENCAISSEMENT, TypeMouvement.DECAISSEMENT


def repartition(db: Session, type_mouvement: TypeMouvement) -> list[dict]:
    M = MouvementTresorerie
    lignes = db.execute(
        select(Categorie.libelle_categorie, func.sum(M.montant))
        .join(Categorie, Categorie.id_categorie == M.id_categorie)
        .where(M.statut == Statut.VALIDE, M.type_mouvement == type_mouvement)
        .group_by(Categorie.libelle_categorie)
        .order_by(func.sum(M.montant).desc())
    ).all()
    total = sum((D(m) for _, m in lignes), Decimal("0"))
    return [
        {"categorie": nom, "montant": D(m),
         "pourcentage": round(float(D(m) / total * 100), 2) if total else 0.0}
        for nom, m in lignes
    ]


@router.get("")
def tableau_de_bord(db: Session = Depends(get_db), _=Depends(get_current_user)):
    M = MouvementTresorerie
    aujourdhui = date.today()
    debut_mois = aujourdhui.replace(day=1)

    comptes = db.scalars(select(CompteTresorerie).where(CompteTresorerie.actif.is_(True))).all()
    soldes = []
    for c in comptes:
        solde = solde_compte(db, c)
        soldes.append({
            "id_compte": c.id_compte, "libelle": c.libelle_compte, "type": c.type_compte.value,
            "solde": solde, "seuil_minimum": D(c.seuil_minimum), "solde_faible": solde < D(c.seuil_minimum),
        })
    solde_total = sum((s["solde"] for s in soldes), Decimal("0"))
    solde_initial = sum((D(c.solde_initial) for c in comptes), Decimal("0"))

    tr = somme_mouvements(db, ENC)
    td = somme_mouvements(db, DEC)
    taux_depenses = round(float(td / tr * 100), 2) if tr else None  # cas TR = 0

    # Evolution : solde de fin de mois (les transferts internes n'ont aucun effet sur le total)
    lignes = db.execute(
        select(extract("year", M.date_mouvement), extract("month", M.date_mouvement),
               M.type_mouvement, func.sum(M.montant))
        .where(M.statut == Statut.VALIDE)
        .group_by(extract("year", M.date_mouvement), extract("month", M.date_mouvement), M.type_mouvement)
    ).all()
    par_mois: dict[tuple[int, int], dict] = {}
    for annee, mois, type_mv, montant in lignes:
        cle = (int(annee), int(mois))
        entree = par_mois.setdefault(cle, {"recettes": Decimal("0"), "depenses": Decimal("0")})
        entree["recettes" if type_mv == ENC else "depenses"] += D(montant)
    evolution, cumul = [], solde_initial
    for (annee, mois) in sorted(par_mois):
        e = par_mois[(annee, mois)]
        cumul += e["recettes"] - e["depenses"]
        evolution.append({"mois": f"{annee}-{mois:02d}", "recettes": e["recettes"],
                          "depenses": e["depenses"], "solde": cumul})

    derniers = db.scalars(
        select(M).order_by(M.date_mouvement.desc(), M.id_mouvement.desc()).limit(8)
    ).unique().all()
    en_attente = db.scalar(select(func.count()).select_from(M).where(M.statut == Statut.BROUILLON)) or 0

    alertes = [f"Solde faible sur le compte {s['libelle']}" for s in soldes if s["solde_faible"]]
    if en_attente:
        alertes.append(f"{en_attente} operation(s) en attente de validation")

    tc, tdt = totaux_creances_dettes(db)

    return {
        "solde_total": solde_total,
        "total_recettes": tr,
        "total_depenses": td,
        "variation_nette": tr - td,
        "taux_depenses": taux_depenses,
        "recettes_jour": somme_mouvements(db, ENC, debut=aujourdhui, fin=aujourdhui),
        "depenses_jour": somme_mouvements(db, DEC, debut=aujourdhui, fin=aujourdhui),
        "recettes_mois": somme_mouvements(db, ENC, debut=debut_mois, fin=aujourdhui),
        "depenses_mois": somme_mouvements(db, DEC, debut=debut_mois, fin=aujourdhui),
        "soldes_comptes": soldes,
        "recettes_par_categorie": repartition(db, ENC),
        "depenses_par_categorie": repartition(db, DEC),
        "evolution": evolution[-12:],
        "dernieres_transactions": [MouvementOut.model_validate(m) for m in derniers],
        "operations_en_attente": en_attente,
        "total_creances": tc,
        "total_dettes": tdt,
        "position_nette": tc - tdt,
        "alertes": alertes,
    }
