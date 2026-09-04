from datetime import datetime, timezone
from typing import Any
import json
import sqlite3
import uuid

from .auth import CurrentUser, hash_password, verify_password
from .database import Database

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class NotebookNotFound(Exception): pass
class RevisionConflict(Exception):
    def __init__(self, current_revision: int): self.current_revision = current_revision
class UsernameExists(Exception): pass

class UserRepository:
    def __init__(self, database: Database): self.database = database

    def create(self, username: str, display_name: str, password: str) -> CurrentUser:
        user = CurrentUser(f"usr_{uuid.uuid4().hex[:12]}", username, display_name)
        try:
            with self.database.connect() as connection:
                connection.execute("INSERT INTO users VALUES (?, ?, ?, ?, 'ACTIVE', ?)", (user.user_id, user.username, user.display_name, hash_password(password), now_iso()))
        except sqlite3.IntegrityError as error:
            raise UsernameExists() from error
        return user

    def authenticate(self, username: str, password: str) -> CurrentUser | None:
        with self.database.connect() as connection:
            row = connection.execute("SELECT * FROM users WHERE username = ? AND status = 'ACTIVE'", (username,)).fetchone()
        if row is None or not verify_password(password, row["password_hash"]): return None
        return CurrentUser(row["user_id"], row["username"], row["display_name"])

class NotebookRepository:
    def __init__(self, database: Database): self.database = database

    def create(self, owner_user_id: str, title: str, content: dict[str, Any]) -> dict:
        notebook_id, timestamp = f"nb_{uuid.uuid4().hex[:12]}", now_iso()
        with self.database.connect() as connection:
            connection.execute("INSERT INTO notebooks VALUES (?, ?, ?, 1, ?, ?)", (notebook_id, owner_user_id, title, timestamp, timestamp))
            connection.execute("INSERT INTO notebook_revisions VALUES (?, 1, ?, ?)", (notebook_id, json.dumps(content, ensure_ascii=False), timestamp))
        return self.get(owner_user_id, notebook_id)

    def list(self, owner_user_id: str) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute("""SELECT n.*, r.content_json FROM notebooks n JOIN notebook_revisions r ON r.notebook_id=n.notebook_id AND r.revision=n.current_revision WHERE n.owner_user_id=? ORDER BY n.updated_at DESC""", (owner_user_id,)).fetchall()
        return [self._to_record(row) for row in rows]

    def get(self, owner_user_id: str, notebook_id: str) -> dict:
        with self.database.connect() as connection:
            row = connection.execute("""SELECT n.*, r.content_json FROM notebooks n JOIN notebook_revisions r ON r.notebook_id=n.notebook_id AND r.revision=n.current_revision WHERE n.notebook_id=? AND n.owner_user_id=?""", (notebook_id, owner_user_id)).fetchone()
        if row is None: raise NotebookNotFound()
        return self._to_record(row)

    def save(self, owner_user_id: str, notebook_id: str, base_revision: int, content: dict, title: str | None) -> dict:
        timestamp = now_iso()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT current_revision,title FROM notebooks WHERE notebook_id=? AND owner_user_id=?", (notebook_id, owner_user_id)).fetchone()
            if row is None: raise NotebookNotFound()
            if row["current_revision"] != base_revision: raise RevisionConflict(row["current_revision"])
            revision = base_revision + 1
            connection.execute("INSERT INTO notebook_revisions VALUES (?, ?, ?, ?)", (notebook_id, revision, json.dumps(content, ensure_ascii=False), timestamp))
            connection.execute("UPDATE notebooks SET title=?,current_revision=?,updated_at=? WHERE notebook_id=?", (title or row["title"], revision, timestamp, notebook_id))
        return self.get(owner_user_id, notebook_id)

    def rename(self, owner_user_id: str, notebook_id: str, title: str) -> dict:
        with self.database.connect() as connection:
            cursor = connection.execute("UPDATE notebooks SET title=?,updated_at=? WHERE notebook_id=? AND owner_user_id=?", (title, now_iso(), notebook_id, owner_user_id))
            if cursor.rowcount == 0: raise NotebookNotFound()
        return self.get(owner_user_id, notebook_id)

    def delete(self, owner_user_id: str, notebook_id: str) -> None:
        with self.database.connect() as connection:
            cursor = connection.execute("DELETE FROM notebooks WHERE notebook_id=? AND owner_user_id=?", (notebook_id, owner_user_id))
            if cursor.rowcount == 0: raise NotebookNotFound()

    @staticmethod
    def _to_record(row) -> dict:
        return {"notebookId": row["notebook_id"], "title": row["title"], "revision": row["current_revision"], "content": json.loads(row["content_json"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
