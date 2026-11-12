// Doit refléter backend/app/deps.py. Le serveur reste l'autorité : ces règles ne servent qu'à adapter l'affichage.
export const SEUIL_VALIDATION = 500000;

const A = "ADMINISTRATEUR", DG = "DIRECTEUR_GENERAL", RF = "RESPONSABLE_FINANCIER", CAISSIER = "CAISSIER", COMPTABLE = "COMPTABLE";
const REGLES = {
  saisir: [A, DG, RF, CAISSIER],
  valider: [A, DG, RF],
  validerEleve: [A, DG],
  gerer: [A, DG, RF],
  rapprocher: [A, DG, RF, COMPTABLE],
  administrer: [A],
};

export const peut = (user, action) => !!user && (REGLES[action] || []).includes(user.role_libelle);
export const peutValider = (user, mv) =>
  mv.type_mouvement === "DECAISSEMENT" && Number(mv.montant) > SEUIL_VALIDATION ? peut(user, "validerEleve") : peut(user, "valider");
