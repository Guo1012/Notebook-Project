from datetime import datetime, timezone
from pathlib import Path
import os
import uuid

from fastapi import UploadFile
from .database import Database

MAX_UPLOAD_BYTES = int(os.getenv("LUMEN_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
DEFAULT_FILES_ROOT = Path(__file__).parent.parent / "data" / "users"

class FileNotFound(Exception): pass
class FileTooLarge(Exception): pass

class UserFileRepository:
    def __init__(self, database: Database, root: Path | None = None):
        self.database = database
        self.root = root or Path(os.getenv("LUMEN_FILES_ROOT", DEFAULT_FILES_ROOT))
        self.root.mkdir(parents=True, exist_ok=True)

    async def save(self, owner_user_id: str, upload: UploadFile) -> dict:
        file_id = f"file_{uuid.uuid4().hex[:12]}"
        storage_name = f"{file_id}.bin"
        directory = self.root / owner_user_id
        directory.mkdir(parents=True, exist_ok=True)
        path, size = directory / storage_name, 0
        try:
            with path.open("wb") as destination:
                while chunk := await upload.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES: raise FileTooLarge()
                    destination.write(chunk)
        except Exception:
            path.unlink(missing_ok=True)
            raise
        uploaded_at = datetime.now(timezone.utc).isoformat()
        record = {"id": file_id, "name": Path(upload.filename or "upload.bin").name, "type": upload.content_type or "application/octet-stream", "size": size, "uploadedAt": uploaded_at}
        with self.database.connect() as connection:
            connection.execute("INSERT INTO user_files VALUES (?, ?, ?, ?, ?, ?, ?)", (file_id, owner_user_id, record["name"], storage_name, record["type"], size, uploaded_at))
        return record

    def list(self, owner_user_id: str) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute("SELECT * FROM user_files WHERE owner_user_id=? ORDER BY uploaded_at DESC", (owner_user_id,)).fetchall()
        return [self._record(row) for row in rows]

    def resolve(self, owner_user_id: str, file_id: str) -> tuple[Path, dict]:
        with self.database.connect() as connection:
            row = connection.execute("SELECT * FROM user_files WHERE file_id=? AND owner_user_id=?", (file_id, owner_user_id)).fetchone()
        if row is None: raise FileNotFound()
        return self.root / owner_user_id / row["storage_name"], self._record(row)

    def delete(self, owner_user_id: str, file_id: str) -> None:
        path, _ = self.resolve(owner_user_id, file_id)
        with self.database.connect() as connection:
            connection.execute("DELETE FROM user_files WHERE file_id=? AND owner_user_id=?", (file_id, owner_user_id))
        path.unlink(missing_ok=True)

    @staticmethod
    def _record(row) -> dict:
        return {"id": row["file_id"], "name": row["original_name"], "type": row["content_type"], "size": row["size"], "uploadedAt": row["uploaded_at"]}
