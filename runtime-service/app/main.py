from contextlib import asynccontextmanager

from fastapi import (
    FastAPI,
    HTTPException,
)

from .models import (
    CreateRuntimeRequest,
    RuntimeConnectionResponse,
    RuntimeResponse,
    RuntimeState,
)

from .service import RuntimeService


runtime_service = RuntimeService()


@asynccontextmanager
async def lifespan(app: FastAPI):

    runtime_service.reconcile_all()

    yield


app = FastAPI(
    lifespan=lifespan
)


def to_response(
    runtime,
) -> RuntimeResponse:

    return RuntimeResponse(
        runtimeId=runtime.runtime_id,
        notebookId=runtime.notebook_id,
        profile=runtime.profile,
        state=runtime.state,
        provider=runtime.provider,
        providerRef=runtime.provider_ref,
    )


@app.post(
    "/v1/runtimes",
    response_model=RuntimeResponse,
)
def create_runtime(
    req: CreateRuntimeRequest,
):

    runtime = (
        runtime_service.create_runtime(
            notebook_id=req.notebookId,
            profile=req.profile,
        )
    )

    return to_response(runtime)


@app.get(
    "/v1/runtimes/{runtime_id}",
    response_model=RuntimeResponse,
)
def get_runtime(
    runtime_id: str,
):

    runtime = (
        runtime_service.get_runtime(
            runtime_id
        )
    )

    if runtime is None:
        raise HTTPException(
            status_code=404,
            detail="Runtime not found",
        )

    return to_response(runtime)


@app.delete(
    "/v1/runtimes/{runtime_id}",
    response_model=RuntimeResponse,
)
def delete_runtime(
    runtime_id: str,
):

    runtime = (
        runtime_service
        .terminate_runtime(
            runtime_id
        )
    )

    if runtime is None:
        raise HTTPException(
            status_code=404,
            detail="Runtime not found",
        )

    return to_response(runtime)

@app.get(
    "/internal/runtimes/{runtime_id}/connection",
    response_model=RuntimeConnectionResponse,
)
def get_runtime_connection(
    runtime_id: str,
):
    runtime, endpoint = (
        runtime_service.get_connection(
            runtime_id
        )
    )

    if runtime is None:
        raise HTTPException(
            status_code=404,
            detail="Runtime not found",
        )

    if (
        runtime.state
        != RuntimeState.READY
        or endpoint is None
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Runtime is not ready",
                "state": runtime.state.value,
            },
        )

    return RuntimeConnectionResponse(
        runtimeId=runtime.runtime_id,
        state=runtime.state,
        host=endpoint.host,
        port=endpoint.port,
        token=runtime.jupyter_token,
    )