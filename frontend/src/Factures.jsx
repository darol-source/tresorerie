import { useEffect, useState } from "react";
import { api, qs, telecharger } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Kpi, Modal, Onglets, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, fmtAr, fmtDate, fmtPct } from "./format.js";
import { STATUT_FACTURE } from "./libelles.js";

export default function Factures() {
  const { peut } = useAuth();
  const ui = useUI();
  const [type, setType] = useState("CREANCE");
  const [statut, setStatut] = useState("");
  const { donnees: rows, chargement, erreur, recharger } = useChargement(() => api(`/factures${qs({ type_facture: type, statut_paiement: statut })}`), [type, statut]);
  const { donnees: syn, recharger: rechargerSyn } = useChargement(() => api("/factures/synthese"), []);
  const [ref, setRef] = useState({ tiers: [], comptes: [], modes: [], categories: [] });
  const [nouvelle, setNouvelle] = useState(null);
  const [ajout, setAjout] = useState(null);
  const [paiement, setPaiement] = useState(null);
  const [err, setErr] = useState("");

  const creance = type === "CREANCE";
  const cleTiers = creance ? "id_client" : "id_fournisseur";
  const nomTiers = creance ? "nom_client" : "nom_fournisseur";

  useEffect(() => { api(creance ? "/clients" : "/fournisseurs").then((tiers) => setRef((x) => ({ ...x, tiers }))).catch((e) => ui.erreur(e.message)); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all([api("/comptes?actifs_seulement=true"), api("/modes-paiement"), api("/categories")])
      .then(([comptes, modes, categories]) => setRef((x) => ({ ...x, comptes, modes, categories }))).catch((e) => ui.erreur(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tout = () => { recharger(); rechargerSyn(); };
  const bloc = syn && (creance ? syn.creances : syn.dettes);

  const creerTiers = async () => {
    if (!ajout?.trim()) return;
    try {
      const t = await api(creance ? "/clients" : "/fournisseurs", { method: "POST", body: { [nomTiers]: ajout.trim() } });
      setRef((x) => ({ ...x, tiers: [...x.tiers, t] }));
      setNouvelle((n) => ({ ...n, tiers: String(t[cleTiers]) })); setAjout(null);
      ui.succes(`${creance ? "Client" : "Fournisseur"} créé`);
    } catch (ex) { setErr(ex.message); }
  };

  const creer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      await api("/factures", { method: "POST", body: { type_facture: type, date_facture: nouvelle.date_facture, date_echeance: nouvelle.date_echeance, montant: String(nouvelle.montant), description: nouvelle.description || null, [cleTiers]: +nouvelle.tiers } });
      ui.succes("Facture enregistrée"); setNouvelle(null); tout();
    } catch (ex) { setErr(ex.message); }
  };

  const payer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      await api(`/factures/${paiement.id}/paiements`, { method: "POST", body: { date_mouvement: paiement.date_mouvement, montant: String(paiement.montant), id_compte: +paiement.id_compte, id_mode: +paiement.id_mode, id_categorie: +paiement.id_categorie } });
      ui.succes("Paiement enregistré en attente de validation"); setPaiement(null); tout();
    } catch (ex) { setErr(ex.message); }
  };

  const rappeler = async (f) => {
    const ok = await ui.confirmer({ titre: "Envoyer un rappel par e-mail ?", message: `Un rappel sera envoyé à ${f.tiers_nom} pour la facture ${f.reference}.`, libelleOk: "Envoyer" });
    if (!ok) return;
    try { const r = await api(`/rappels/facture/${f.id_facture}`, { method: "POST" }); ui.succes(`Rappel envoyé à ${r.envoye_a}`); } catch (ex) { ui.erreur(ex.message); }
  };

  const annuler = async (f) => {
    const motif = await ui.saisir({ titre: `Annuler la facture ${f.reference}`, libelle: "Motif", min: 3, libelleOk: "Annuler la facture", danger: true });
    if (!motif) return;
    try { await api(`/factures/${f.id_facture}/annuler`, { method: "POST", body: { motif } }); ui.succes("Facture annulée"); tout(); } catch (ex) { ui.erreur(ex.message); }
  };

  const liste = rows || [];
  const maj = (k) => (e) => setNouvelle({ ...nouvelle, [k]: e.target.value });
  const majP = (k) => (e) => setPaiement({ ...paiement, [k]: e.target.value });

  return (
    <>
      <PageTete titre="Créances et dettes" sousTitre="Une facture impayée est une créance ou une dette, pas une recette ni une dépense."
        actions={<>
          <div className="groupe-btn">{["xlsx", "pdf"].map((x) => <button key={x} className="btn btn-secondaire btn-sm" onClick={() => telecharger(`/rapports/factures/export${qs({ type_facture: type, format: x })}`, `factures.${x}`).catch((e) => ui.erreur(e.message))}>{x.toUpperCase()}</button>)}</div>
          {peut("saisir") && <button className="btn btn-primaire" onClick={() => { setErr(""); setAjout(null); setNouvelle({ date_facture: aujourdhui(), date_echeance: aujourdhui(), montant: "", tiers: "", description: "" }); }}><Icone nom="plus" />Nouvelle facture</button>}
        </>} />

      <Onglets valeur={type} onChange={(t) => { setType(t); setStatut(""); }} options={[["CREANCE", "Créances clients"], ["DETTE", "Dettes fournisseurs"]]} />
      {erreur && <Alerte ton="ko">{erreur}</Alerte>}

      {bloc && (
        <div className="kpis">
          <Kpi libelle="Total facturé" valeur={fmtAr(bloc.total_facture)} icone="factures" />
          <Kpi libelle={creance ? "Total encaissé" : "Total payé"} valeur={fmtAr(bloc.total_paye)} icone="check" ton="ok" />
          <Kpi libelle={creance ? "Reste à recevoir" : "Reste à payer"} valeur={fmtAr(bloc.reste)} icone="portefeuille" ton="brand" note={`${creance ? "Recouvrement" : "Règlement"} : ${fmtPct(bloc.taux)}`} />
          <Kpi libelle="En retard" valeur={bloc.nombre_en_retard} icone="alerte" ton={bloc.nombre_en_retard ? "ko" : "ok"} note={fmtAr(bloc.montant_en_retard)} />
        </div>
      )}

      <Carte plat>
        <div className="filtres">
          <select value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut"><option value="">Tous les statuts</option>{Object.entries(STATUT_FACTURE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          {syn && <span className="texte-doux">Position nette créances − dettes : <b className={syn.position_nette >= 0 ? "texte-ok" : "texte-ko"}>{fmtAr(syn.position_nette)}</b></span>}
        </div>
        {chargement && !rows ? <div className="carte-corps"><Chargement /></div> : liste.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Facture</th><th>{creance ? "Client" : "Fournisseur"}</th><th>Échéance</th><th className="num">Montant</th><th className="num">Réglé</th><th className="num">Reste</th><th>Statut</th><th /></tr></thead>
            <tbody>{liste.map((f) => {
              const [lib, ton] = STATUT_FACTURE[f.statut_paiement];
              const ouverte = f.reste > 0 && !f.annulee;
              return (
                <tr key={f.id_facture}>
                  <td>{f.reference}<span className="sous">{fmtDate(f.date_facture)}</span></td><td>{f.tiers_nom}</td>
                  <td>{fmtDate(f.date_echeance)}{f.en_retard && <span className="sous texte-ko">{f.jours_retard} jour(s) de retard</span>}</td>
                  <td className="num">{fmtAr(f.montant)}</td><td className="num">{fmtAr(f.montant_paye)}</td><td className="num"><b>{fmtAr(f.reste)}</b></td>
                  <td><Badge ton={ton}>{lib}</Badge></td>
                  <td className="actions">
                    {ouverte && peut("saisir") && <button className="btn btn-primaire btn-sm" onClick={() => { setErr(""); setPaiement({ id: f.id_facture, reference: f.reference, tiers: f.tiers_nom, reste: f.reste, date_mouvement: aujourdhui(), montant: f.reste, id_compte: "", id_mode: "", id_categorie: "" }); }}>{creance ? "Encaisser" : "Payer"}</button>}{" "}
                    {ouverte && creance && peut("saisir") && <button className="btn btn-lien btn-sm" onClick={() => rappeler(f)}><Icone nom="mail" taille={15} />Rappel</button>}
                    {!f.annulee && Number(f.montant_paye) === 0 && peut("valider") && <button className="btn btn-lien ko btn-sm" onClick={() => annuler(f)}>Annuler</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <Vide icone="factures" titre={creance ? "Aucune créance" : "Aucune dette"} texte="Enregistrez une facture à crédit pour suivre son règlement." />}
      </Carte>

      {nouvelle && (
        <Modal titre={creance ? "Nouvelle créance client" : "Nouvelle dette fournisseur"} onClose={() => setNouvelle(null)} onSubmit={creer} err={err}>
          <Champ label={creance ? "Client" : "Fournisseur"} full>
            <select value={nouvelle.tiers} onChange={maj("tiers")} required><option value="">{ref.tiers.some((t) => t.actif) ? "Choisir…" : "Aucun enregistré"}</option>
              {ref.tiers.filter((t) => t.actif).map((t) => <option key={t[cleTiers]} value={t[cleTiers]}>{t[nomTiers]}</option>)}</select>
          </Champ>
          {peut("gerer") && (
            <div className="full">
              {ajout === null ? <button type="button" className="btn btn-lien btn-sm" onClick={() => setAjout("")}><Icone nom="plus" taille={15} />Nouveau {creance ? "client" : "fournisseur"}</button> : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input autoFocus style={{ flex: 1 }} placeholder="Nom" value={ajout} onChange={(e) => setAjout(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); creerTiers(); } }} />
                  <button type="button" className="btn btn-primaire btn-sm" onClick={creerTiers}>Créer</button>
                  <button type="button" className="btn btn-secondaire btn-sm" onClick={() => setAjout(null)}>Annuler</button>
                </div>)}
            </div>)}
          <Champ label="Date de la facture"><input type="date" value={nouvelle.date_facture} onChange={maj("date_facture")} required /></Champ>
          <Champ label="Date d'échéance"><input type="date" value={nouvelle.date_echeance} min={nouvelle.date_facture} onChange={maj("date_echeance")} required /></Champ>
          <Champ label="Montant (Ar)"><input type="number" min="0.01" step="0.01" value={nouvelle.montant} onChange={maj("montant")} required /></Champ>
          <Champ label="Description (facultative)"><input value={nouvelle.description} onChange={maj("description")} maxLength={255} /></Champ>
        </Modal>
      )}

      {paiement && (
        <Modal titre={creance ? "Enregistrer un encaissement" : "Enregistrer un paiement"} sousTitre={`${paiement.reference} · ${paiement.tiers} · reste ${fmtAr(paiement.reste)}`} onClose={() => setPaiement(null)} onSubmit={payer} err={err} libelleOk="Enregistrer">
          <Champ label="Date"><input type="date" value={paiement.date_mouvement} onChange={majP("date_mouvement")} required /></Champ>
          <Champ label="Montant (Ar)" aide="Un paiement partiel est possible"><input type="number" min="0.01" step="0.01" max={paiement.reste} value={paiement.montant} onChange={majP("montant")} required /></Champ>
          <Champ label="Compte"><select value={paiement.id_compte} onChange={majP("id_compte")} required><option value="">Choisir…</option>{ref.comptes.map((c) => <option key={c.id_compte} value={c.id_compte}>{c.libelle_compte}</option>)}</select></Champ>
          <Champ label="Mode de paiement"><select value={paiement.id_mode} onChange={majP("id_mode")} required><option value="">Choisir…</option>{ref.modes.map((m) => <option key={m.id_mode} value={m.id_mode}>{m.libelle_mode}</option>)}</select></Champ>
          <Champ label="Catégorie" full><select value={paiement.id_categorie} onChange={majP("id_categorie")} required><option value="">Choisir…</option>{ref.categories.filter((c) => c.nature === (creance ? "RECETTE" : "DEPENSE") && c.actif).map((c) => <option key={c.id_categorie} value={c.id_categorie}>{c.libelle_categorie}</option>)}</select></Champ>
          <div className="full"><div className="bandeau info" style={{ marginBottom: 0 }}><Icone nom="info" />Le paiement est créé en attente : le reste n'est réduit qu'après sa validation.</div></div>
        </Modal>
      )}
    </>
  );
}
