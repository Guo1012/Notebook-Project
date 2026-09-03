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
        self.client = docker.from_env()

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
            ports={
                "8888/tcp": ("127.0.0.1", None),
            },
            labels={
                "qmentor.runtime-id": spec.runtime_id,
                "qmentor.notebook-id": spec.notebook_id,
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

        ready = running and health == "healthy"

        return ProviderRuntimeStatus(
            running=running,
            ready=ready,
            detail=health or container.status,
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