# Gestion de tresorerie (FastAPI + SQLAlchemy + MySQL + React)

## Backend
    cd backend
    python -m venv .venv && source .venv/bin/activate      # Windows : .venv\Scripts\activate
    pip install -r requirements.txt
    cp .env.example .env                                    # puis renseigner DATABASE_URL et SECRET_KEY
    # MySQL : CREATE DATABASE tresorerie CHARACTER SET utf8mb4;
    python -m app.migrate_v2                                # SI tu as deja une base v1 : ajoute les nouvelles tables et la colonne id_facture
    python -m app.seed                                      # tables + roles + admin + comptes d'exemple
    uvicorn app.main:app --reload                           # docs : http://localhost:8000/docs
    pytest                                                  # test de bout en bout (SQLite)

Compte initial : admin@tresorerie.mg / Admin123!  (a changer immediatement)

## Frontend
    cd frontend
    npm install
    npm run dev                                             # http://localhost:5173

## Modules v2
Creances et dettes, budgets, previsions, rapprochement, notifications, rapports et exports PDF/Excel/CSV.
Documentation interactive de tous les endpoints : http://localhost:8000/docs
