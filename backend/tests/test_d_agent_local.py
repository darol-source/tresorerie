import json

import httpx
import pytest

from app.config import settings


def chat(client, h, q="Bonjour"):
    return client.post("/api/agent/chat", json={"messages": [{"role": "user", "content": q}]}, headers=h)


@pytest.fixture
def scenario(monkeypatch):
    """Remplace l'appel HTTP vers le modele et rejoue des reponses scriptees."""
    def installer(*reponses):
        appels, file = [], list(reponses)

        def faux_post(url, payload, headers=None):
            appels.append({"url": url, "payload": json.loads(json.dumps(payload)), "headers": headers})
            return file.pop(0)

        monkeypatch.setattr("app.services.agent._post", faux_post)
        return appels
    return installer


def test_ollama_lecture_puis_reponse(client, h, scenario, monkeypatch):
    monkeypatch.setattr(settings, "agent_provider", "ollama")
    appels = scenario(
        {"message": {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "get_tableau_de_bord", "arguments": {}}}]}},
        {"message": {"role": "assistant", "content": "Votre solde total est affiche."}},
    )
    r = chat(client, h, "Quel est mon solde ?")
    assert r.status_code == 200 and r.json()["reponse"] == "Votre solde total est affiche."
    assert appels[0]["url"].endswith("/api/chat")
    assert appels[0]["payload"]["options"]["num_ctx"] == settings.ollama_num_ctx
    assert appels[0]["payload"]["messages"][0]["role"] == "system"
    outil = appels[1]["payload"]["messages"][-1]
    assert outil["role"] == "tool" and "solde_total" in outil["content"]


def test_ollama_proposition_arguments_en_texte(client, h, scenario, monkeypatch):
    monkeypatch.setattr(settings, "agent_provider", "ollama")
    scenario(
        {"message": {"content": "", "tool_calls": [{"function": {"name": "proposer_creation_fournisseur",
                                                                  "arguments": json.dumps({"nom": "Fournisseur Local"})}}]}},
        {"message": {"content": "En attente de votre confirmation."}},
    )
    r = chat(client, h).json()
    assert len(r["propositions"]) == 1
    assert client.post("/api/agent/executer", json={"token": r["propositions"][0]["token"]}, headers=h).status_code == 200
    assert "Fournisseur Local" in [f["nom_fournisseur"] for f in client.get("/api/fournisseurs", headers=h).json()]


def test_ollama_outil_inconnu_ou_arguments_invalides(client, h, scenario, monkeypatch):
    monkeypatch.setattr(settings, "agent_provider", "ollama")
    appels = scenario(
        {"message": {"content": "", "tool_calls": [{"function": {"name": "supprimer_tout", "arguments": "pas du json"}}]}},
        {"message": {"content": "Je ne peux pas faire cela."}},
    )
    assert chat(client, h).status_code == 200
    assert "erreur" in appels[1]["payload"]["messages"][-1]["content"]


def test_openai_compatible(client, h, scenario, monkeypatch):
    monkeypatch.setattr(settings, "agent_provider", "openai")
    monkeypatch.setattr(settings, "openai_base_url", "https://exemple.test/v1")
    monkeypatch.setattr(settings, "openai_model", "modele-test")
    monkeypatch.setattr(settings, "openai_api_key", "cle-test")
    appels = scenario(
        {"choices": [{"message": {"content": None, "tool_calls": [
            {"function": {"name": "lister_comptes", "arguments": "{}"}}]}}]},  # sans id : genere cote serveur
        {"choices": [{"message": {"content": "Deux comptes."}}]},
    )
    r = chat(client, h)
    assert r.json()["reponse"] == "Deux comptes."
    assert appels[0]["url"] == "https://exemple.test/v1/chat/completions"
    assert appels[0]["headers"] == {"Authorization": "Bearer cle-test"}
    suite = appels[1]["payload"]["messages"]
    assert suite[-1]["role"] == "tool" and suite[-1]["tool_call_id"] == suite[-2]["tool_calls"][0]["id"]


def test_statut_ollama(client, h, monkeypatch):
    monkeypatch.setattr(settings, "agent_provider", "ollama")

    def injoignable(*a, **k):
        raise httpx.ConnectError("refuse")
    monkeypatch.setattr("app.services.agent.httpx.get", injoignable)
    s = client.get("/api/agent/statut", headers=h).json()
    assert s["actif"] is False and "ollama serve" in s["detail"]

    class Rep:
        def raise_for_status(self): pass
        def json(self): return {"models": [{"name": "autre:latest"}]}
    monkeypatch.setattr("app.services.agent.httpx.get", lambda *a, **k: Rep())
    s = client.get("/api/agent/statut", headers=h).json()
    assert s["actif"] is False and "ollama pull" in s["detail"]

    class Rep2(Rep):
        def json(self): return {"models": [{"name": "qwen2.5:7b"}]}
    monkeypatch.setattr("app.services.agent.httpx.get", lambda *a, **k: Rep2())
    s = client.get("/api/agent/statut", headers=h).json()
    assert s["actif"] is True and s["local"] is True


def test_ollama_hors_ligne_donne_502(client, h, monkeypatch):
    monkeypatch.setattr(settings, "agent_provider", "ollama")

    def echec(*a, **k):
        raise httpx.ConnectError("refuse")
    monkeypatch.setattr("app.services.agent._post", echec)
    r = chat(client, h)
    assert r.status_code == 502 and "indisponible" in r.json()["detail"]
