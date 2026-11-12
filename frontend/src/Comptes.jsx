import { useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Barre, Carte, Champ, Chargement, Kpi, Modal, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, fmtAr, fmtDate } from "./format.js";
import { STATUT_MV, TYPE_COMPTE } from "./libelles.js";

const vide = () => ({ id: null, libelle_compte: "", type_compte: "CAISSE", numero_compte: "", banque: "", devise: "MGA", solde_initial: "0", seuil_minimum: "0", date_ouverture: aujourdhui() });

export default function Comptes() {
  const { peut } = useAuth();
  const ui = useUI();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/comptes"), []);
  const [inactifs, setInactifs] = useState(false);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [histo, setHisto] = useState(null);

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const comptes = donnees || [];
  const actifs = comptes.filter((c) => c.actif);
  const visibles = inactifs ? comptes : actifs;
  const total = actifs.reduce((s, c) => s + Number(c.solde_actuel), 0);
  const maj = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const enregistrer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      if (form.id) {
        await api(`/comptes/${form.id}`, { method: "PUT", body: { libelle_compte: form.libelle_compte, numero_compte: form.numero_compte || null, banque: form.banque || null, seuil_minimum: String(form.seuil_minimum) } });
      } else {
        await api("/comptes", { method: "POST", body: { ...form, numero_compte: form.numero_compte || null, banque: form.type_compte === "BANQUE" ? form.banque || null : null, devise: form.devise.toUpperCase() } });
      }
      ui.succes(form.id ? "Compte modifié" : "Compte créé"); setForm(null); recharger();
    } catch (ex) { setErr(ex.message); }
  };

  const basculer = async (c) => {
    if (c.actif) {
      const ok = await ui.confirmer({ titre: `Désactiver « ${c.libelle_compte} » ?`, libelleOk: "Désactiver", danger: true,
        message: Number(c.solde_actuel) !== 0 ? `Ce compte a un solde de ${fmtAr(c.solde_actuel)}. Il ne pourra plus recevoir de nouvelles opérations.` : "Il ne pourra plus recevoir de nouvelles opérations. Son historique est conservé." });
      if (!ok) return;
    }
    try { await api(`/comptes/${c.id_compte}`, { method: "PUT", body: { actif: !c.actif } }); ui.succes(c.actif ? "Compte désactivé" : "Compte réactivé"); recharger(); }
    catch (ex) { ui.erreur(ex.message); }
  };

  const voirHistorique = async (c) => {
    setHisto({ compte: c, lignes: null });
    try {
      const [mv, tr] = await Promise.all([api(`/mouvements?id_compte=${c.id_compte}&limit=60`), api("/transferts")]);
      const lignes = [
        ...mv.map((m) => ({ cle: `m${m.id_mouvement}`, date: m.date_mouvement, ref: m.reference, libelle: m.libelle, montant: (m.type_mouvement === "ENCAISSEMENT" ? 1 : -1) * Number(m.montant), statut: m.statut })),
        ...tr.filter((t) => t.id_compte_source === c.id_compte || t.id_compte_destination === c.id_compte).map((t) => ({
          cle: `t${t.id_transfert}`, date: t.date_transfert, ref: t.reference, statut: t.statut,
          libelle: t.id_compte_source === c.id_compte ? `Transfert vers ${t.destination_libelle}` : `Transfert depuis ${t.source_libelle}`,
          montant: (t.id_compte_source === c.id_compte ? -1 : 1) * Number(t.montant) })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      setHisto({ compte: c, lignes });
    } catch (ex) { ui.erreur(ex.message); setHisto(null); }
  };

  return (
    <>
      <PageTete titre="Comptes de trésorerie" sousTitre="Caisses, comptes bancaires et Mobile Money."
        actions={peut("gerer") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm(vide()); }}><Icone nom="plus" />Nouveau compte</button>} />
      <div className="kpis">
        <Kpi libelle="Solde total" valeur={fmtAr(total)} icone="portefeuille" ton="brand" />
        <Kpi libelle="Comptes actifs" valeur={actifs.length} icone="comptes" />
        <Kpi libelle="Comptes sous le seuil" valeur={actifs.filter((c) => c.solde_faible).length} icone="alerte" ton={actifs.some((c) => c.solde_faible) ? "ko" : "ok"} />
      </div>
      {comptes.some((c) => !c.actif) && (
        <label className="texte-doux" style={{ display: "inline-flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />Afficher les comptes inactifs
        </label>
      )}

      {visibles.length ? (
        <div className="grille g-auto">
          {visibles.map((c) => (
            <Carte key={c.id_compte} classe={`compte ${c.actif ? "" : "inactif"}`}>
              <div className="compte-ligne" style={{ alignItems: "flex-start" }}>
                <div><h3 style={{ color: "var(--ink)" }}>{c.libelle_compte}</h3><span>{TYPE_COMPTE[c.type_compte]}{c.banque ? ` · ${c.banque}` : ""}{c.numero_compte ? ` · ${c.numero_compte}` : ""}</span></div>
                {!c.actif ? <Badge>Inactif</Badge> : c.solde_faible ? <Badge ton="ko">Solde faible</Badge> : <Badge ton="ok">Actif</Badge>}
              </div>
              <div className={`compte-solde ${c.solde_faible ? "texte-ko" : ""}`} style={{ marginTop: 10 }}>{fmtAr(c.solde_actuel)}</div>
              <div style={{ marginTop: 10 }}>
                <Barre pct={Number(c.seuil_minimum) > 0 ? (Number(c.solde_actuel) / (Number(c.seuil_minimum) * 2)) * 100 : 100} ton={c.solde_faible ? "ko" : "ok"} />
                <div className="compte-ligne" style={{ marginTop: 6 }}><span>Seuil minimum : {fmtAr(c.seuil_minimum)}</span><span>Ouvert le {fmtDate(c.date_ouverture)}</span></div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                <button className="btn btn-secondaire btn-sm" onClick={() => voirHistorique(c)}>Historique</button>
                {peut("gerer") && <button className="btn btn-lien btn-sm" onClick={() => { setErr(""); setForm({ ...c, id: c.id_compte, numero_compte: c.numero_compte || "", banque: c.banque || "", solde_initial: String(c.solde_initial), seuil_minimum: String(c.seuil_minimum) }); }}>Modifier</button>}
                {peut("gerer") && <button className={`btn btn-lien btn-sm ${c.actif ? "ko" : ""}`} onClick={() => basculer(c)}>{c.actif ? "Désactiver" : "Réactiver"}</button>}
              </div>
            </Carte>
          ))}
        </div>
      ) : <Carte><Vide icone="comptes" titre="Aucun compte" texte="Créez une caisse ou un compte bancaire pour commencer." /></Carte>}

      {form && (
        <Modal titre={form.id ? "Modifier le compte" : "Nouveau compte"} onClose={() => setForm(null)} onSubmit={enregistrer} err={err}>
          <Champ label="Libellé" full><input value={form.libelle_compte} onChange={maj("libelle_compte")} required autoFocus /></Champ>
          <Champ label="Type"><select value={form.type_compte} onChange={maj("type_compte")} disabled={!!form.id}>{Object.entries(TYPE_COMPTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
          <Champ label="Devise"><input value={form.devise} onChange={maj("devise")} maxLength={3} minLength={3} required disabled={!!form.id} /></Champ>
          {form.type_compte === "BANQUE" && <Champ label="Banque"><input value={form.banque} onChange={maj("banque")} /></Champ>}
          <Champ label="Numéro de compte"><input value={form.numero_compte} onChange={maj("numero_compte")} /></Champ>
          <Champ label="Solde initial (Ar)" aide={form.id ? "Non modifiable après création" : undefined}><input type="number" min="0" step="0.01" value={form.solde_initial} onChange={maj("solde_initial")} required disabled={!!form.id} /></Champ>
          <Champ label="Seuil minimum (Ar)" aide="Une alerte s'affiche sous ce montant"><input type="number" min="0" step="0.01" value={form.seuil_minimum} onChange={maj("seuil_minimum")} required /></Champ>
          {!form.id && <Champ label="Date d'ouverture"><input type="date" value={form.date_ouverture} onChange={maj("date_ouverture")} required /></Champ>}
        </Modal>
      )}

      {histo && (
        <Modal titre={`Historique — ${histo.compte.libelle_compte}`} sousTitre={`Solde actuel : ${fmtAr(histo.compte.solde_actuel)}`} taille="lg" onClose={() => setHisto(null)} sansChamps>
          {!histo.lignes ? <Chargement lignes={3} /> : histo.lignes.length ? (
            <div className="table-defile"><table className="tableau">
              <thead><tr><th>Date</th><th>Libellé</th><th className="num">Montant</th><th>Statut</th></tr></thead>
              <tbody>{histo.lignes.map((l) => (
                <tr key={l.cle}><td>{fmtDate(l.date)}</td><td>{l.libelle}<span className="sous">{l.ref}</span></td>
                  <td className={`num ${l.montant >= 0 ? "texte-ok" : "texte-ko"}`}>{l.montant >= 0 ? "+" : "−"}{fmtAr(Math.abs(l.montant))}</td>
                  <td><Badge ton={STATUT_MV[l.statut][1]}>{STATUT_MV[l.statut][0]}</Badge></td></tr>
              ))}</tbody>
            </table></div>
          ) : <Vide icone="mouvements" titre="Aucun mouvement" />}
        </Modal>
      )}
    </>
  );
}
