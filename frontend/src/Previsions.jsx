import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, qs } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Kpi, Modal, PageTete, Segment, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, debutMois, finMois, fmtAr, fmtCompact, fmtDate, fmtPct } from "./format.js";

export default function Previsions() {
  const { peut } = useAuth();
  const ui = useUI();
  const [gran, setGran] = useState("mois");
  const { donnees: s, chargement, erreur, recharger } = useChargement(() => api(`/previsions/solde${qs({ granularite: gran })}`), [gran]);
  const { donnees: liste, recharger: rechargerListe } = useChargement(() => api("/previsions?statut=PREVU"), []);
  const { donnees: real } = useChargement(() => api(`/previsions/realisation${qs({ debut: debutMois(), fin: finMois() })}`), []);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");

  const tout = () => { recharger(); rechargerListe(); };
  const creer = async (e) => {
    e.preventDefault(); setErr("");
    try { await api("/previsions", { method: "POST", body: { ...form, montant: String(form.montant) } }); ui.succes("Prévision enregistrée"); setForm(null); tout(); }
    catch (ex) { setErr(ex.message); }
  };
  const annuler = async (p) => {
    const ok = await ui.confirmer({ titre: "Annuler cette prévision ?", message: p.libelle, libelleOk: "Annuler la prévision", danger: true });
    if (!ok) return;
    try { await api(`/previsions/${p.id_prevision}/annuler`, { method: "PUT" }); ui.succes("Prévision annulée"); tout(); } catch (ex) { ui.erreur(ex.message); }
  };

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !s) return <Chargement lignes={5} />;
  const periodes = s.periodes.map((p) => ({ ...p, solde: Number(p.solde_previsionnel) }));

  return (
    <>
      <PageTete titre="Prévisions de trésorerie" sousTitre="Solde prévisionnel = solde actuel + encaissements prévus − décaissements prévus. Les échéances des créances et dettes sont incluses."
        actions={<>
          <Segment valeur={gran} onChange={setGran} options={[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"]]} />
          {peut("gerer") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm({ type_prevision: "ENCAISSEMENT", date_prevue: aujourdhui(), montant: "", libelle: "" }); }}><Icone nom="plus" />Nouvelle prévision</button>}
        </>} />
      {s.periodes_a_risque > 0 && <Alerte ton="ko">{s.periodes_a_risque} période(s) à risque : le solde prévisionnel passe sous le seuil minimum ou devient négatif.</Alerte>}
      <div className="kpis">
        <Kpi libelle="Solde actuel" valeur={fmtAr(s.solde_actuel)} icone="portefeuille" ton="brand" />
        <Kpi libelle="Encaissements prévus" valeur={fmtAr(s.total_encaissements)} icone="flecheHaut" ton="ok" note={`jusqu'au ${fmtDate(s.jusqua)}`} />
        <Kpi libelle="Décaissements prévus" valeur={fmtAr(s.total_decaissements)} icone="flecheBas" ton="ko" />
        <Kpi libelle="Solde prévisionnel" valeur={fmtAr(s.solde_previsionnel)} icone="previsions" ton={s.solde_previsionnel < 0 ? "ko" : "ok"} />
      </div>

      <div className="grille g-2-1">
        <Carte titre="Solde prévisionnel par période" sousTitre="La ligne pointillée est la somme des seuils minimums des comptes">
          {periodes.length ? (
            <div style={{ height: 260 }}><ResponsiveContainer>
              <LineChart data={periodes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" vertical={false} />
                <XAxis dataKey="periode" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} fontSize={12} width={52} />
                <Tooltip formatter={(v) => fmtAr(v)} />
                <ReferenceLine y={Number(s.seuil_total)} stroke="#b45309" strokeDasharray="5 5" />
                <Line dataKey="solde" name="Solde prévisionnel" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer></div>
          ) : <Vide icone="previsions" titre="Aucun flux prévu" texte="Ajoutez des prévisions ou des factures avec échéance." />}
        </Carte>
        <Carte titre="Réalisation du mois" sousTitre="Réel comparé au prévu">
          {real ? [["Recettes", real.recettes], ["Dépenses", real.depenses]].map(([n, l]) => (
            <div key={n} style={{ marginBottom: 14 }}>
              <div className="compte-ligne" style={{ color: "inherit" }}><b>{n}</b><span>{fmtPct(l.taux_realisation)}</span></div>
              <div className="compte-ligne"><span>Prévu {fmtAr(l.prevu)}</span><span>Réel {fmtAr(l.reel)}</span></div>
            </div>
          )) : <Chargement lignes={2} />}
        </Carte>
      </div>

      {periodes.length > 0 && (
        <Carte titre="Détail par période" plat><div className="table-defile"><table className="tableau">
          <thead><tr><th>Période</th><th className="num">Encaissements</th><th className="num">Décaissements</th><th className="num">Solde prévisionnel</th><th>Risque</th></tr></thead>
          <tbody>{s.periodes.map((p) => (
            <tr key={p.periode}><td>{p.periode}</td><td className="num texte-ok">{fmtAr(p.encaissements)}</td><td className="num texte-ko">{fmtAr(p.decaissements)}</td><td className="num"><b>{fmtAr(p.solde_previsionnel)}</b></td>
              <td>{p.risque ? <Badge ton="ko">{p.risque === "NEGATIF" ? "Solde négatif" : "Sous le seuil"}</Badge> : <Badge ton="ok">Aucun</Badge>}</td></tr>
          ))}</tbody>
        </table></div></Carte>
      )}

      <Carte titre="Prévisions saisies" plat>
        {(liste || []).length ? <div className="table-defile"><table className="tableau">
          <thead><tr><th>Date prévue</th><th>Type</th><th>Libellé</th><th className="num">Montant</th><th /></tr></thead>
          <tbody>{liste.map((p) => (
            <tr key={p.id_prevision}><td>{fmtDate(p.date_prevue)}</td><td><Badge ton={p.type_prevision === "ENCAISSEMENT" ? "ok" : "ko"}>{p.type_prevision === "ENCAISSEMENT" ? "Encaissement" : "Décaissement"}</Badge></td><td>{p.libelle}</td><td className="num">{fmtAr(p.montant)}</td>
              <td className="actions">{peut("gerer") && <button className="btn btn-lien ko btn-sm" onClick={() => annuler(p)}>Annuler</button>}</td></tr>
          ))}</tbody>
        </table></div> : <Vide icone="previsions" titre="Aucune prévision en attente" />}
      </Carte>

      {form && (
        <Modal titre="Nouvelle prévision" taille="sm" onClose={() => setForm(null)} onSubmit={creer} err={err}>
          <div className="full"><Segment valeur={form.type_prevision} onChange={(v) => setForm({ ...form, type_prevision: v })} options={[["ENCAISSEMENT", "Encaissement attendu"], ["DECAISSEMENT", "Décaissement prévu"]]} /></div>
          <Champ label="Date prévue"><input type="date" value={form.date_prevue} onChange={(e) => setForm({ ...form, date_prevue: e.target.value })} required /></Champ>
          <Champ label="Montant (Ar)"><input type="number" min="0.01" step="0.01" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} required /></Champ>
          <Champ label="Libellé" full><input value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} required maxLength={255} autoFocus /></Champ>
        </Modal>
      )}
    </>
  );
}
