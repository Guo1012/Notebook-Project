import os
from fastapi import Depends, FastAPI, Header, HTTPException
from .auth import CurrentUser, require_user
from .models import EnsureRuntimeRequest, RuntimeResponse
from .service import RuntimeService
from .providers.docker import DockerRuntimeProvider

app = FastAPI(title="Lumen Runtime API", version="1.0.0")
runtime_service = RuntimeService(provider=DockerRuntimeProvider())

def response(runtime) -> RuntimeResponse:
    return RuntimeResponse(runtimeId=runtime.runtime_id, state=runtime.state, desiredState=runtime.desired_state, profile=runtime.profile, provider=runtime.provider, providerRef=runtime.provider_ref, createdAt=runtime.created_at, updatedAt=runtime.updated_at, lastActivityAt=runtime.last_activity_at, failureReason=runtime.failure_reason)

@app.get("/healthz")
def healthz(): return {"status": "ok"}

@app.put("/api/runtime", response_model=RuntimeResponse)
def ensure_runtime(req: EnsureRuntimeRequest, user: CurrentUser = Depends(require_user)):
    return response(runtime_service.ensure_user_runtime(user.user_id, req.profile))

@app.get("/api/runtime", response_model=RuntimeResponse)
def get_runtime(user: CurrentUser = Depends(require_user)):
    runtime = runtime_service.get_user_runtime(user.user_id)
    if runtime is None: raise HTTPException(status_code=404, detail={"code": "RUNTIME_NOT_FOUND", "message": "No active runtime"})
    return response(runtime)

@app.delete("/api/runtime", status_code=202, response_model=RuntimeResponse)
def stop_runtime(user: CurrentUser = Depends(require_user)):
    runtime = runtime_service.request_stop(user.user_id)
    if runtime is None: raise HTTPException(status_code=404, detail={"code": "RUNTIME_NOT_FOUND", "message": "No active runtime"})
    return response(runtime)

@app.get("/internal/runtimes/{runtime_id}/connection")
def runtime_connection(runtime_id: str, x_lumen_user_id: str = Header(), x_lumen_internal_secret: str = Header()):
    if not secrets_equal(x_lumen_internal_secret, os.getenv("LUMEN_INTERNAL_SECRET", "development-internal-change-me")):
        raise HTTPException(status_code=403, detail="Forbidden")
    result = runtime_service.get_connection(runtime_id, x_lumen_user_id)
    if result is None: raise HTTPException(status_code=404, detail="Runtime not found")
    runtime, connection = result
    if connection is None: raise HTTPException(status_code=409, detail={"state": runtime.state.value})
    return connection

def secrets_equal(left: str, right: str) -> bool:
    import hmac
    return hmac.compare_digest(left, right)
