import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Modal, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, fmtAr, fmtDate } from "./format.js";
import { STATUT_MV } from "./libelles.js";

const vide = () => ({ id_compte_source: "", id_compte_destination: "", montant: "", date_transfert: aujourdhui(), motif: "" });

export default function Transferts() {
  const { peut } = useAuth();
  const ui = useUI();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/transferts"), []);
  const [comptes, setComptes] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const chargerComptes = useCallback(() => api("/comptes?actifs_seulement=true").then(setComptes).catch((e) => ui.erreur(e.message)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { chargerComptes(); }, [chargerComptes]);

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const source = comptes.find((c) => String(c.id_compte) === String(form?.id_compte_source));
  const maj = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const enregistrer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      await api("/transferts", { method: "POST", body: { ...form, montant: String(form.montant), id_compte_source: +form.id_compte_source, id_compte_destination: +form.id_compte_destination, motif: form.motif || null } });
      ui.succes("Transfert effectué"); setForm(null); recharger(); chargerComptes();
    } catch (ex) { setErr(ex.message); }
  };

  const annuler = async (t) => {
    const motif = await ui.saisir({ titre: `Annuler le transfert ${t.reference}`, libelle: "Motif", min: 3, libelleOk: "Annuler le transfert", danger: true,
      message: `${fmtAr(t.montant)} seront remis sur « ${t.source_libelle} » et retirés de « ${t.destination_libelle} ».` });
    if (!motif) return;
    try { await api(`/transferts/${t.id_transfert}/annuler`, { method: "POST", body: { motif } }); ui.succes("Transfert annulé"); recharger(); chargerComptes(); }
    catch (ex) { ui.erreur(ex.message); }
  };

  const rows = donnees || [];
  return (
    <>
      <PageTete titre="Transferts de fonds" sousTitre="Un transfert interne répartit l'argent entre les comptes sans changer le total de la trésorerie."
        actions={peut("saisir") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm(vide()); }}><Icone nom="plus" />Nouveau transfert</button>} />
      <Carte plat>
        {rows.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Date</th><th>Référence</th><th>De</th><th>Vers</th><th>Motif</th><th className="num">Montant</th><th>Statut</th><th /></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id_transfert}>
                <td>{fmtDate(t.date_transfert)}</td><td>{t.reference}</td><td>{t.source_libelle}</td><td>{t.destination_libelle}</td>
                <td>{t.motif || <span className="texte-doux">—</span>}{t.motif_annulation && <span className="sous">Annulé : {t.motif_annulation}</span>}</td>
                <td className="num">{fmtAr(t.montant)}</td>
                <td><Badge ton={STATUT_MV[t.statut][1]}>{STATUT_MV[t.statut][0]}</Badge></td>
                <td className="actions">{t.statut === "VALIDE" && peut("valider") && <button className="btn btn-lien ko btn-sm" onClick={() => annuler(t)}>Annuler</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Vide icone="transferts" titre="Aucun transfert" texte="Déplacez de l'argent d'une caisse vers une banque, par exemple." />}
      </Carte>

      {form && (
        <Modal titre="Nouveau transfert" onClose={() => setForm(null)} onSubmit={enregistrer} err={err}>
          <Champ label="Compte source" full>
            <select value={form.id_compte_source} onChange={maj("id_compte_source")} required><option value="">Choisir…</option>
              {comptes.map((c) => <option key={c.id_compte} value={c.id_compte}>{c.libelle_compte} — {fmtAr(c.solde_actuel)}</option>)}</select>
          </Champ>
          <Champ label="Compte destinataire" full>
            <select value={form.id_compte_destination} onChange={maj("id_compte_destination")} required><option value="">Choisir…</option>
              {comptes.filter((c) => String(c.id_compte) !== String(form.id_compte_source)).map((c) => <option key={c.id_compte} value={c.id_compte}>{c.libelle_compte}</option>)}</select>
          </Champ>
          <Champ label="Montant (Ar)" aide={source ? `Disponible : ${fmtAr(source.solde_actuel)}` : undefined}>
            <input type="number" min="0.01" step="0.01" max={source ? source.solde_actuel : undefined} value={form.montant} onChange={maj("montant")} required />
          </Champ>
          <Champ label="Date"><input type="date" value={form.date_transfert} onChange={maj("date_transfert")} required /></Champ>
          <Champ label="Motif (facultatif)" full><input value={form.motif} onChange={maj("motif")} maxLength={255} /></Champ>
        </Modal>
      )}
    </>
  );
}
