from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ADMIN, DG, RF, get_current_user, require_roles
from ..models import Budget, Categorie, Nature, Utilisateur
from ..schemas import BudgetIn, BudgetOut, BudgetUpdate
from ..services import budgets as svc

router = APIRouter(prefix="/budgets", tags=["Budgets previsionnels"])


def sortie(db: Session, b: Budget) -> BudgetOut:
    out = BudgetOut.model_validate(b)
    for cle, valeur in svc.calculer(db, b).items():
        setattr(out, cle, valeur)
    return out


@router.get("", response_model=list[BudgetOut])
def lister(actifs_seulement: bool = True, db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(Budget).order_by(Budget.date_debut.desc(), Budget.id_budget.desc())
    if actifs_seulement:
        stmt = stmt.where(Budget.actif.is_(True))
    return [sortie(db, b) for b in db.scalars(stmt).unique()]


@router.post("", response_model=BudgetOut, status_code=201)
def creer(data: BudgetIn, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(ADMIN, DG, RF))):
    categorie = db.get(Categorie, data.id_categorie)
    if not categorie or not categorie.actif or categorie.nature != Nature.DEPENSE:
        raise HTTPException(400, "Un budget doit etre rattache a une categorie de depense active")
    fin = svc.fin_periode(data.date_debut, data.periode)
    chevauche = db.scalar(select(Budget.id_budget).where(
        Budget.id_categorie == data.id_categorie, Budget.actif.is_(True),
        Budget.date_debut <= fin, Budget.date_fin >= data.date_debut))
    if chevauche:
        raise HTTPException(400, "Un budget actif existe deja pour cette categorie sur cette periode")
    b = Budget(**data.model_dump(), date_fin=fin, id_utilisateur=user.id_utilisateur)
    db.add(b)
    db.commit()
    db.refresh(b)
    return sortie(db, b)


@router.put("/{id_budget}", response_model=BudgetOut)
def modifier(id_budget: int, data: BudgetUpdate, db: Session = Depends(get_db), _=Depends(require_roles(ADMIN, DG, RF))):
    b = db.get(Budget, id_budget)
    if not b:
        raise HTTPException(404, "Budget introuvable")
    b.montant_previsionnel = data.montant_previsionnel
    db.commit()
    return sortie(db, b)


@router.put("/{id_budget}/desactiver", response_model=BudgetOut)
def desactiver(id_budget: int, db: Session = Depends(get_db), _=Depends(require_roles(ADMIN, DG, RF))):
    b = db.get(Budget, id_budget)
    if not b:
        raise HTTPException(404, "Budget introuvable")
    b.actif = False
    db.commit()
    return sortie(db, b)
