import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Utilisateur
from .security import decode_token

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ADMIN = "ADMINISTRATEUR"
DG = "DIRECTEUR_GENERAL"
RF = "RESPONSABLE_FINANCIER"
CAISSIER = "CAISSIER"
COMPTABLE = "COMPTABLE"

ROLES_VALIDATION = (ADMIN, DG, RF)
ROLES_VALIDATION_ELEVEE = (ADMIN, DG)
ROLES_SAISIE = (ADMIN, DG, RF, CAISSIER)


def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> Utilisateur:
    erreur = HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification invalide")
    try:
        payload = decode_token(token)
        user = db.get(Utilisateur, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise erreur
    if not user or not user.actif:
        raise erreur
    return user


def require_roles(*roles: str):
    def verifier(user: Utilisateur = Depends(get_current_user)) -> Utilisateur:
        if user.role_libelle not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permission insuffisante")
        return user

    return verifier
