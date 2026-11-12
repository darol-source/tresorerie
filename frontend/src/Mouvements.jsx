import { useCallback, useEffect, useState } from "react";
import { api, qs, telecharger } from "./api";
import { useAuth } from "./auth.jsx";
import { Badge, Carte, Champ, Chargement, Modal, PageTete, Segment, Vide, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { aujourdhui, fmtAr, fmtDate, fmtDateHeure } from "./format.js";
import { STATUT_MV, TYPE_MV } from "./libelles.js";
import { peutValider } from "./droits.js";
import { useActionsMouvement } from "./actionsMouvement.js";

const PAGE = 50;
const vide = () => ({ id: null, type_mouvement: "ENCAISSEMENT", date_mouvement: aujourdhui(), libelle: "", montant: "", id_compte: "", id_categorie: "", id_mode: "", id_client: "", id_fournisseur: "", id_facture: null, fichier: null });

export default function Mouvements() {
  const { user, peut } = useAuth();
  const ui = useUI();
  const [filtre, setFiltre] = useState({ q: "", type_mouvement: "", statut: "", id_compte: "", date_debut: "", date_fin: "" });
  const [rows, setRows] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [encore, setEncore] = useState(false);
  const [ref, setRef] = useState({ comptes: [], categories: [], modes: [], clients: [], fournisseurs: [] });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [detail, setDetail] = useState(null);

  const charger = useCallback(async (suite = false) => {
    setChargement(true);
    try {
      const skip = suite ? rows.length : 0;
      const lot = await api(`/mouvements${qs({ ...filtre, skip, limit: PAGE })}`);
      setRows(suite ? [...rows, ...lot] : lot);
      setEncore(lot.length === PAGE);
    } catch (e) { ui.erreur(e.message); }
    finally { setChargement(false); }
  }, [filtre]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => charger(false), 250); return () => clearTimeout(t); }, [charger]);
  useEffect(() => {
    Promise.all([api("/comptes?actifs_seulement=true"), api("/categories"), api("/modes-paiement"), api("/clients"), api("/fournisseurs")])
      .then(([comptes, categories, modes, clients, fournisseurs]) => setRef({ comptes, categories, modes, clients: clients.filter((x) => x.actif), fournisseurs: fournisseurs.filter((x) => x.actif) }))
      .catch((e) => ui.erreur(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { valider, annuler } = useActionsMouvement(() => { charger(false); setDetail(null); });
  const maj = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const nature = form?.type_mouvement === "ENCAISSEMENT" ? "RECETTE" : "DEPENSE";

  const ouvrirEdition = (m) => {
    setErr(""); setDetail(null);
    setForm({ id: m.id_mouvement, type_mouvement: m.type_mouvement, date_mouvement: m.date_mouvement, libelle: m.libelle, montant: String(m.montant),
      id_compte: String(m.id_compte), id_categorie: String(m.id_categorie), id_mode: String(m.id_mode),
      id_client: m.id_client ? String(m.id_client) : "", id_fournisseur: m.id_fournisseur ? String(m.id_fournisseur) : "", id_facture: m.id_facture, fichier: null });
  };

  const enregistrer = async (e) => {
    e.preventDefault(); setErr(""); setOccupe(true);
    const corps = {
      date_mouvement: form.date_mouvement, libelle: form.libelle, montant: String(form.montant), type_mouvement: form.type_mouvement,
      id_compte: +form.id_compte, id_categorie: +form.id_categorie, id_mode: +form.id_mode,
      id_client: form.type_mouvement === "ENCAISSEMENT" && form.id_client ? +form.id_client : null,
      id_fournisseur: form.type_mouvement === "DECAISSEMENT" && form.id_fournisseur ? +form.id_fournisseur : null,
      id_facture: form.id_facture || null,
    };
    try {
      const r = form.id ? await api(`/mouvements/${form.id}`, { method: "PUT", body: corps }) : await api("/mouvements", { method: "POST", body: corps });
      if (form.fichier) {
        const fd = new FormData(); fd.append("fichier", form.fichier);
        await api(`/mouvements/${r.id_mouvement}/piece`, { method: "POST", form: fd });
      }
      ui.succes(form.id ? "Opération modifiée" : `Opération ${r.reference} enregistrée en attente de validation`);
      setForm(null); charger(false);
    } catch (ex) { setErr(ex.message); }
    finally { setOccupe(false); }
  };

  const joindre = async (m, fichier) => {
    if (!fichier) return;
    const fd = new FormData(); fd.append("fichier", fichier);
    try { const r = await api(`/mouvements/${m.id_mouvement}/piece`, { method: "POST", form: fd }); setDetail(r); ui.succes("Pièce jointe ajoutée"); charger(false); }
    catch (ex) { ui.erreur(ex.message); }
  };

  const exporter = (format) => telecharger(`/rapports/mouvements/export${qs({ ...filtre, format })}`, `mouvements.${format}`).catch((e) => ui.erreur(e.message));
  const peutAnnuler = (m) => m.statut !== "ANNULE" && (peut("valider") || (m.statut === "BROUILLON" && m.id_utilisateur === user.id_utilisateur));
  const f = (k) => (e) => setFiltre({ ...filtre, [k]: e.target.value });

  return (
    <>
      <PageTete titre="Recettes et dépenses" sousTitre="Toute opération est saisie en attente, puis validée par un responsable."
        actions={<>
          <div className="groupe-btn">
            {["xlsx", "pdf", "csv"].map((x) => <button key={x} className="btn btn-secondaire btn-sm" onClick={() => exporter(x)}>{x.toUpperCase()}</button>)}
          </div>
          {peut("saisir") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm(vide()); }}><Icone nom="plus" />Nouvelle opération</button>}
        </>} />

      <Carte plat>
        <div className="filtres">
          <div className="recherche"><Icone nom="recherche" taille={16} /><input placeholder="Rechercher (libellé, référence)" value={filtre.q} onChange={f("q")} aria-label="Rechercher" /></div>
          <select value={filtre.type_mouvement} onChange={f("type_mouvement")} aria-label="Type"><option value="">Tous les types</option><option value="ENCAISSEMENT">Recettes</option><option value="DECAISSEMENT">Dépenses</option></select>
          <select value={filtre.statut} onChange={f("statut")} aria-label="Statut"><option value="">Tous les statuts</option><option value="BROUILLON">En attente</option><option value="VALIDE">Validé</option><option value="ANNULE">Annulé</option></select>
          <select value={filtre.id_compte} onChange={f("id_compte")} aria-label="Compte"><option value="">Tous les comptes</option>{ref.comptes.map((c) => <option key={c.id_compte} value={c.id_compte}>{c.libelle_compte}</option>)}</select>
          <input type="date" value={filtre.date_debut} onChange={f("date_debut")} aria-label="Du" title="Du" />
          <input type="date" value={filtre.date_fin} onChange={f("date_fin")} aria-label="Au" title="Au" />
        </div>
        {chargement && !rows.length ? <div className="carte-corps"><Chargement /></div> : rows.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Compte</th><th className="num">Montant</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {rows.map((m) => {
                const [lib, ton] = STATUT_MV[m.statut];
                return (
                  <tr key={m.id_mouvement} className="cliquable" onClick={() => setDetail(m)}>
                    <td>{fmtDate(m.date_mouvement)}</td>
                    <td>{m.libelle}<span className="sous">{m.reference}</span></td>
                    <td>{m.categorie_libelle}</td><td>{m.compte_libelle}</td>
                    <td className={`num ${m.type_mouvement === "ENCAISSEMENT" ? "texte-ok" : "texte-ko"}`}>{m.type_mouvement === "ENCAISSEMENT" ? "+" : "−"}{fmtAr(m.montant)}</td>
                    <td><Badge ton={ton}>{lib}</Badge></td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      {m.piece_justificative && <span className="texte-doux" title="Pièce jointe"><Icone nom="trombone" taille={15} /></span>}{" "}
                      {m.statut === "BROUILLON" && peutValider(user, m) && <button className="btn btn-lien btn-sm" onClick={() => valider(m)}>Valider</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <Vide icone="mouvements" titre="Aucune opération" texte="Modifiez les filtres ou enregistrez une nouvelle opération." />}
        {encore && <div className="pied-liste"><button className="btn btn-secondaire" onClick={() => charger(true)} disabled={chargement}>Afficher plus</button></div>}
      </Carte>

      {detail && (
        <Modal titre={detail.libelle} sousTitre={detail.reference} onClose={() => setDetail(null)} sansChamps
          pied={<>
            {detail.statut === "BROUILLON" && peut("saisir") && <button className="btn btn-secondaire" onClick={() => ouvrirEdition(detail)}><Icone nom="crayon" taille={16} />Modifier</button>}
            {peutAnnuler(detail) && <button className="btn btn-secondaire" onClick={() => annuler(detail, detail.statut === "BROUILLON" ? "Refuser" : "Annuler")}>{detail.statut === "BROUILLON" ? "Refuser" : "Annuler l'opération"}</button>}
            {detail.statut === "BROUILLON" && peutValider(user, detail) && <button className="btn btn-primaire" onClick={() => valider(detail)}>Valider</button>}
          </>}>
          <dl className="def">
            <dt>Type</dt><dd>{TYPE_MV[detail.type_mouvement]}</dd>
            <dt>Montant</dt><dd className={detail.type_mouvement === "ENCAISSEMENT" ? "texte-ok" : "texte-ko"}>{fmtAr(detail.montant)}</dd>
            <dt>Date</dt><dd>{fmtDate(detail.date_mouvement)}</dd>
            <dt>Compte</dt><dd>{detail.compte_libelle}</dd>
            <dt>Catégorie</dt><dd>{detail.categorie_libelle}</dd>
            <dt>Mode de paiement</dt><dd>{detail.mode_libelle}</dd>
            <dt>Statut</dt><dd><Badge ton={STATUT_MV[detail.statut][1]}>{STATUT_MV[detail.statut][0]}</Badge></dd>
            <dt>Saisi par</dt><dd>{detail.utilisateur_nom}, le {fmtDateHeure(detail.date_creation)}</dd>
            {detail.date_validation && <><dt>Validé le</dt><dd>{fmtDateHeure(detail.date_validation)}</dd></>}
            {detail.motif_annulation && <><dt>Motif d'annulation</dt><dd>{detail.motif_annulation}</dd></>}
            {detail.id_facture && <><dt>Facture liée</dt><dd>Paiement d'une facture</dd></>}
            <dt>Pièce justificative</dt>
            <dd>
              {detail.piece_justificative
                ? <button className="btn btn-lien btn-sm" onClick={() => telecharger(`/mouvements/${detail.id_mouvement}/piece`, detail.piece_justificative).catch((e) => ui.erreur(e.message))}><Icone nom="telecharger" taille={15} />Télécharger</button>
                : peut("saisir") ? <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => joindre(detail, e.target.files[0])} aria-label="Joindre une pièce" /> : "Aucune"}
            </dd>
          </dl>
        </Modal>
      )}

      {form && (
        <Modal titre={form.id ? "Modifier l'opération" : "Nouvelle opération"} sousTitre="Elle sera enregistrée en attente de validation." onClose={() => setForm(null)} onSubmit={enregistrer} err={err} occupe={occupe}>
          <div className="full"><Segment valeur={form.type_mouvement} onChange={(v) => setForm({ ...form, type_mouvement: v, id_categorie: "" })} options={[["ENCAISSEMENT", "Recette"], ["DECAISSEMENT", "Dépense"]]} /></div>
          <Champ label="Date"><input type="date" value={form.date_mouvement} onChange={maj("date_mouvement")} required /></Champ>
          <Champ label="Montant (Ar)"><input type="number" min="0.01" step="0.01" value={form.montant} onChange={maj("montant")} required /></Champ>
          <Champ label="Libellé" full><input value={form.libelle} onChange={maj("libelle")} required maxLength={255} /></Champ>
          <Champ label="Compte"><select value={form.id_compte} onChange={maj("id_compte")} required><option value="">Choisir…</option>{ref.comptes.map((c) => <option key={c.id_compte} value={c.id_compte}>{c.libelle_compte}</option>)}</select></Champ>
          <Champ label="Catégorie"><select value={form.id_categorie} onChange={maj("id_categorie")} required><option value="">Choisir…</option>{ref.categories.filter((c) => c.nature === nature && c.actif).map((c) => <option key={c.id_categorie} value={c.id_categorie}>{c.libelle_categorie}</option>)}</select></Champ>
          <Champ label="Mode de paiement"><select value={form.id_mode} onChange={maj("id_mode")} required><option value="">Choisir…</option>{ref.modes.map((m) => <option key={m.id_mode} value={m.id_mode}>{m.libelle_mode}</option>)}</select></Champ>
          {form.id_facture ? <div className="full texte-doux">Cette opération est liée à une facture : le tiers ne peut pas être modifié.</div> : form.type_mouvement === "ENCAISSEMENT"
            ? <Champ label="Client (facultatif)"><select value={form.id_client} onChange={maj("id_client")}><option value="">Aucun</option>{ref.clients.map((c) => <option key={c.id_client} value={c.id_client}>{c.nom_client}</option>)}</select></Champ>
            : <Champ label="Fournisseur (facultatif)"><select value={form.id_fournisseur} onChange={maj("id_fournisseur")}><option value="">Aucun</option>{ref.fournisseurs.map((c) => <option key={c.id_fournisseur} value={c.id_fournisseur}>{c.nom_fournisseur}</option>)}</select></Champ>}
          <Champ label="Pièce justificative (facultatif)" aide="PDF, JPG ou PNG, 5 Mo maximum" full>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setForm({ ...form, fichier: e.target.files[0] || null })} />
          </Champ>
        </Modal>
      )}
    </>
  );
}
