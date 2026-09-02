from pathlib import Path
from typing import Any
import json
import uuid


class NotebookNotFound(Exception):
    pass


class RevisionConflict(Exception):
    def __init__(self, current_revision: int):
        self.current_revision = current_revision


class LocalNotebookRepository:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def _notebook_dir(self, notebook_id: str) -> Path:
        return self.data_dir / notebook_id

    def _read_meta(self, notebook_id: str) -> dict:
        path = self._notebook_dir(notebook_id) / "meta.json"

        if not path.exists():
            raise NotebookNotFound()

        return json.loads(path.read_text())

    def _read_revision(
        self,
        notebook_id: str,
        revision: int,
    ) -> dict[str, Any]:
        path = (
            self._notebook_dir(notebook_id)
            / f"{revision}.ipynb"
        )

        if not path.exists():
            raise NotebookNotFound()

        return json.loads(path.read_text())

    def create(
        self,
        content: dict[str, Any],
    ) -> tuple[str, int, dict[str, Any]]:
        notebook_id = f"nb_{uuid.uuid4().hex[:12]}"
        revision = 1

        directory = self._notebook_dir(notebook_id)
        directory.mkdir(parents=True)

        self._write_revision(
            notebook_id,
            revision,
            content,
        )

        self._write_meta(
            notebook_id,
            revision,
        )

        return notebook_id, revision, content

    def get(
        self,
        notebook_id: str,
    ) -> tuple[int, dict[str, Any]]:
        meta = self._read_meta(notebook_id)
        revision = meta["currentRevision"]

        content = self._read_revision(
            notebook_id,
            revision,
        )

        return revision, content

    def save(
        self,
        notebook_id: str,
        base_revision: int,
        content: dict[str, Any],
    ) -> tuple[int, dict[str, Any]]:
        meta = self._read_meta(notebook_id)

        current_revision = meta["currentRevision"]

        if base_revision != current_revision:
            raise RevisionConflict(current_revision)

        new_revision = current_revision + 1

        self._write_revision(
            notebook_id,
            new_revision,
            content,
        )

        self._write_meta(
            notebook_id,
            new_revision,
        )

        return new_revision, content

    def _write_revision(
        self,
        notebook_id: str,
        revision: int,
        content: dict[str, Any],
    ) -> None:
        path = (
            self._notebook_dir(notebook_id)
            / f"{revision}.ipynb"
        )

        path.write_text(
            json.dumps(
                content,
                ensure_ascii=False,
                indent=2,
            )
        )

    def _write_meta(
        self,
        notebook_id: str,
        revision: int,
    ) -> None:
        path = self._notebook_dir(notebook_id) / "meta.json"

        path.write_text(
            json.dumps(
                {
                    "notebookId": notebook_id,
                    "currentRevision": revision,
                },
                ensure_ascii=False,
                indent=2,
            )
        )