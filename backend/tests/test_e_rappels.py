import smtplib
from datetime import date, timedelta

import pytest

from app.config import settings
from app.services import emails


@pytest.fixture
def smtp(monkeypatch):
    envoyes = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "compta@societe.mg")
    monkeypatch.setattr(settings, "rappels_pause_secondes", 0)
    monkeypatch.setattr("app.services.emails._transport", lambda msg: envoyes.append(msg))
    return envoyes


def nouvelle_creance(client, h, email, echeance, nom="Client Mail"):
    cl = client.post("/api/clients", json={"nom_client": nom, "email": email}, headers=h).json()
    f = client.post("/api/factures", json={"type_facture": "CREANCE", "date_facture": str(echeance - timedelta(days=30)),
                    "date_echeance": str(echeance), "montant": "800000", "id_client": cl["id_client"]}, headers=h)
    assert f.status_code == 201, f.text
    return f.json()


def test_calendrier_et_etapes():
    assert emails.calendrier() == [-3, 0, 1, 7, 15]
    o = emails.calendrier()
    assert emails.etape_courante(-10, o) is None
    assert emails.etape_courante(-3, o) == -3 and emails.etape_courante(-1, o) == -3
    assert emails.etape_courante(0, o) == 0 and emails.etape_courante(5, o) == 1
    assert emails.etape_courante(40, o) == 15


def test_rappel_retard_sans_doublon(client, h, ref, smtp):
    f = nouvelle_creance(client, h, "client.mail@exemple.mg", date.today() - timedelta(days=2))
    ap = client.get("/api/rappels/apercu", headers=h).json()
    mien = [x for x in ap["a_envoyer"] if x["id_facture"] == f["id_facture"]]
    assert len(mien) == 1 and "retard" in mien[0]["objet"] and mien[0]["etape"] == 1
    assert smtp == []  # l'apercu n'envoie rien

    r = client.post("/api/rappels/executer", headers=h).json()
    assert r["envoyes"] >= 1 and r["echecs"] == 0
    msg = [m for m in smtp if m["To"] == "client.mail@exemple.mg"]
    assert len(msg) == 1
    corps = msg[0].get_body(preferencelist=("plain",)).get_content()
    assert "800 000 Ar" in corps and "Reste à payer" in corps and "ne pas tenir compte" in corps
    assert msg[0].get_body(preferencelist=("html",)) is not None

    avant = len(smtp)
    assert client.post("/api/rappels/executer", headers=h).json()["envoyes"] == 0  # pas de doublon
    assert len(smtp) == avant
    hist = client.get(f"/api/rappels/historique?id_facture={f['id_facture']}", headers=h).json()
    assert len(hist) == 1 and hist[0]["statut"] == "ENVOYE" and hist[0]["type_rappel"] == "AUTO"


def test_echec_puis_nouvel_essai(client, h, smtp, monkeypatch):
    f = nouvelle_creance(client, h, "echec@exemple.mg", date.today() - timedelta(days=1), "Client Echec")

    def panne(msg):
        raise smtplib.SMTPAuthenticationError(535, b"refuse")
    monkeypatch.setattr("app.services.emails._transport", panne)
    r = client.post("/api/rappels/executer", headers=h).json()
    assert r["echecs"] >= 1
    hist = client.get(f"/api/rappels/historique?id_facture={f['id_facture']}", headers=h).json()
    assert hist[0]["statut"] == "ECHEC" and hist[0]["erreur"]

    monkeypatch.setattr("app.services.emails._transport", lambda msg: smtp.append(msg))
    client.post("/api/rappels/executer", headers=h)
    assert any(m["To"] == "echec@exemple.mg" for m in smtp)  # le rappel en echec est retente


def test_client_sans_email_et_facture_soldee(client, h, ref, smtp):
    f = nouvelle_creance(client, h, "", date.today() - timedelta(days=3), "Client Sans Mail")
    ap = client.get("/api/rappels/apercu", headers=h).json()
    assert any(x["id_facture"] == f["id_facture"] for x in ap["ignores"])
    assert client.post(f"/api/rappels/facture/{f['id_facture']}", headers=h).status_code == 400

    f2 = nouvelle_creance(client, h, "paye@exemple.mg", date.today() - timedelta(days=3), "Client Paye")
    pay = {"date_mouvement": str(date.today()), "montant": "800000", "id_compte": ref["caisse"]["id_compte"],
           "id_mode": ref["mode"], "id_categorie": ref["cats"]["Recouvrement clients"]}
    idm = client.post(f"/api/factures/{f2['id_facture']}/paiements", json=pay, headers=h).json()["id_mouvement"]
    assert client.post(f"/api/mouvements/{idm}/valider", headers=h).status_code == 200
    ap = client.get("/api/rappels/apercu", headers=h).json()
    assert not any(x["id_facture"] == f2["id_facture"] for x in ap["a_envoyer"])  # soldee : plus de rappel


def test_mode_test_et_rappel_manuel(client, h, smtp, monkeypatch):
    monkeypatch.setattr(settings, "email_test_destinataire", "moi@exemple.mg")
    f = nouvelle_creance(client, h, "vrai.client@exemple.mg", date.today() + timedelta(days=10), "Client Manuel")
    r = client.post(f"/api/rappels/facture/{f['id_facture']}", headers=h)
    assert r.status_code == 200, r.text
    assert smtp[-1]["To"] == "moi@exemple.mg" and smtp[-1]["Subject"].startswith("[TEST]")  # jamais au vrai client
    assert r.json()["destinataire"] == "vrai.client@exemple.mg" and r.json()["envoye_a"] == "moi@exemple.mg"
    assert client.post(f"/api/rappels/facture/{f['id_facture']}", headers=h).status_code == 200  # manuel : repetable


def test_dette_et_roles(client, h, smtp):
    roles = {r["libelle_role"]: r["id_role"] for r in client.get("/api/roles", headers=h).json()}
    client.post("/api/utilisateurs", json={"nom": "C", "prenom": "Compta2", "email": "compta2@tresorerie.mg",
                "mot_de_passe": "Motdepasse1", "id_role": roles["COMPTABLE"]}, headers=h)
    tok = client.post("/api/auth/login", data={"username": "compta2@tresorerie.mg", "password": "Motdepasse1"}).json()["access_token"]
    hc = {"Authorization": f"Bearer {tok}"}
    assert client.post("/api/rappels/executer", headers=hc).status_code == 403
    assert client.post("/api/rappels/test", json={}, headers=hc).status_code == 403
    assert client.post("/api/rappels/test", json={"destinataire": "admin@exemple.mg"}, headers=h).json() == {"envoye_a": "admin@exemple.mg"}

    fo = client.post("/api/fournisseurs", json={"nom_fournisseur": "Fournisseur X", "email": "f@x.mg"}, headers=h).json()
    d = client.post("/api/factures", json={"type_facture": "DETTE", "date_facture": "2026-01-01", "date_echeance": "2026-01-10",
                    "montant": "1000", "id_fournisseur": fo["id_fournisseur"]}, headers=h).json()
    assert client.post(f"/api/rappels/facture/{d['id_facture']}", headers=h).status_code == 400  # uniquement les creances


def test_smtp_non_configure(client, h, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    assert client.post("/api/rappels/executer", headers=h).status_code == 400
    assert client.get("/api/rappels/config", headers=h).json()["smtp_configure"] is False
