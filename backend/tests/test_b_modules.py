from datetime import date, timedelta
from decimal import Decimal


def D(x):
    return Decimal(str(x))


def test_creances_budgets_previsions_rapprochement(client, h, ref):
    aujourdhui = date.today()
    caisse = ref["caisse"]

    # --- creance avec paiement partiel ---
    cl = client.post("/api/clients", json={"nom_client": "Client A"}, headers=h).json()
    f = client.post("/api/factures", json={"type_facture": "CREANCE", "date_facture": "1999-12-01",
                    "date_echeance": "2000-01-01", "montant": "1000000", "id_client": cl["id_client"]}, headers=h)
    assert f.status_code == 201, f.text
    fid = f.json()["id_facture"]
    assert f.json()["en_retard"] is True and f.json()["statut_paiement"] == "NON_PAYEE"

    pay = {"date_mouvement": str(aujourdhui), "montant": "400000", "id_compte": caisse["id_compte"],
           "id_mode": ref["mode"], "id_categorie": ref["cats"]["Recouvrement clients"]}
    p = client.post(f"/api/factures/{fid}/paiements", json=pay, headers=h)
    assert p.status_code == 201, p.text
    idp = p.json()["id_mouvement"]
    liste = client.get("/api/factures?type_facture=CREANCE", headers=h).json()
    assert D(liste[0]["reste"]) == 1000000  # brouillon : le reste ne bouge pas
    assert client.post(f"/api/mouvements/{idp}/valider", headers=h).status_code == 200
    f = [x for x in client.get("/api/factures", headers=h).json() if x["id_facture"] == fid][0]
    assert D(f["reste"]) == 600000 and f["statut_paiement"] == "PARTIELLE"
    pay["montant"] = "700000"
    assert client.post(f"/api/factures/{fid}/paiements", json=pay, headers=h).status_code == 400  # depasse le reste
    syn = client.get("/api/factures/synthese", headers=h).json()
    assert D(syn["creances"]["reste"]) == 600000 and syn["creances"]["taux"] == 40.0

    # --- budget ---
    debut_mois = aujourdhui.replace(day=1)
    b = client.post("/api/budgets", json={"id_categorie": ref["cats"]["Achats"], "montant_previsionnel": "1000000",
                    "periode": "MENSUEL", "date_debut": str(debut_mois)}, headers=h)
    assert b.status_code == 201, b.text
    assert client.post("/api/budgets", json={"id_categorie": ref["cats"]["Achats"], "montant_previsionnel": "5",
                       "periode": "MENSUEL", "date_debut": str(debut_mois)}, headers=h).status_code == 400  # chevauchement
    dep = client.post("/api/mouvements", json={"date_mouvement": str(aujourdhui), "libelle": "achat", "montant": "1200000",
                      "type_mouvement": "DECAISSEMENT", "id_compte": caisse["id_compte"],
                      "id_categorie": ref["cats"]["Achats"], "id_mode": ref["mode"]}, headers=h).json()
    assert client.post(f"/api/mouvements/{dep['id_mouvement']}/valider", headers=h).status_code == 200
    b = client.get("/api/budgets", headers=h).json()[0]
    assert b["etat"] == "DEPASSE" and D(b["depassement"]) == 200000 and b["taux_consommation"] == 120.0

    # --- previsions ---
    client.post("/api/previsions", json={"type_prevision": "ENCAISSEMENT", "date_prevue": str(aujourdhui + timedelta(days=5)),
                "montant": "500000", "libelle": "Vente attendue"}, headers=h)
    s = client.get("/api/previsions/solde", headers=h).json()
    assert D(s["solde_previsionnel"]) == D(s["solde_actuel"]) + D(s["total_encaissements"]) - D(s["total_decaissements"])
    assert D(s["total_encaissements"]) >= 1100000  # prevision + reste de la creance echue
    real = client.get(f"/api/previsions/realisation?debut={aujourdhui}&fin={aujourdhui + timedelta(days=10)}", headers=h).json()
    assert D(real["recettes"]["prevu"]) == 500000

    # --- rapprochement ---
    solde = D([c for c in client.get("/api/comptes", headers=h).json() if c["id_compte"] == caisse["id_compte"]][0]["solde_actuel"])
    r = client.post("/api/rapprochements", json={"id_compte": caisse["id_compte"], "date_rapprochement": str(aujourdhui),
                    "solde_reference": str(solde)}, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["anomalie"] is False
    rid = r.json()["id_rapprochement"]
    csv_data = f"date;libelle;montant\n{aujourdhui};paiement client;400000\n{aujourdhui};frais inconnus;-1234\n"
    imp = client.post(f"/api/rapprochements/{rid}/releve", files={"fichier": ("releve.csv", csv_data, "text/csv")}, headers=h)
    assert imp.json() == {"lignes_importees": 2, "rapprochees": 1, "non_rapprochees": 1}, imp.text
    det = client.get(f"/api/rapprochements/{rid}", headers=h).json()
    assert len(det["releve_non_rapproche"]) == 1
    assert client.post(f"/api/rapprochements/{rid}/valider", json={}, headers=h).status_code == 200
    r2 = client.post("/api/rapprochements", json={"id_compte": caisse["id_compte"], "date_rapprochement": str(aujourdhui),
                     "solde_reference": str(solde - 500)}, headers=h).json()
    assert r2["anomalie"] is True and D(r2["ecart"]) == -500
    assert client.post(f"/api/rapprochements/{r2['id_rapprochement']}/valider", json={}, headers=h).status_code == 400

    # --- notifications ---
    assert client.get("/api/notifications/compteur", headers=h).json()["non_lues"] >= 2  # facture en retard + budget depasse
    assert client.put("/api/notifications/lire-tout", headers=h).status_code == 200
    assert client.get("/api/notifications/compteur", headers=h).json()["non_lues"] == 0

    # --- exports et rapports ---
    q = f"debut={debut_mois}&fin={aujourdhui}"
    assert client.get(f"/api/rapports/periode/export?{q}&format=pdf", headers=h).content.startswith(b"%PDF")
    assert client.get(f"/api/rapports/periode/export?{q}&format=xlsx", headers=h).content.startswith(b"PK")
    assert client.get("/api/rapports/mouvements/export?format=csv", headers=h).status_code == 200
    assert client.get("/api/rapports/factures/export?format=pdf", headers=h).content.startswith(b"%PDF")
    rap = client.get(f"/api/rapports/periode?{q}", headers=h).json()
    assert D(rap["solde_final"]) == D(rap["solde_initial"]) + D(rap["total_recettes"]) - D(rap["total_depenses"])
    dash = client.get("/api/dashboard", headers=h).json()
    assert D(dash["total_creances"]) == 600000
