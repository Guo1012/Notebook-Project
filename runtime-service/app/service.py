from datetime import datetime, timezone
import sqlite3
import hashlib
import hmac
import os
import threading
import time
import uuid
from .models import DesiredState, RuntimeRecord, RuntimeState
from .repository import RuntimeRepository
from .providers.base import ProviderRuntimeRef, RuntimeProvider, RuntimeSpec

ALLOWED_TRANSITIONS = {
    RuntimeState.QUEUED: {RuntimeState.REQUESTED, RuntimeState.FAILED, RuntimeState.STOPPING},
    RuntimeState.REQUESTED: {RuntimeState.PROVISIONING, RuntimeState.FAILED, RuntimeState.STOPPING},
    RuntimeState.PROVISIONING: {RuntimeState.STARTING, RuntimeState.FAILED, RuntimeState.STOPPING},
    RuntimeState.STARTING: {RuntimeState.READY, RuntimeState.FAILED, RuntimeState.STOPPING},
    RuntimeState.READY: {RuntimeState.FAILED, RuntimeState.STOPPING},
    RuntimeState.STOPPING: {RuntimeState.STOPPED, RuntimeState.FAILED},
    RuntimeState.FAILED: {RuntimeState.STOPPED},
    RuntimeState.STOPPED: set(),
}

def now_iso() -> str: return datetime.now(timezone.utc).isoformat()

class InvalidRuntimeTransition(Exception): pass

class RuntimeService:
    def __init__(self, repository: RuntimeRepository | None = None, provider: RuntimeProvider | None = None):
        self.repository = repository or RuntimeRepository()
        self.provider = provider
        self._provisioning_ids: set[str] = set()
        self._provisioning_lock = threading.Lock()

    def ensure_user_runtime(self, user_id: str, profile: str) -> RuntimeRecord:
        existing = self.repository.find_active_by_user(user_id)
        if existing:
            if self.provider and existing.state == RuntimeState.REQUESTED:
                self._start_provision(existing.runtime_id)
            return existing
        timestamp = now_iso()
        runtime = RuntimeRecord(f"rt_{uuid.uuid4().hex[:12]}", user_id, profile, RuntimeState.REQUESTED, DesiredState.RUNNING, "unassigned", None, timestamp, timestamp, timestamp, None)
        try: self.repository.create(runtime)
        except sqlite3.IntegrityError:
            existing = self.repository.find_active_by_user(user_id)
            if existing: return existing
            raise
        if self.provider:
            self._start_provision(runtime.runtime_id)
        return runtime

    def _start_provision(self, runtime_id: str) -> None:
        with self._provisioning_lock:
            if runtime_id in self._provisioning_ids: return
            self._provisioning_ids.add(runtime_id)
        def run():
            try: self._provision(runtime_id)
            finally:
                with self._provisioning_lock: self._provisioning_ids.discard(runtime_id)
        threading.Thread(target=run, daemon=True).start()

    def get_user_runtime(self, user_id: str) -> RuntimeRecord | None:
        return self.repository.find_active_by_user(user_id)

    def request_stop(self, user_id: str) -> RuntimeRecord | None:
        runtime = self.repository.find_active_by_user(user_id)
        if runtime is None: return None
        runtime.desired_state = DesiredState.STOPPED
        if runtime.state != RuntimeState.STOPPING: self.transition(runtime, RuntimeState.STOPPING)
        if not self.provider:
            return runtime
        if runtime.provider_ref:
            try: self.provider.terminate(ProviderRuntimeRef(runtime.provider_ref))
            except Exception as error:
                return self.transition(runtime, RuntimeState.FAILED, failure_reason=str(error))
        self.transition(runtime, RuntimeState.STOPPED)
        return runtime

    def get_connection(self, runtime_id: str, user_id: str):
        runtime = self.repository.get_for_user(runtime_id, user_id)
        if not runtime: return None
        if runtime.state != RuntimeState.READY or not runtime.provider_ref or not self.provider: return runtime, None
        endpoint = self.provider.get_endpoint(ProviderRuntimeRef(runtime.provider_ref))
        return runtime, {"host": endpoint.host, "port": endpoint.port, "token": self.runtime_token(runtime.runtime_id)}

    @staticmethod
    def runtime_token(runtime_id: str) -> str:
        secret = os.getenv("LUMEN_RUNTIME_TOKEN_SECRET", "development-runtime-token-change-me").encode()
        return hmac.new(secret, runtime_id.encode(), hashlib.sha256).hexdigest()

    def _provision(self, runtime_id: str) -> None:
        runtime = self.repository.get(runtime_id)
        if not runtime or not self.provider or runtime.state != RuntimeState.REQUESTED: return
        try:
            self.transition(runtime, RuntimeState.PROVISIONING, provider="docker")
            image = os.getenv("LUMEN_JUPYTER_IMAGE", "quay.io/jupyter/minimal-notebook:python-3.12")
            ref = self.provider.create(RuntimeSpec(runtime.runtime_id, runtime.owner_user_id, image, self.runtime_token(runtime.runtime_id)))
            self.transition(runtime, RuntimeState.STARTING, provider_ref=ref.id)
            deadline = time.monotonic() + int(os.getenv("LUMEN_RUNTIME_START_TIMEOUT", "90"))
            while time.monotonic() < deadline:
                status = self.provider.inspect(ref)
                if status.ready:
                    self.transition(runtime, RuntimeState.READY)
                    return
                if not status.running: raise RuntimeError(status.detail or "Jupyter container stopped")
                time.sleep(0.5)
            raise TimeoutError("Jupyter Server startup timed out")
        except Exception as error:
            current = self.repository.get(runtime_id)
            if current and current.state not in (RuntimeState.FAILED, RuntimeState.STOPPED):
                try: self.transition(current, RuntimeState.FAILED, failure_reason=str(error))
                except InvalidRuntimeTransition: pass

    def transition(self, runtime: RuntimeRecord, state: RuntimeState, *, provider: str | None = None, provider_ref: str | None = None, failure_reason: str | None = None) -> RuntimeRecord:
        if state not in ALLOWED_TRANSITIONS[runtime.state]: raise InvalidRuntimeTransition(f"{runtime.state.value} -> {state.value}")
        runtime.state, runtime.updated_at = state, now_iso()
        if provider is not None: runtime.provider = provider
        if provider_ref is not None: runtime.provider_ref = provider_ref
        runtime.failure_reason = failure_reason
        self.repository.update(runtime)
        return runtime
