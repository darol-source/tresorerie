import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import CompteTresorerie, MouvementTresorerie, Statut, Transfert, TypeMouvement

CENTIME = Decimal("0.01")


def D(valeur) -> Decimal:
    return Decimal(str(valeur or 0))


def generer_reference(prefixe: str) -> str:
    return f"{prefixe}-{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"


def somme_mouvements(db: Session, type_mouvement: TypeMouvement, id_compte: int | None = None,
                     debut: date | None = None, fin: date | None = None) -> Decimal:
    stmt = select(func.coalesce(func.sum(MouvementTresorerie.montant), 0)).where(
        MouvementTresorerie.statut == Statut.VALIDE,
        MouvementTresorerie.type_mouvement == type_mouvement,
    )
    if id_compte is not None:
        stmt = stmt.where(MouvementTresorerie.id_compte == id_compte)
    if debut:
        stmt = stmt.where(MouvementTresorerie.date_mouvement >= debut)
    if fin:
        stmt = stmt.where(MouvementTresorerie.date_mouvement <= fin)
    return D(db.scalar(stmt))


def somme_transferts(db: Session, colonne, id_compte: int, fin: date | None = None) -> Decimal:
    stmt = select(func.coalesce(func.sum(Transfert.montant), 0)).where(
        colonne == id_compte, Transfert.statut == Statut.VALIDE
    )
    if fin:
        stmt = stmt.where(Transfert.date_transfert <= fin)
    return D(db.scalar(stmt))


def solde_compte(db: Session, compte: CompteTresorerie, jusqua: date | None = None) -> Decimal:
    """SC = SI + RE - DE + TE - TS (operations validees uniquement, jusqu'a une date optionnelle)."""
    re = somme_mouvements(db, TypeMouvement.ENCAISSEMENT, compte.id_compte, fin=jusqua)
    de = somme_mouvements(db, TypeMouvement.DECAISSEMENT, compte.id_compte, fin=jusqua)
    te = somme_transferts(db, Transfert.id_compte_destination, compte.id_compte, jusqua)
    ts = somme_transferts(db, Transfert.id_compte_source, compte.id_compte, jusqua)
    return (D(compte.solde_initial) + re - de + te - ts).quantize(CENTIME)
