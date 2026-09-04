from app.models import DesiredState, RuntimeState
from app.repository import RuntimeRepository
from app.service import InvalidRuntimeTransition, RuntimeService
from app.providers.base import InternalEndpoint, ProviderRuntimeRef, ProviderRuntimeStatus, RuntimeProvider


class FakeProvider(RuntimeProvider):
    def __init__(self): self.created = []; self.terminated = []
    def create(self, spec): self.created.append(spec); return ProviderRuntimeRef(f"container-{spec.user_id}")
    def inspect(self, ref): return ProviderRuntimeStatus(True, True, "ready")
    def terminate(self, ref): self.terminated.append(ref.id)
    def get_endpoint(self, ref): return InternalEndpoint("127.0.0.1", 18888)


def test_one_active_runtime_per_user(tmp_path):
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"))
    first = service.ensure_user_runtime("usr_a", "python-small")
    second = service.ensure_user_runtime("usr_a", "python-medium")
    other = service.ensure_user_runtime("usr_b", "python-small")
    assert first.runtime_id == second.runtime_id
    assert other.runtime_id != first.runtime_id


def test_runtime_state_machine_and_stop_request(tmp_path):
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"))
    runtime = service.ensure_user_runtime("usr_a", "python-small")
    service.transition(runtime, RuntimeState.PROVISIONING, provider="docker", provider_ref="container-1")
    service.transition(runtime, RuntimeState.STARTING)
    service.transition(runtime, RuntimeState.READY)
    stopped = service.request_stop("usr_a")
    assert stopped is not None
    assert stopped.state == RuntimeState.STOPPING
    assert stopped.desired_state == DesiredState.STOPPED


def test_invalid_transition_is_rejected(tmp_path):
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"))
    runtime = service.ensure_user_runtime("usr_a", "python-small")
    try:
        service.transition(runtime, RuntimeState.READY)
    except InvalidRuntimeTransition:
        pass
    else:
        raise AssertionError("invalid transition was accepted")


def test_provider_creates_one_server_per_user_and_reuses_it(tmp_path):
    import time
    provider = FakeProvider()
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"), provider)
    first = service.ensure_user_runtime("usr_a", "python-small")
    second = service.ensure_user_runtime("usr_a", "python-small")
    deadline = time.monotonic() + 2
    while service.get_user_runtime("usr_a").state != RuntimeState.READY and time.monotonic() < deadline:
        time.sleep(0.01)
    ready = service.get_user_runtime("usr_a")
    assert first.runtime_id == second.runtime_id == ready.runtime_id
    assert len(provider.created) == 1
    runtime, connection = service.get_connection(ready.runtime_id, "usr_a")
    assert runtime.state == RuntimeState.READY
    assert connection["port"] == 18888
    assert service.get_connection(ready.runtime_id, "usr_b") is None
