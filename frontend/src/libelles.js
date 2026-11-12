export const ROLES_LIB = {
  ADMINISTRATEUR: "Administrateur", DIRECTEUR_GENERAL: "Directeur général", RESPONSABLE_FINANCIER: "Responsable financier",
  CAISSIER: "Caissier", COMPTABLE: "Comptable",
};
export const TYPE_MV = { ENCAISSEMENT: "Recette", DECAISSEMENT: "Dépense" };
export const TYPE_COMPTE = { CAISSE: "Caisse", BANQUE: "Banque", MOBILE_MONEY: "Mobile Money" };

// [libellé, ton]
export const STATUT_MV = { BROUILLON: ["En attente", "attente"], VALIDE: ["Validé", "ok"], ANNULE: ["Annulé", "ko"] };
export const STATUT_FACTURE = { NON_PAYEE: ["Non payée", "attente"], PARTIELLE: ["Partielle", "info"], PAYEE: ["Payée", "ok"], ANNULEE: ["Annulée", "ko"] };
export const STATUT_RAPPRO = { EN_COURS: ["En cours", "attente"], VALIDE: ["Validé", "ok"] };
export const STATUT_ENVOI = { ENVOYE: ["Envoyé", "ok"], ECHEC: ["Échec", "ko"], EN_COURS: ["En cours", "attente"] };
export const BUDGET_ETAT = { RESPECTE: ["Respecté", "ok"], EXACT: ["Atteint", "info"], DEPASSE: ["Dépassé", "ko"] };
