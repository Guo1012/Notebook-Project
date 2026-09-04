from app.models import DesiredState, RuntimeState
from app.repository import RuntimeRepository
from app.service import InvalidRuntimeTransition, RuntimeService
from app.providers.base import InternalEndpoint, ProviderRuntimeRef, ProviderRuntimeStatus, RuntimeProvider
import threading
from concurrent.futures import ThreadPoolExecutor


class FakeProvider(RuntimeProvider):
    def __init__(self): self.created = []; self.terminated = []
    def create(self, spec): self.created.append(spec); return ProviderRuntimeRef(f"container-{spec.user_id}")
    def inspect(self, ref): return ProviderRuntimeStatus(True, True, "ready")
    def terminate(self, ref): self.terminated.append(ref.id)
    def get_endpoint(self, ref): return InternalEndpoint("127.0.0.1", 18888)


class BlockingProvider(FakeProvider):
    def __init__(self):
        super().__init__()
        self.create_started = threading.Event()
        self.allow_create = threading.Event()

    def create(self, spec):
        self.create_started.set()
        assert self.allow_create.wait(2), "provider create was not released"
        return super().create(spec)


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


def test_provider_is_not_called_until_runtime_is_ensured(tmp_path):
    provider = FakeProvider()
    RuntimeService(RuntimeRepository(tmp_path / "runtime.db"), provider)
    assert provider.created == []


def test_stop_during_provider_create_cleans_up_container(tmp_path):
    import time

    provider = BlockingProvider()
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"), provider)
    runtime = service.ensure_user_runtime("usr_a", "python-small")
    assert provider.create_started.wait(1)
    stopped = service.request_stop("usr_a")
    assert stopped is not None
    provider.allow_create.set()
    deadline = time.monotonic() + 2
    while provider.terminated == [] and time.monotonic() < deadline:
        time.sleep(0.01)
    current = service.repository.get(runtime.runtime_id)
    assert current is not None
    assert current.state == RuntimeState.STOPPED
    assert provider.terminated == ["container-usr_a"]


def test_thirty_users_can_ensure_runtimes_concurrently(tmp_path):
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"))
    with ThreadPoolExecutor(max_workers=30) as executor:
        runtimes = list(
            executor.map(
                lambda index: service.ensure_user_runtime(f"usr_{index}", "python-small"),
                range(30),
            )
        )
    assert len({runtime.runtime_id for runtime in runtimes}) == 30


def test_concurrent_requests_for_one_user_create_one_runtime(tmp_path):
    service = RuntimeService(RuntimeRepository(tmp_path / "runtime.db"))
    with ThreadPoolExecutor(max_workers=16) as executor:
        runtimes = list(
            executor.map(
                lambda _: service.ensure_user_runtime("usr_same", "python-small"),
                range(32),
            )
        )
    assert len({runtime.runtime_id for runtime in runtimes}) == 1
