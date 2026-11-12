import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, UniqueConstraint, Date, DateTime, Enum as SAEnum, ForeignKey,
    Numeric, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TypeCompte(str, enum.Enum):
    CAISSE = "CAISSE"
    BANQUE = "BANQUE"
    MOBILE_MONEY = "MOBILE_MONEY"


class Nature(str, enum.Enum):
    RECETTE = "RECETTE"
    DEPENSE = "DEPENSE"


class TypeMouvement(str, enum.Enum):
    ENCAISSEMENT = "ENCAISSEMENT"
    DECAISSEMENT = "DECAISSEMENT"


class Statut(str, enum.Enum):
    BROUILLON = "BROUILLON"
    VALIDE = "VALIDE"
    ANNULE = "ANNULE"


def enum_col(e, length=20):
    return SAEnum(e, native_enum=False, length=length)


class Role(Base):
    __tablename__ = "role"
    id_role: Mapped[int] = mapped_column(primary_key=True)
    libelle_role: Mapped[str] = mapped_column(String(50), unique=True)
    description: Mapped[str | None] = mapped_column(String(255))


class Utilisateur(Base):
    __tablename__ = "utilisateur"
    id_utilisateur: Mapped[int] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column(String(100))
    prenom: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(150), unique=True)
    mot_de_passe: Mapped[str] = mapped_column(String(255))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    id_role: Mapped[int] = mapped_column(ForeignKey("role.id_role"))
    role: Mapped[Role] = relationship(lazy="joined")

    @property
    def role_libelle(self) -> str:
        return self.role.libelle_role


class CompteTresorerie(Base):
    __tablename__ = "compte_tresorerie"
    id_compte: Mapped[int] = mapped_column(primary_key=True)
    libelle_compte: Mapped[str] = mapped_column(String(100))
    type_compte: Mapped[TypeCompte] = mapped_column(enum_col(TypeCompte))
    numero_compte: Mapped[str | None] = mapped_column(String(50))
    banque: Mapped[str | None] = mapped_column(String(100))
    devise: Mapped[str] = mapped_column(String(3), default="MGA")
    solde_initial: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)
    seuil_minimum: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)
    date_ouverture: Mapped[date] = mapped_column(Date)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)


class Categorie(Base):
    __tablename__ = "categorie"
    id_categorie: Mapped[int] = mapped_column(primary_key=True)
    libelle_categorie: Mapped[str] = mapped_column(String(100))
    nature: Mapped[Nature] = mapped_column(enum_col(Nature))
    description: Mapped[str | None] = mapped_column(String(255))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)


class Client(Base):
    __tablename__ = "client"
    id_client: Mapped[int] = mapped_column(primary_key=True)
    nom_client: Mapped[str] = mapped_column(String(150))
    telephone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(150))
    adresse: Mapped[str | None] = mapped_column(String(255))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)


class Fournisseur(Base):
    __tablename__ = "fournisseur"
    id_fournisseur: Mapped[int] = mapped_column(primary_key=True)
    nom_fournisseur: Mapped[str] = mapped_column(String(150))
    telephone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(150))
    adresse: Mapped[str | None] = mapped_column(String(255))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)


class ModePaiement(Base):
    __tablename__ = "mode_paiement"
    id_mode: Mapped[int] = mapped_column(primary_key=True)
    libelle_mode: Mapped[str] = mapped_column(String(50), unique=True)


class MouvementTresorerie(Base):
    __tablename__ = "mouvement_tresorerie"
    __table_args__ = (CheckConstraint("montant > 0", name="ck_mouvement_montant"),)

    id_mouvement: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    date_mouvement: Mapped[date] = mapped_column(Date, index=True)
    libelle: Mapped[str] = mapped_column(String(255))
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    type_mouvement: Mapped[TypeMouvement] = mapped_column(enum_col(TypeMouvement))
    statut: Mapped[Statut] = mapped_column(enum_col(Statut), default=Statut.BROUILLON, index=True)
    piece_justificative: Mapped[str | None] = mapped_column(String(255))
    id_compte: Mapped[int] = mapped_column(ForeignKey("compte_tresorerie.id_compte"))
    id_categorie: Mapped[int] = mapped_column(ForeignKey("categorie.id_categorie"))
    id_mode: Mapped[int] = mapped_column(ForeignKey("mode_paiement.id_mode"))
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))
    id_client: Mapped[int | None] = mapped_column(ForeignKey("client.id_client"))
    id_fournisseur: Mapped[int | None] = mapped_column(ForeignKey("fournisseur.id_fournisseur"))
    id_validateur: Mapped[int | None] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))
    id_facture: Mapped[int | None] = mapped_column(ForeignKey("facture.id_facture"))
    date_validation: Mapped[datetime | None] = mapped_column(DateTime)
    motif_annulation: Mapped[str | None] = mapped_column(String(255))
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    date_modification: Mapped[datetime | None] = mapped_column(DateTime, onupdate=func.now())

    compte: Mapped[CompteTresorerie] = relationship(lazy="joined")
    categorie: Mapped[Categorie] = relationship(lazy="joined")
    mode: Mapped[ModePaiement] = relationship(lazy="joined")
    utilisateur: Mapped[Utilisateur] = relationship(lazy="joined", foreign_keys=[id_utilisateur])
    client: Mapped[Client | None] = relationship(lazy="joined")
    fournisseur: Mapped[Fournisseur | None] = relationship(lazy="joined")

    @property
    def compte_libelle(self) -> str:
        return self.compte.libelle_compte

    @property
    def categorie_libelle(self) -> str:
        return self.categorie.libelle_categorie

    @property
    def mode_libelle(self) -> str:
        return self.mode.libelle_mode

    @property
    def utilisateur_nom(self) -> str:
        return f"{self.utilisateur.prenom} {self.utilisateur.nom}"


