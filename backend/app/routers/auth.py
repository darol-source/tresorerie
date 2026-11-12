import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ADMIN, get_current_user, require_roles
from ..models import Role, Utilisateur
from ..schemas import (ChangementMotDePasseIn, MotDePasseIn, RoleOut, Token, UtilisateurIn,
                       UtilisateurOut, UtilisateurUpdate)
from ..security import create_token, hash_password, verify_password

router = APIRouter(tags=["Authentification"])

MAX_ECHECS, FENETRE_SECONDES = 5, 900
_ECHECS: dict[str, deque] = defaultdict(deque)  # tentatives echouees par e-mail (par processus)


def _verifier_verrou(cle: str) -> None:
    file, maintenant = _ECHECS[cle], time.time()
    while file and maintenant - file[0] > FENETRE_SECONDES:
        file.popleft()
    if not file:
        _ECHECS.pop(cle, None)
    elif len(file) >= MAX_ECHECS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Trop de tentatives de connexion. Reessayez dans 15 minutes.")


@router.post("/auth/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    cle = form.username.strip().lower()
    _verifier_verrou(cle)
    user = db.scalar(select(Utilisateur).where(Utilisateur.email == form.username))
    if not user or not user.actif or not verify_password(form.password, user.mot_de_passe):
        _ECHECS[cle].append(time.time())
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants incorrects")
    _ECHECS.pop(cle, None)
    return Token(access_token=create_token(user.id_utilisateur))


@router.get("/auth/me", response_model=UtilisateurOut)
def me(user: Utilisateur = Depends(get_current_user)):
    return user


@router.post("/auth/mot-de-passe")
def changer_mon_mot_de_passe(data: ChangementMotDePasseIn, db: Session = Depends(get_db),
                             user: Utilisateur = Depends(get_current_user)):
    if not verify_password(data.ancien, user.mot_de_passe):
        raise HTTPException(400, "L'ancien mot de passe est incorrect")
    if data.ancien == data.nouveau:
        raise HTTPException(400, "Le nouveau mot de passe doit etre different de l'ancien")
    user.mot_de_passe = hash_password(data.nouveau)
    db.commit()
    return {"ok": True}


@router.get("/roles", response_model=list[RoleOut])
def lister_roles(db: Session = Depends(get_db), _=Depends(require_roles(ADMIN))):
    return db.scalars(select(Role).order_by(Role.id_role)).all()


@router.get("/utilisateurs", response_model=list[UtilisateurOut])
def lister_utilisateurs(db: Session = Depends(get_db), _=Depends(require_roles(ADMIN))):
    return db.scalars(select(Utilisateur).order_by(Utilisateur.nom, Utilisateur.prenom)).unique().all()


def _charger(db: Session, id_utilisateur: int) -> Utilisateur:
    user = db.get(Utilisateur, id_utilisateur)
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    return user


@router.post("/utilisateurs", response_model=UtilisateurOut, status_code=201)
def creer_utilisateur(data: UtilisateurIn, db: Session = Depends(get_db), _=Depends(require_roles(ADMIN))):
    if db.scalar(select(Utilisateur).where(Utilisateur.email == data.email)):
        raise HTTPException(400, "Cet email est deja utilise")
    if not db.get(Role, data.id_role):
        raise HTTPException(400, "Role inconnu")
    user = Utilisateur(
        nom=data.nom, prenom=data.prenom, email=data.email,
        mot_de_passe=hash_password(data.mot_de_passe), id_role=data.id_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/utilisateurs/{id_utilisateur}", response_model=UtilisateurOut)
def modifier_utilisateur(id_utilisateur: int, data: UtilisateurUpdate, db: Session = Depends(get_db),
                         admin: Utilisateur = Depends(require_roles(ADMIN))):
    user = _charger(db, id_utilisateur)
    champs = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "id_role" in champs and champs["id_role"] != user.id_role:
        if user.id_utilisateur == admin.id_utilisateur:
            raise HTTPException(400, "Vous ne pouvez pas modifier votre propre role")
        if not db.get(Role, champs["id_role"]):
            raise HTTPException(400, "Role inconnu")
    if "email" in champs and champs["email"] != user.email:
        if db.scalar(select(Utilisateur.id_utilisateur).where(Utilisateur.email == champs["email"])):
            raise HTTPException(400, "Cet email est deja utilise")
    for champ, valeur in champs.items():
        setattr(user, champ, valeur)
    db.commit()
    db.refresh(user)
    return user


@router.put("/utilisateurs/{id_utilisateur}/desactiver", response_model=UtilisateurOut)
def desactiver_utilisateur(id_utilisateur: int, db: Session = Depends(get_db),
                           admin: Utilisateur = Depends(require_roles(ADMIN))):
    user = _charger(db, id_utilisateur)
    if user.id_utilisateur == admin.id_utilisateur:
        raise HTTPException(400, "Vous ne pouvez pas vous desactiver vous-meme")
    user.actif = False
    db.commit()
    return user


@router.put("/utilisateurs/{id_utilisateur}/activer", response_model=UtilisateurOut)
def activer_utilisateur(id_utilisateur: int, db: Session = Depends(get_db), _=Depends(require_roles(ADMIN))):
    user = _charger(db, id_utilisateur)
    user.actif = True
    db.commit()
    return user


@router.put("/utilisateurs/{id_utilisateur}/mot-de-passe")
def reinitialiser_mot_de_passe(id_utilisateur: int, data: MotDePasseIn, db: Session = Depends(get_db),
                               _=Depends(require_roles(ADMIN))):
    user = _charger(db, id_utilisateur)
    user.mot_de_passe = hash_password(data.mot_de_passe)
    _ECHECS.pop(user.email.strip().lower(), None)  # debloque aussi un compte verrouille
    db.commit()
    return {"ok": True}
