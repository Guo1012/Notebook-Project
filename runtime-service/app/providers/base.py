from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ProviderRuntimeRef:
    id: str


@dataclass
class ProviderRuntimeStatus:
    running: bool
    ready: bool
    detail: str | None = None


@dataclass
class InternalEndpoint:
    host: str
    port: int


@dataclass
class RuntimeSpec:
    runtime_id: str
    notebook_id: str
    image: str
    jupyter_token: str


class RuntimeProvider(ABC):

    @abstractmethod
    def create(
        self,
        spec: RuntimeSpec,
    ) -> ProviderRuntimeRef:
        pass

    @abstractmethod
    def inspect(
        self,
        ref: ProviderRuntimeRef,
    ) -> ProviderRuntimeStatus:
        pass

    @abstractmethod
    def terminate(
        self,
        ref: ProviderRuntimeRef,
    ) -> None:
        pass

    @abstractmethod
    def get_endpoint(
        self,
        ref: ProviderRuntimeRef,
    ) -> InternalEndpoint:
        pass