from decimal import Decimal


def total(client, h):
    return Decimal(str(client.get("/api/dashboard", headers=h).json()["solde_total"]))


def mouvement(ref, type_mv, cat, montant, compte):
    return {"date_mouvement": "2026-11-09", "libelle": "test", "montant": montant, "type_mouvement": type_mv,
            "id_compte": compte["id_compte"], "id_categorie": ref["cats"][cat], "id_mode": ref["mode"]}


def test_cycle_complet(client, h, ref):
    depart = total(client, h)
    r = client.post("/api/mouvements", json=mouvement(ref, "ENCAISSEMENT", "Ventes", "2000000", ref["caisse"]), headers=h)
    assert r.status_code == 201, r.text
    idm = r.json()["id_mouvement"]
    assert total(client, h) == depart  # brouillon : aucun effet
    assert client.post(f"/api/mouvements/{idm}/valider", headers=h).status_code == 200
    assert total(client, h) == depart + 2000000

    r = client.post("/api/transferts", json={"date_transfert": "2026-11-09", "montant": "1000000",
                    "id_compte_source": ref["caisse"]["id_compte"], "id_compte_destination": ref["banque"]["id_compte"]}, headers=h)
    assert r.status_code == 201, r.text
    assert total(client, h) == depart + 2000000  # un transfert ne change pas le total

    r = client.post("/api/mouvements", json=mouvement(ref, "DECAISSEMENT", "Achats", "99000000", ref["caisse"]), headers=h)
    idd = r.json()["id_mouvement"]
    assert client.post(f"/api/mouvements/{idd}/valider", headers=h).status_code == 400  # solde insuffisant
    r = client.post("/api/mouvements", json=mouvement(ref, "DECAISSEMENT", "Ventes", "1000", ref["caisse"]), headers=h)
    assert r.status_code == 400  # mauvaise nature de categorie
    r = client.post(f"/api/mouvements/{idd}/annuler", json={"motif": "erreur de saisie"}, headers=h)
    assert r.json()["statut"] == "ANNULE"
