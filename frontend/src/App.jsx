import { Component, useCallback, useEffect, useRef, useState } from "react";
import { api, getToken, setToken } from "./api";
import { AuthContext, fabriquerAuth } from "./auth.jsx";
import { ROLES_LIB } from "./libelles.js";
import { initiales } from "./format.js";
import { Icone } from "./icones.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Agent from "./Agent.jsx";
import Rapports from "./Rapports.jsx";
import Mouvements from "./Mouvements.jsx";
import Validations from "./Validations.jsx";
import Transferts from "./Transferts.jsx";
import Factures from "./Factures.jsx";
import Comptes from "./Comptes.jsx";
import Categories from "./Categories.jsx";
import Tiers from "./Tiers.jsx";
import Budgets from "./Budgets.jsx";
import Previsions from "./Previsions.jsx";
import Rapprochement from "./Rapprochement.jsx";
import Rappels from "./Rappels.jsx";
import Utilisateurs from "./Utilisateurs.jsx";
import Notifications from "./Notifications.jsx";
import MonMotDePasse from "./MonMotDePasse.jsx";

export const PAGES = {
  dashboard: { titre: "Tableau de bord", icone: "tableau", Vue: Dashboard },
  assistant: { titre: "Assistant", icone: "assistant", Vue: Agent },
  rapports: { titre: "Rapports", icone: "rapports", Vue: Rapports },
  mouvements: { titre: "Recettes et dépenses", icone: "mouvements", Vue: Mouvements },
  validations: { titre: "Validations", icone: "validations", Vue: Validations, droit: "valider" },
  transferts: { titre: "Transferts", icone: "transferts", Vue: Transferts },
  factures: { titre: "Créances et dettes", icone: "factures", Vue: Factures },
  comptes: { titre: "Comptes de trésorerie", icone: "comptes", Vue: Comptes },
  categories: { titre: "Catégories", icone: "categories", Vue: Categories },
  tiers: { titre: "Clients et fournisseurs", icone: "tiers", Vue: Tiers },
  budgets: { titre: "Budgets", icone: "budgets", Vue: Budgets },
  previsions: { titre: "Prévisions", icone: "previsions", Vue: Previsions },
  rapprochement: { titre: "Rapprochement", icone: "rapprochement", Vue: Rapprochement },
  rappels: { titre: "Rappels par e-mail", icone: "mail", Vue: Rappels },
  utilisateurs: { titre: "Utilisateurs", icone: "utilisateurs", Vue: Utilisateurs, droit: "administrer" },
  notifications: { titre: "Notifications", icone: "cloche", Vue: Notifications },
};

const GROUPES = [
  ["Pilotage", ["dashboard", "assistant", "rapports"]],
  ["Opérations", ["mouvements", "validations", "transferts", "factures"]],
  ["Référentiels", ["comptes", "categories", "tiers"]],
  ["Pilotage financier", ["budgets", "previsions"]],
  ["Contrôle", ["rapprochement", "rappels"]],
  ["Administration", ["utilisateurs"]],
];

class Garde extends Component {
  state = { erreur: null };
  static getDerivedStateFromError(erreur) { return { erreur }; }
  componentDidUpdate(prev) { if (prev.cle !== this.props.cle && this.state.erreur) this.setState({ erreur: null }); }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="carte"><div className="vide">
        <div className="vide-icone"><Icone nom="alerte" taille={26} /></div>
        <h4>Une erreur d'affichage est survenue</h4>
        <p>Rechargez la page. Si le problème persiste, contactez l'administrateur.</p>
        <button className="btn btn-primaire" onClick={() => window.location.reload()}>Recharger</button>
      </div></div>
    );
  }
}

