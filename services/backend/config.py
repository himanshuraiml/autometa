"""Central configuration for the Autometa backend.

Every setting is overridable via environment variable so the same binary works
as a Tauri sidecar, in local development, and in CI:

  AUTOMETA_HOST          Bind address                       (default: 127.0.0.1)
  AUTOMETA_PORT          Bind port                          (default: 8000)
  AUTOMETA_DB_PATH       SQLite file path                   (default: <user-data-dir>/autometa.db)
  AUTOMETA_CORS_ORIGINS  Comma-separated allowed origins    (default: Tauri + Vite dev origins)
  AUTOMETA_AUTH_TOKEN    If set, every /api request must    (default: unset = auth disabled,
                         send "Authorization: Bearer <it>"   for bare local development)
  AUTOMETA_LOG_LEVEL     Python log level name              (default: INFO)
  AUTOMETA_SQL_ECHO      "1" to echo SQL statements         (default: off)
  AUTOMETA_OLLAMA_URL    Ollama generate endpoint           (default: http://localhost:11434/api/generate)
  AUTOMETA_LLM_TIMEOUT   Seconds per chat LLM request       (default: 120)
  AUTOMETA_LESSON_TIMEOUT Seconds per lesson LLM request    (default: 180)
  AUTOMETA_LLM_RETRIES   Retry attempts on transient errors (default: 2)
"""

import os
import sys
from pathlib import Path


def _default_data_dir() -> Path:
    """Per-user writable data directory.

    The PyInstaller sidecar is spawned from inside the app bundle, where the
    working directory may be read-only — a relative sqlite path is not safe.
    """
    home = Path.home()
    if sys.platform == "darwin":
        base = home / "Library" / "Application Support"
    elif sys.platform.startswith("win"):
        base = Path(os.getenv("APPDATA", home / "AppData" / "Roaming"))
    else:
        base = Path(os.getenv("XDG_DATA_HOME", home / ".local" / "share"))
    return base / "Autometa"


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


DEFAULT_CORS_ORIGINS = [
    # Tauri v2 webview origins (macOS/Linux and Windows respectively)
    "tauri://localhost",
    "http://tauri.localhost",
    # Vite dev server
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


class Settings:
    def __init__(self) -> None:
        self.host: str = os.getenv("AUTOMETA_HOST", "127.0.0.1")
        self.port: int = _env_int("AUTOMETA_PORT", 8000)

        db_path = os.getenv("AUTOMETA_DB_PATH")
        if db_path:
            self.db_path = Path(db_path)
        else:
            self.db_path = _default_data_dir() / "autometa.db"

        raw_origins = os.getenv("AUTOMETA_CORS_ORIGINS")
        if raw_origins:
            self.cors_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
        else:
            self.cors_origins = list(DEFAULT_CORS_ORIGINS)

        self.auth_token: str = os.getenv("AUTOMETA_AUTH_TOKEN", "")
        self.log_level: str = os.getenv("AUTOMETA_LOG_LEVEL", "INFO").upper()
        self.sql_echo: bool = os.getenv("AUTOMETA_SQL_ECHO", "") in ("1", "true", "yes")

        self.ollama_url: str = os.getenv(
            "AUTOMETA_OLLAMA_URL", "http://localhost:11434/api/generate"
        )
        self.ollama_model: str = os.getenv("AUTOMETA_OLLAMA_MODEL", "qwen2.5-coder:7b")
        self.ollama_fallback_model: str = os.getenv(
            "AUTOMETA_OLLAMA_FALLBACK_MODEL", "llama3.2:1b"
        )
        self.llm_timeout: float = _env_float("AUTOMETA_LLM_TIMEOUT", 120.0)
        self.lesson_timeout: float = _env_float("AUTOMETA_LESSON_TIMEOUT", 180.0)
        self.llm_retries: int = _env_int("AUTOMETA_LLM_RETRIES", 2)


settings = Settings()

APP_VERSION = "0.2.4"
