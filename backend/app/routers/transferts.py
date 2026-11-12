from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ROLES_SAISIE, ROLES_VALIDATION, get_current_user, require_roles
from ..models import CompteTresorerie, Statut, Transfert, Utilisateur
from ..schemas import AnnulationIn, TransfertIn, TransfertOut
from ..services.tresorerie import D, generer_reference, solde_compte

router = APIRouter(prefix="/transferts", tags=["Transferts de fonds"])


def verrouiller(db: Session, *ids: int) -> dict[int, CompteTresorerie]:
    """Verrouille les comptes dans un ordre fixe pour eviter les interblocages."""
    comptes = db.scalars(
        select(CompteTresorerie).where(CompteTresorerie.id_compte.in_(ids))
        .order_by(CompteTresorerie.id_compte).with_for_update()
    ).all()
    return {c.id_compte: c for c in comptes}


@router.get("", response_model=list[TransfertOut])
def lister(db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(Transfert).order_by(Transfert.date_transfert.desc(), Transfert.id_transfert.desc())
    return db.scalars(stmt).unique().all()


@router.post("", response_model=TransfertOut, status_code=201)
def creer(data: TransfertIn, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(*ROLES_SAISIE))):
    if data.id_compte_source == data.id_compte_destination:
        raise HTTPException(400, "Les comptes source et destination doivent etre differents")
    comptes = verrouiller(db, data.id_compte_source, data.id_compte_destination)
    source, dest = comptes.get(data.id_compte_source), comptes.get(data.id_compte_destination)
    if not source or not dest or not source.actif or not dest.actif:
        raise HTTPException(400, "Compte inexistant ou inactif")
    if source.devise != dest.devise:
        raise HTTPException(400, "Les deux comptes doivent avoir la meme devise")
    if solde_compte(db, source) < D(data.montant):
        raise HTTPException(400, "Solde insuffisant sur le compte source")
    transfert = Transfert(
        **data.model_dump(), reference=generer_reference("TRF"),
        statut=Statut.VALIDE, id_utilisateur=user.id_utilisateur,
    )
    db.add(transfert)
    db.commit()
    db.refresh(transfert)
    return transfert


@router.post("/{id_transfert}/annuler", response_model=TransfertOut)
def annuler(id_transfert: int, data: AnnulationIn, db: Session = Depends(get_db),
            _=Depends(require_roles(*ROLES_VALIDATION))):
    transfert = db.get(Transfert, id_transfert)
    if not transfert:
        raise HTTPException(404, "Transfert introuvable")
    if transfert.statut == Statut.ANNULE:
        raise HTTPException(400, "Deja annule")
    comptes = verrouiller(db, transfert.id_compte_source, transfert.id_compte_destination)
    if solde_compte(db, comptes[transfert.id_compte_destination]) < D(transfert.montant):
        raise HTTPException(400, "Annulation impossible : le solde du compte destinataire deviendrait negatif")
    transfert.statut = Statut.ANNULE
    transfert.motif_annulation = data.motif
    db.commit()
    return transfert
