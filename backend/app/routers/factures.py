from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ROLES_SAISIE, ROLES_VALIDATION, get_current_user, require_roles
from ..models import (Client, Facture, Fournisseur, MouvementTresorerie, TypeFacture,
                      TypeMouvement, Utilisateur)
from ..schemas import AnnulationIn, FactureIn, FactureOut, MouvementIn, MouvementOut, PaiementIn
from ..services.factures import enrichir, payes_par_facture
from ..services.tresorerie import D, generer_reference
from .mouvements import creer_mouvement

router = APIRouter(prefix="/factures", tags=["Creances et dettes"])


def charger_facture(db: Session, id_facture: int) -> Facture:
    f = db.get(Facture, id_facture)
    if not f:
        raise HTTPException(404, "Facture introuvable")
    return f


@router.get("", response_model=list[FactureOut])
def lister(type_facture: TypeFacture | None = None, statut_paiement: str | None = None,
           en_retard: bool | None = None, id_client: int | None = None, id_fournisseur: int | None = None,
           echeance_debut: date | None = None, echeance_fin: date | None = None,
           db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(Facture).order_by(Facture.date_echeance, Facture.id_facture)
    if type_facture:
        stmt = stmt.where(Facture.type_facture == type_facture)
    if id_client:
        stmt = stmt.where(Facture.id_client == id_client)
    if id_fournisseur:
        stmt = stmt.where(Facture.id_fournisseur == id_fournisseur)
    if echeance_debut:
        stmt = stmt.where(Facture.date_echeance >= echeance_debut)
    if echeance_fin:
        stmt = stmt.where(Facture.date_echeance <= echeance_fin)
    payes = payes_par_facture(db)
    sorties = [enrichir(f, payes) for f in db.scalars(stmt).unique()]
    if statut_paiement:
        sorties = [o for o in sorties if o.statut_paiement == statut_paiement]
    if en_retard is not None:
        sorties = [o for o in sorties if o.en_retard == en_retard]
    return sorties


@router.post("", response_model=FactureOut, status_code=201)
def creer(data: FactureIn, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(*ROLES_SAISIE))):
    if data.type_facture == TypeFacture.CREANCE:
        tiers = db.get(Client, data.id_client)
        data.id_fournisseur = None
    else:
        tiers = db.get(Fournisseur, data.id_fournisseur)
        data.id_client = None
    if not tiers or not tiers.actif:
        raise HTTPException(400, "Client ou fournisseur inexistant ou inactif")
    prefixe = "FAC-C" if data.type_facture == TypeFacture.CREANCE else "FAC-F"
    f = Facture(**data.model_dump(), reference=generer_reference(prefixe), id_utilisateur=user.id_utilisateur)
    db.add(f)
    db.commit()
    return enrichir(charger_facture(db, f.id_facture), {})


@router.post("/{id_facture}/annuler", response_model=FactureOut)
def annuler(id_facture: int, data: AnnulationIn, db: Session = Depends(get_db),
            _=Depends(require_roles(*ROLES_VALIDATION))):
    f = charger_facture(db, id_facture)
    payes = payes_par_facture(db)
    if payes.get(id_facture, Decimal("0")) > 0:
        raise HTTPException(400, "Une facture deja payee (meme partiellement) ne peut pas etre annulee")
    f.annulee = True
    db.commit()
    return enrichir(f, payes)


@router.post("/{id_facture}/paiements", response_model=MouvementOut, status_code=201)
def payer(id_facture: int, data: PaiementIn, db: Session = Depends(get_db),
          user: Utilisateur = Depends(require_roles(*ROLES_SAISIE))):
    """Cree un mouvement (brouillon) lie a la facture. Le reste n'est reduit qu'apres validation (regles 1 et 2)."""
    f = charger_facture(db, id_facture)
    type_mv = TypeMouvement.ENCAISSEMENT if f.type_facture == TypeFacture.CREANCE else TypeMouvement.DECAISSEMENT
    libelle = data.libelle or f"Paiement facture {f.reference}"
    mouvement = MouvementIn(
        date_mouvement=data.date_mouvement, libelle=libelle, montant=data.montant, type_mouvement=type_mv,
        id_compte=data.id_compte, id_categorie=data.id_categorie, id_mode=data.id_mode, id_facture=id_facture,
    )
    return creer_mouvement(db, mouvement, user)


@router.get("/synthese")
def synthese(db: Session = Depends(get_db), _=Depends(get_current_user)):
    payes = payes_par_facture(db)
    factures = [enrichir(f, payes) for f in db.scalars(select(Facture).where(Facture.annulee.is_(False))).unique()]

    def bloc(type_facture: TypeFacture) -> dict:
        lignes = [o for o in factures if o.type_facture == type_facture]
        par_tiers: dict[str, dict] = {}
        for o in lignes:
            t = par_tiers.setdefault(o.tiers_nom, {"tiers": o.tiers_nom, "facture": Decimal("0"),
                                                   "paye": Decimal("0"), "reste": Decimal("0"), "en_retard": 0})
            t["facture"] += D(o.montant)
            t["paye"] += o.montant_paye
            t["reste"] += o.reste
            t["en_retard"] += 1 if o.en_retard else 0
        for t in par_tiers.values():
            t["taux"] = round(float(t["paye"] / t["facture"] * 100), 2) if t["facture"] else None
        mtf = sum((D(o.montant) for o in lignes), Decimal("0"))
        mtp = sum((o.montant_paye for o in lignes), Decimal("0"))
        return {
            "total_facture": mtf, "total_paye": mtp, "reste": mtf - mtp,
            "taux": round(float(mtp / mtf * 100), 2) if mtf else None,  # TRC ou TRF
            "nombre_en_retard": sum(1 for o in lignes if o.en_retard),
            "montant_en_retard": sum((o.reste for o in lignes if o.en_retard), Decimal("0")),
            "tiers": sorted(par_tiers.values(), key=lambda t: t["reste"], reverse=True),
        }

    creances, dettes = bloc(TypeFacture.CREANCE), bloc(TypeFacture.DETTE)
    return {"creances": creances, "dettes": dettes, "position_nette": creances["reste"] - dettes["reste"]}
