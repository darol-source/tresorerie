import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Barre, Carte, Champ, Chargement, Kpi, Modal, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { debutMois, fmtAr, fmtDate, fmtPct } from "./format.js";
import { BUDGET_ETAT } from "./libelles.js";

const PERIODES = { MENSUEL: "Mensuel", TRIMESTRIEL: "Trimestriel", ANNUEL: "Annuel" };

export default function Budgets() {
  const { peut } = useAuth();
  const ui = useUI();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/budgets"), []);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/categories").then(setCats).catch(() => {}); }, []);

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const rows = donnees || [];
  const total = rows.reduce((s, b) => s + Number(b.montant_previsionnel), 0);
  const depense = rows.reduce((s, b) => s + Number(b.depenses_reelles), 0);

  const enregistrer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      if (form.id) await api(`/budgets/${form.id}`, { method: "PUT", body: { montant_previsionnel: String(form.montant_previsionnel) } });
      else await api("/budgets", { method: "POST", body: { id_categorie: +form.id_categorie, montant_previsionnel: String(form.montant_previsionnel), periode: form.periode, date_debut: form.date_debut } });
      ui.succes(form.id ? "Budget modifié" : "Budget créé"); setForm(null); recharger();
    } catch (ex) { setErr(ex.message); }
  };

  const desactiver = async (b) => {
    const ok = await ui.confirmer({ titre: `Désactiver le budget « ${b.categorie_libelle} » ?`, libelleOk: "Désactiver", danger: true });
    if (!ok) return;
    try { await api(`/budgets/${b.id_budget}/desactiver`, { method: "PUT" }); ui.succes("Budget désactivé"); recharger(); } catch (ex) { ui.erreur(ex.message); }
  };

  return (
    <>
      <PageTete titre="Budgets prévisionnels" sousTitre="Comparez vos dépenses réelles validées au montant prévu pour chaque catégorie."
        actions={peut("gerer") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm({ id: null, id_categorie: "", montant_previsionnel: "", periode: "MENSUEL", date_debut: debutMois() }); }}><Icone nom="plus" />Nouveau budget</button>} />
      <div className="kpis">
        <Kpi libelle="Budgets actifs" valeur={rows.length} icone="budgets" />
        <Kpi libelle="Total budgété" valeur={fmtAr(total)} icone="portefeuille" ton="brand" />
        <Kpi libelle="Total dépensé" valeur={fmtAr(depense)} icone="flecheBas" ton="ko" note={total ? `${fmtPct((depense / total) * 100)} du total budgété` : undefined} />
        <Kpi libelle="Budgets dépassés" valeur={rows.filter((b) => b.etat === "DEPASSE").length} icone="alerte" ton={rows.some((b) => b.etat === "DEPASSE") ? "ko" : "ok"} />
      </div>

      {rows.length ? (
        <div className="grille g-auto">
          {rows.map((b) => {
            const pct = b.taux_consommation ?? 0;
            const ton = pct > 100 ? "ko" : pct >= 80 ? "warn" : "ok";
            const [lib, tonBadge] = BUDGET_ETAT[b.etat];
            return (
              <Carte key={b.id_budget} classe="compte">
                <div className="compte-ligne" style={{ alignItems: "flex-start" }}>
                  <div><h3 style={{ color: "var(--ink)" }}>{b.categorie_libelle}</h3><span>{PERIODES[b.periode]} · du {fmtDate(b.date_debut)} au {fmtDate(b.date_fin)}</span></div>
                  <Badge ton={tonBadge}>{lib}</Badge>
                </div>
                <div className="compte-solde">{fmtPct(pct)}</div>
                <Barre pct={pct} ton={ton} />
                <dl className="def" style={{ gridTemplateColumns: "1fr auto", gap: "4px 10px" }}>
                  <dt>Budget</dt><dd>{fmtAr(b.montant_previsionnel)}</dd>
                  <dt>Dépensé</dt><dd>{fmtAr(b.depenses_reelles)}</dd>
                  <dt>{b.etat === "DEPASSE" ? "Dépassement" : "Reste"}</dt><dd className={b.etat === "DEPASSE" ? "texte-ko" : "texte-ok"}>{fmtAr(b.etat === "DEPASSE" ? b.depassement : b.budget_restant)}</dd>
                </dl>
                {peut("gerer") && <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-lien btn-sm" onClick={() => { setErr(""); setForm({ id: b.id_budget, categorie_libelle: b.categorie_libelle, montant_previsionnel: String(b.montant_previsionnel) }); }}>Modifier le montant</button>
                  <button className="btn btn-lien ko btn-sm" onClick={() => desactiver(b)}>Désactiver</button>
                </div>}
              </Carte>
            );
          })}
        </div>
      ) : <Carte><Vide icone="budgets" titre="Aucun budget" texte="Définissez un montant prévu par catégorie de dépense pour suivre votre consommation." /></Carte>}

      {form && (
        <Modal titre={form.id ? `Modifier — ${form.categorie_libelle}` : "Nouveau budget"} taille="sm" onClose={() => setForm(null)} onSubmit={enregistrer} err={err}>
          {!form.id && <>
            <Champ label="Catégorie de dépense" full><select value={form.id_categorie} onChange={(e) => setForm({ ...form, id_categorie: e.target.value })} required><option value="">Choisir…</option>{cats.filter((c) => c.nature === "DEPENSE" && c.actif).map((c) => <option key={c.id_categorie} value={c.id_categorie}>{c.libelle_categorie}</option>)}</select></Champ>
            <Champ label="Période"><select value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })}>{Object.entries(PERIODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
            <Champ label="Date de début"><input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} required /></Champ>
          </>}
          <Champ label="Montant prévisionnel (Ar)" full><input type="number" min="1" step="0.01" value={form.montant_previsionnel} onChange={(e) => setForm({ ...form, montant_previsionnel: e.target.value })} required autoFocus /></Champ>
        </Modal>
      )}
    </>
  );
}
