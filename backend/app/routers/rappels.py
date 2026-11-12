from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import ADMIN, DG, RF, ROLES_SAISIE, get_current_user, require_roles
from ..models import RappelEmail, Utilisateur
from ..schemas import RappelOut, TestEmailIn
from ..services import emails

router = APIRouter(prefix="/rappels", tags=["Rappels par e-mail"])
ROLES_RAPPELS = (ADMIN, DG, RF)


@router.get("/config")
def config(_=Depends(get_current_user)):
    return {
        "smtp_configure": emails.smtp_configure(), "automatique": settings.rappels_auto,
        "heure": settings.rappels_heure, "calendrier": emails.calendrier(),
        "mode_test": bool(settings.email_test_destinataire), "adresse_test": settings.email_test_destinataire,
        "expediteur": settings.smtp_from, "societe": settings.societe_nom,
    }


@router.get("/apercu")
def apercu(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Ce qui serait envoye maintenant. N'envoie rien."""
    a_envoyer, ignores = emails.planifier(db)
    return {"a_envoyer": [{k: v for k, v in it.items() if k not in ("html", "cle")} for it in a_envoyer], "ignores": ignores}


@router.post("/executer")
def executer(db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(*ROLES_RAPPELS))):
    if not emails.smtp_configure():
        raise HTTPException(400, "L'envoi d'e-mails n'est pas configure (SMTP_HOST et SMTP_FROM dans .env)")
    a_envoyer, ignores = emails.planifier(db)
    details = emails.envoyer_rappels(db, a_envoyer, user.id_utilisateur)
    return {"envoyes": sum(1 for d in details if d["statut"] == "ENVOYE"),
            "echecs": sum(1 for d in details if d["statut"] == "ECHEC"),
            "ignores": len(ignores), "restants": max(0, len(a_envoyer) - settings.rappels_max_par_execution),
            "details": details}


@router.post("/facture/{id_facture}", response_model=RappelOut)
def rappeler(id_facture: int, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(*ROLES_SAISIE))):
    return emails.envoyer_manuel(db, id_facture, user.id_utilisateur)


@router.post("/test")
def tester(data: TestEmailIn, user: Utilisateur = Depends(require_roles(ADMIN))):
    if not emails.smtp_configure():
        raise HTTPException(400, "SMTP_HOST et SMTP_FROM doivent etre renseignes dans .env")
    a = data.destinataire or user.email
    try:
        emails.envoyer(a, "Test d'envoi - gestion de tresorerie",
                       f"Ce message confirme que l'envoi d'e-mails fonctionne.\n\n{settings.societe_nom}\n")
    except Exception as e:
        raise HTTPException(502, f"Envoi impossible : {e.__class__.__name__} - {str(e)[:200]}")
    return {"envoye_a": a}


@router.get("/historique", response_model=list[RappelOut])
def historique(id_facture: int | None = None, limite: int = 100, db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(RappelEmail).order_by(RappelEmail.id_rappel.desc()).limit(min(limite, 500))
    if id_facture:
        stmt = stmt.where(RappelEmail.id_facture == id_facture)
    return db.scalars(stmt).unique().all()
