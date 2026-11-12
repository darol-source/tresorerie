from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Facture, MouvementTresorerie, Statut, TypeFacture
from ..schemas import FactureOut
from .tresorerie import D


def payes_par_facture(db: Session) -> dict[int, Decimal]:
    """Paiements encaisses/decaisses (mouvements VALIDES) regroupes par facture."""
    M = MouvementTresorerie
    lignes = db.execute(
        select(M.id_facture, func.sum(M.montant))
        .where(M.statut == Statut.VALIDE, M.id_facture.is_not(None))
        .group_by(M.id_facture)
    ).all()
    return {i: D(m) for i, m in lignes}


def reste_facture(db: Session, facture: Facture) -> Decimal:
    M = MouvementTresorerie
    paye = D(db.scalar(select(func.coalesce(func.sum(M.montant), 0)).where(
        M.statut == Statut.VALIDE, M.id_facture == facture.id_facture)))
    return D(facture.montant) - paye


def enrichir(f: Facture, payes: dict[int, Decimal], aujourdhui: date | None = None) -> FactureOut:
    aujourdhui = aujourdhui or date.today()
    out = FactureOut.model_validate(f)
    paye = payes.get(f.id_facture, Decimal("0"))
    reste = D(f.montant) - paye
    out.montant_paye = paye
    out.reste = reste
    if f.annulee:
        out.statut_paiement = "ANNULEE"
    elif reste <= 0:
        out.statut_paiement = "PAYEE"
    else:
        out.statut_paiement = "PARTIELLE" if paye > 0 else "NON_PAYEE"
    jours = (aujourdhui - f.date_echeance).days  # JR = date actuelle - echeance
    out.jours_retard = jours if (reste > 0 and not f.annulee and jours > 0) else 0
    out.en_retard = out.jours_retard > 0
    return out


def factures_ouvertes(db: Session) -> list[FactureOut]:
    payes = payes_par_facture(db)
    factures = db.scalars(select(Facture).where(Facture.annulee.is_(False))).unique().all()
    sorties = [enrichir(f, payes) for f in factures]
    return [o for o in sorties if o.reste > 0]


def totaux_creances_dettes(db: Session) -> tuple[Decimal, Decimal]:
    tc = td = Decimal("0")
    for o in factures_ouvertes(db):
        if o.type_facture == TypeFacture.CREANCE:
            tc += o.reste
        else:
            td += o.reste
    return tc, td
