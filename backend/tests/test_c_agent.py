from types import SimpleNamespace as NS

import pytest

from app.config import settings


class FauxClient:
    """Remplace anthropic.Anthropic : rejoue un scenario et memorise les appels."""

    def __init__(self, scenario):
        self.scenario, self.appels = list(scenario), []
        self.messages = self

    def create(self, **kw):
        self.appels.append({**kw, "messages": list(kw["messages"])})
        return self.scenario.pop(0)


def texte(t):
    return NS(stop_reason="end_turn", content=[NS(type="text", text=t)])


def outil(nom, args, id="tu_1"):
    return NS(stop_reason="tool_use", content=[NS(type="tool_use", id=id, name=nom, input=args)])


@pytest.fixture
def faux(monkeypatch):
    def installer(*scenario):
        f = FauxClient(scenario)
        monkeypatch.setattr("app.services.agent.get_client", lambda: f)
        return f
    return installer


def chat(client, h, question="Bonjour"):
    return client.post("/api/agent/chat", json={"messages": [{"role": "user", "content": question}]}, headers=h)


def test_lecture_donnees(client, h, faux):
    f = faux(outil("get_tableau_de_bord", {}), texte("Votre tresorerie est de X Ar."))
    r = chat(client, h, "Quelle est ma tresorerie ?")
    assert r.status_code == 200 and r.json()["reponse"] == "Votre tresorerie est de X Ar."
    assert r.json()["propositions"] == []
    resultat = f.appels[1]["messages"][-1]["content"][0]
    assert resultat["type"] == "tool_result" and "solde_total" in resultat["content"]
    assert "Super Admin" in f.appels[0]["system"]


def test_proposition_confirmee(client, h, faux):
    faux(outil("proposer_creation_client", {"nom": "Societe Agent"}), texte("En attente de confirmation."))
    r = chat(client, h, "Cree le client Societe Agent").json()
    assert len(r["propositions"]) == 1
    noms = [c["nom_client"] for c in client.get("/api/clients", headers=h).json()]
    assert "Societe Agent" not in noms  # rien n'est cree avant confirmation
    token = r["propositions"][0]["token"]
    assert client.post("/api/agent/executer", json={"token": token}, headers=h).status_code == 200
    noms = [c["nom_client"] for c in client.get("/api/clients", headers=h).json()]
    assert "Societe Agent" in noms
    assert client.post("/api/agent/executer", json={"token": token}, headers=h).status_code == 400  # rejeu
    assert client.post("/api/agent/executer", json={"token": token[:-3] + "abc"}, headers=h).status_code == 400  # falsifie


def test_facture_et_mouvement_via_agent(client, h, ref, faux):
    cl = client.post("/api/clients", json={"nom_client": "Client Agent"}, headers=h).json()
    faux(outil("proposer_creation_facture", {"type_facture": "CREANCE", "id_tiers": cl["id_client"],
         "date_facture": "2026-11-01", "date_echeance": "2026-12-01", "montant": 250000}), texte("ok"))
    p = chat(client, h).json()["propositions"][0]
    assert "250 000 Ar" in p["description"]
    assert client.post("/api/agent/executer", json={"token": p["token"]}, headers=h).status_code == 200
    assert any(x["tiers_nom"] == "Client Agent" for x in client.get("/api/factures", headers=h).json())

    faux(outil("proposer_mouvement", {"type_mouvement": "ENCAISSEMENT", "date_mouvement": "2026-11-09", "libelle": "Vente agent",
         "montant": 10000, "id_compte": ref["caisse"]["id_compte"], "id_categorie": ref["cats"]["Ventes"], "id_mode": ref["mode"]}), texte("ok"))
    p = chat(client, h).json()["propositions"][0]
    res = client.post("/api/agent/executer", json={"token": p["token"]}, headers=h).json()
    assert "brouillon" in res["message"]
    mv = [m for m in client.get("/api/mouvements", headers=h).json() if m["libelle"] == "Vente agent"][0]
    assert mv["statut"] == "BROUILLON"  # l'agent ne valide jamais


def test_erreurs_renvoyees_au_modele(client, h, faux):
    f = faux(outil("proposer_creation_facture", {"type_facture": "CREANCE", "id_tiers": 99999, "date_facture": "2026-11-01",
             "date_echeance": "2026-12-01", "montant": 1000}), texte("Client introuvable."))
    r = chat(client, h).json()
    assert r["propositions"] == []
    assert "erreur" in f.appels[1]["messages"][-1]["content"][0]["content"]


def test_roles(client, h, faux):
    roles = {r["libelle_role"]: r["id_role"] for r in client.get("/api/roles", headers=h).json()}
    client.post("/api/utilisateurs", json={"nom": "Compta", "prenom": "Test", "email": "compta@tresorerie.mg",
                "mot_de_passe": "Motdepasse1", "id_role": roles["COMPTABLE"]}, headers=h)
    tok = client.post("/api/auth/login", data={"username": "compta@tresorerie.mg", "password": "Motdepasse1"}).json()["access_token"]
    hc = {"Authorization": f"Bearer {tok}"}

    f = faux(outil("proposer_creation_client", {"nom": "Interdit"}), texte("Impossible."))
    assert chat(client, hc).json()["propositions"] == []
    assert "role" in f.appels[1]["messages"][-1]["content"][0]["content"]

    faux(outil("proposer_creation_client", {"nom": "Via admin"}), texte("ok"))
    token = chat(client, h).json()["propositions"][0]["token"]
    assert client.post("/api/agent/executer", json={"token": token}, headers=hc).status_code == 403  # jeton d'un autre


def test_validation_et_configuration(client, h, monkeypatch):
    r = client.post("/api/agent/chat", json={"messages": [{"role": "assistant", "content": "salut"}]}, headers=h)
    assert r.status_code == 400
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    assert chat(client, h).status_code == 503
    assert client.get("/api/agent/statut", headers=h).json()["actif"] is False
