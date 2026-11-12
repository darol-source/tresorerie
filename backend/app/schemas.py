from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import (Nature, PeriodeBudget, Statut, StatutPrevision, StatutRapprochement,
                     TypeCompte, TypeFacture, TypeMouvement)

Montant = Decimal


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth / utilisateurs ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleOut(ORM):
    id_role: int
    libelle_role: str
    description: str | None = None


class UtilisateurIn(BaseModel):
    nom: str = Field(min_length=1, max_length=100)
    prenom: str = Field(min_length=1, max_length=100)
    email: EmailStr
    mot_de_passe: str = Field(min_length=8, max_length=100)
    id_role: int


class UtilisateurOut(ORM):
    id_utilisateur: int
    nom: str
    prenom: str
    email: str
    actif: bool
    id_role: int
    role_libelle: str


# ---------- Comptes ----------
class CompteIn(BaseModel):
    libelle_compte: str = Field(min_length=1, max_length=100)
    type_compte: TypeCompte
    numero_compte: str | None = None
    banque: str | None = None
    devise: str = Field(default="MGA", min_length=3, max_length=3)
    solde_initial: Montant = Field(default=Decimal("0"), ge=0, max_digits=15, decimal_places=2)
    seuil_minimum: Montant = Field(default=Decimal("0"), ge=0, max_digits=15, decimal_places=2)
    date_ouverture: date


class CompteUpdate(BaseModel):
    libelle_compte: str | None = None
    numero_compte: str | None = None
    banque: str | None = None
    seuil_minimum: Montant | None = Field(default=None, ge=0)
    actif: bool | None = None


class CompteOut(ORM):
    id_compte: int
    libelle_compte: str
    type_compte: TypeCompte
    numero_compte: str | None
    banque: str | None
    devise: str
    solde_initial: Montant
    seuil_minimum: Montant
    date_ouverture: date
    actif: bool
    solde_actuel: Montant | None = None
    solde_faible: bool = False


# ---------- Referentiels ----------
class CategorieIn(BaseModel):
    libelle_categorie: str = Field(min_length=1, max_length=100)
    nature: Nature
    description: str | None = None


class CategorieOut(ORM, CategorieIn):
    id_categorie: int
    actif: bool


class ClientIn(BaseModel):
    nom_client: str = Field(min_length=1, max_length=150)
    telephone: str | None = None
    email: str | None = None
    adresse: str | None = None


class ClientOut(ORM, ClientIn):
    id_client: int
    actif: bool


class FournisseurIn(BaseModel):
    nom_fournisseur: str = Field(min_length=1, max_length=150)
    telephone: str | None = None
    email: str | None = None
    adresse: str | None = None


class FournisseurOut(ORM, FournisseurIn):
    id_fournisseur: int
    actif: bool


class ModeOut(ORM):
    id_mode: int
    libelle_mode: str


# ---------- Mouvements ----------
class MouvementIn(BaseModel):
    date_mouvement: date
    libelle: str = Field(min_length=1, max_length=255)
    montant: Montant = Field(gt=0, max_digits=15, decimal_places=2)
    type_mouvement: TypeMouvement
    id_compte: int
    id_categorie: int
    id_mode: int
    id_client: int | None = None
    id_fournisseur: int | None = None
    id_facture: int | None = None


class MouvementOut(ORM):
    id_mouvement: int
    reference: str
    date_mouvement: date
    libelle: str
    montant: Montant
    type_mouvement: TypeMouvement
    statut: Statut
    piece_justificative: str | None
    id_compte: int
    id_categorie: int
    id_mode: int
    id_utilisateur: int
    id_client: int | None
    id_fournisseur: int | None
    id_validateur: int | None
    id_facture: int | None
    date_validation: datetime | None
    motif_annulation: str | None
    date_creation: datetime | None
    compte_libelle: str
    categorie_libelle: str
    mode_libelle: str
    utilisateur_nom: str


class AnnulationIn(BaseModel):
    motif: str = Field(min_length=3, max_length=255)


# ---------- Transferts ----------
class TransfertIn(BaseModel):
    date_transfert: date
    montant: Montant = Field(gt=0, max_digits=15, decimal_places=2)
    motif: str | None = None
    id_compte_source: int
    id_compte_destination: int


class TransfertOut(ORM):
    id_transfert: int
    reference: str
    date_transfert: date
    montant: Montant
    motif: str | None
    statut: Statut
    id_compte_source: int
    id_compte_destination: int
    id_utilisateur: int
    motif_annulation: str | None
    source_libelle: str
    destination_libelle: str


