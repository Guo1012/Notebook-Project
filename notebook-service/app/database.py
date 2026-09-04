from pathlib import Path
import os
import sqlite3

DEFAULT_DB_PATH = Path(__file__).parent.parent / "data" / "lumen.db"

class Database:
    def __init__(self, path: Path | None = None):
        self.path = path or Path(os.getenv("LUMEN_DB_PATH", DEFAULT_DB_PATH))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS notebooks (
                    notebook_id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL REFERENCES users(user_id),
                    title TEXT NOT NULL, current_revision INTEGER NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_notebooks_owner_updated ON notebooks(owner_user_id, updated_at DESC);
                CREATE TABLE IF NOT EXISTS notebook_revisions (
                    notebook_id TEXT NOT NULL REFERENCES notebooks(notebook_id) ON DELETE CASCADE,
                    revision INTEGER NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY (notebook_id, revision)
                );
                CREATE TABLE IF NOT EXISTS user_files (
                    file_id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL REFERENCES users(user_id),
                    original_name TEXT NOT NULL,
                    storage_name TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    uploaded_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_user_files_owner_uploaded
                ON user_files(owner_user_id, uploaded_at DESC);
            """)
