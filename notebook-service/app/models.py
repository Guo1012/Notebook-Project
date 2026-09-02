from typing import Any

from pydantic import BaseModel


class CreateNotebookRequest(BaseModel):
    content: dict[str, Any]


class SaveNotebookRequest(BaseModel):
    baseRevision: int
    content: dict[str, Any]


class NotebookResponse(BaseModel):
    notebookId: str
    revision: int
    content: dict[str, Any]