class Transfert(Base):
    __tablename__ = "transfert"
    __table_args__ = (CheckConstraint("montant > 0", name="ck_transfert_montant"),)

    id_transfert: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    date_transfert: Mapped[date] = mapped_column(Date, index=True)
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    motif: Mapped[str | None] = mapped_column(String(255))
    statut: Mapped[Statut] = mapped_column(enum_col(Statut), default=Statut.VALIDE)
    id_compte_source: Mapped[int] = mapped_column(ForeignKey("compte_tresorerie.id_compte"))
    id_compte_destination: Mapped[int] = mapped_column(ForeignKey("compte_tresorerie.id_compte"))
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))
    motif_annulation: Mapped[str | None] = mapped_column(String(255))
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    source: Mapped[CompteTresorerie] = relationship(lazy="joined", foreign_keys=[id_compte_source])
    destination: Mapped[CompteTresorerie] = relationship(lazy="joined", foreign_keys=[id_compte_destination])

    @property
    def source_libelle(self) -> str:
        return self.source.libelle_compte

    @property
    def destination_libelle(self) -> str:
        return self.destination.libelle_compte


# ======================= Modules v2 =======================
class TypeFacture(str, enum.Enum):
    CREANCE = "CREANCE"
    DETTE = "DETTE"


class PeriodeBudget(str, enum.Enum):
    MENSUEL = "MENSUEL"
    TRIMESTRIEL = "TRIMESTRIEL"
    ANNUEL = "ANNUEL"


class StatutPrevision(str, enum.Enum):
    PREVU = "PREVU"
    REALISE = "REALISE"
    ANNULE = "ANNULE"


class StatutRapprochement(str, enum.Enum):
    EN_COURS = "EN_COURS"
    VALIDE = "VALIDE"


class Facture(Base):
    """Facture client (CREANCE) ou fournisseur (DETTE). Les paiements sont des mouvements lies."""
    __tablename__ = "facture"
    __table_args__ = (CheckConstraint("montant > 0", name="ck_facture_montant"),)

    id_facture: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    type_facture: Mapped[TypeFacture] = mapped_column(enum_col(TypeFacture))
    date_facture: Mapped[date] = mapped_column(Date)
    date_echeance: Mapped[date] = mapped_column(Date, index=True)
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    description: Mapped[str | None] = mapped_column(String(255))
    annulee: Mapped[bool] = mapped_column(Boolean, default=False)
    id_client: Mapped[int | None] = mapped_column(ForeignKey("client.id_client"))
    id_fournisseur: Mapped[int | None] = mapped_column(ForeignKey("fournisseur.id_fournisseur"))
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    client: Mapped[Client | None] = relationship(lazy="joined")
    fournisseur: Mapped[Fournisseur | None] = relationship(lazy="joined")

    @property
    def tiers_nom(self) -> str:
        if self.client:
            return self.client.nom_client
        return self.fournisseur.nom_fournisseur if self.fournisseur else ""


class Budget(Base):
    __tablename__ = "budget"
    __table_args__ = (CheckConstraint("montant_previsionnel > 0", name="ck_budget_montant"),)

    id_budget: Mapped[int] = mapped_column(primary_key=True)
    id_categorie: Mapped[int] = mapped_column(ForeignKey("categorie.id_categorie"))
    montant_previsionnel: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    periode: Mapped[PeriodeBudget] = mapped_column(enum_col(PeriodeBudget))
    date_debut: Mapped[date] = mapped_column(Date)
    date_fin: Mapped[date] = mapped_column(Date)
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))

    categorie: Mapped[Categorie] = relationship(lazy="joined")

    @property
    def categorie_libelle(self) -> str:
        return self.categorie.libelle_categorie


