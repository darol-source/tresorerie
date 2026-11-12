from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .services import emails
from .routers import (agent, auth, budgets, comptes, dashboard, factures, mouvements, notifications,
                      previsions, rapports, rapprochements, referentiels, rappels, transferts)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)  # en production, preferer Alembic
    emails.demarrer_planificateur()
    yield
    emails.arreter_planificateur()


app = FastAPI(title="Gestion de tresorerie", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, comptes.router, referentiels.categories, referentiels.clients,
          referentiels.fournisseurs, referentiels.modes, mouvements.router,
          transferts.router, dashboard.router, factures.router, budgets.router, previsions.router,
          rapprochements.router, notifications.router, rapports.router, agent.router, rappels.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
