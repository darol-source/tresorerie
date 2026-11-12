import { api } from "./api";
import { Alerte, Badge, Carte, Chargement, PageTete, Vide, useChargement, useUI } from "./ui.jsx";
import { Icone } from "./icones.jsx";
import { fmtDateHeure } from "./format.js";

const TYPES = {
  SOLDE_FAIBLE: ["alerte", "ko", "Solde faible"], FACTURE_RETARD: ["factures", "ko", "Retard"], FACTURE_ECHEANCE: ["factures", "attente", "Échéance"],
  BUDGET_DEPASSE: ["budgets", "ko", "Budget"], EN_ATTENTE: ["validations", "attente", "Validation"], OPERATION_VALIDEE: ["check", "ok", "Validée"], OPERATION_REFUSEE: ["alerte", "ko", "Refusée"],
};

export default function Notifications({ rafraichir }) {
  const ui = useUI();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/notifications"), []);
  const maj = () => { recharger(); rafraichir?.(); };
  const lue = async (n) => { if (n.lu) return; try { await api(`/notifications/${n.id_notification}/lue`, { method: "PUT" }); maj(); } catch (e) { ui.erreur(e.message); } };
  const toutLire = async () => { try { await api("/notifications/lire-tout", { method: "PUT" }); maj(); } catch (e) { ui.erreur(e.message); } };

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const rows = donnees || [];
  const nonLues = rows.filter((n) => !n.lu).length;

  return (
    <>
      <PageTete titre="Notifications" sousTitre={nonLues ? `${nonLues} non lue(s)` : "Tout est lu"}
        actions={nonLues > 0 && <button className="btn btn-secondaire" onClick={toutLire}><Icone nom="check" taille={16} />Tout marquer comme lu</button>} />
      <Carte plat>
        {rows.length ? rows.map((n) => {
          const [icone, ton, lib] = TYPES[n.type_notification] || ["info", "neutre", "Information"];
          return (
            <div key={n.id_notification} onClick={() => lue(n)} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line-2)", cursor: n.lu ? "default" : "pointer", background: n.lu ? "transparent" : "#f7faff" }}>
              <div className={`kpi-icone ton-${ton}`} style={{ width: 38, height: 38 }}><Icone nom={icone} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: n.lu ? 400 : 650 }}>{n.message}</div><small className="texte-doux">{fmtDateHeure(n.date_creation)}</small></div>
              <Badge ton={ton}>{lib}</Badge>
              {!n.lu && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--brand)" }} aria-label="Non lue" />}
            </div>
          );
        }) : <Vide icone="cloche" titre="Aucune notification" texte="Les alertes de solde, d'échéance et de budget apparaîtront ici." />}
      </Carte>
    </>
  );
}
