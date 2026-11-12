import os

os.environ["DATABASE_URL"] = "sqlite:///./test_tresorerie.db"
if os.path.exists("test_tresorerie.db"):
    os.remove("test_tresorerie.db")

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app import seed
    from app.main import app

    seed.run()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def h(client):
    r = client.post("/api/auth/login", data={"username": "admin@tresorerie.mg", "password": "Admin123!"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def ref(client, h):
    comptes = client.get("/api/comptes", headers=h).json()
    return {
        "caisse": comptes[0], "banque": comptes[1],
        "cats": {x["libelle_categorie"]: x["id_categorie"] for x in client.get("/api/categories", headers=h).json()},
        "mode": client.get("/api/modes-paiement", headers=h).json()[0]["id_mode"],
    }
