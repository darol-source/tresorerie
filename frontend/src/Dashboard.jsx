import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "./api";
import { Alerte, Badge, Barre, Carte, Chargement, Kpi, PageTete, Vide, useChargement } from "./ui.jsx";
import { fmtAr, fmtCompact, fmtDate, fmtMois, fmtPct } from "./format.js";
import { STATUT_MV, TYPE_COMPTE } from "./libelles.js";

const PALETTE = ["#1d4ed8", "#0ea5a4", "#f59e0b", "#7c3aed", "#e11d48", "#64748b", "#16a34a", "#ea580c"];

export default function Dashboard() {
  const { donnees: d, chargement, erreur } = useChargement(() => api("/dashboard"), []);
  if (erreur) return <Alerte ton="ko">{erreur}</Alerte>;
  if (chargement && !d) return <Chargement lignes={6} />;

  const evolution = d.evolution.map((e) => ({ ...e, mois: fmtMois(e.mois) }));
  const totalSoldes = d.soldes_comptes.reduce((s, c) => s + Number(c.solde), 0) || 1;
  const aujourdhui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageTete titre="Tableau de bord" sousTitre={aujourdhui.charAt(0).toUpperCase() + aujourdhui.slice(1)}
        actions={<a className="btn btn-secondaire" href="#/rapports">Voir les rapports</a>} />

      {d.alertes.map((a) => <Alerte key={a}>{a}</Alerte>)}

      <div className="kpis">
        <Kpi libelle="Solde total de trésorerie" valeur={fmtAr(d.solde_total)} icone="portefeuille" ton="brand" />
        <Kpi libelle="Total des recettes" valeur={fmtAr(d.total_recettes)} icone="flecheHaut" ton="ok" />
        <Kpi libelle="Total des dépenses" valeur={fmtAr(d.total_depenses)} icone="flecheBas" ton="ko" note={`${fmtPct(d.taux_depenses)} des recettes`} />
        <Kpi libelle="Variation nette" valeur={fmtAr(d.variation_nette)} icone="balance" ton={d.variation_nette >= 0 ? "ok" : "ko"} note="Recettes − dépenses" />
      </div>
      <div className="kpis">
        <Kpi libelle="Aujourd'hui" valeur={fmtAr(d.recettes_jour - d.depenses_jour)} icone="mouvements" note={`+${fmtAr(d.recettes_jour)} / −${fmtAr(d.depenses_jour)}`} />
        <Kpi libelle="Ce mois-ci" valeur={fmtAr(d.recettes_mois - d.depenses_mois)} icone="mouvements" note={`+${fmtAr(d.recettes_mois)} / −${fmtAr(d.depenses_mois)}`} />
        <Kpi libelle="Créances clients non réglées" valeur={fmtAr(d.total_creances)} icone="factures" ton="info" />
        <Kpi libelle="Dettes fournisseurs non réglées" valeur={fmtAr(d.total_dettes)} icone="factures" ton="attente" note={`Position nette : ${fmtAr(d.position_nette)}`} />
      </div>

      <div className="grille g-2-1">
        <Carte titre="Évolution de la trésorerie" sousTitre="Solde de fin de mois, recettes et dépenses validées">
          {evolution.length ? (
            <div style={{ height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart data={evolution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" vertical={false} />
                  <XAxis dataKey="mois" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={fmtCompact} tickLine={false} axisLine={false} fontSize={12} width={52} />
                  <Tooltip formatter={(v) => fmtAr(v)} />
                  <Legend iconType="circle" />
                  <Bar dataKey="recettes" name="Recettes" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="depenses" name="Dépenses" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Line dataKey="solde" name="Solde" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <Vide icone="rapports" titre="Aucune opération validée" texte="Le graphique apparaîtra dès la première opération validée." />}
        </Carte>

        <Carte titre="Dépenses par catégorie">
          {d.depenses_par_categorie.length ? (
            <>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.depenses_par_categorie} dataKey="montant" nameKey="categorie" innerRadius={52} outerRadius={82} paddingAngle={2}>
                      {d.depenses_par_categorie.map((c, i) => <Cell key={c.categorie} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtAr(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <table className="tableau"><tbody>
                {d.depenses_par_categorie.map((c, i) => (
                  <tr key={c.categorie}>
                    <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], marginRight: 8 }} />{c.categorie}</td>
                    <td className="num">{fmtAr(c.montant)}</td><td className="num texte-doux">{c.pourcentage} %</td>
                  </tr>
                ))}
              </tbody></table>
            </>
          ) : <Vide icone="categories" titre="Aucune dépense validée" />}
        </Carte>
      </div>

      <div className="grille g-2">
        <Carte titre="Soldes par compte" actions={<a className="btn btn-lien btn-sm" href="#/comptes">Gérer</a>}>
          {d.soldes_comptes.length ? d.soldes_comptes.map((c) => (
            <div key={c.id_compte} style={{ marginBottom: 14 }}>
              <div className="compte-ligne" style={{ color: "inherit", marginBottom: 6 }}>
                <span><b>{c.libelle}</b> <span className="texte-doux">· {TYPE_COMPTE[c.type] || c.type}</span></span>
                <span className={c.solde_faible ? "texte-ko" : ""}><b>{fmtAr(c.solde)}</b></span>
              </div>
              <Barre pct={(Number(c.solde) / totalSoldes) * 100} ton={c.solde_faible ? "ko" : undefined} />
              {c.solde_faible && <small className="texte-ko">Sous le seuil minimum de {fmtAr(c.seuil_minimum)}</small>}
            </div>
          )) : <Vide icone="comptes" titre="Aucun compte actif" />}
        </Carte>
        <Carte titre="Recettes par catégorie">
          {d.recettes_par_categorie.length ? (
            <table className="tableau"><tbody>
              {d.recettes_par_categorie.map((c) => (
                <tr key={c.categorie}><td>{c.categorie}</td><td className="num">{fmtAr(c.montant)}</td><td className="num texte-doux">{c.pourcentage} %</td></tr>
              ))}
            </tbody></table>
          ) : <Vide icone="categories" titre="Aucune recette validée" />}
        </Carte>
      </div>

      <Carte titre="Dernières transactions" plat actions={<a className="btn btn-lien btn-sm" href="#/mouvements">Tout voir</a>}>
        {d.dernieres_transactions.length ? (
          <div className="table-defile"><table className="tableau">
            <thead><tr><th>Date</th><th>Libellé</th><th>Compte</th><th className="num">Montant</th><th>Statut</th></tr></thead>
            <tbody>
              {d.dernieres_transactions.map((m) => {
                const [lib, ton] = STATUT_MV[m.statut];
                return (
                  <tr key={m.id_mouvement}>
                    <td>{fmtDate(m.date_mouvement)}</td>
                    <td>{m.libelle}<span className="sous">{m.reference}</span></td>
                    <td>{m.compte_libelle}</td>
                    <td className={`num ${m.type_mouvement === "ENCAISSEMENT" ? "texte-ok" : "texte-ko"}`}>{m.type_mouvement === "ENCAISSEMENT" ? "+" : "−"}{fmtAr(m.montant)}</td>
                    <td><Badge ton={ton}>{lib}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <Vide icone="mouvements" titre="Aucune transaction" texte="Enregistrez une première recette ou dépense." action={<a className="btn btn-primaire" href="#/mouvements">Aller aux opérations</a>} />}
      </Carte>
    </>
  );
}
