import urllib.error
import urllib.request
import docker

from .base import (
    InternalEndpoint,
    ProviderRuntimeRef,
    ProviderRuntimeStatus,
    RuntimeProvider,
    RuntimeSpec,
)


class DockerRuntimeProvider(RuntimeProvider):

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    def create(
        self,
        spec: RuntimeSpec,
    ) -> ProviderRuntimeRef:

        container = self.client.containers.run(
            spec.image,
            detach=True,
            name=f"jupyter-runtime-{spec.runtime_id}",
            environment={
                "JUPYTER_TOKEN": spec.jupyter_token,
            },
            command=["start-notebook.py", f"--ServerApp.token={spec.jupyter_token}", "--ServerApp.allow_origin=*"],
            ports={
                "8888/tcp": ("127.0.0.1", None),
            },
            volumes={f"lumen-user-{spec.user_id}": {"bind": "/home/jovyan/work", "mode": "rw"}},
            labels={
                "qmentor.runtime-id": spec.runtime_id,
                "qmentor.user-id": spec.user_id,
                "qmentor.managed-by": "runtime-service",
            },
        )

        return ProviderRuntimeRef(
            id=container.id,
        )

    def inspect(
        self,
        ref: ProviderRuntimeRef,
    ) -> ProviderRuntimeStatus:

        try:
            container = self.client.containers.get(
                ref.id
            )
        except docker.errors.NotFound:
            return ProviderRuntimeStatus(
                running=False,
                ready=False,
                detail="container not found",
            )

        container.reload()

        running = container.status == "running"

        health = (
            container.attrs
            .get("State", {})
            .get("Health", {})
            .get("Status")
        )

        ready = False
        if running:
            try:
                endpoint = self.get_endpoint(ref)
                with urllib.request.urlopen(f"http://{endpoint.host}:{endpoint.port}/api/status", timeout=1):
                    ready = True
            except urllib.error.HTTPError:
                # An HTTP response (including auth rejection) means Jupyter's
                # Tornado application is accepting requests, not just TCP.
                ready = True
            except Exception:
                ready = False

        return ProviderRuntimeStatus(
            running=running,
            ready=ready,
            detail=("ready" if ready else health or container.status),
        )

    def terminate(
        self,
        ref: ProviderRuntimeRef,
    ) -> None:

        try:
            container = self.client.containers.get(
                ref.id
            )
        except docker.errors.NotFound:
            return

        container.remove(force=True)

    def get_endpoint(
        self,
        ref: ProviderRuntimeRef,
    ) -> InternalEndpoint:

        container = self.client.containers.get(
            ref.id
        )

        container.reload()

        bindings = (
            container
            .attrs["NetworkSettings"]
            ["Ports"]["8888/tcp"]
        )

        if not bindings:
            raise RuntimeError(
                "Jupyter port is not published"
            )

        return InternalEndpoint(
            host="127.0.0.1",
            port=int(bindings[0]["HostPort"]),
        )
