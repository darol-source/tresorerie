from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import ADMIN, DG, RF, ROLES_SAISIE, get_current_user, require_roles
from ..models import (Categorie, CompteTresorerie, MouvementTresorerie, Prevision, Statut,
                      StatutPrevision, TypeFacture, TypeMouvement, Utilisateur)
from ..schemas import PrevisionIn, PrevisionOut, RealisationIn
from ..services.factures import factures_ouvertes
from ..services.tresorerie import D, somme_mouvements, solde_compte

router = APIRouter(prefix="/previsions", tags=["Previsions de tresorerie"])
ENC, DEC = TypeMouvement.ENCAISSEMENT, TypeMouvement.DECAISSEMENT


def cle_periode(d: date, granularite: str, aujourdhui: date) -> str:
    d = max(d, aujourdhui)  # les echeances depassees tombent dans la premiere periode
    if granularite == "jour":
        return d.isoformat()
    if granularite == "semaine":
        return (d - timedelta(days=d.weekday())).isoformat()
    return f"{d.year}-{d.month:02d}"


@router.get("", response_model=list[PrevisionOut])
def lister(statut: StatutPrevision | None = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    stmt = select(Prevision).order_by(Prevision.date_prevue, Prevision.id_prevision)
    if statut:
        stmt = stmt.where(Prevision.statut == statut)
    return db.scalars(stmt).all()


@router.post("", response_model=PrevisionOut, status_code=201)
def creer(data: PrevisionIn, db: Session = Depends(get_db), user: Utilisateur = Depends(require_roles(ADMIN, DG, RF))):
    if data.id_categorie and not db.get(Categorie, data.id_categorie):
        raise HTTPException(400, "Categorie inconnue")
    if data.id_compte and not db.get(CompteTresorerie, data.id_compte):
        raise HTTPException(400, "Compte inconnu")
    p = Prevision(**data.model_dump(), id_utilisateur=user.id_utilisateur)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{id_prevision}/annuler", response_model=PrevisionOut)
def annuler(id_prevision: int, db: Session = Depends(get_db), _=Depends(require_roles(ADMIN, DG, RF))):
    p = db.get(Prevision, id_prevision)
    if not p:
        raise HTTPException(404, "Prevision introuvable")
    if p.statut != StatutPrevision.PREVU:
        raise HTTPException(400, "Seule une prevision en attente peut etre annulee")
    p.statut = StatutPrevision.ANNULE
    db.commit()
    return p


@router.post("/{id_prevision}/realiser", response_model=PrevisionOut)
def realiser(id_prevision: int, data: RealisationIn, db: Session = Depends(get_db),
             _=Depends(require_roles(*ROLES_SAISIE))):
    """Lie la prevision a l'operation reelle : elle sort du solde previsionnel (pas de double comptage)."""
    p = db.get(Prevision, id_prevision)
    mv = db.get(MouvementTresorerie, data.id_mouvement)
    if not p or not mv:
        raise HTTPException(404, "Prevision ou mouvement introuvable")
    if p.statut != StatutPrevision.PREVU:
        raise HTTPException(400, "Prevision deja realisee ou annulee")
    if mv.type_mouvement != p.type_prevision or mv.statut == Statut.ANNULE:
        raise HTTPException(400, "Le mouvement ne correspond pas a la prevision")
    p.statut, p.id_mouvement = StatutPrevision.REALISE, mv.id_mouvement
    db.commit()
    return p


@router.get("/solde")
def solde_previsionnel(jusqua: date | None = None, granularite: str = Query("mois", pattern="^(jour|semaine|mois)$"),
                       inclure_echeances: bool = True, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """SP = SA + EP - DP, ventile par periode, avec detection des periodes a risque."""
    aujourdhui = date.today()
    jusqua = jusqua or aujourdhui + timedelta(days=90)
    if jusqua < aujourdhui:
        raise HTTPException(400, "La date limite doit etre dans le futur")

    comptes = db.scalars(select(CompteTresorerie).where(CompteTresorerie.actif.is_(True))).all()
    sa = sum((solde_compte(db, c) for c in comptes), Decimal("0"))
    seuil = sum((D(c.seuil_minimum) for c in comptes), Decimal("0"))

    flux: list[tuple[date, TypeMouvement, Decimal]] = [
        (p.date_prevue, p.type_prevision, D(p.montant))
        for p in db.scalars(select(Prevision).where(Prevision.statut == StatutPrevision.PREVU,
                                                    Prevision.date_prevue <= jusqua))
    ]
    if inclure_echeances:  # creances et dettes non reglees, a leur date d'echeance
        for f in factures_ouvertes(db):
            if f.date_echeance <= jusqua:
                flux.append((f.date_echeance, ENC if f.type_facture == TypeFacture.CREANCE else DEC, f.reste))

    periodes: dict[str, dict] = {}
    for d, type_mv, montant in flux:
        p = periodes.setdefault(cle_periode(d, granularite, aujourdhui),
                                {"encaissements": Decimal("0"), "decaissements": Decimal("0")})
        p["encaissements" if type_mv == ENC else "decaissements"] += montant

    resultat, cumul = [], sa
    for cle in sorted(periodes):
        p = periodes[cle]
        cumul += p["encaissements"] - p["decaissements"]
        risque = "NEGATIF" if cumul < 0 else "SOUS_SEUIL" if cumul < seuil else None
        resultat.append({"periode": cle, **p, "solde_previsionnel": cumul, "risque": risque})

    ep = sum((p["encaissements"] for p in periodes.values()), Decimal("0"))
    dp = sum((p["decaissements"] for p in periodes.values()), Decimal("0"))
    return {
        "solde_actuel": sa, "seuil_total": seuil, "jusqua": jusqua, "granularite": granularite,
        "total_encaissements": ep, "total_decaissements": dp, "solde_previsionnel": sa + ep - dp,
        "periodes": resultat, "periodes_a_risque": sum(1 for p in resultat if p["risque"]),
    }


@router.get("/realisation")
def realisation(debut: date, fin: date, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Compare previsions et realisations : E = reel - prevu, TRP et TDP en pourcentage."""
    if debut > fin:
        raise HTTPException(400, "Periode invalide")
    prevu = {ENC: Decimal("0"), DEC: Decimal("0")}
    for p in db.scalars(select(Prevision).where(Prevision.statut != StatutPrevision.ANNULE,
                                                Prevision.date_prevue >= debut, Prevision.date_prevue <= fin)):
        prevu[p.type_prevision] += D(p.montant)
    reel = {ENC: somme_mouvements(db, ENC, debut=debut, fin=fin), DEC: somme_mouvements(db, DEC, debut=debut, fin=fin)}

    def ligne(t):
        return {"prevu": prevu[t], "reel": reel[t], "ecart": reel[t] - prevu[t],
                "taux_realisation": round(float(reel[t] / prevu[t] * 100), 2) if prevu[t] else None}

    return {"debut": debut, "fin": fin, "recettes": ligne(ENC), "depenses": ligne(DEC)}
