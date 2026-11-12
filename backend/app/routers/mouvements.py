import os
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import (ROLES_SAISIE, ROLES_VALIDATION, ROLES_VALIDATION_ELEVEE,
                    get_current_user, require_roles)
from ..models import (Categorie, Client, CompteTresorerie, Facture, Fournisseur, ModePaiement,
                      MouvementTresorerie, Nature, Statut, TypeFacture, TypeMouvement, Utilisateur)
from ..schemas import AnnulationIn, MouvementIn, MouvementOut
from ..services.factures import reste_facture
from ..services.notifications import notifier
from ..services.tresorerie import D, generer_reference, solde_compte

router = APIRouter(prefix="/mouvements", tags=["Recettes et depenses"])

EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


def verifier_references(db: Session, data: MouvementIn) -> None:
    compte = db.get(CompteTresorerie, data.id_compte)
    if not compte or not compte.actif:
        raise HTTPException(400, "Compte inexistant ou inactif")
    categorie = db.get(Categorie, data.id_categorie)
    if not categorie or not categorie.actif:
        raise HTTPException(400, "Categorie inexistante ou inactive")
    attendue = Nature.RECETTE if data.type_mouvement == TypeMouvement.ENCAISSEMENT else Nature.DEPENSE
    if categorie.nature != attendue:
        raise HTTPException(400, f"La categorie doit etre de nature {attendue.value}")
    if not db.get(ModePaiement, data.id_mode):
        raise HTTPException(400, "Mode de paiement inconnu")
    if data.id_facture:
        facture = db.get(Facture, data.id_facture)
        if not facture or facture.annulee:
            raise HTTPException(400, "Facture inexistante ou annulee")
        attendu = TypeFacture.CREANCE if data.type_mouvement == TypeMouvement.ENCAISSEMENT else TypeFacture.DETTE
        if facture.type_facture != attendu:
            raise HTTPException(400, "Le type de mouvement ne correspond pas au type de facture")
        if D(data.montant) > reste_facture(db, facture):
            raise HTTPException(400, "Le montant depasse le reste a payer de la facture")
        data.id_client, data.id_fournisseur = facture.id_client, facture.id_fournisseur
    if data.id_client and (data.type_mouvement != TypeMouvement.ENCAISSEMENT or not db.get(Client, data.id_client)):
        raise HTTPException(400, "Client invalide (reserve aux encaissements)")
    if data.id_fournisseur and (data.type_mouvement != TypeMouvement.DECAISSEMENT or not db.get(Fournisseur, data.id_fournisseur)):
        raise HTTPException(400, "Fournisseur invalide (reserve aux decaissements)")


def charger(db: Session, id_mouvement: int) -> MouvementTresorerie:
    mv = db.get(MouvementTresorerie, id_mouvement)
    if not mv:
        raise HTTPException(404, "Mouvement introuvable")
    return mv


@router.get("", response_model=list[MouvementOut])
def lister(
    date_debut: date | None = None, date_fin: date | None = None,
    type_mouvement: TypeMouvement | None = None, statut: Statut | None = None,
    id_compte: int | None = None, id_categorie: int | None = None,
    id_client: int | None = None, id_fournisseur: int | None = None,
    q: str | None = None, skip: int = 0, limit: int = Query(100, le=500),
    db: Session = Depends(get_db), _=Depends(get_current_user),
):
    M = MouvementTresorerie
    stmt = select(M).order_by(M.date_mouvement.desc(), M.id_mouvement.desc())
    filtres = [
        (date_debut, M.date_mouvement >= date_debut if date_debut else None),
        (date_fin, M.date_mouvement <= date_fin if date_fin else None),
        (type_mouvement, M.type_mouvement == type_mouvement),
        (statut, M.statut == statut),
        (id_compte, M.id_compte == id_compte),
        (id_categorie, M.id_categorie == id_categorie),
        (id_client, M.id_client == id_client),
        (id_fournisseur, M.id_fournisseur == id_fournisseur),
    ]
    for valeur, condition in filtres:
        if valeur is not None:
            stmt = stmt.where(condition)
    if q:
        stmt = stmt.where(M.libelle.ilike(f"%{q}%") | M.reference.ilike(f"%{q}%"))
    return db.scalars(stmt.offset(skip).limit(limit)).unique().all()


def creer_mouvement(db: Session, data: MouvementIn, user: Utilisateur) -> MouvementTresorerie:
    verifier_references(db, data)
    prefixe = "REC" if data.type_mouvement == TypeMouvement.ENCAISSEMENT else "DEP"
    mv = MouvementTresorerie(
        **data.model_dump(), reference=generer_reference(prefixe),
        statut=Statut.BROUILLON, id_utilisateur=user.id_utilisateur,
    )
    db.add(mv)
    db.commit()
    return charger(db, mv.id_mouvement)


@router.post("", response_model=MouvementOut, status_code=201)
def creer(data: MouvementIn, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(*ROLES_SAISIE))):
    return creer_mouvement(db, data, user)


