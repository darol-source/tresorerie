from calendar import monthrange
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Budget, MouvementTresorerie, PeriodeBudget, Statut, TypeMouvement
from .tresorerie import D

MOIS = {PeriodeBudget.MENSUEL: 1, PeriodeBudget.TRIMESTRIEL: 3, PeriodeBudget.ANNUEL: 12}


def fin_periode(debut: date, periode: PeriodeBudget) -> date:
    m = debut.month - 1 + MOIS[periode]
    annee, mois = debut.year + m // 12, m % 12 + 1
    jour = min(debut.day, monthrange(annee, mois)[1])
    return date(annee, mois, jour) - timedelta(days=1)


def depenses_reelles(db: Session, id_categorie: int, debut: date, fin: date):
    M = MouvementTresorerie
    return D(db.scalar(select(func.coalesce(func.sum(M.montant), 0)).where(
        M.statut == Statut.VALIDE, M.type_mouvement == TypeMouvement.DECAISSEMENT,
        M.id_categorie == id_categorie, M.date_mouvement >= debut, M.date_mouvement <= fin)))


def calculer(db: Session, b: Budget) -> dict:
    dr = depenses_reelles(db, b.id_categorie, b.date_debut, b.date_fin)
    bp = D(b.montant_previsionnel)
    eb = bp - dr  # BR = EB = BP - DR
    return {
        "depenses_reelles": dr,
        "budget_restant": eb,
        "taux_consommation": round(float(dr / bp * 100), 2) if bp else None,
        "depassement": max(dr - bp, D(0)),
        "ecart": eb,
        "etat": "DEPASSE" if eb < 0 else "EXACT" if eb == 0 else "RESPECTE",
    }