# ---------- Factures (creances et dettes) ----------
class FactureIn(BaseModel):
    type_facture: TypeFacture
    date_facture: date
    date_echeance: date
    montant: Montant = Field(gt=0, max_digits=15, decimal_places=2)
    description: str | None = None
    id_client: int | None = None
    id_fournisseur: int | None = None

    @model_validator(mode="after")
    def coherence(self):
        if self.type_facture == TypeFacture.CREANCE and not self.id_client:
            raise ValueError("Une creance necessite un client")
        if self.type_facture == TypeFacture.DETTE and not self.id_fournisseur:
            raise ValueError("Une dette necessite un fournisseur")
        if self.date_echeance < self.date_facture:
            raise ValueError("L'echeance ne peut pas preceder la date de la facture")
        return self


class FactureOut(ORM):
    id_facture: int
    reference: str
    type_facture: TypeFacture
    date_facture: date
    date_echeance: date
    montant: Montant
    description: str | None
    annulee: bool
    id_client: int | None
    id_fournisseur: int | None
    tiers_nom: str
    montant_paye: Montant = Decimal("0")
    reste: Montant = Decimal("0")
    statut_paiement: str = "NON_PAYEE"
    jours_retard: int = 0
    en_retard: bool = False


class PaiementIn(BaseModel):
    date_mouvement: date
    montant: Montant = Field(gt=0, max_digits=15, decimal_places=2)
    id_compte: int
    id_mode: int
    id_categorie: int
    libelle: str | None = None


# ---------- Budgets ----------
class BudgetIn(BaseModel):
    id_categorie: int
    montant_previsionnel: Montant = Field(gt=0, max_digits=15, decimal_places=2)
    periode: PeriodeBudget
    date_debut: date


class BudgetUpdate(BaseModel):
    montant_previsionnel: Montant = Field(gt=0, max_digits=15, decimal_places=2)


class BudgetOut(ORM):
    id_budget: int
    id_categorie: int
    categorie_libelle: str
    montant_previsionnel: Montant
    periode: PeriodeBudget
    date_debut: date
    date_fin: date
    actif: bool
    depenses_reelles: Montant = Decimal("0")
    budget_restant: Montant = Decimal("0")
    taux_consommation: float | None = None
    depassement: Montant = Decimal("0")
    ecart: Montant = Decimal("0")
    etat: str = "RESPECTE"


# ---------- Previsions ----------
class PrevisionIn(BaseModel):
    type_prevision: TypeMouvement
    date_prevue: date
    montant: Montant = Field(gt=0, max_digits=15, decimal_places=2)
    libelle: str = Field(min_length=1, max_length=255)
    id_categorie: int | None = None
    id_compte: int | None = None


class PrevisionOut(ORM):
    id_prevision: int
    type_prevision: TypeMouvement
    date_prevue: date
    montant: Montant
    libelle: str
    id_categorie: int | None
    id_compte: int | None
    statut: StatutPrevision
    id_mouvement: int | None


class RealisationIn(BaseModel):
    id_mouvement: int


# ---------- Rapprochement ----------
class RapprochementIn(BaseModel):
    id_compte: int
    date_rapprochement: date
    solde_reference: Montant = Field(max_digits=15, decimal_places=2)
    commentaire: str | None = None


class RapprochementOut(ORM):
    id_rapprochement: int
    id_compte: int
    compte_libelle: str
    date_rapprochement: date
    solde_reference: Montant
    solde_comptable: Montant
    ecart: Montant
    statut: StatutRapprochement
    commentaire: str | None
    anomalie: bool


class ValidationRapprochementIn(BaseModel):
    commentaire: str | None = None


# ---------- Notifications ----------
class NotificationOut(ORM):
    id_notification: int
    type_notification: str
    message: str
    lu: bool
    date_creation: datetime | None


# ---------- Rappels par e-mail ----------
class RappelOut(ORM):
    id_rappel: int
    id_facture: int
    facture_reference: str
    client_nom: str
    type_rappel: str
    etape: int | None
    destinataire: str
    envoye_a: str
    objet: str
    statut: str
    erreur: str | None
    date_envoi: datetime | None


class TestEmailIn(BaseModel):
    destinataire: EmailStr | None = None


# ---------- Gestion des utilisateurs ----------
class UtilisateurUpdate(BaseModel):
    nom: str | None = Field(default=None, min_length=1, max_length=100)
    prenom: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    id_role: int | None = None


class MotDePasseIn(BaseModel):
    mot_de_passe: str = Field(min_length=8, max_length=100)


class ChangementMotDePasseIn(BaseModel):
    ancien: str = Field(min_length=1, max_length=100)
    nouveau: str = Field(min_length=8, max_length=100)
