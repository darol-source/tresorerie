import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App, { PAGES } from "../App.jsx";
import { UIProvider } from "../ui.jsx";

/* ---------------------------------------------------------------- données simulées */
const u = (role, id = 1) => ({ id_utilisateur: id, nom: "Admin", prenom: "Super", email: "a@b.mg", actif: true, id_role: 1, role_libelle: role });
const mv = (id, type, statut, montant) => ({
  id_mouvement: id, reference: `REF-${id}`, date_mouvement: "2026-11-09", libelle: `Opération ${id}`, montant, type_mouvement: type, statut,
  piece_justificative: null, id_compte: 1, id_categorie: 1, id_mode: 1, id_utilisateur: 1, id_client: null, id_fournisseur: null, id_validateur: null,
  id_facture: null, date_validation: null, motif_annulation: null, date_creation: "2026-11-09T08:00:00", compte_libelle: "Caisse principale",
  categorie_libelle: "Ventes", mode_libelle: "ESPECES", utilisateur_nom: "Super Admin",
});
const comptes = [
  { id_compte: 1, libelle_compte: "Caisse principale", type_compte: "CAISSE", numero_compte: null, banque: null, devise: "MGA", solde_initial: 5000000, seuil_minimum: 500000, date_ouverture: "2026-01-01", actif: true, solde_actuel: 6200000, solde_faible: false },
  { id_compte: 2, libelle_compte: "Compte BNI", type_compte: "BANQUE", numero_compte: "123", banque: "BNI", devise: "MGA", solde_initial: 800000, seuil_minimum: 1000000, date_ouverture: "2026-01-01", actif: true, solde_actuel: 300000, solde_faible: true },
];
const facture = { id_facture: 1, reference: "FAC-C-1", type_facture: "CREANCE", date_facture: "2026-10-01", date_echeance: "2026-10-15", montant: 1000000, description: null, annulee: false, id_client: 1, id_fournisseur: null, tiers_nom: "Client Alpha", montant_paye: 400000, reste: 600000, statut_paiement: "PARTIELLE", jours_retard: 25, en_retard: true };
const bloc = { total_facture: 1000000, total_paye: 400000, reste: 600000, taux: 40, nombre_en_retard: 1, montant_en_retard: 600000, tiers: [] };
const rapprochement = { id_rapprochement: 1, id_compte: 1, compte_libelle: "Caisse principale", date_rapprochement: "2026-11-09", solde_reference: 6199500, solde_comptable: 6200000, ecart: -500, statut: "EN_COURS", commentaire: null, anomalie: true };

