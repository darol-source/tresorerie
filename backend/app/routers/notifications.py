from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ROLES_VALIDATION, get_current_user
from ..models import Notification, Utilisateur
from ..schemas import NotificationOut
from ..services.notifications import generer_alertes

router = APIRouter(prefix="/notifications", tags=["Notifications et alertes"])


@router.get("/compteur")
def compteur(db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    generer_alertes(db, user.id_utilisateur, user.role_libelle in ROLES_VALIDATION)
    n = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.id_utilisateur == user.id_utilisateur, Notification.lu.is_(False)))
    return {"non_lues": n or 0}


@router.get("", response_model=list[NotificationOut])
def lister(non_lues: bool = False, db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    generer_alertes(db, user.id_utilisateur, user.role_libelle in ROLES_VALIDATION)
    stmt = select(Notification).where(Notification.id_utilisateur == user.id_utilisateur)
    if non_lues:
        stmt = stmt.where(Notification.lu.is_(False))
    return db.scalars(stmt.order_by(Notification.id_notification.desc()).limit(200)).all()


@router.put("/lire-tout")
def lire_tout(db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    db.execute(update(Notification).where(Notification.id_utilisateur == user.id_utilisateur).values(lu=True))
    db.commit()
    return {"ok": True}


@router.put("/{id_notification}/lue", response_model=NotificationOut)
def marquer_lue(id_notification: int, db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    n = db.get(Notification, id_notification)
    if not n or n.id_utilisateur != user.id_utilisateur:
        raise HTTPException(404, "Notification introuvable")
    n.lu = True
    db.commit()
    return n
