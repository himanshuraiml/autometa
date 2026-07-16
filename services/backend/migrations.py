"""Lightweight, ordered SQLite migrations tracked via PRAGMA user_version.

Alembic is deliberately avoided: this backend ships as a single PyInstaller
sidecar binary, and a directory of migration scripts does not survive that
packaging model well. Instead each schema change is one entry in MIGRATIONS;
entries run in order inside a transaction and user_version records progress.

Adding a migration:
  1. Change the SQLModel models.
  2. Append (N, "ALTER TABLE ...") below with N = previous version + 1.
  3. Bump nothing else — fresh databases are created at the latest schema by
     SQLModel.metadata.create_all and stamped directly with the latest version.
"""

import logging
from typing import List, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel

logger = logging.getLogger("autometa.migrations")

# (version, sql). Versions must be consecutive integers starting at 1.
# Version 1 is the baseline schema and intentionally has no SQL: databases
# created before this system existed already have it, and fresh databases
# get it from create_all.
MIGRATIONS: List[Tuple[int, str]] = [
    (1, ""),
    (2, "ALTER TABLE project ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"),
    (
        3,
        "ALTER TABLE project ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';"
        "ALTER TABLE project ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';"
        "ALTER TABLE project ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0;"
        "ALTER TABLE project ADD COLUMN owner_profile_id INTEGER;"
        "ALTER TABLE project ADD COLUMN cloned_from_id INTEGER;",
    ),
]

LATEST_VERSION = MIGRATIONS[-1][0]


def _get_user_version(engine: Engine) -> int:
    with engine.connect() as conn:
        return conn.execute(text("PRAGMA user_version")).scalar() or 0


def _set_user_version(engine: Engine, version: int) -> None:
    with engine.connect() as conn:
        # PRAGMA does not accept bind parameters; version is a trusted int.
        conn.execute(text(f"PRAGMA user_version = {int(version)}"))
        conn.commit()


def _is_fresh_database(engine: Engine) -> bool:
    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT count(*) FROM sqlite_master WHERE type = 'table'")
        ).scalar()
    return (count or 0) == 0


def run_migrations(engine: Engine) -> None:
    fresh = _is_fresh_database(engine)
    current = _get_user_version(engine)

    if fresh:
        SQLModel.metadata.create_all(engine)
        _set_user_version(engine, LATEST_VERSION)
        logger.info("Created fresh database at schema version %d", LATEST_VERSION)
        return

    if current > LATEST_VERSION:
        # Database written by a newer app version; refuse to guess.
        raise RuntimeError(
            f"Database schema version {current} is newer than this build "
            f"supports ({LATEST_VERSION}). Update the application."
        )

    for version, sql in MIGRATIONS:
        if version <= current:
            continue
        logger.info("Applying migration %d", version)
        if sql:
            with engine.begin() as conn:
                for statement in sql.split(";"):
                    if statement.strip():
                        conn.execute(text(statement))
        _set_user_version(engine, version)

    # Pick up any brand-new tables added purely through the models.
    SQLModel.metadata.create_all(engine)

    if current < LATEST_VERSION:
        logger.info("Database migrated %d -> %d", current, LATEST_VERSION)
