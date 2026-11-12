import { useState } from "react";
import { api, qs } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Modal, Onglets, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";

const CONFIG = {
  client: { chemin: "/clients", nom: "nom_client", id: "id_client", singulier: "client" },
  fournisseur: { chemin: "/fournisseurs", nom: "nom_fournisseur", id: "id_fournisseur", singulier: "fournisseur" },
};
const vide = () => ({ id: null, nom: "", telephone: "", email: "", adresse: "" });

export default function Tiers() {
  const { peut } = useAuth();
  const ui = useUI();
  const [type, setType] = useState("client");
  const [q, setQ] = useState("");
  const c = CONFIG[type];
  const { donnees, chargement, erreur, recharger } = useChargement(() => api(`${c.chemin}${qs({ q })}`), [type, q]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");

  const enregistrer = async (e) => {
    e.preventDefault(); setErr("");
    const body = { [c.nom]: form.nom, telephone: form.telephone || null, email: form.email || null, adresse: form.adresse || null };
    try {
      if (form.id) await api(`${c.chemin}/${form.id}`, { method: "PUT", body });
      else await api(c.chemin, { method: "POST", body });
      ui.succes(form.id ? "Modifications enregistrées" : `${c.singulier[0].toUpperCase() + c.singulier.slice(1)} créé`); setForm(null); recharger();
    } catch (ex) { setErr(ex.message); }
  };

  const desactiver = async (r) => {
    const ok = await ui.confirmer({ titre: `Désactiver « ${r[c.nom]} » ?`, libelleOk: "Désactiver", danger: true, message: "Il ne pourra plus être choisi pour de nouvelles factures. L'historique est conservé." });
    if (!ok) return;
    try { await api(`${c.chemin}/${r[c.id]}/desactiver`, { method: "PUT" }); ui.succes("Désactivé"); recharger(); } catch (ex) { ui.erreur(ex.message); }
  };

  const rows = donnees || [];
  const sansEmail = type === "client" ? rows.filter((r) => r.actif && !r.email).length : 0;

  return (
    <>
      <PageTete titre="Clients et fournisseurs" sousTitre="Tiers associés aux factures, aux recettes et aux dépenses."
        actions={peut("gerer") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm(vide()); }}><Icone nom="plus" />Nouveau {c.singulier}</button>} />
      <Onglets valeur={type} onChange={(t) => { setType(t); setQ(""); }} options={[["client", "Clients"], ["fournisseur", "Fournisseurs"]]} />
      {sansEmail > 0 && <Alerte ton="info">{sansEmail} client(s) sans adresse e-mail : ils ne recevront pas de rappels automatiques.</Alerte>}
      {erreur && <Alerte ton="ko">{erreur}</Alerte>}
      <Carte plat>
        <div className="filtres"><div className="recherche"><Icone nom="recherche" taille={16} /><input placeholder="Rechercher par nom" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" /></div></div>
        {chargement && !donnees ? <div className="carte-corps"><Chargement /></div> : rows.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Nom</th><th>Téléphone</th><th>E-mail</th><th>Adresse</th><th>Statut</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r[c.id]} style={{ opacity: r.actif ? 1 : 0.55 }}>
                <td><b>{r[c.nom]}</b></td><td>{r.telephone || <span className="texte-doux">—</span>}</td>
                <td>{r.email || (type === "client" ? <Badge ton="attente">Non renseigné</Badge> : <span className="texte-doux">—</span>)}</td>
                <td>{r.adresse || <span className="texte-doux">—</span>}</td>
                <td><Badge ton={r.actif ? "ok" : "neutre"}>{r.actif ? "Actif" : "Inactif"}</Badge></td>
                <td className="actions">{peut("gerer") && r.actif && <>
                  <button className="btn btn-lien btn-sm" onClick={() => { setErr(""); setForm({ id: r[c.id], nom: r[c.nom], telephone: r.telephone || "", email: r.email || "", adresse: r.adresse || "" }); }}>Modifier</button>
                  <button className="btn btn-lien ko btn-sm" onClick={() => desactiver(r)}>Désactiver</button></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Vide icone="tiers" titre={q ? "Aucun résultat" : `Aucun ${c.singulier}`} texte={q ? "Essayez un autre nom." : undefined} />}
      </Carte>

      {form && (
        <Modal titre={form.id ? `Modifier le ${c.singulier}` : `Nouveau ${c.singulier}`} onClose={() => setForm(null)} onSubmit={enregistrer} err={err}>
          <Champ label="Nom" full><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required autoFocus /></Champ>
          <Champ label="Téléphone"><input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></Champ>
          <Champ label="E-mail" aide={type === "client" ? "Nécessaire pour les rappels de paiement" : undefined}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Champ>
          <Champ label="Adresse" full><input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} /></Champ>
        </Modal>
      )}
    </>
  );
}
