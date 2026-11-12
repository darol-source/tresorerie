import { useState } from "react";
import { api, qs, telecharger } from "./api";
import { Alerte, Carte, Chargement, Kpi, PageTete, Segment, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, debutMois, finMois, fmtAr, fmtDate, fmtPct } from "./format.js";

const iso = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString().slice(0, 10);

function plage(preset) {
  const n = new Date();
  if (preset === "mois") return [debutMois(), aujourdhui()];
  if (preset === "precedent") { const p = new Date(n.getFullYear(), n.getMonth() - 1, 1); return [debutMois(p), finMois(p)]; }
  if (preset === "trimestre") return [iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)), aujourdhui()];
  if (preset === "annee") return [iso(new Date(n.getFullYear(), 0, 1)), aujourdhui()];
  return null;
}

export default function Rapports() {
  const ui = useUI();
  const [preset, setPreset] = useState("mois");
  const [[debut, fin], setPeriode] = useState(plage("mois"));
  const { donnees: r, chargement, erreur } = useChargement(() => api(`/rapports/periode${qs({ debut, fin })}`), [debut, fin]);

  const choisir = (p) => { setPreset(p); const x = plage(p); if (x) setPeriode(x); };
  const exporter = (format) => telecharger(`/rapports/periode/export${qs({ debut, fin, format })}`, `rapport_${debut}_${fin}.${format}`).catch((e) => ui.erreur(e.message));

  return (
    <>
      <PageTete titre="Rapports financiers" sousTitre="Synthèse des recettes et dépenses validées sur la période choisie."
        actions={<div className="groupe-btn">{["pdf", "xlsx"].map((x) => <button key={x} className="btn btn-secondaire" onClick={() => exporter(x)}><Icone nom="telecharger" taille={15} />{x.toUpperCase()}</button>)}</div>} />
      <div className="page-actions" style={{ marginBottom: 16 }}>
        <Segment valeur={preset} onChange={choisir} options={[["mois", "Ce mois"], ["precedent", "Mois précédent"], ["trimestre", "Trimestre"], ["annee", "Année"], ["perso", "Personnalisé"]]} />
        <input type="date" value={debut} max={fin} onChange={(e) => { setPreset("perso"); setPeriode([e.target.value, fin]); }} aria-label="Du" />
        <span className="texte-doux">au</span>
        <input type="date" value={fin} min={debut} onChange={(e) => { setPreset("perso"); setPeriode([debut, e.target.value]); }} aria-label="Au" />
      </div>

      {erreur && <Alerte ton="ko">{erreur}</Alerte>}
      {chargement && !r ? <Chargement lignes={5} /> : r && (
        <>
          <div className="kpis">
            <Kpi libelle="Solde initial" valeur={fmtAr(r.solde_initial)} icone="portefeuille" note={`au ${fmtDate(r.debut)}`} />
            <Kpi libelle="Recettes" valeur={fmtAr(r.total_recettes)} icone="flecheHaut" ton="ok" note={`${fmtPct(r.variation_recettes_pct)} vs période précédente`} />
            <Kpi libelle="Dépenses" valeur={fmtAr(r.total_depenses)} icone="flecheBas" ton="ko" note={`${fmtPct(r.variation_depenses_pct)} vs période précédente`} />
            <Kpi libelle="Solde final" valeur={fmtAr(r.solde_final)} icone="balance" ton="brand" note={`Variation : ${fmtAr(r.variation_tresorerie)}`} />
          </div>
          <div className="grille g-2">
            {[["Recettes par catégorie", r.recettes_par_categorie], ["Dépenses par catégorie", r.depenses_par_categorie]].map(([t, l]) => (
              <Carte key={t} titre={t} plat>
                {l.length ? <table className="tableau"><tbody>{l.map((c) => (
                  <tr key={c.categorie}><td>{c.categorie}</td><td className="num">{fmtAr(c.montant)}</td><td className="num texte-doux">{c.pourcentage} %</td></tr>
                ))}</tbody></table> : <Vide icone="categories" titre="Aucune opération sur la période" />}
              </Carte>
            ))}
          </div>
        </>
      )}
    </>
  );
}
