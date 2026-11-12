import { useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Modal, Onglets, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";

export default function Categories() {
  const { peut } = useAuth();
  const ui = useUI();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/categories"), []);
  const [nature, setNature] = useState("RECETTE");
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const toutes = donnees || [];
  const rows = toutes.filter((c) => c.nature === nature);

  const enregistrer = async (e) => {
    e.preventDefault(); setErr("");
    const body = { libelle_categorie: form.libelle_categorie, nature: form.nature, description: form.description || null };
    try {
      if (form.id) await api(`/categories/${form.id}`, { method: "PUT", body });
      else await api("/categories", { method: "POST", body });
      ui.succes(form.id ? "Catégorie modifiée" : "Catégorie créée"); setForm(null); recharger();
    } catch (ex) { setErr(ex.message); }
  };

  const desactiver = async (c) => {
    const ok = await ui.confirmer({ titre: `Désactiver « ${c.libelle_categorie} » ?`, libelleOk: "Désactiver", danger: true,
      message: "Elle ne sera plus proposée pour les nouvelles opérations. Les opérations existantes ne changent pas." });
    if (!ok) return;
    try { await api(`/categories/${c.id_categorie}/desactiver`, { method: "PUT" }); ui.succes("Catégorie désactivée"); recharger(); }
    catch (ex) { ui.erreur(ex.message); }
  };

  return (
    <>
      <PageTete titre="Catégories" sousTitre="Elles classent les recettes et les dépenses et alimentent les budgets et les rapports."
        actions={peut("gerer") && <button className="btn btn-primaire" onClick={() => { setErr(""); setForm({ id: null, libelle_categorie: "", nature, description: "" }); }}><Icone nom="plus" />Nouvelle catégorie</button>} />
      <Onglets valeur={nature} onChange={setNature} options={[["RECETTE", "Recettes", toutes.filter((c) => c.nature === "RECETTE" && c.actif).length], ["DEPENSE", "Dépenses", toutes.filter((c) => c.nature === "DEPENSE" && c.actif).length]]} />
      <Carte plat>
        {rows.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Catégorie</th><th>Description</th><th>Statut</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id_categorie} style={{ opacity: c.actif ? 1 : 0.55 }}>
                <td><b>{c.libelle_categorie}</b></td><td>{c.description || <span className="texte-doux">—</span>}</td>
                <td><Badge ton={c.actif ? "ok" : "neutre"}>{c.actif ? "Active" : "Inactive"}</Badge></td>
                <td className="actions">{peut("gerer") && c.actif && <>
                  <button className="btn btn-lien btn-sm" onClick={() => { setErr(""); setForm({ id: c.id_categorie, libelle_categorie: c.libelle_categorie, nature: c.nature, description: c.description || "" }); }}>Modifier</button>
                  <button className="btn btn-lien ko btn-sm" onClick={() => desactiver(c)}>Désactiver</button></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Vide icone="categories" titre="Aucune catégorie" texte="Créez-en une pour classer vos opérations." />}
      </Carte>

      {form && (
        <Modal titre={form.id ? "Modifier la catégorie" : "Nouvelle catégorie"} taille="sm" onClose={() => setForm(null)} onSubmit={enregistrer} err={err}>
          <Champ label="Nom" full><input value={form.libelle_categorie} onChange={(e) => setForm({ ...form, libelle_categorie: e.target.value })} required autoFocus /></Champ>
          <Champ label="Nature" full>
            <select value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })} disabled={!!form.id}><option value="RECETTE">Recette</option><option value="DEPENSE">Dépense</option></select>
          </Champ>
          <Champ label="Description (facultative)" full><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={255} /></Champ>
        </Modal>
      )}
    </>
  );
}