const DONNEES = {
  "GET /dashboard": { solde_total: 6500000, total_recettes: 2000000, total_depenses: 700000, variation_nette: 1300000, taux_depenses: 35, recettes_jour: 0, depenses_jour: 0, recettes_mois: 2000000, depenses_mois: 700000,
    soldes_comptes: [{ id_compte: 1, libelle: "Caisse principale", type: "CAISSE", solde: 6200000, seuil_minimum: 500000, solde_faible: false }, { id_compte: 2, libelle: "Compte BNI", type: "BANQUE", solde: 300000, seuil_minimum: 1000000, solde_faible: true }],
    recettes_par_categorie: [{ categorie: "Ventes", montant: 2000000, pourcentage: 100 }], depenses_par_categorie: [{ categorie: "Achats", montant: 700000, pourcentage: 100 }],
    evolution: [{ mois: "2026-10", recettes: 1000000, depenses: 300000, solde: 5700000 }, { mois: "2026-11", recettes: 1000000, depenses: 400000, solde: 6500000 }],
    dernieres_transactions: [mv(1, "ENCAISSEMENT", "VALIDE", 2000000)], operations_en_attente: 2, total_creances: 600000, total_dettes: 0, position_nette: 600000, alertes: ["Solde faible sur le compte Compte BNI"] },
  "GET /mouvements": [mv(1, "ENCAISSEMENT", "VALIDE", 2000000), mv(2, "DECAISSEMENT", "BROUILLON", 700000), mv(3, "DECAISSEMENT", "BROUILLON", 100000)],
  "GET /comptes": comptes,
  "GET /categories": [{ id_categorie: 1, libelle_categorie: "Ventes", nature: "RECETTE", description: null, actif: true }, { id_categorie: 2, libelle_categorie: "Achats", nature: "DEPENSE", description: "Marchandises", actif: true }],
  "GET /modes-paiement": [{ id_mode: 1, libelle_mode: "ESPECES" }],
  "GET /clients": [{ id_client: 1, nom_client: "Client Alpha", telephone: null, email: null, adresse: null, actif: true }],
  "GET /fournisseurs": [{ id_fournisseur: 1, nom_fournisseur: "Fournisseur Beta", telephone: "034", email: "f@x.mg", adresse: null, actif: true }],
  "GET /transferts": [{ id_transfert: 1, reference: "TRF-1", date_transfert: "2026-11-09", montant: 1000000, motif: "Dépôt en banque", statut: "VALIDE", id_compte_source: 1, id_compte_destination: 2, id_utilisateur: 1, motif_annulation: null, source_libelle: "Caisse principale", destination_libelle: "Compte BNI" }],
  "GET /factures": [facture],
  "GET /factures/synthese": { creances: bloc, dettes: { ...bloc, total_facture: 0, total_paye: 0, reste: 0, taux: null, nombre_en_retard: 0, montant_en_retard: 0 }, position_nette: 600000 },
  "GET /budgets": [{ id_budget: 1, id_categorie: 2, categorie_libelle: "Achats", montant_previsionnel: 1000000, periode: "MENSUEL", date_debut: "2026-11-01", date_fin: "2026-11-30", actif: true, depenses_reelles: 1200000, budget_restant: -200000, taux_consommation: 120, depassement: 200000, ecart: -200000, etat: "DEPASSE" }],
  "GET /previsions/solde": { solde_actuel: 6500000, seuil_total: 1500000, jusqua: "2026-12-09", granularite: "mois", total_encaissements: 1100000, total_decaissements: 300000, solde_previsionnel: 7300000, periodes: [{ periode: "2026-11", encaissements: 1100000, decaissements: 300000, solde_previsionnel: 7300000, risque: null }, { periode: "2026-12", encaissements: 0, decaissements: 9000000, solde_previsionnel: -1700000, risque: "NEGATIF" }], periodes_a_risque: 1 },
  "GET /previsions": [{ id_prevision: 1, type_prevision: "ENCAISSEMENT", date_prevue: "2026-11-20", montant: 500000, libelle: "Vente attendue", id_categorie: null, id_compte: null, statut: "PREVU", id_mouvement: null }],
  "GET /previsions/realisation": { debut: "2026-11-01", fin: "2026-11-30", recettes: { prevu: 500000, reel: 250000, ecart: -250000, taux_realisation: 50 }, depenses: { prevu: 0, reel: 700000, ecart: 700000, taux_realisation: null } },
  "GET /rapprochements": [rapprochement],
  "GET /rapprochements/1": { rapprochement, lignes_releve: [], releve_non_rapproche: [{ date: "2026-11-09", libelle: "Frais inconnus", montant: -1234 }], operations_non_rapprochees: [{ type: "MOUVEMENT", id: 1, date: "2026-11-09", reference: "REF-1", libelle: "Opération 1", montant: 2000000 }], nombre_non_rapprochees: 2 },
  "GET /rapports/periode": { debut: "2026-11-01", fin: "2026-11-12", solde_initial: 5000000, total_recettes: 2000000, total_depenses: 700000, solde_final: 6300000, variation_tresorerie: 1300000, periode_precedente: {}, variation_recettes_pct: 10, variation_depenses_pct: null, recettes_par_categorie: [{ categorie: "Ventes", montant: 2000000, pourcentage: 100 }], depenses_par_categorie: [] },
  "GET /rappels/config": { smtp_configure: true, automatique: false, heure: 8, calendrier: [-3, 0, 1, 7, 15], mode_test: true, adresse_test: "moi@exemple.mg", expediteur: "compta@societe.mg", societe: "Ma société" },
  "GET /rappels/historique": [{ id_rappel: 1, id_facture: 1, facture_reference: "FAC-C-1", client_nom: "Client Alpha", type_rappel: "AUTO", etape: 1, destinataire: "c@x.mg", envoye_a: "moi@exemple.mg", objet: "x", statut: "ENVOYE", erreur: null, date_envoi: "2026-11-09T08:00:00" }],
  "GET /rappels/apercu": { a_envoyer: [{ id_facture: 1, reference: "FAC-C-1", client: "Client Alpha", email: "c@x.mg", envoye_a: "moi@exemple.mg", etape: 1, objet: "x", texte: "y" }], ignores: [{ id_facture: 2, reference: "FAC-C-2", client: "Sans Mail", raison: "Client sans adresse e-mail valide" }] },
  "GET /utilisateurs": [u("ADMINISTRATEUR", 1), { ...u("CAISSIER", 2), nom: "Rakoto", prenom: "Jean", id_role: 4, email: "j@x.mg" }],
  "GET /roles": [{ id_role: 1, libelle_role: "ADMINISTRATEUR", description: "" }, { id_role: 4, libelle_role: "CAISSIER", description: "" }],
  "GET /notifications": [{ id_notification: 1, type_notification: "SOLDE_FAIBLE", message: "Solde faible sur le compte Compte BNI", lu: false, date_creation: "2026-11-09T08:00:00" }],
  "GET /notifications/compteur": { non_lues: 1 },
  "GET /agent/statut": { actif: true, modele: "qwen2.5:7b", local: true, fournisseur: "ollama", detail: "" },
  "POST /agent/chat": { reponse: "Votre trésorerie est saine.", propositions: [{ token: "jeton", action: "client", description: "Créer le client Société Test" }] },
  "POST /agent/executer": { message: "Client Société Test créé." },
  "POST /mouvements": mv(9, "ENCAISSEMENT", "BROUILLON", 5000),
  "POST /mouvements/3/valider": mv(3, "DECAISSEMENT", "VALIDE", 100000),
  "POST /mouvements/2/annuler": mv(2, "DECAISSEMENT", "ANNULE", 700000),
};

