import pytest
from sqlalchemy import text
from sqlmodel import create_engine

import migrations
from migrations import LATEST_VERSION, run_migrations


def make_engine(tmp_path, name):
    return create_engine(f"sqlite:///{tmp_path / name}")


def get_user_version(engine):
    with engine.connect() as conn:
        return conn.execute(text("PRAGMA user_version")).scalar() or 0


class TestMigrations:
    def test_fresh_database_created_at_latest_version(self, tmp_path):
        engine = make_engine(tmp_path, "fresh.db")
        run_migrations(engine)

        assert get_user_version(engine) == LATEST_VERSION
        with engine.connect() as conn:
            tables = [
                r[0] for r in conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                )
            ]
        assert "project" in tables

    def test_rerun_is_a_noop(self, tmp_path):
        engine = make_engine(tmp_path, "rerun.db")
        run_migrations(engine)
        run_migrations(engine)  # must not raise or change the version
        assert get_user_version(engine) == LATEST_VERSION

    def test_pending_migration_sql_is_applied_in_order(self, tmp_path, monkeypatch):
        engine = make_engine(tmp_path, "pending.db")
        run_migrations(engine)  # existing DB at current LATEST_VERSION

        monkeypatch.setattr(migrations, "MIGRATIONS", migrations.MIGRATIONS + [
            (LATEST_VERSION + 1, "CREATE TABLE migration_probe (id INTEGER PRIMARY KEY)"),
        ])
        monkeypatch.setattr(migrations, "LATEST_VERSION", LATEST_VERSION + 1)

        run_migrations(engine)

        assert get_user_version(engine) == LATEST_VERSION + 1
        with engine.connect() as conn:
            count = conn.execute(
                text("SELECT count(*) FROM sqlite_master WHERE name='migration_probe'")
            ).scalar()
        assert count == 1

    def test_newer_database_than_build_is_refused(self, tmp_path):
        engine = make_engine(tmp_path, "newer.db")
        run_migrations(engine)
        with engine.connect() as conn:
            conn.execute(text(f"PRAGMA user_version = {LATEST_VERSION + 10}"))
            conn.commit()

        with pytest.raises(RuntimeError, match="newer than this build"):
            run_migrations(engine)
