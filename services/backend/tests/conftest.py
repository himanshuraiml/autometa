"""Test bootstrap: point the backend at a throwaway SQLite file BEFORE any
backend module is imported (config/database read the environment at import
time), and make the flat backend modules importable from the tests dir."""

import os
import sys
import tempfile
from pathlib import Path

_TMP_DIR = tempfile.mkdtemp(prefix="autometa-test-")
os.environ["AUTOMETA_DB_PATH"] = str(Path(_TMP_DIR) / "test.db")
os.environ["AUTOMETA_LOG_LEVEL"] = "WARNING"
os.environ.pop("AUTOMETA_AUTH_TOKEN", None)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# database.py adopts a legacy `autometa.db` sitting in the current working
# directory (a one-time upgrade path for real installs). If pytest happens to
# be invoked with cwd=services/backend and a dev-server-created autometa.db
# is sitting there, that stale file gets copied over the fresh test DB path
# above, silently reusing an out-of-date schema. Running from the isolated
# temp dir sidesteps that regardless of invocation directory.
os.chdir(_TMP_DIR)
