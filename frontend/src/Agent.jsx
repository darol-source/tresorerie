import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Alerte, Carte, PageTete, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";

const SUGGESTIONS = [
  "Quelle est ma situation de trésorerie aujourd'hui ?",
  "Quelles factures clients sont en retard ?",
  "Où en sont mes budgets ce mois-ci ?",
  "Quel sera mon solde dans 30 jours ?",
  "Résume les dépenses du mois par catégorie.",
];

export default function Agent() {
  const ui = useUI();
  const { donnees: statut } = useChargement(() => api("/agent/statut"), []);
  const [msgs, setMsgs] = useState([]);
  const [texte, setTexte] = useState("");
  const [charge, setCharge] = useState(false);
  const fin = useRef(null);
  const actif = statut ? statut.actif : true;

  useEffect(() => { fin.current?.scrollIntoView?.({ behavior: "smooth" }); }, [msgs, charge]);

  const envoyer = async (contenu) => {
    const t = (contenu ?? texte).trim();
    if (!t || charge) return;
    const suite = [...msgs, { role: "user", content: t }];
    setMsgs(suite); setTexte(""); setCharge(true);
    try {
      const r = await api("/agent/chat", { method: "POST", body: { messages: suite.slice(-20).map(({ role, content }) => ({ role, content })) } });
      setMsgs([...suite, { role: "assistant", content: r.reponse, propositions: (r.propositions || []).map((p) => ({ ...p, etat: "attente" })) }]);
    } catch (e) { ui.erreur(e.message); }
    finally { setCharge(false); }
  };

  const maj = (i, j, patch) => setMsgs((ms) => ms.map((m, k) => (k !== i ? m : { ...m, propositions: m.propositions.map((p, l) => (l !== j ? p : { ...p, ...patch })) })));
  const decider = async (i, j, accepter) => {
    const p = msgs[i].propositions[j];
    if (!accepter) { maj(i, j, { etat: "refuse" }); return; }
    maj(i, j, { etat: "en_cours" });
    try {
      const r = await api("/agent/executer", { method: "POST", body: { token: p.token } });
      maj(i, j, { etat: "fait" });
      setMsgs((ms) => [...ms, { role: "assistant", content: r.message }]);
    } catch (e) { maj(i, j, { etat: "erreur", detail: e.message }); }
  };

  return (
    <>
      <PageTete titre="Assistant" sousTitre={statut?.modele ? `Modèle : ${statut.modele}${statut.local ? " — exécuté sur cette machine, vos données ne sortent pas" : ""}` : undefined} />
      {!actif && <Alerte ton="ko">L'assistant n'est pas actif. {statut.detail}</Alerte>}
      <Carte plat classe="chat">
        <div className="chat-fil">
          {!msgs.length && (
            <div>
              <h3>Comment puis-je vous aider ?</h3>
              <p className="texte-doux" style={{ marginTop: 6, maxWidth: 560 }}>Posez une question sur votre trésorerie, vos créances et dettes, vos budgets ou vos prévisions. L'assistant peut aussi préparer une création : rien n'est enregistré sans votre confirmation, et il ne valide jamais une opération.</p>
              <div className="suggestions">{SUGGESTIONS.map((s) => <button key={s} onClick={() => envoyer(s)} disabled={!actif}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div className={`bulle ${m.role}`}>{m.content}</div>
              {(m.propositions || []).map((p, j) => (
                <div className="proposition" key={j}>
                  <b>Action proposée</b><div>{p.description}</div>
                  {p.etat === "attente" && <div className="actions"><button className="btn btn-primaire btn-sm" onClick={() => decider(i, j, true)}>Confirmer</button><button className="btn btn-secondaire btn-sm" onClick={() => decider(i, j, false)}>Refuser</button></div>}
                  {p.etat === "en_cours" && <div className="texte-doux">Exécution…</div>}
                  {p.etat === "fait" && <div className="texte-ok" style={{ marginTop: 8 }}>Confirmée et enregistrée.</div>}
                  {p.etat === "refuse" && <div className="texte-doux" style={{ marginTop: 8 }}>Refusée.</div>}
                  {p.etat === "erreur" && <div className="texte-ko" style={{ marginTop: 8 }}>{p.detail}</div>}
                </div>
              ))}
            </div>
          ))}
          {charge && <div className="bulle assistant texte-doux">Analyse en cours{statut?.local ? " (un modèle local peut prendre plusieurs dizaines de secondes)" : ""}…</div>}
          <div ref={fin} />
        </div>
        <form className="chat-saisie" onSubmit={(e) => { e.preventDefault(); envoyer(); }}>
          <textarea rows={2} placeholder="Votre question" value={texte} disabled={!actif} aria-label="Votre question" onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }} />
          <button className="btn btn-primaire" disabled={charge || !actif}><Icone nom="envoyer" taille={16} />Envoyer</button>
        </form>
      </Carte>
    </>
  );
}
