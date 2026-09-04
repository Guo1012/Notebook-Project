from typing import Any
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)

class BootstrapUserRequest(LoginRequest):
    displayName: str = Field(min_length=1, max_length=128)

class UserResponse(BaseModel):
    id: str
    username: str
    displayName: str

class CreateNotebookRequest(BaseModel):
    title: str = Field(default="未命名 Notebook", min_length=1, max_length=256)
    content: dict[str, Any]

class SaveNotebookRequest(BaseModel):
    baseRevision: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=256)
    content: dict[str, Any]

class RenameNotebookRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)

class NotebookResponse(BaseModel):
    notebookId: str
    title: str
    revision: int
    content: dict[str, Any]
    createdAt: str
    updatedAt: str

class NotebookSummary(BaseModel):
    notebookId: str
    title: str
    revision: int
    cellCount: int
    createdAt: str
    updatedAt: str

class NotebookListResponse(BaseModel):
    items: list[NotebookSummary]

class UploadedFileResponse(BaseModel):
    id: str
    name: str
    type: str
    size: int
    uploadedAt: str

class FileListResponse(BaseModel):
    items: list[UploadedFileResponse]