@router.put("/{id_mouvement}", response_model=MouvementOut)
def modifier(id_mouvement: int, data: MouvementIn, db: Session = Depends(get_db),
             _=Depends(require_roles(*ROLES_SAISIE))):
    mv = charger(db, id_mouvement)
    if mv.statut != Statut.BROUILLON:
        raise HTTPException(400, "Seul un mouvement non valide peut etre modifie")
    verifier_references(db, data)
    for champ, valeur in data.model_dump().items():
        setattr(mv, champ, valeur)
    db.commit()
    return charger(db, id_mouvement)


@router.post("/{id_mouvement}/valider", response_model=MouvementOut)
def valider(id_mouvement: int, db: Session = Depends(get_db), user: Utilisateur = Depends(get_current_user)):
    mv = charger(db, id_mouvement)
    if mv.statut != Statut.BROUILLON:
        raise HTTPException(400, "Seul un brouillon peut etre valide")
    autorises = ROLES_VALIDATION
    if mv.type_mouvement == TypeMouvement.DECAISSEMENT and D(mv.montant) > settings.seuil_validation_directeur:
        autorises = ROLES_VALIDATION_ELEVEE
    if user.role_libelle not in autorises:
        raise HTTPException(403, "Votre role ne permet pas de valider cette operation (seuil de validation)")
    if mv.type_mouvement == TypeMouvement.DECAISSEMENT:
        compte = db.execute(
            select(CompteTresorerie).where(CompteTresorerie.id_compte == mv.id_compte).with_for_update()
        ).scalar_one()
        if solde_compte(db, compte) < D(mv.montant):
            raise HTTPException(400, "Solde insuffisant sur le compte")
    if mv.id_facture:
        facture = db.get(Facture, mv.id_facture)
        if facture.annulee or D(mv.montant) > reste_facture(db, facture):
            raise HTTPException(400, "Le montant depasse le reste a payer de la facture")
    mv.statut = Statut.VALIDE
    mv.id_validateur = user.id_utilisateur
    mv.date_validation = datetime.now()
    if mv.id_utilisateur != user.id_utilisateur:
        notifier(db, mv.id_utilisateur, "OPERATION_VALIDEE", f"Operation {mv.reference} validee",
                 f"VAL:{mv.id_mouvement}")
    db.commit()
    return charger(db, id_mouvement)


@router.post("/{id_mouvement}/annuler", response_model=MouvementOut)
def annuler(id_mouvement: int, data: AnnulationIn, db: Session = Depends(get_db),
            user: Utilisateur = Depends(get_current_user)):
    mv = charger(db, id_mouvement)
    if mv.statut == Statut.ANNULE:
        raise HTTPException(400, "Deja annule")
    if user.role_libelle not in ROLES_VALIDATION and mv.id_utilisateur != user.id_utilisateur:
        raise HTTPException(403, "Permission insuffisante")
    if mv.statut == Statut.VALIDE and mv.type_mouvement == TypeMouvement.ENCAISSEMENT:
        if user.role_libelle not in ROLES_VALIDATION:
            raise HTTPException(403, "Seul un valideur peut annuler une operation validee")
        compte = db.execute(
            select(CompteTresorerie).where(CompteTresorerie.id_compte == mv.id_compte).with_for_update()
        ).scalar_one()
        if solde_compte(db, compte) < D(mv.montant):
            raise HTTPException(400, "Annulation impossible : le solde du compte deviendrait negatif")
    elif mv.statut == Statut.VALIDE and user.role_libelle not in ROLES_VALIDATION:
        raise HTTPException(403, "Seul un valideur peut annuler une operation validee")
    mv.statut = Statut.ANNULE
    mv.motif_annulation = data.motif
    if mv.id_utilisateur != user.id_utilisateur:
        notifier(db, mv.id_utilisateur, "OPERATION_REFUSEE",
                 f"Operation {mv.reference} annulee ou refusee : {data.motif}", f"ANN:{mv.id_mouvement}")
    db.commit()
    return charger(db, id_mouvement)


@router.post("/{id_mouvement}/piece", response_model=MouvementOut)
async def joindre_piece(id_mouvement: int, fichier: UploadFile = File(...), db: Session = Depends(get_db),
                        _=Depends(require_roles(*ROLES_SAISIE))):
    mv = charger(db, id_mouvement)
    extension = os.path.splitext(fichier.filename or "")[1].lower()
    if extension not in EXTENSIONS:
        raise HTTPException(400, "Formats acceptes : PDF, JPG, PNG")
    contenu = await fichier.read(settings.taille_max_fichier + 1)
    if len(contenu) > settings.taille_max_fichier:
        raise HTTPException(400, "Fichier trop volumineux (5 Mo maximum)")
    os.makedirs(settings.upload_dir, exist_ok=True)
    nom = f"{uuid.uuid4().hex}{extension}"
    with open(os.path.join(settings.upload_dir, nom), "wb") as f:
        f.write(contenu)
    mv.piece_justificative = nom
    db.commit()
    return charger(db, id_mouvement)


@router.get("/{id_mouvement}/piece")
def telecharger_piece(id_mouvement: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    mv = charger(db, id_mouvement)
    if not mv.piece_justificative:
        raise HTTPException(404, "Aucune piece jointe")
    chemin = os.path.join(settings.upload_dir, os.path.basename(mv.piece_justificative))
    if not os.path.exists(chemin):
        raise HTTPException(404, "Fichier introuvable")
    return FileResponse(chemin)
