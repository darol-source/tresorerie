"""Migration v2 : cree les nouvelles tables et ajoute mouvement_tresorerie.id_facture.
Usage : python -m app.migrate_v2   (idempotent)"""
from sqlalchemy import inspect, text

from . import models  # noqa: F401  (enregistre toutes les tables)
from .database import Base, engine


def run() -> None:
    Base.metadata.create_all(engine)  # ne cree que les tables manquantes
    colonnes = {c["name"] for c in inspect(engine).get_columns("mouvement_tresorerie")}
    if "id_facture" not in colonnes:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE mouvement_tresorerie ADD COLUMN id_facture INTEGER NULL"))
            if engine.dialect.name == "mysql":
                conn.execute(text("ALTER TABLE mouvement_tresorerie ADD CONSTRAINT fk_mouvement_facture "
                                  "FOREIGN KEY (id_facture) REFERENCES facture(id_facture)"))
        print("Colonne id_facture ajoutee.")
    print("Migration v2 terminee.")


if __name__ == "__main__":
    run()
