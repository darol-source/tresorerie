import { useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Champ, Chargement, Modal, PageTete, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { initiales } from "./format.js";
import { ROLES_LIB } from "./libelles.js";

const DROITS = [
  ["ADMINISTRATEUR", "Tout, y compris la gestion des utilisateurs et des rôles."],
  ["DIRECTEUR_GENERAL", "Saisie, validation de toutes les opérations (y compris au-delà de 500 000 Ar), budgets, prévisions, rapprochement, annulations."],
  ["RESPONSABLE_FINANCIER", "Saisie, validation jusqu'à 500 000 Ar, budgets, prévisions, rapprochement, annulations, rappels par e-mail."],
  ["CAISSIER", "Saisie des recettes, dépenses, transferts, factures et paiements. Ne valide rien."],
  ["COMPTABLE", "Consultation, rapports et exports, création et import des rapprochements."],
];
const vide = () => ({ id: null, nom: "", prenom: "", email: "", mot_de_passe: "", id_role: "" });

export default function Utilisateurs() {
  const { user: moi } = useAuth();
  const ui = useUI();
  const { donnees: rows, chargement, erreur, recharger } = useChargement(() => api("/utilisateurs"), []);
  const { donnees: roles } = useChargement(() => api("/roles"), []);
  const [form, setForm] = useState(null);
  const [mdp, setMdp] = useState(null);
  const [err, setErr] = useState("");

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !rows) return <Chargement />;

  const enregistrer = async (e) => {
    e.preventDefault(); setErr("");
    try {
      if (form.id) await api(`/utilisateurs/${form.id}`, { method: "PUT", body: { nom: form.nom, prenom: form.prenom, email: form.email, id_role: +form.id_role } });
      else await api("/utilisateurs", { method: "POST", body: { nom: form.nom, prenom: form.prenom, email: form.email, mot_de_passe: form.mot_de_passe, id_role: +form.id_role } });
      ui.succes(form.id ? "Utilisateur modifié" : "Utilisateur créé"); setForm(null); recharger();
    } catch (ex) { setErr(ex.message); }
  };
  const reinitialiser = async (e) => {
    e.preventDefault(); setErr("");
    try { await api(`/utilisateurs/${mdp.id}/mot-de-passe`, { method: "PUT", body: { mot_de_passe: mdp.mot_de_passe } }); ui.succes("Mot de passe réinitialisé. Communiquez-le à l'utilisateur."); setMdp(null); }
    catch (ex) { setErr(ex.message); }
  };
  const basculer = async (u) => {
    if (u.actif) {
      const ok = await ui.confirmer({ titre: `Désactiver ${u.prenom} ${u.nom} ?`, message: "Cette personne ne pourra plus se connecter, même si elle est déjà connectée.", libelleOk: "Désactiver", danger: true });
      if (!ok) return;
    }
    try { await api(`/utilisateurs/${u.id_utilisateur}/${u.actif ? "desactiver" : "activer"}`, { method: "PUT" }); ui.succes(u.actif ? "Compte désactivé" : "Compte réactivé"); recharger(); }
    catch (ex) { ui.erreur(ex.message); }
  };

  return (
    <>
      <PageTete titre="Utilisateurs" sousTitre="Comptes d'accès et rôles. Chaque utilisateur a un seul rôle."
        actions={<button className="btn btn-primaire" onClick={() => { setErr(""); setForm(vide()); }}><Icone nom="plus" />Nouvel utilisateur</button>} />
      <Carte plat>
        <div className="table-defile"><table className="tableau">
          <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Statut</th><th /></tr></thead>
          <tbody>{(rows || []).map((u) => {
            const soi = u.id_utilisateur === moi.id_utilisateur;
            return (
              <tr key={u.id_utilisateur} style={{ opacity: u.actif ? 1 : 0.55 }}>
                <td><div style={{ display: "flex", gap: 12, alignItems: "center" }}><span className="avatar">{initiales(u)}</span><div><b>{u.prenom} {u.nom}</b>{soi && <> <Badge ton="brand">Vous</Badge></>}<span className="sous">{u.email}</span></div></div></td>
                <td>{ROLES_LIB[u.role_libelle] || u.role_libelle}</td>
                <td><Badge ton={u.actif ? "ok" : "neutre"}>{u.actif ? "Actif" : "Inactif"}</Badge></td>
                <td className="actions">
                  <button className="btn btn-lien btn-sm" onClick={() => { setErr(""); setForm({ id: u.id_utilisateur, nom: u.nom, prenom: u.prenom, email: u.email, mot_de_passe: "", id_role: String(u.id_role) }); }}>Modifier</button>
                  <button className="btn btn-lien btn-sm" onClick={() => { setErr(""); setMdp({ id: u.id_utilisateur, nom: `${u.prenom} ${u.nom}`, mot_de_passe: "" }); }}>Mot de passe</button>
                  {!soi && <button className={`btn btn-lien btn-sm ${u.actif ? "ko" : ""}`} onClick={() => basculer(u)}>{u.actif ? "Désactiver" : "Réactiver"}</button>}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Carte>

      <Carte titre="Ce que chaque rôle peut faire" sousTitre="Tous les rôles peuvent consulter. Les différences portent sur la saisie, la validation et l'administration." plat>
        <table className="tableau"><tbody>{DROITS.map(([cle, texte]) => <tr key={cle}><td style={{ whiteSpace: "nowrap" }}><b>{ROLES_LIB[cle]}</b></td><td>{texte}</td></tr>)}</tbody></table>
      </Carte>

      {form && (
        <Modal titre={form.id ? "Modifier l'utilisateur" : "Nouvel utilisateur"} onClose={() => setForm(null)} onSubmit={enregistrer} err={err}>
          <Champ label="Prénom"><input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required autoFocus /></Champ>
          <Champ label="Nom"><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required /></Champ>
          <Champ label="Adresse e-mail (identifiant)" full><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Champ>
          <Champ label="Rôle" full aide={form.id === moi.id_utilisateur ? "Vous ne pouvez pas modifier votre propre rôle" : undefined}>
            <select value={form.id_role} onChange={(e) => setForm({ ...form, id_role: e.target.value })} required disabled={form.id === moi.id_utilisateur}>
              <option value="">Choisir…</option>{(roles || []).map((r) => <option key={r.id_role} value={r.id_role}>{ROLES_LIB[r.libelle_role] || r.libelle_role}</option>)}
            </select>
          </Champ>
          {!form.id && <Champ label="Mot de passe initial" aide="8 caractères minimum" full><input type="text" minLength={8} value={form.mot_de_passe} onChange={(e) => setForm({ ...form, mot_de_passe: e.target.value })} required /></Champ>}
        </Modal>
      )}
      {mdp && (
        <Modal titre="Réinitialiser le mot de passe" sousTitre={mdp.nom} taille="sm" onClose={() => setMdp(null)} onSubmit={reinitialiser} err={err} libelleOk="Réinitialiser">
          <Champ label="Nouveau mot de passe" aide="8 caractères minimum. Les sessions ouvertes restent valables jusqu'à leur expiration : désactivez le compte pour couper l'accès immédiatement." full>
            <input type="text" minLength={8} value={mdp.mot_de_passe} onChange={(e) => setMdp({ ...mdp, mot_de_passe: e.target.value })} required autoFocus />
          </Champ>
        </Modal>
      )}
    </>
  );
}
