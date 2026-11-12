from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ADMIN, DG, RF, get_current_user, require_roles
from ..models import CompteTresorerie
from ..schemas import CompteIn, CompteOut, CompteUpdate
from ..services.tresorerie import D, solde_compte

router = APIRouter(prefix="/comptes", tags=["Comptes de tresorerie"])


def enrichir(db: Session, compte: CompteTresorerie) -> CompteOut:
    sortie = CompteOut.model_validate(compte)
    sortie.solde_actuel = solde_compte(db, compte)
    sortie.solde_faible = sortie.solde_actuel < D(compte.seuil_minimum)
    return sortie


@router.get("", response_model=list[CompteOut])
def lister(actifs_seulement: bool = False, db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(CompteTresorerie).order_by(CompteTresorerie.libelle_compte)
    if actifs_seulement:
        stmt = stmt.where(CompteTresorerie.actif.is_(True))
    return [enrichir(db, c) for c in db.scalars(stmt)]


@router.post("", response_model=CompteOut, status_code=201)
def creer(data: CompteIn, db: Session = Depends(get_db), _=Depends(require_roles(ADMIN, DG, RF))):
    compte = CompteTresorerie(**data.model_dump())
    db.add(compte)
    db.commit()
    db.refresh(compte)
    return enrichir(db, compte)


@router.put("/{id_compte}", response_model=CompteOut)
def modifier(id_compte: int, data: CompteUpdate, db: Session = Depends(get_db),
             _=Depends(require_roles(ADMIN, DG, RF))):
    compte = db.get(CompteTresorerie, id_compte)
    if not compte:
        raise HTTPException(404, "Compte introuvable")
    for champ, valeur in data.model_dump(exclude_unset=True).items():
        setattr(compte, champ, valeur)
    db.commit()
    return enrichir(db, compte)
