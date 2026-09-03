from pathlib import Path
import sqlite3

from .models import (
    RuntimeRecord,
    RuntimeState,
)


class RuntimeRepository:

    ACTIVE_STATES = (
        RuntimeState.REQUESTED,
        RuntimeState.PROVISIONING,
        RuntimeState.STARTING,
        RuntimeState.READY,
    )

    def __init__(
        self,
        db_path: Path,
    ):
        self.db_path = db_path

        self.db_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        self._init_db()

    def _connect(self):
        connection = sqlite3.connect(
            self.db_path
        )

        connection.row_factory = sqlite3.Row

        return connection

    def _init_db(self):
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runtimes (
                    runtime_id TEXT PRIMARY KEY,
                    notebook_id TEXT NOT NULL,
                    profile TEXT NOT NULL,

                    state TEXT NOT NULL,

                    provider TEXT NOT NULL,
                    provider_ref TEXT,

                    jupyter_token TEXT NOT NULL,

                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS
                idx_runtimes_notebook
                ON runtimes(notebook_id)
                """
            )

    def _row_to_record(
        self,
        row: sqlite3.Row,
    ) -> RuntimeRecord:

        return RuntimeRecord(
            runtime_id=row["runtime_id"],
            notebook_id=row["notebook_id"],
            profile=row["profile"],

            state=RuntimeState(row["state"]),

            provider=row["provider"],
            provider_ref=row["provider_ref"],

            jupyter_token=row["jupyter_token"],

            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create(
        self,
        runtime: RuntimeRecord,
    ) -> None:

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runtimes (
                    runtime_id,
                    notebook_id,
                    profile,
                    state,
                    provider,
                    provider_ref,
                    jupyter_token,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    runtime.runtime_id,
                    runtime.notebook_id,
                    runtime.profile,
                    runtime.state.value,
                    runtime.provider,
                    runtime.provider_ref,
                    runtime.jupyter_token,
                    runtime.created_at,
                    runtime.updated_at,
                ),
            )

    def update(
        self,
        runtime: RuntimeRecord,
    ) -> None:

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE runtimes
                SET
                    state = ?,
                    provider_ref = ?,
                    updated_at = ?
                WHERE runtime_id = ?
                """,
                (
                    runtime.state.value,
                    runtime.provider_ref,
                    runtime.updated_at,
                    runtime.runtime_id,
                ),
            )

    def get(
        self,
        runtime_id: str,
    ) -> RuntimeRecord | None:

        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM runtimes
                WHERE runtime_id = ?
                """,
                (runtime_id,),
            ).fetchone()

        if row is None:
            return None

        return self._row_to_record(row)

    def find_active_by_notebook(
        self,
        notebook_id: str,
    ) -> RuntimeRecord | None:

        states = tuple(
            state.value
            for state in self.ACTIVE_STATES
        )

        placeholders = ",".join(
            "?"
            for _ in states
        )

        with self._connect() as conn:
            row = conn.execute(
                f"""
                SELECT *
                FROM runtimes
                WHERE notebook_id = ?
                  AND state IN ({placeholders})
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (
                    notebook_id,
                    *states,
                ),
            ).fetchone()

        if row is None:
            return None

        return self._row_to_record(row)

    def list_non_stopped(
        self,
    ) -> list[RuntimeRecord]:

        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM runtimes
                WHERE state != ?
                ORDER BY created_at
                """,
                (
                    RuntimeState.STOPPED.value,
                ),
            ).fetchall()

        return [
            self._row_to_record(row)
            for row in rows
        ]