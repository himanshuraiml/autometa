import logging
import shutil
from pathlib import Path

from sqlmodel import Session, create_engine

from config import settings
from migrations import run_migrations

logger = logging.getLogger("autometa.database")

settings.db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    echo=settings.sql_echo,
    connect_args={"check_same_thread": False},
)


def _adopt_legacy_database() -> None:
    """Earlier builds wrote autometa.db into the process working directory.
    Adopt that file once so existing users keep their projects."""
    legacy = Path("autometa.db").resolve()
    if settings.db_path.exists() or not legacy.is_file():
        return
    if legacy == settings.db_path.resolve():
        return
    shutil.copy2(legacy, settings.db_path)
    logger.info("Adopted legacy database from %s", legacy)


def init_db() -> None:
    _adopt_legacy_database()
    logger.info("Using database at %s", settings.db_path)
    run_migrations(engine)


def get_session():
    with Session(engine) as session:
        yield session
