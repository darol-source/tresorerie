const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const fmtAr = (n) => nombre.format(Number(n) || 0) + " Ar";
export const fmtNombre = (n) => nombre.format(Number(n) || 0);
export const fmtCompact = (n) => new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(Number(n) || 0);
export const fmtPct = (v) => (v === null || v === undefined ? "n/d" : `${nombre.format(v)} %`);

export const fmtDate = (d) => {
  if (!d) return "";
  const [y, m, j] = String(d).slice(0, 10).split("-");
  return `${j}/${m}/${y}`;
};
export const fmtDateHeure = (d) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const fmtMois = (ym) => {
  const [y, m] = String(ym).split("-");
  return `${MOIS[Number(m) - 1] || m} ${String(y).slice(2)}`;
};
export const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const debutMois = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1, 12).toISOString().slice(0, 10);
export const finMois = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).toISOString().slice(0, 10);
export const initiales = (u) => `${(u.prenom || "?")[0]}${(u.nom || "")[0] || ""}`.toUpperCase();