class Prevision(Base):
    __tablename__ = "prevision"
    __table_args__ = (CheckConstraint("montant > 0", name="ck_prevision_montant"),)

    id_prevision: Mapped[int] = mapped_column(primary_key=True)
    type_prevision: Mapped[TypeMouvement] = mapped_column(enum_col(TypeMouvement))
    date_prevue: Mapped[date] = mapped_column(Date, index=True)
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    libelle: Mapped[str] = mapped_column(String(255))
    id_categorie: Mapped[int | None] = mapped_column(ForeignKey("categorie.id_categorie"))
    id_compte: Mapped[int | None] = mapped_column(ForeignKey("compte_tresorerie.id_compte"))
    statut: Mapped[StatutPrevision] = mapped_column(enum_col(StatutPrevision), default=StatutPrevision.PREVU)
    id_mouvement: Mapped[int | None] = mapped_column(ForeignKey("mouvement_tresorerie.id_mouvement"))
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))


class Rapprochement(Base):
    __tablename__ = "rapprochement"

    id_rapprochement: Mapped[int] = mapped_column(primary_key=True)
    id_compte: Mapped[int] = mapped_column(ForeignKey("compte_tresorerie.id_compte"))
    date_rapprochement: Mapped[date] = mapped_column(Date)
    solde_reference: Mapped[Decimal] = mapped_column(Numeric(15, 2))  # solde reel (caisse) ou releve (banque)
    solde_comptable: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    ecart: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    statut: Mapped[StatutRapprochement] = mapped_column(enum_col(StatutRapprochement), default=StatutRapprochement.EN_COURS)
    commentaire: Mapped[str | None] = mapped_column(String(255))
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    compte: Mapped[CompteTresorerie] = relationship(lazy="joined")

    @property
    def compte_libelle(self) -> str:
        return self.compte.libelle_compte

    @property
    def anomalie(self) -> bool:
        return Decimal(self.ecart) != 0


class LigneReleve(Base):
    __tablename__ = "ligne_releve"

    id_ligne: Mapped[int] = mapped_column(primary_key=True)
    id_rapprochement: Mapped[int] = mapped_column(ForeignKey("rapprochement.id_rapprochement"), index=True)
    date_operation: Mapped[date] = mapped_column(Date)
    libelle: Mapped[str] = mapped_column(String(255))
    montant: Mapped[Decimal] = mapped_column(Numeric(15, 2))  # signe : positif = entree
    type_correspondance: Mapped[str | None] = mapped_column(String(20))  # MOUVEMENT ou TRANSFERT
    id_correspondance: Mapped[int | None] = mapped_column()


class Notification(Base):
    __tablename__ = "notification"
    __table_args__ = (UniqueConstraint("id_utilisateur", "cle", name="uq_notification_cle"),)

    id_notification: Mapped[int] = mapped_column(primary_key=True)
    id_utilisateur: Mapped[int] = mapped_column(ForeignKey("utilisateur.id_utilisateur"), index=True)
    type_notification: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(String(255))
    cle: Mapped[str] = mapped_column(String(100))
    lu: Mapped[bool] = mapped_column(Boolean, default=False)
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RappelEmail(Base):
    """Historique des e-mails de rappel envoyes aux clients. cle_unique empeche tout doublon automatique."""
    __tablename__ = "rappel_email"

    id_rappel: Mapped[int] = mapped_column(primary_key=True)
    id_facture: Mapped[int] = mapped_column(ForeignKey("facture.id_facture"), index=True)
    type_rappel: Mapped[str] = mapped_column(String(10))  # AUTO ou MANUEL
    etape: Mapped[int | None] = mapped_column()  # jours par rapport a l'echeance
    destinataire: Mapped[str] = mapped_column(String(150))  # adresse du client
    envoye_a: Mapped[str] = mapped_column(String(150))  # adresse reelle (differente en mode test)
    objet: Mapped[str] = mapped_column(String(255))
    statut: Mapped[str] = mapped_column(String(15))  # EN_COURS, ENVOYE, ECHEC
    erreur: Mapped[str | None] = mapped_column(String(255))
    cle_unique: Mapped[str | None] = mapped_column(String(50), unique=True)
    id_utilisateur: Mapped[int | None] = mapped_column(ForeignKey("utilisateur.id_utilisateur"))
    date_envoi: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    facture: Mapped[Facture] = relationship(lazy="joined")

    @property
    def facture_reference(self) -> str:
        return self.facture.reference

    @property
    def client_nom(self) -> str:
        return self.facture.tiers_nom
