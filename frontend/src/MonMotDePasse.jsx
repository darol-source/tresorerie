import { useState } from "react";
import { api } from "./api";
import { Champ, Modal, useUI } from "./ui.jsx";

export default function MonMotDePasse({ onClose }) {
  const ui = useUI();
  const [f, setF] = useState({ ancien: "", nouveau: "", confirmation: "" });
  const [err, setErr] = useState("");

  const envoyer = async (e) => {
    e.preventDefault();
    if (f.nouveau !== f.confirmation) { setErr("Les deux nouveaux mots de passe sont différents"); return; }
    try { await api("/auth/mot-de-passe", { method: "POST", body: { ancien: f.ancien, nouveau: f.nouveau } }); ui.succes("Mot de passe modifié"); onClose(); }
    catch (ex) { setErr(ex.message); }
  };
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal titre="Changer mon mot de passe" taille="sm" onClose={onClose} onSubmit={envoyer} err={err}>
      <Champ label="Mot de passe actuel" full><input type="password" value={f.ancien} onChange={maj("ancien")} required autoFocus autoComplete="current-password" /></Champ>
      <Champ label="Nouveau mot de passe" aide="8 caractères minimum" full><input type="password" minLength={8} value={f.nouveau} onChange={maj("nouveau")} required autoComplete="new-password" /></Champ>
      <Champ label="Confirmer le nouveau mot de passe" full><input type="password" minLength={8} value={f.confirmation} onChange={maj("confirmation")} required autoComplete="new-password" /></Champ>
    </Modal>
  );
}
