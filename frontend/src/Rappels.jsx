import { useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Chargement, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { fmtDateHeure } from "./format.js";
import { STATUT_ENVOI } from "./libelles.js";

const etape = (e) => (e === null || e === undefined ? "Manuel" : e < 0 ? `${-e} j avant l'échéance` : e === 0 ? "Jour de l'échéance" : `${e} j de retard`);

export default function Rappels() {
  const { peut } = useAuth();
  const ui = useUI();
  const { donnees: cfg, erreur, recharger: rechargerCfg } = useChargement(() => api("/rappels/config"), []);
  const { donnees: histo, recharger: rechargerHisto } = useChargement(() => api("/rappels/historique"), []);
  const [apercu, setApercu] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const voir = async () => { setOccupe(true); try { setApercu(await api("/rappels/apercu")); } catch (e) { ui.erreur(e.message); } finally { setOccupe(false); } };
  const envoyer = async () => {
    const n = apercu ? apercu.a_envoyer.length : null;
    const ok = await ui.confirmer({ titre: "Envoyer les rappels maintenant ?", libelleOk: "Envoyer",
      message: cfg.mode_test ? `Mode test : tous les e-mails seront envoyés à ${cfg.adresse_test}. Aucun client ne sera contacté.` : `${n === null ? "Les rappels dus" : `${n} rappel(s)`} seront envoyés aux clients concernés.` });
    if (!ok) return;
    setOccupe(true);
    try {
      const r = await api("/rappels/executer", { method: "POST" });
      ui.succes(`${r.envoyes} envoyé(s), ${r.echecs} échec(s), ${r.ignores} client(s) sans e-mail`);
      setApercu(null); rechargerHisto();
    } catch (e) { ui.erreur(e.message); } finally { setOccupe(false); }
  };
  const tester = async () => {
    const a = await ui.saisir({ titre: "E-mail de test", libelle: "Adresse de destination", message: "Un message de test sera envoyé pour vérifier la configuration.", min: 5, libelleOk: "Envoyer le test" });
    if (!a) return;
    try { const r = await api("/rappels/test", { method: "POST", body: { destinataire: a } }); ui.succes(`E-mail de test envoyé à ${r.envoye_a}`); } catch (e) { ui.erreur(e.message); }
  };

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (!cfg) return <Chargement />;

  const ligne = (icone, titre, valeur, ton) => (
    <div style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line-2)", alignItems: "center" }}>
      <div className={`kpi-icone ton-${ton}`} style={{ width: 34, height: 34 }}><Icone nom={icone} taille={16} /></div>
      <div><b>{titre}</b><div className="texte-doux">{valeur}</div></div>
    </div>
  );

  return (
    <>
      <PageTete titre="Rappels par e-mail" sousTitre="Rappels de paiement envoyés aux clients ayant une créance impayée."
        actions={<>
          <button className="btn btn-secondaire" onClick={voir} disabled={occupe}>Voir ce qui serait envoyé</button>
          {peut("administrer") && <button className="btn btn-secondaire" onClick={tester} disabled={occupe || !cfg.smtp_configure}>E-mail de test</button>}
          {peut("gerer") && <button className="btn btn-primaire" onClick={envoyer} disabled={occupe || !cfg.smtp_configure}><Icone nom="envoyer" taille={16} />Envoyer maintenant</button>}
        </>} />
      {cfg.mode_test && <Alerte>Mode test actif : tous les e-mails sont envoyés à <b>{cfg.adresse_test}</b>. Aucun client n'est contacté.</Alerte>}
      {!cfg.smtp_configure && <Alerte ton="ko">L'envoi d'e-mails n'est pas configuré. Renseignez SMTP_HOST et SMTP_FROM dans le fichier .env du backend.</Alerte>}

      <div className="grille g-2">
        <Carte titre="Configuration">
          {ligne("mail", "Serveur d'envoi", cfg.smtp_configure ? `Configuré — expéditeur ${cfg.expediteur}` : "Non configuré", cfg.smtp_configure ? "ok" : "ko")}
          {ligne("previsions", "Envoi automatique", cfg.automatique ? `Actif, chaque jour vers ${cfg.heure} h` : "Désactivé", cfg.automatique ? "ok" : "attente")}
          {ligne("budgets", "Calendrier", cfg.calendrier.map(etape).join(" · "), "info")}
        </Carte>
        <Carte titre="À envoyer maintenant" sousTitre={apercu ? `${apercu.a_envoyer.length} rappel(s)` : "Cliquez sur « Voir ce qui serait envoyé »"} plat>
          {apercu ? (apercu.a_envoyer.length || apercu.ignores.length ? <div className="table-defile"><table className="tableau"><tbody>
            {apercu.a_envoyer.map((x) => <tr key={x.id_facture + ":" + x.etape}><td>{x.client}<span className="sous">{x.reference}</span></td><td>{etape(x.etape)}</td><td className="texte-doux">{x.envoye_a}</td></tr>)}
            {apercu.ignores.map((x) => <tr key={x.id_facture}><td>{x.client}<span className="sous">{x.reference}</span></td><td colSpan="2"><Badge ton="attente">{x.raison}</Badge></td></tr>)}
          </tbody></table></div> : <Vide icone="check" titre="Rien à envoyer aujourd'hui" />) : <div className="carte-corps texte-doux">Aucun aperçu chargé.</div>}
        </Carte>
      </div>

      <Carte titre="Historique des envois" plat>
        {(histo || []).length ? <div className="table-defile"><table className="tableau">
          <thead><tr><th>Date</th><th>Facture</th><th>Client</th><th>Type</th><th>Étape</th><th>Envoyé à</th><th>Statut</th></tr></thead>
          <tbody>{histo.map((h) => (
            <tr key={h.id_rappel}><td>{fmtDateHeure(h.date_envoi)}</td><td>{h.facture_reference}</td><td>{h.client_nom}</td><td>{h.type_rappel === "AUTO" ? "Automatique" : "Manuel"}</td><td>{etape(h.etape)}</td><td>{h.envoye_a}</td>
              <td><Badge ton={STATUT_ENVOI[h.statut]?.[1]} titre={h.erreur || ""}>{STATUT_ENVOI[h.statut]?.[0] || h.statut}</Badge></td></tr>
          ))}</tbody>
        </table></div> : <Vide icone="mail" titre="Aucun e-mail envoyé" />}
      </Carte>
    </>
  );
}
