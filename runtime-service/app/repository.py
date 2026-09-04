from pathlib import Path
import os
import sqlite3
from .models import DesiredState, RuntimeRecord, RuntimeState

ACTIVE_STATES = (RuntimeState.QUEUED, RuntimeState.REQUESTED, RuntimeState.PROVISIONING, RuntimeState.STARTING, RuntimeState.READY, RuntimeState.STOPPING)

class RuntimeRepository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or Path(os.getenv("LUMEN_RUNTIME_DB_PATH", Path(__file__).parent.parent / "data" / "runtime.db"))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        connection = sqlite3.connect(self.db_path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _init_db(self):
        with self._connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS user_runtimes (
                    runtime_id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    profile TEXT NOT NULL,
                    state TEXT NOT NULL,
                    desired_state TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    provider_ref TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_activity_at TEXT NOT NULL,
                    failure_reason TEXT
                );
                CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_runtime
                ON user_runtimes(owner_user_id)
                WHERE state IN ('QUEUED','REQUESTED','PROVISIONING','STARTING','READY','STOPPING');
                CREATE INDEX IF NOT EXISTS idx_user_runtimes_state ON user_runtimes(state, updated_at);
            """)

    def create(self, runtime: RuntimeRecord) -> None:
        with self._connect() as connection:
            connection.execute("INSERT INTO user_runtimes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", self._values(runtime))

    def get(self, runtime_id: str) -> RuntimeRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM user_runtimes WHERE runtime_id=?", (runtime_id,)).fetchone()
        return self._row(row) if row else None

    def get_for_user(self, runtime_id: str, user_id: str) -> RuntimeRecord | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM user_runtimes WHERE runtime_id=? AND owner_user_id=?", (runtime_id, user_id)).fetchone()
        return self._row(row) if row else None

    def find_active_by_user(self, user_id: str) -> RuntimeRecord | None:
        placeholders = ",".join("?" for _ in ACTIVE_STATES)
        with self._connect() as connection:
            row = connection.execute(f"SELECT * FROM user_runtimes WHERE owner_user_id=? AND state IN ({placeholders}) ORDER BY created_at DESC LIMIT 1", (user_id, *(state.value for state in ACTIVE_STATES))).fetchone()
        return self._row(row) if row else None

    def update_if_state(self, runtime: RuntimeRecord, expected_state: RuntimeState) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                """UPDATE user_runtimes
                   SET profile=?,state=?,desired_state=?,provider=?,provider_ref=?,
                       updated_at=?,last_activity_at=?,failure_reason=?
                   WHERE runtime_id=? AND owner_user_id=? AND state=?""",
                (
                    runtime.profile,
                    runtime.state.value,
                    runtime.desired_state.value,
                    runtime.provider,
                    runtime.provider_ref,
                    runtime.updated_at,
                    runtime.last_activity_at,
                    runtime.failure_reason,
                    runtime.runtime_id,
                    runtime.owner_user_id,
                    expected_state.value,
                ),
            )
            return cursor.rowcount == 1

    @staticmethod
    def _values(r: RuntimeRecord):
        return (r.runtime_id, r.owner_user_id, r.profile, r.state.value, r.desired_state.value, r.provider, r.provider_ref, r.created_at, r.updated_at, r.last_activity_at, r.failure_reason)

    @staticmethod
    def _row(row) -> RuntimeRecord:
        return RuntimeRecord(row["runtime_id"], row["owner_user_id"], row["profile"], RuntimeState(row["state"]), DesiredState(row["desired_state"]), row["provider"], row["provider_ref"], row["created_at"], row["updated_at"], row["last_activity_at"], row["failure_reason"])
