from datetime import (
    datetime,
    timezone,
)
from pathlib import Path
import secrets
import uuid

from .models import (
    RuntimeRecord,
    RuntimeState,
)

from .providers.base import (
    ProviderRuntimeRef,
    RuntimeSpec,
)

from .providers.docker import (
    DockerRuntimeProvider,
)

from .repository import (
    RuntimeRepository,
)


def now_iso() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat()


class RuntimeService:

    IMAGE = (
        "quay.io/jupyter/"
        "base-notebook:2026-07-28"
    )

    ACTIVE_STATES = {
        RuntimeState.REQUESTED,
        RuntimeState.PROVISIONING,
        RuntimeState.STARTING,
        RuntimeState.READY,
    }

    def __init__(self):

        db_path = (
            Path(__file__)
            .parent
            .parent
            / "data"
            / "runtime.db"
        )

        self.repository = RuntimeRepository(
            db_path
        )

        self.provider = (
            DockerRuntimeProvider()
        )

    def create_runtime(
        self,
        notebook_id: str,
        profile: str,
    ) -> RuntimeRecord:

        existing = (
            self.repository
            .find_active_by_notebook(
                notebook_id
            )
        )

        if existing:
            existing = self.reconcile_runtime(
                existing
            )

            if (
                existing.state
                in self.ACTIVE_STATES
            ):
                return existing

        runtime_id = (
            f"rt_{uuid.uuid4().hex[:12]}"
        )

        timestamp = now_iso()

        runtime = RuntimeRecord(
            runtime_id=runtime_id,
            notebook_id=notebook_id,
            profile=profile,

            state=RuntimeState.REQUESTED,

            provider="docker",
            provider_ref=None,

            jupyter_token=(
                secrets.token_urlsafe(32)
            ),

            created_at=timestamp,
            updated_at=timestamp,
        )

        self.repository.create(runtime)

        runtime.state = (
            RuntimeState.PROVISIONING
        )

        runtime.updated_at = now_iso()

        self.repository.update(runtime)

        try:
            ref = self.provider.create(
                RuntimeSpec(
                    runtime_id=runtime.runtime_id,
                    notebook_id=runtime.notebook_id,
                    image=self.IMAGE,
                    jupyter_token=runtime.jupyter_token,
                )
            )

            runtime.provider_ref = ref.id

            runtime.state = (
                RuntimeState.STARTING
            )

            runtime.updated_at = now_iso()

            self.repository.update(runtime)

            return self.reconcile_runtime(
                runtime
            )

        except Exception:
            runtime.state = (
                RuntimeState.FAILED
            )

            runtime.updated_at = now_iso()

            self.repository.update(runtime)

            raise

    def get_runtime(
        self,
        runtime_id: str,
    ) -> RuntimeRecord | None:

        runtime = self.repository.get(
            runtime_id
        )

        if runtime is None:
            return None

        return self.reconcile_runtime(
            runtime
        )

    def reconcile_runtime(
        self,
        runtime: RuntimeRecord,
    ) -> RuntimeRecord:

        if runtime.state == RuntimeState.STOPPED:
            return runtime

        if runtime.provider_ref is None:
            if runtime.state in self.ACTIVE_STATES:
                runtime.state = (
                    RuntimeState.FAILED
                )

                runtime.updated_at = now_iso()

                self.repository.update(
                    runtime
                )

            return runtime

        status = self.provider.inspect(
            ProviderRuntimeRef(
                id=runtime.provider_ref
            )
        )

        if not status.running:
            new_state = RuntimeState.FAILED

        elif status.ready:
            new_state = RuntimeState.READY

        else:
            new_state = RuntimeState.STARTING

        if runtime.state != new_state:

            runtime.state = new_state
            runtime.updated_at = now_iso()

            self.repository.update(runtime)

        return runtime

    def reconcile_all(self) -> None:

        runtimes = (
            self.repository
            .list_non_stopped()
        )

        for runtime in runtimes:
            self.reconcile_runtime(
                runtime
            )

    def terminate_runtime(
        self,
        runtime_id: str,
    ) -> RuntimeRecord | None:

        runtime = self.repository.get(
            runtime_id
        )

        if runtime is None:
            return None

        if runtime.provider_ref:
            self.provider.terminate(
                ProviderRuntimeRef(
                    id=runtime.provider_ref
                )
            )

        runtime.state = (
            RuntimeState.STOPPED
        )

        runtime.updated_at = now_iso()

        self.repository.update(runtime)

        return runtime

    def get_connection(
        self,
        runtime_id: str,
    ):
        runtime = self.get_runtime(
            runtime_id
        )

        if runtime is None:
            return None, None

        if (
            runtime.state
            != RuntimeState.READY
        ):
            return runtime, None

        if runtime.provider_ref is None:
            return runtime, None

        endpoint = self.provider.get_endpoint(
            ProviderRuntimeRef(
                id=runtime.provider_ref
            )
        )

        return runtime, endpoint