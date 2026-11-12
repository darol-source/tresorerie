from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings


def hash_password(mot_de_passe: str) -> str:
    return bcrypt.hashpw(mot_de_passe.encode(), bcrypt.gensalt()).decode()


def verify_password(mot_de_passe: str, hache: str) -> bool:
    try:
        return bcrypt.checkpw(mot_de_passe.encode(), hache.encode())
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
