import time
from collections import defaultdict, deque
from typing import Literal

import anthropic
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Utilisateur
from ..services import agent

router = APIRouter(prefix="/agent", tags=["Assistant IA"])
_REQUETES: dict[int, deque] = defaultdict(deque)


class MessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    messages: list[MessageIn] = Field(min_length=1, max_length=40)


class ExecutionIn(BaseModel):
    token: str


def limiter(id_utilisateur: int) -> None:
    maintenant, file = time.time(), _REQUETES[id_utilisateur]
    while file and maintenant - file[0] > 600:
        file.popleft()
    if len(file) >= settings.agent_requetes_par_10min:
        raise HTTPException(429, "Trop de demandes a l'assistant, reessayez dans quelques minutes")
    file.append(maintenant)


@router.get("/statut")
def statut(_=Depends(get_current_user)):
    return agent.statut_agent()


@router.post("/chat")
def chat(data: ChatIn, db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    messages = [m.model_dump() for m in data.messages][-20:]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages or messages[-1]["role"] != "user":
        raise HTTPException(400, "Le dernier message doit venir de l'utilisateur")
    limiter(user.id_utilisateur)
    try:
        reponse, propositions = agent.executer_conversation(db, user, messages)
    except (anthropic.APIError, httpx.HTTPError) as e:
        raise HTTPException(502, f"Service IA indisponible ({e.__class__.__name__}). "
                                 "Verifiez que le fournisseur est demarre et que le modele est disponible.")
    return {"reponse": reponse, "propositions": propositions}


@router.post("/executer")
def executer(data: ExecutionIn, db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    return agent.executer_action(db, user, data.token)
