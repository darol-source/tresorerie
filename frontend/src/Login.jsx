import { useState } from "react";
import { api, setToken } from "./api";
import { Champ } from "./ui.jsx";
import { Icone } from "./icones.jsx";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [err, setErr] = useState("");
  const [occupe, setOccupe] = useState(false);

  const soumettre = async (e) => {
    e.preventDefault();
    setErr(""); setOccupe(true);
    try {
      const { access_token } = await api("/auth/login", { method: "POST", form: new URLSearchParams({ username: email.trim(), password: mdp }) });
      setToken(access_token);
      onLogin(await api("/auth/me"));
    } catch (ex) { setErr(ex.message); setOccupe(false); }
  };

  return (
    <div className="login-page">
      <div className="login-marque">
        <div>
          <div className="marque"><div className="marque-logo"><Icone nom="portefeuille" /></div>Trésorerie</div>
          <h1>Pilotez votre trésorerie en toute confiance.</h1>
          <p>Suivi des recettes et dépenses, créances, dettes, budgets et prévisions, avec validation et traçabilité de chaque opération.</p>
        </div>
        <div className="login-points">
          {[["validations", "Validation des opérations selon les seuils et les rôles"], ["previsions", "Prévisions et alertes avant les périodes à risque"], ["rapprochement", "Rapprochement bancaire et contrôle de caisse"]].map(([i, t]) => (
            <div className="login-point" key={i}><div className="kpi-icone"><Icone nom={i} /></div><span>{t}</span></div>
          ))}
        </div>
      </div>
      <div className="login-form">
        <form onSubmit={soumettre}>
          <div><h2>Connexion</h2><p className="texte-doux" style={{ marginTop: 4 }}>Entrez vos identifiants pour accéder à l'application.</p></div>
          {err && <div className="bandeau ko"><Icone nom="alerte" />{err}</div>}
          <Champ label="Adresse e-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></Champ>
          <Champ label="Mot de passe"><input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" required /></Champ>
          <button className="btn btn-primaire" disabled={occupe}>{occupe ? "Connexion…" : "Se connecter"}</button>
        </form>
      </div>
    </div>
  );
}
