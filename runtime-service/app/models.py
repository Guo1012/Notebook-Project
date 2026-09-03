from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel


class RuntimeState(str, Enum):
    REQUESTED = "REQUESTED"
    PROVISIONING = "PROVISIONING"
    STARTING = "STARTING"
    READY = "READY"
    FAILED = "FAILED"
    STOPPED = "STOPPED"


class CreateRuntimeRequest(BaseModel):
    notebookId: str
    profile: str = "python-base"


class RuntimeResponse(BaseModel):
    runtimeId: str
    notebookId: str
    profile: str
    state: RuntimeState
    provider: str
    providerRef: str | None = None


@dataclass
class RuntimeRecord:
    runtime_id: str
    notebook_id: str
    profile: str

    state: RuntimeState

    provider: str
    provider_ref: str | None

    jupyter_token: str

    created_at: str
    updated_at: str

class RuntimeConnectionResponse(BaseModel):
    runtimeId: str
    state: RuntimeState

    host: str
    port: int

    token: str