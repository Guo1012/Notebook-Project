import os
import time
import uuid
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from .auth import CurrentUser, require_user
from .logging_config import configure_logging
from .models import EnsureRuntimeRequest, RuntimeResponse
from .service import RuntimeService
from .providers.docker import DockerRuntimeProvider

app = FastAPI(title="Lumen Runtime API", version="1.0.0")
logger = configure_logging("runtime-service")
runtime_service = RuntimeService(provider=DockerRuntimeProvider())


@app.middleware("http")
async def request_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.perf_counter()
    logger.info("event=http_request_started request_id=%s method=%s path=%s", request_id, request.method, request.url.path)
    try:
        response_value = await call_next(request)
    except Exception:
        logger.exception("event=http_request_failed request_id=%s method=%s path=%s", request_id, request.method, request.url.path)
        raise
    response_value.headers["X-Request-Id"] = request_id
    logger.info(
        "event=http_request_finished request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
        request_id,
        request.method,
        request.url.path,
        response_value.status_code,
        (time.perf_counter() - started) * 1000,
    )
    return response_value

def response(runtime) -> RuntimeResponse:
    return RuntimeResponse(runtimeId=runtime.runtime_id, state=runtime.state, desiredState=runtime.desired_state, profile=runtime.profile, provider=runtime.provider, providerRef=runtime.provider_ref, createdAt=runtime.created_at, updatedAt=runtime.updated_at, lastActivityAt=runtime.last_activity_at, failureReason=runtime.failure_reason)

@app.get("/healthz")
def healthz(): return {"status": "ok"}

@app.put("/api/runtime", response_model=RuntimeResponse)
def ensure_runtime(req: EnsureRuntimeRequest, user: CurrentUser = Depends(require_user)):
    runtime = runtime_service.ensure_user_runtime(user.user_id, req.profile)
    logger.info("event=runtime_ensured user_id=%s runtime_id=%s state=%s profile=%s", user.user_id, runtime.runtime_id, runtime.state.value, runtime.profile)
    return response(runtime)

@app.get("/api/runtime", response_model=RuntimeResponse)
def get_runtime(user: CurrentUser = Depends(require_user)):
    runtime = runtime_service.get_user_runtime(user.user_id)
    if runtime is None:
        logger.info("event=runtime_lookup user_id=%s result=not_found", user.user_id)
        raise HTTPException(status_code=404, detail={"code": "RUNTIME_NOT_FOUND", "message": "No active runtime"})
    logger.info("event=runtime_lookup user_id=%s runtime_id=%s state=%s", user.user_id, runtime.runtime_id, runtime.state.value)
    return response(runtime)

@app.delete("/api/runtime", status_code=202, response_model=RuntimeResponse)
def stop_runtime(user: CurrentUser = Depends(require_user)):
    runtime = runtime_service.request_stop(user.user_id)
    if runtime is None:
        logger.info("event=runtime_stop_requested user_id=%s result=not_found", user.user_id)
        raise HTTPException(status_code=404, detail={"code": "RUNTIME_NOT_FOUND", "message": "No active runtime"})
    logger.info("event=runtime_stop_requested user_id=%s runtime_id=%s state=%s", user.user_id, runtime.runtime_id, runtime.state.value)
    return response(runtime)

@app.get("/internal/runtimes/{runtime_id}/connection")
def runtime_connection(runtime_id: str, x_lumen_user_id: str = Header(), x_lumen_internal_secret: str = Header()):
    if not secrets_equal(x_lumen_internal_secret, os.getenv("LUMEN_INTERNAL_SECRET", "development-internal-change-me")):
        logger.warning("event=runtime_connection_denied runtime_id=%s user_id=%s", runtime_id, x_lumen_user_id)
        raise HTTPException(status_code=403, detail="Forbidden")
    result = runtime_service.get_connection(runtime_id, x_lumen_user_id)
    if result is None:
        logger.info("event=runtime_connection_lookup runtime_id=%s user_id=%s result=not_found", runtime_id, x_lumen_user_id)
        raise HTTPException(status_code=404, detail="Runtime not found")
    runtime, connection = result
    if connection is None:
        logger.info("event=runtime_connection_lookup runtime_id=%s user_id=%s state=%s result=not_ready", runtime_id, x_lumen_user_id, runtime.state.value)
        raise HTTPException(status_code=409, detail={"state": runtime.state.value})
    logger.info("event=runtime_connection_lookup runtime_id=%s user_id=%s state=%s result=ready", runtime_id, x_lumen_user_id, runtime.state.value)
    return connection

def secrets_equal(left: str, right: str) -> bool:
    import hmac
    return hmac.compare_digest(left, right)
