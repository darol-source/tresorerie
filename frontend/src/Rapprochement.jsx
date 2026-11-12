import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Kpi, Modal, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, fmtAr, fmtDate } from "./format.js";
import { STATUT_RAPPRO } from "./libelles.js";

export default function Rapprochement() {
  const { peut } = useAuth();
  const ui = useUI();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/rapprochements"), []);
  const [comptes, setComptes] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  useEffect(() => { api("/comptes?actifs_seulement=true").then(setComptes).catch(() => {}); }, []);

  const ouvrir = async (id) => { try { setDetail(await api(`/rapprochements/${id}`)); } catch (ex) { ui.erreur(ex.message); } };

  const creer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      const r = await api("/rapprochements", { method: "POST", body: { id_compte: +form.id_compte, date_rapprochement: form.date_rapprochement, solde_reference: String(form.solde_reference), commentaire: form.commentaire || null } });
      ui.succes("Rapprochement créé"); setForm(null); recharger(); ouvrir(r.id_rapprochement);
    } catch (ex) { setErr(ex.message); }
  };

  const importer = async (e) => {
    const fichier = e.target.files[0]; e.target.value = "";
    if (!fichier) return;
    const fd = new FormData(); fd.append("fichier", fichier);
    try {
      const r = await api(`/rapprochements/${detail.rapprochement.id_rapprochement}/releve`, { method: "POST", form: fd });
      ui.succes(`${r.lignes_importees} ligne(s) importée(s) : ${r.rapprochees} rapprochée(s), ${r.non_rapprochees} sans correspondance`);
      ouvrir(detail.rapprochement.id_rapprochement);
    } catch (ex) { ui.erreur(ex.message); }
  };

  const valider = async () => {
    const r = detail.rapprochement;
    let commentaire = null;
    if (r.anomalie) {
      commentaire = await ui.saisir({ titre: "Justifier l'écart", message: `Écart constaté : ${fmtAr(r.ecart)}. Une justification est obligatoire pour valider.`, libelle: "Justification", min: 3, libelleOk: "Valider malgré l'écart" });
      if (!commentaire) return;
    }
    try { await api(`/rapprochements/${r.id_rapprochement}/valider`, { method: "POST", body: { commentaire } }); ui.succes("Rapprochement validé"); recharger(); ouvrir(r.id_rapprochement); }
    catch (ex) { ui.erreur(ex.message); }
  };

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const rows = donnees || [];
  const r = detail?.rapprochement;

  return (
    <>
      <PageTete titre="Rapprochement et contrôle de caisse" sousTitre="Comparez le solde réel (caisse) ou le relevé (banque) au solde comptable de l'application."
        actions={peut("rapprocher") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm({ id_compte: "", date_rapprochement: aujourdhui(), solde_reference: "", commentaire: "" }); }}><Icone nom="plus" />Nouveau rapprochement</button>} />

      <Carte plat>
        {rows.length ? <div className="table-defile"><table className="tableau">
          <thead><tr><th>Date</th><th>Compte</th><th className="num">Solde réel / relevé</th><th className="num">Solde comptable</th><th className="num">Écart</th><th>Statut</th><th /></tr></thead>
          <tbody>{rows.map((x) => (
            <tr key={x.id_rapprochement} className="cliquable" onClick={() => ouvrir(x.id_rapprochement)}>
              <td>{fmtDate(x.date_rapprochement)}</td><td>{x.compte_libelle}</td><td className="num">{fmtAr(x.solde_reference)}</td><td className="num">{fmtAr(x.solde_comptable)}</td>
              <td className={`num ${x.anomalie ? "texte-ko" : "texte-ok"}`}><b>{fmtAr(x.ecart)}</b></td>
              <td><Badge ton={STATUT_RAPPRO[x.statut][1]}>{STATUT_RAPPRO[x.statut][0]}</Badge></td>
              <td className="actions"><button className="btn btn-lien btn-sm">Ouvrir</button></td>
            </tr>
          ))}</tbody>
        </table></div> : <Vide icone="rapprochement" titre="Aucun rapprochement" texte="Saisissez le solde réel d'une caisse ou le solde d'un relevé bancaire." />}
      </Carte>

      {r && (
        <Carte titre={`${r.compte_libelle} au ${fmtDate(r.date_rapprochement)}`} sousTitre={r.commentaire || undefined}
          actions={<>
            {r.statut !== "VALIDE" && peut("rapprocher") && <label className="btn btn-secondaire btn-sm" style={{ cursor: "pointer" }}><Icone nom="telecharger" taille={15} />Importer un relevé CSV<input type="file" accept=".csv" onChange={importer} style={{ display: "none" }} /></label>}
            {r.statut !== "VALIDE" && peut("valider") && <button className="btn btn-primaire btn-sm" onClick={valider}>Valider</button>}
            <button className="btn btn-secondaire btn-sm" onClick={() => setDetail(null)}>Fermer</button>
          </>}>
          <div className="kpis" style={{ marginBottom: 12 }}>
            <Kpi libelle="Solde réel / relevé" valeur={fmtAr(r.solde_reference)} icone="portefeuille" />
            <Kpi libelle="Solde comptable" valeur={fmtAr(r.solde_comptable)} icone="comptes" />
            <Kpi libelle="Écart" valeur={fmtAr(r.ecart)} icone={r.anomalie ? "alerte" : "check"} ton={r.anomalie ? "ko" : "ok"} note={r.anomalie ? "Anomalie à vérifier" : "Aucun écart"} />
            <Kpi libelle="Opérations non rapprochées" valeur={detail.nombre_non_rapprochees} icone="rapprochement" ton={detail.nombre_non_rapprochees ? "attente" : "ok"} />
          </div>
          {r.statut !== "VALIDE" && <p className="texte-doux" style={{ marginBottom: 12 }}>Format du relevé : colonnes <b>date;libelle;montant</b> (montant positif = entrée, négatif = sortie).</p>}
          <div className="grille g-2" style={{ marginBottom: 0 }}>
            <div><h4 style={{ marginBottom: 8 }}>Lignes du relevé sans correspondance</h4>
              {detail.releve_non_rapproche.length ? <table className="tableau"><tbody>{detail.releve_non_rapproche.map((l, i) => <tr key={i}><td>{fmtDate(l.date)}</td><td>{l.libelle}</td><td className="num">{fmtAr(l.montant)}</td></tr>)}</tbody></table> : <span className="texte-doux">Aucune</span>}</div>
            <div><h4 style={{ marginBottom: 8 }}>Opérations enregistrées absentes du relevé</h4>
              {detail.operations_non_rapprochees.length ? <table className="tableau"><tbody>{detail.operations_non_rapprochees.map((o) => <tr key={o.type + o.id}><td>{fmtDate(o.date)}</td><td>{o.libelle}<span className="sous">{o.reference}</span></td><td className={`num ${o.montant >= 0 ? "texte-ok" : "texte-ko"}`}>{fmtAr(o.montant)}</td></tr>)}</tbody></table> : <span className="texte-doux">Aucune</span>}</div>
          </div>
        </Carte>
      )}

      {form && (
        <Modal titre="Nouveau rapprochement" taille="sm" onClose={() => setForm(null)} onSubmit={creer} err={err}>
          <Champ label="Compte" full><select value={form.id_compte} onChange={(e) => setForm({ ...form, id_compte: e.target.value })} required><option value="">Choisir…</option>{comptes.map((c) => <option key={c.id_compte} value={c.id_compte}>{c.libelle_compte}</option>)}</select></Champ>
          <Champ label="Date"><input type="date" value={form.date_rapprochement} onChange={(e) => setForm({ ...form, date_rapprochement: e.target.value })} required /></Champ>
          <Champ label="Solde réel ou relevé (Ar)"><input type="number" step="0.01" value={form.solde_reference} onChange={(e) => setForm({ ...form, solde_reference: e.target.value })} required /></Champ>
          <Champ label="Commentaire (facultatif)" full><input value={form.commentaire} onChange={(e) => setForm({ ...form, commentaire: e.target.value })} maxLength={255} /></Champ>
        </Modal>
      )}
    </>
  );
}
