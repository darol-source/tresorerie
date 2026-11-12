import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "./icones.jsx";

/* ------------------------------------------------------------------ chargement de données */
export function useChargement(fn, deps = []) {
  const [etat, setEtat] = useState({ donnees: null, chargement: true, erreur: "" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recharger = useCallback(async () => {
    setEtat((e) => ({ ...e, chargement: true }));
    try { setEtat({ donnees: await fn(), chargement: false, erreur: "" }); }
    catch (e) { setEtat((x) => ({ ...x, chargement: false, erreur: e.message })); }
  }, deps);
  useEffect(() => { recharger(); }, [recharger]);
  return { ...etat, recharger };
}

/* ------------------------------------------------------------------ notifications et dialogues */
const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialogue, setDialogue] = useState(null);
  const compteur = useRef(0);

  const toast = useCallback((ton, message) => {
    const id = ++compteur.current;
    setToasts((t) => [...t, { id, ton, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ton === "ko" ? 6500 : 3500);
  }, []);

  const ui = useMemo(() => ({
    succes: (m) => toast("ok", m),
    erreur: (m) => toast("ko", m),
    info: (m) => toast("info", m),
    confirmer: (opts) => new Promise((resolve) => setDialogue({ type: "confirmer", ...opts, resolve })),
    saisir: (opts) => new Promise((resolve) => setDialogue({ type: "saisir", ...opts, resolve })),
  }), [toast]);

  return (
    <UIContext.Provider value={ui}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.ton}`}><Icone nom={t.ton === "ko" ? "alerte" : t.ton === "ok" ? "check" : "info"} /><span>{t.message}</span></div>
        ))}
      </div>
      {dialogue && <Dialogue d={dialogue} fermer={() => setDialogue(null)} />}
    </UIContext.Provider>
  );
}

function Dialogue({ d, fermer }) {
  const [valeur, setValeur] = useState("");
  const [erreur, setErreur] = useState("");
  const finir = (resultat) => { d.resolve(resultat); fermer(); };
  const annuler = () => finir(d.type === "saisir" ? null : false);
  const valider = (e) => {
    e.preventDefault();
    if (d.type === "saisir") {
      if (d.requis !== false && valeur.trim().length < (d.min || 1)) { setErreur(`Saisie obligatoire (${d.min || 1} caractère(s) minimum)`); return; }
      finir(valeur.trim());
    } else finir(true);
  };
  return (
    <Modal titre={d.titre} taille="sm" onClose={annuler} onSubmit={valider} libelleOk={d.libelleOk || "Confirmer"} dangereux={d.danger} err={erreur}>
      {d.message && <p className="full texte-doux">{d.message}</p>}
      {d.type === "saisir" && (
        <Champ label={d.libelle || "Motif"} full>
          <textarea rows={3} value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus />
        </Champ>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ fenêtre modale */
export function Modal({ titre, sousTitre, onClose, onSubmit, err, children, libelleOk = "Enregistrer", libelleFermer = "Annuler",
  taille = "md", occupe = false, pied, sansChamps = false, dangereux = false }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const Racine = onSubmit ? "form" : "div";
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Racine className={`modal modal-${taille}`} role="dialog" aria-modal="true" aria-label={titre} onSubmit={onSubmit}>
        <div className="modal-tete">
          <div><h2>{titre}</h2>{sousTitre && <p>{sousTitre}</p>}</div>
          <button type="button" className="icone-btn" onClick={onClose} aria-label="Fermer"><Icone nom="fermer" /></button>
        </div>
        <div className="modal-corps">
          {err && <div className="bandeau ko">{err}</div>}
          {sansChamps ? children : <div className="fields">{children}</div>}
        </div>
        <div className="modal-pied">
          {pied}
          {onSubmit ? (
            <>
              <button type="button" className="btn btn-secondaire" onClick={onClose}>{libelleFermer}</button>
              <button className={`btn ${dangereux ? "btn-danger" : "btn-primaire"}`} disabled={occupe}>{libelleOk}</button>
            </>
          ) : <button type="button" className="btn btn-secondaire" onClick={onClose}>Fermer</button>}
        </div>
      </Racine>
    </div>
  );
}

/* ------------------------------------------------------------------ éléments d'interface */
export const Champ = ({ label, aide, full, children }) => (
  <label className={`champ${full ? " full" : ""}`}><span>{label}</span>{children}{aide && <small>{aide}</small>}</label>
);

export const Badge = ({ ton = "neutre", children, titre }) => <span className={`badge badge-${ton}`} title={titre}>{children}</span>;

export const Carte = ({ titre, sousTitre, actions, children, plat = false, classe = "" }) => (
  <section className={`carte ${classe}`}>
    {(titre || actions) && (
      <header className="carte-tete">
        <div><h3>{titre}</h3>{sousTitre && <p>{sousTitre}</p>}</div>
        {actions && <div className="carte-actions">{actions}</div>}
      </header>
    )}
    <div className={plat ? "" : "carte-corps"}>{children}</div>
  </section>
);

export const Kpi = ({ libelle, valeur, ton = "neutre", icone, note }) => (
  <div className="kpi">
    <div className={`kpi-icone ton-${ton}`}>{icone && <Icone nom={icone} />}</div>
    <div className="kpi-texte">
      <span className="kpi-libelle">{libelle}</span>
      <span className={`kpi-valeur ${ton === "ok" || ton === "ko" ? `texte-${ton}` : ""}`}>{valeur}</span>
      {note && <span className="kpi-note">{note}</span>}
    </div>
  </div>
);

export const PageTete = ({ titre, sousTitre, actions }) => (
  <div className="page-tete">
    <div><h2>{titre}</h2>{sousTitre && <p>{sousTitre}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
);

export const Vide = ({ icone = "info", titre, texte, action }) => (
  <div className="vide"><div className="vide-icone"><Icone nom={icone} taille={26} /></div><h4>{titre}</h4>{texte && <p>{texte}</p>}{action}</div>
);

export const Chargement = ({ lignes = 4 }) => (
  <div className="chargement" aria-busy="true">
    {Array.from({ length: lignes }, (_, i) => <div key={i} className="sk" style={{ height: i === 0 ? 70 : 44, width: i === 0 ? "100%" : `${92 - i * 8}%` }} />)}
  </div>
);

export const Onglets = ({ valeur, options, onChange }) => (
  <div className="onglets" role="tablist">
    {options.map(([cle, libelle, compte]) => (
      <button key={cle} role="tab" aria-selected={valeur === cle} className={valeur === cle ? "actif" : ""} onClick={() => onChange(cle)}>
        {libelle}{compte !== undefined && <span className="onglet-compte">{compte}</span>}
      </button>
    ))}
  </div>
);

export const Barre = ({ pct, ton }) => (
  <div className="barre" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
    <i className={ton} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
  </div>
);

export const Segment = ({ valeur, options, onChange }) => (
  <div className="segment">
    {options.map(([cle, libelle]) => <button type="button" key={cle} className={valeur === cle ? "actif" : ""} onClick={() => onChange(cle)}>{libelle}</button>)}
  </div>
);

export const Alerte = ({ ton = "attente", children }) => <div className={`bandeau ${ton}`}><Icone nom={ton === "ko" ? "alerte" : "info"} />{children}</div>;
