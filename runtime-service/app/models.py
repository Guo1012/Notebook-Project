from dataclasses import dataclass
from enum import Enum
from pydantic import BaseModel, Field

class RuntimeState(str, Enum):
    QUEUED = "QUEUED"
    REQUESTED = "REQUESTED"
    PROVISIONING = "PROVISIONING"
    STARTING = "STARTING"
    READY = "READY"
    STOPPING = "STOPPING"
    FAILED = "FAILED"
    STOPPED = "STOPPED"

class DesiredState(str, Enum):
    RUNNING = "RUNNING"
    STOPPED = "STOPPED"

class EnsureRuntimeRequest(BaseModel):
    profile: str = Field(default="python-small", pattern=r"^[a-z0-9-]{1,64}$")

class RuntimeResponse(BaseModel):
    runtimeId: str
    state: RuntimeState
    desiredState: DesiredState
    profile: str
    provider: str
    providerRef: str | None
    createdAt: str
    updatedAt: str
    lastActivityAt: str
    failureReason: str | None

@dataclass
class RuntimeRecord:
    runtime_id: str
    owner_user_id: str
    profile: str
    state: RuntimeState
    desired_state: DesiredState
    provider: str
    provider_ref: str | None
    created_at: str
    updated_at: str
    last_activity_at: str
    failure_reason: str | None