const lirePage = () => window.location.hash.replace(/^#\/?/, "") || "dashboard";

export default function App() {
  const [user, setUser] = useState(null);
  const [pret, setPret] = useState(!getToken());
  const [page, setPage] = useState(lirePage);
  const [navOuverte, setNavOuverte] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [mdp, setMdp] = useState(false);
  const [nonLues, setNonLues] = useState(0);
  const [enAttente, setEnAttente] = useState(0);
  const refMenu = useRef(null);

  useEffect(() => {
    const h = () => setPage(lirePage());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me").then(setUser).catch(() => setToken(null)).finally(() => setPret(true));
  }, []);
  useEffect(() => {
    const h = (e) => { if (refMenu.current && !refMenu.current.contains(e.target)) setMenuOuvert(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const auth = fabriquerAuth(user);
  const rafraichir = useCallback(async () => {
    try {
      setNonLues((await api("/notifications/compteur")).non_lues);
      if (auth.peut("valider")) setEnAttente((await api("/mouvements?statut=BROUILLON&limit=200")).length);
    } catch { /* silencieux : simple indicateur */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    rafraichir();
    const t = setInterval(rafraichir, 60000);
    return () => clearInterval(t);
  }, [user, rafraichir]);

  if (!pret) return null;
  if (!user) return <Login onLogin={setUser} />;

  const autorise = (cle) => PAGES[cle] && (!PAGES[cle].droit || auth.peut(PAGES[cle].droit));
  const cle = autorise(page) ? page : "dashboard";
  const { Vue, titre } = PAGES[cle];
  const aller = (p) => { window.location.hash = `/${p}`; setNavOuverte(false); setMenuOuvert(false); window.scrollTo?.(0, 0); };

  return (
    <AuthContext.Provider value={auth}>
      <div className="app">
        <div className={`nav-fond ${navOuverte ? "ouvert" : ""}`} onClick={() => setNavOuverte(false)} />
        <nav className={`nav ${navOuverte ? "ouvert" : ""}`} aria-label="Navigation principale">
          <div className="marque"><div className="marque-logo"><Icone nom="portefeuille" /></div><div>Trésorerie<small>Gestion financière</small></div></div>
          {GROUPES.map(([nom, cles]) => {
            const visibles = cles.filter(autorise);
            if (!visibles.length) return null;
            return (
              <div className="nav-groupe" key={nom}>
                <div className="nav-titre">{nom}</div>
                {visibles.map((c) => (
                  <button key={c} className={`nav-lien ${cle === c ? "actif" : ""}`} onClick={() => aller(c)} aria-current={cle === c ? "page" : undefined}>
                    <Icone nom={PAGES[c].icone} />{PAGES[c].titre}
                    {c === "validations" && enAttente > 0 && <span className="nav-badge">{enAttente}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="corps">
          <header className="topbar">
            <button className="icone-btn burger" onClick={() => setNavOuverte(true)} aria-label="Ouvrir le menu"><Icone nom="menu" /></button>
            <h1>{titre}</h1>
            <div className="espace" />
            <button className="icone-btn" onClick={() => aller("notifications")} aria-label="Notifications">
              <Icone nom="cloche" />{nonLues > 0 && <span className="cloche-badge">{nonLues > 99 ? "99+" : nonLues}</span>}
            </button>
            <div className="profil" ref={refMenu}>
              <button className="profil-btn" onClick={() => setMenuOuvert((o) => !o)} aria-haspopup="menu" aria-expanded={menuOuvert}>
                <span className="avatar">{initiales(user)}</span>
                <span className="profil-nom"><b>{user.prenom} {user.nom}</b><small>{ROLES_LIB[user.role_libelle] || user.role_libelle}</small></span>
                <Icone nom="chevron" taille={16} />
              </button>
              {menuOuvert && (
                <div className="menu-liste" role="menu">
                  <button role="menuitem" onClick={() => { setMenuOuvert(false); setMdp(true); }}><Icone nom="cle" />Changer mon mot de passe</button>
                  <hr />
                  <button role="menuitem" onClick={() => { setToken(null); setUser(null); window.location.hash = ""; }}><Icone nom="sortie" />Se déconnecter</button>
                </div>
              )}
            </div>
          </header>
          <main className="contenu">
            <Garde cle={cle}><Vue rafraichir={rafraichir} /></Garde>
          </main>
        </div>
        {mdp && <MonMotDePasse onClose={() => setMdp(false)} />}
      </div>
    </AuthContext.Provider>
  );
}
