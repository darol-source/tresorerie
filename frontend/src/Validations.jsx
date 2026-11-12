import { api } from "./api";
import { useAuth } from "./auth.jsx";
import { Alerte, Badge, Carte, Chargement, Kpi, PageTete, Vide, useChargement } from "./ui.jsx";
import { fmtAr, fmtDate } from "./format.js";
import { peutValider, SEUIL_VALIDATION } from "./droits.js";
import { useActionsMouvement } from "./actionsMouvement.js";

export default function Validations({ rafraichir }) {
  const { user } = useAuth();
  const { donnees, chargement, erreur, recharger } = useChargement(() => api("/mouvements?statut=BROUILLON&limit=200"), []);
  const { valider, annuler } = useActionsMouvement(() => { recharger(); rafraichir?.(); });

  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !donnees) return <Chargement />;
  const rows = donnees || [];
  const somme = (t) => rows.filter((m) => m.type_mouvement === t).reduce((s, m) => s + Number(m.montant), 0);

  return (
    <>
      <PageTete titre="Opérations à valider" sousTitre="Une opération en attente ne modifie pas le solde tant qu'elle n'est pas validée." />
      <div className="kpis">
        <Kpi libelle="Opérations en attente" valeur={rows.length} icone="validations" ton="attente" />
        <Kpi libelle="Recettes en attente" valeur={fmtAr(somme("ENCAISSEMENT"))} icone="flecheHaut" ton="ok" />
        <Kpi libelle="Dépenses en attente" valeur={fmtAr(somme("DECAISSEMENT"))} icone="flecheBas" ton="ko" />
      </div>
      <Alerte ton="info">Les dépenses supérieures à {fmtAr(SEUIL_VALIDATION)} doivent être validées par la direction.</Alerte>

      <Carte plat>
        {rows.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Date</th><th>Opération</th><th>Compte</th><th>Saisi par</th><th className="num">Montant</th><th /></tr></thead>
            <tbody>
              {rows.map((m) => {
                const ok = peutValider(user, m);
                return (
                  <tr key={m.id_mouvement}>
                    <td>{fmtDate(m.date_mouvement)}</td>
                    <td>{m.libelle}<span className="sous">{m.reference} · {m.categorie_libelle}</span></td>
                    <td>{m.compte_libelle}</td><td>{m.utilisateur_nom}</td>
                    <td className={`num ${m.type_mouvement === "ENCAISSEMENT" ? "texte-ok" : "texte-ko"}`}>{m.type_mouvement === "ENCAISSEMENT" ? "+" : "−"}{fmtAr(m.montant)}</td>
                    <td className="actions">
                      {ok ? <>
                        <button className="btn btn-lien ko btn-sm" onClick={() => annuler(m, "Refuser")}>Refuser</button>{" "}
                        <button className="btn btn-primaire btn-sm" onClick={() => valider(m)}>Valider</button>
                      </> : <Badge ton="attente" titre="Montant supérieur au seuil">Réservé à la direction</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <Vide icone="validations" titre="Tout est à jour" texte="Aucune opération n'attend de validation." />}
      </Carte>
    </>
  );
}
