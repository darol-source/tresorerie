from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (Budget, CompteTresorerie, MouvementTresorerie, Notification, Statut,
                      TypeFacture, TypeMouvement)
from . import budgets as svc_budgets
from .factures import factures_ouvertes
from .tresorerie import D, solde_compte

JOURS_PREAVIS = 7


def notifier(db: Session, id_utilisateur: int, type_: str, message: str, cle: str) -> None:
    """Cree une notification une seule fois par (utilisateur, cle). Le commit est fait par l'appelant."""
    existe = db.scalar(select(Notification.id_notification).where(
        Notification.id_utilisateur == id_utilisateur, Notification.cle == cle))
    if not existe:
        db.add(Notification(id_utilisateur=id_utilisateur, type_notification=type_, message=message[:255], cle=cle))


def generer_alertes(db: Session, id_utilisateur: int, valideur: bool) -> None:
    aujourdhui = date.today()

    for c in db.scalars(select(CompteTresorerie).where(CompteTresorerie.actif.is_(True))):
        if solde_compte(db, c) < D(c.seuil_minimum):
            notifier(db, id_utilisateur, "SOLDE_FAIBLE", f"Solde faible sur le compte {c.libelle_compte}",
                     f"SOLDE:{c.id_compte}:{aujourdhui}")

    for f in factures_ouvertes(db):
        jours = (f.date_echeance - aujourdhui).days
        nature = "client" if f.type_facture == TypeFacture.CREANCE else "fournisseur"
        if jours < 0:
            notifier(db, id_utilisateur, "FACTURE_RETARD",
                     f"Facture {nature} {f.reference} ({f.tiers_nom}) en retard de {-jours} jour(s)",
                     f"ECH:{f.id_facture}:RETARD")
        elif jours <= JOURS_PREAVIS:
            notifier(db, id_utilisateur, "FACTURE_ECHEANCE",
                     f"Facture {nature} {f.reference} ({f.tiers_nom}) arrive a echeance le {f.date_echeance}",
                     f"ECH:{f.id_facture}:PROCHE")

    for b in db.scalars(select(Budget).where(Budget.actif.is_(True), Budget.date_debut <= aujourdhui,
                                             Budget.date_fin >= aujourdhui)).unique():
        if svc_budgets.calculer(db, b)["etat"] == "DEPASSE":
            notifier(db, id_utilisateur, "BUDGET_DEPASSE", f"Budget depasse : {b.categorie_libelle}",
                     f"BUD:{b.id_budget}")

    if valideur:
        M = MouvementTresorerie
        n = len(db.scalars(select(M.id_mouvement).where(M.statut == Statut.BROUILLON)).all())
        if n:
            notifier(db, id_utilisateur, "EN_ATTENTE", f"{n} operation(s) en attente de validation",
                     f"ATT:{aujourdhui}:{n}")
    db.commit()
