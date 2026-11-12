"""Donnees initiales : python -m app.seed"""
import os
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import (Categorie, CompteTresorerie, ModePaiement, Nature, Role,
                     TypeCompte, Utilisateur)
from .security import hash_password

ROLES = [
    ("ADMINISTRATEUR", "Gestion complete de l'application"),
    ("DIRECTEUR_GENERAL", "Consultation globale et validation"),
    ("RESPONSABLE_FINANCIER", "Controle de la tresorerie"),
    ("CAISSIER", "Enregistrement des encaissements et decaissements"),
    ("COMPTABLE", "Verification et consultation des operations"),
]
MODES = ["ESPECES", "VIREMENT", "CHEQUE", "MOBILE_MONEY"]
CATEGORIES = [
    ("Ventes", Nature.RECETTE), ("Recouvrement clients", Nature.RECETTE), ("Autres recettes", Nature.RECETTE),
    ("Achats", Nature.DEPENSE), ("Salaires", Nature.DEPENSE), ("Transport", Nature.DEPENSE),
    ("Electricite et eau", Nature.DEPENSE), ("Autres depenses", Nature.DEPENSE),
]


def run() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(Role).limit(1)):
            db.add_all(Role(libelle_role=n, description=d) for n, d in ROLES)
            db.add_all(ModePaiement(libelle_mode=m) for m in MODES)
            db.add_all(Categorie(libelle_categorie=n, nature=nat) for n, nat in CATEGORIES)
            db.commit()
        if not db.scalar(select(Utilisateur).limit(1)):
            admin = db.scalar(select(Role).where(Role.libelle_role == "ADMINISTRATEUR"))
            db.add(Utilisateur(
                nom="Admin", prenom="Super", email="admin@tresorerie.mg",
                mot_de_passe=hash_password(os.getenv("ADMIN_PASSWORD", "Admin123!")),
                id_role=admin.id_role,
            ))
            db.commit()
        if not db.scalar(select(CompteTresorerie).limit(1)):
            db.add_all([
                CompteTresorerie(libelle_compte="Caisse principale", type_compte=TypeCompte.CAISSE,
                                 solde_initial=Decimal("5000000"), seuil_minimum=Decimal("500000"),
                                 date_ouverture=date.today()),
                CompteTresorerie(libelle_compte="Compte bancaire", type_compte=TypeCompte.BANQUE,
                                 banque="BNI Madagascar", numero_compte="00001-000-0000",
                                 solde_initial=Decimal("8000000"), seuil_minimum=Decimal("1000000"),
                                 date_ouverture=date.today()),
            ])
            db.commit()
    print("Base initialisee. Connexion : admin@tresorerie.mg")


if __name__ == "__main__":
    run()
