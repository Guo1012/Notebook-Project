from dataclasses import replace
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
from .logging_config import configure_logging


logger = configure_logging("runtime-service")

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
class ConcurrentRuntimeTransition(Exception): pass

class RuntimeService:
    def __init__(self, repository: RuntimeRepository | None = None, provider: RuntimeProvider | None = None):
        self.repository = repository or RuntimeRepository()
        self.provider = provider
        self._provisioning_ids: set[str] = set()
        self._provisioning_lock = threading.Lock()

    def ensure_user_runtime(self, user_id: str, profile: str) -> RuntimeRecord:
        existing = self.repository.find_active_by_user(user_id)
        if existing:
            logger.info("event=runtime_reused user_id=%s runtime_id=%s state=%s", user_id, existing.runtime_id, existing.state.value)
            if self.provider and existing.state == RuntimeState.REQUESTED:
                self._start_provision(existing.runtime_id)
            return existing
        timestamp = now_iso()
        runtime = RuntimeRecord(f"rt_{uuid.uuid4().hex[:12]}", user_id, profile, RuntimeState.REQUESTED, DesiredState.RUNNING, "unassigned", None, timestamp, timestamp, timestamp, None)
        try: self.repository.create(runtime)
        except sqlite3.IntegrityError:
            existing = self.repository.find_active_by_user(user_id)
            if existing:
                logger.info("event=runtime_race_reused user_id=%s runtime_id=%s state=%s", user_id, existing.runtime_id, existing.state.value)
                return existing
            raise
        logger.info("event=runtime_created user_id=%s runtime_id=%s profile=%s", user_id, runtime.runtime_id, profile)
        if self.provider:
            self._start_provision(runtime.runtime_id)
        return runtime

    def _start_provision(self, runtime_id: str) -> None:
        with self._provisioning_lock:
            if runtime_id in self._provisioning_ids:
                logger.info("event=runtime_provision_already_running runtime_id=%s", runtime_id)
                return
            self._provisioning_ids.add(runtime_id)
        logger.info("event=runtime_provision_scheduled runtime_id=%s", runtime_id)
        def run():
            try: self._provision(runtime_id)
            finally:
                with self._provisioning_lock: self._provisioning_ids.discard(runtime_id)
        threading.Thread(target=run, daemon=True).start()

    def get_user_runtime(self, user_id: str) -> RuntimeRecord | None:
        return self.repository.find_active_by_user(user_id)

    def request_stop(self, user_id: str) -> RuntimeRecord | None:
        while True:
            runtime = self.repository.find_active_by_user(user_id)
            if runtime is None:
                return None
            if runtime.state == RuntimeState.STOPPING:
                break
            runtime.desired_state = DesiredState.STOPPED
            try:
                self.transition(runtime, RuntimeState.STOPPING)
                break
            except ConcurrentRuntimeTransition:
                continue
        logger.info("event=runtime_stop_started user_id=%s runtime_id=%s state=%s", user_id, runtime.runtime_id, runtime.state.value)
        if not self.provider:
            return runtime
        if runtime.provider_ref:
            try: self.provider.terminate(ProviderRuntimeRef(runtime.provider_ref))
            except Exception as error:
                return self.transition(runtime, RuntimeState.FAILED, failure_reason=str(error))
        self.transition(runtime, RuntimeState.STOPPED)
        logger.info("event=runtime_stop_completed user_id=%s runtime_id=%s", user_id, runtime.runtime_id)
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
        ref: ProviderRuntimeRef | None = None
        try:
            self.transition(runtime, RuntimeState.PROVISIONING, provider="docker")
            image = os.getenv("LUMEN_JUPYTER_IMAGE", "quay.io/jupyter/minimal-notebook:python-3.12")
            logger.info("event=provider_create_started user_id=%s runtime_id=%s provider=docker image=%s", runtime.owner_user_id, runtime.runtime_id, image)
            ref = self.provider.create(RuntimeSpec(runtime.runtime_id, runtime.owner_user_id, image, self.runtime_token(runtime.runtime_id)))
            logger.info("event=provider_create_completed user_id=%s runtime_id=%s provider_ref=%s", runtime.owner_user_id, runtime.runtime_id, ref.id[:12])
            current = self.repository.get(runtime_id)
            if (
                current is None
                or current.state != RuntimeState.PROVISIONING
                or current.desired_state != DesiredState.RUNNING
            ):
                self.provider.terminate(ref)
                if current and current.state == RuntimeState.STOPPING:
                    self.transition(current, RuntimeState.STOPPED)
                logger.info("event=runtime_provision_cancelled runtime_id=%s", runtime_id)
                return
            runtime = current
            self.transition(runtime, RuntimeState.STARTING, provider_ref=ref.id)
            deadline = time.monotonic() + int(os.getenv("LUMEN_RUNTIME_START_TIMEOUT", "90"))
            while time.monotonic() < deadline:
                status = self.provider.inspect(ref)
                if status.ready:
                    self.transition(runtime, RuntimeState.READY)
                    logger.info("event=runtime_ready user_id=%s runtime_id=%s", runtime.owner_user_id, runtime.runtime_id)
                    return
                if not status.running: raise RuntimeError(status.detail or "Jupyter container stopped")
                time.sleep(0.5)
            raise TimeoutError("Jupyter Server startup timed out")
        except ConcurrentRuntimeTransition:
            if ref is not None:
                self.provider.terminate(ref)
            logger.info("event=runtime_provision_cancelled runtime_id=%s", runtime_id)
        except Exception as error:
            logger.exception("event=runtime_provision_failed runtime_id=%s error=%r", runtime_id, error)
            if ref is not None:
                try:
                    self.provider.terminate(ref)
                except Exception:
                    logger.exception("event=runtime_cleanup_failed runtime_id=%s", runtime_id)
            current = self.repository.get(runtime_id)
            if current and current.state not in (RuntimeState.FAILED, RuntimeState.STOPPED):
                try: self.transition(current, RuntimeState.FAILED, failure_reason=str(error))
                except InvalidRuntimeTransition: pass

    def transition(self, runtime: RuntimeRecord, state: RuntimeState, *, provider: str | None = None, provider_ref: str | None = None, failure_reason: str | None = None) -> RuntimeRecord:
        previous_state = runtime.state
        if state not in ALLOWED_TRANSITIONS[previous_state]: raise InvalidRuntimeTransition(f"{previous_state.value} -> {state.value}")
        updated = replace(
            runtime,
            state=state,
            updated_at=now_iso(),
            provider=provider if provider is not None else runtime.provider,
            provider_ref=provider_ref if provider_ref is not None else runtime.provider_ref,
            failure_reason=failure_reason,
        )
        if not self.repository.update_if_state(updated, previous_state):
            raise ConcurrentRuntimeTransition(
                f"runtime {runtime.runtime_id} changed from {previous_state.value}"
            )
        runtime.__dict__.update(updated.__dict__)
        logger.info(
            "event=runtime_state_changed user_id=%s runtime_id=%s from_state=%s to_state=%s failure_reason=%r",
            runtime.owner_user_id,
            runtime.runtime_id,
            previous_state.value,
            state.value,
            failure_reason,
        )
        return runtime
