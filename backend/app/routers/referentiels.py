from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ADMIN, DG, RF, get_current_user, require_roles
from ..models import Categorie, Client, Fournisseur, ModePaiement
from ..schemas import (CategorieIn, CategorieOut, ClientIn, ClientOut,
                       FournisseurIn, FournisseurOut, ModeOut)

ECRITURE = (ADMIN, DG, RF)


def crud_router(prefix: str, tag: str, Model, SchemaIn, SchemaOut, colonne_nom: str) -> APIRouter:
    """Fabrique un CRUD (lister, creer, modifier, desactiver) pour une table de reference."""
    router = APIRouter(prefix=prefix, tags=[tag])
    cle = list(Model.__table__.primary_key.columns)[0].name

    @router.get("", response_model=list[SchemaOut])
    def lister(q: str | None = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
        stmt = select(Model).order_by(getattr(Model, colonne_nom))
        if q:
            stmt = stmt.where(getattr(Model, colonne_nom).ilike(f"%{q}%"))
        return db.scalars(stmt).all()

    @router.post("", response_model=SchemaOut, status_code=201)
    def creer(data: SchemaIn, db: Session = Depends(get_db), _=Depends(require_roles(*ECRITURE))):
        obj = Model(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.put("/{identifiant}", response_model=SchemaOut)
    def modifier(identifiant: int, data: SchemaIn, db: Session = Depends(get_db),
                 _=Depends(require_roles(*ECRITURE))):
        obj = db.get(Model, identifiant)
        if not obj:
            raise HTTPException(404, "Introuvable")
        for champ, valeur in data.model_dump().items():
            setattr(obj, champ, valeur)
        db.commit()
        return obj

    @router.put("/{identifiant}/desactiver", response_model=SchemaOut)
    def desactiver(identifiant: int, db: Session = Depends(get_db), _=Depends(require_roles(*ECRITURE))):
        obj = db.get(Model, identifiant)
        if not obj:
            raise HTTPException(404, "Introuvable")
        obj.actif = False
        db.commit()
        return obj

    return router


categories = crud_router("/categories", "Categories", Categorie, CategorieIn, CategorieOut, "libelle_categorie")
clients = crud_router("/clients", "Clients", Client, ClientIn, ClientOut, "nom_client")
fournisseurs = crud_router("/fournisseurs", "Fournisseurs", Fournisseur, FournisseurIn, FournisseurOut, "nom_fournisseur")

modes = APIRouter(prefix="/modes-paiement", tags=["Modes de paiement"])


@modes.get("", response_model=list[ModeOut])
def lister_modes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.scalars(select(ModePaiement).order_by(ModePaiement.libelle_mode)).all()