/* ---------------------------------------------------------------- environnement */
let appels, erreursReact;

function installer(role) {
  appels = [];
  DONNEES["GET /auth/me"] = u(role);
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const chemin = String(url).replace(/^\/api/, "").split("?")[0];
    const cle = `${opts.method || "GET"} ${chemin}`;
    appels.push({ cle, corps: opts.body ? JSON.parse(opts.body) : null });
    if (!(cle in DONNEES)) return { ok: false, status: 404, json: async () => ({ detail: `Non simulé : ${cle}` }) };
    let data = DONNEES[cle];
    if (cle === "GET /mouvements") {                                   // la fausse API honore le filtre de statut
      const statut = new URLSearchParams(String(url).split("?")[1] || "").get("statut");
      if (statut) data = data.filter((m) => m.statut === statut);
    }
    return { ok: true, status: 200, json: async () => data };
  }));
}

async function ouvrir(page = "dashboard", role = "ADMINISTRATEUR") {
  installer(role);
  localStorage.setItem("token", "t");
  window.location.hash = `#/${page}`;
  render(<UIProvider><App /></UIProvider>);
  await screen.findByRole("heading", { level: 1, name: PAGES[page].titre });
}
const aller = async (page) => {
  window.location.hash = `#/${page}`;
  await screen.findByRole("heading", { level: 1, name: PAGES[page].titre });
  await waitFor(() => expect(document.querySelectorAll(".contenu .sk").length).toBe(0));
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.scrollTo = () => {};
  erreursReact = [];
  vi.spyOn(console, "error").mockImplementation((...a) => { erreursReact.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const graves = () => erreursReact.filter((m) => /unique "key"|The above error occurred|validateDOMNesting|Invalid DOM|Cannot read|is not a function|is not defined/.test(m));

/* ---------------------------------------------------------------- tests */
describe("navigation : chaque écran s'affiche avec des données réalistes", () => {
  const ATTENDU = {
    dashboard: "Solde total de trésorerie", assistant: "Comment puis-je vous aider", rapports: "Recettes par catégorie", mouvements: "Opération 2", validations: "Opérations à valider",
    transferts: "Dépôt en banque", factures: "Client Alpha", comptes: "Caisse principale", categories: "Nouvelle catégorie", tiers: "Client Alpha", budgets: "Dépassé",
    previsions: "Solde négatif", rapprochement: "Caisse principale", rappels: "Mode test actif", utilisateurs: "Rakoto", notifications: "Solde faible sur le compte Compte BNI",
  };
  it("parcourt toutes les pages sans erreur d'affichage", async () => {
    await ouvrir("dashboard");
    for (const page of Object.keys(PAGES)) {
      await aller(page);
      await waitFor(() => expect(document.body.textContent).toContain(ATTENDU[page]));
      expect(document.body.textContent).not.toContain("erreur d'affichage");
    }
    expect(graves()).toEqual([]);
    expect(appels.filter((a) => a.cle.startsWith("GET")).every((a) => a.cle in DONNEES)).toBe(true); // aucun appel imprévu
  });
});

describe("droits par rôle", () => {
  it("le caissier ne voit ni Utilisateurs ni Validations, et ne peut pas valider", async () => {
    await ouvrir("mouvements", "CAISSIER");
    expect(screen.queryByRole("button", { name: /Utilisateurs/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Validations/ })).toBeNull();
    await waitFor(() => screen.getByText("Opération 2"));
    expect(screen.getByRole("button", { name: /Nouvelle opération/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
  });
  it("le comptable ne peut pas saisir", async () => {
    await ouvrir("mouvements", "COMPTABLE");
    await waitFor(() => screen.getByText("Opération 2"));
    expect(screen.queryByRole("button", { name: /Nouvelle opération/ })).toBeNull();
  });
  it("le responsable financier ne peut pas valider une dépense au-dessus du seuil", async () => {
    await ouvrir("validations", "RESPONSABLE_FINANCIER");
    await waitFor(() => screen.getByText("Opération 2"));
    expect(screen.getByText("Réservé à la direction")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Valider" }).length).toBe(1); // seule l'opération de 100 000 Ar
  });
});

describe("actions", () => {
  it("saisit une nouvelle opération", async () => {
    await ouvrir("mouvements");
    await waitFor(() => screen.getByText("Opération 1"));
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle opération/ }));
    const d = within(screen.getByRole("dialog"));
    fireEvent.change(d.getByLabelText("Libellé"), { target: { value: "Vente comptoir" } });
    fireEvent.change(d.getByLabelText("Montant (Ar)"), { target: { value: "5000" } });
    fireEvent.change(d.getByLabelText("Compte"), { target: { value: "1" } });
    fireEvent.change(d.getByLabelText("Catégorie"), { target: { value: "1" } });
    fireEvent.change(d.getByLabelText("Mode de paiement"), { target: { value: "1" } });
    fireEvent.click(d.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(appels.some((a) => a.cle === "POST /mouvements")).toBe(true));
    const corps = appels.find((a) => a.cle === "POST /mouvements").corps;
    expect(corps).toMatchObject({ libelle: "Vente comptoir", montant: "5000", type_mouvement: "ENCAISSEMENT", id_compte: 1, id_categorie: 1, id_mode: 1, id_client: null });
  });

  it("valide puis refuse avec motif depuis la file de validation", async () => {
    await ouvrir("validations");
    await waitFor(() => screen.getByText("Opération 3"));
    const ligne3 = screen.getByText("Opération 3").closest("tr");
    fireEvent.click(within(ligne3).getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(appels.some((a) => a.cle === "POST /mouvements/3/valider")).toBe(true));

    const ligne2 = screen.getByText("Opération 2").closest("tr");
    fireEvent.click(within(ligne2).getByRole("button", { name: "Refuser" }));
    const d = within(await screen.findByRole("dialog"));
    fireEvent.click(d.getByRole("button", { name: "Refuser" }));               // motif obligatoire
    expect(d.getByText(/Saisie obligatoire/)).toBeTruthy();
    fireEvent.change(d.getByRole("textbox"), { target: { value: "Doublon de saisie" } });
    fireEvent.click(d.getByRole("button", { name: "Refuser" }));
    await waitFor(() => expect(appels.find((a) => a.cle === "POST /mouvements/2/annuler")?.corps).toEqual({ motif: "Doublon de saisie" }));
  });

  it("l'assistant répond, propose une action et l'exécute après confirmation", async () => {
    await ouvrir("assistant");
    await waitFor(() => screen.getByText(/Modèle : qwen2.5:7b/));
    fireEvent.change(screen.getByLabelText("Votre question"), { target: { value: "Quel est mon solde ?" } });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    await screen.findByText("Votre trésorerie est saine.");
    expect(screen.getByText("Créer le client Société Test")).toBeTruthy();
    expect(appels.some((a) => a.cle === "POST /agent/executer")).toBe(false);   // rien avant confirmation
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await screen.findByText("Client Société Test créé.");
    expect(appels.find((a) => a.cle === "POST /agent/executer").corps).toEqual({ token: "jeton" });
  });

  it("affiche l'écran de connexion sans jeton", async () => {
    installer("ADMINISTRATEUR");
    window.location.hash = "";
    render(<UIProvider><App /></UIProvider>);
    expect(await screen.findByRole("heading", { name: "Connexion" })).toBeTruthy();
  });
});
