import { api } from "./api";
import { useUI } from "./ui.jsx";

export function useActionsMouvement(apres) {
  const ui = useUI();
  const valider = async (mv) => {
    try {
      await api(`/mouvements/${mv.id_mouvement}/valider`, { method: "POST" });
      ui.succes(`Opération ${mv.reference} validée`);
      apres?.();
      return true;
    } catch (e) { ui.erreur(e.message); return false; }
  };
  const annuler = async (mv, verbe = "Annuler") => {
    const motif = await ui.saisir({
      titre: `${verbe} l'opération ${mv.reference}`, libelle: "Motif (conservé dans l'historique)", min: 3,
      message: mv.statut === "VALIDE" ? "Cette opération est validée : l'annuler modifiera le solde du compte." : undefined,
      libelleOk: verbe, danger: true,
    });
    if (!motif) return false;
    try {
      await api(`/mouvements/${mv.id_mouvement}/annuler`, { method: "POST", body: { motif } });
      ui.succes(`Opération ${mv.reference} annulée`);
      apres?.();
      return true;
    } catch (e) { ui.erreur(e.message); return false; }
  };
  return { valider, annuler };
}
