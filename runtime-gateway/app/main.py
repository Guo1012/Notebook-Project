from dataclasses import dataclass
from typing import Any
import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import aiohttp
import asyncio

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import Response

from .logging_config import configure_logging


logger = configure_logging("runtime-gateway")
app = FastAPI(title="Lumen Runtime Gateway", version="1.0.0")

RUNTIME_SERVICE_URL = os.getenv("LUMEN_RUNTIME_SERVICE_URL", "http://127.0.0.1:8100")
INTERNAL_SECRET = os.getenv("LUMEN_INTERNAL_SECRET", "development-internal-change-me")
SESSION_SECRET = os.getenv("LUMEN_SESSION_SECRET", "development-only-change-me").encode()
kernel_by_notebook: dict[tuple[str, str, str], dict[str, Any]] = {}
kernel_lock = asyncio.Lock()


@dataclass
class KernelCreationGuard:
    lock: asyncio.Lock
    references: int = 0


kernel_creation_guards: dict[tuple[str, str, str], KernelCreationGuard] = {}


async def acquire_kernel_creation_guard(key: tuple[str, str, str]) -> KernelCreationGuard:
    async with kernel_lock:
        guard = kernel_creation_guards.get(key)
        if guard is None:
            guard = KernelCreationGuard(asyncio.Lock())
            kernel_creation_guards[key] = guard
        guard.references += 1
    try:
        await guard.lock.acquire()
    except BaseException:
        async with kernel_lock:
            guard.references -= 1
            if guard.references == 0:
                kernel_creation_guards.pop(key, None)
        raise
    return guard


async def release_kernel_creation_guard(
    key: tuple[str, str, str], guard: KernelCreationGuard
) -> None:
    guard.lock.release()
    async with kernel_lock:
        guard.references -= 1
        if guard.references == 0 and kernel_creation_guards.get(key) is guard:
            kernel_creation_guards.pop(key, None)


HOP_BY_HOP_REQUEST_HEADERS = {
    "host", "connection", "upgrade", "proxy-connection", "keep-alive",
    "transfer-encoding", "te", "trailer", "proxy-authorization",
    "proxy-authenticate",
}

HOP_BY_HOP_RESPONSE_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade", "content-length",
    "content-encoding",
}


@app.middleware("http")
async def request_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    started = time.perf_counter()
    logger.info(
        "event=http_request_started request_id=%s method=%s path=%s",
        request_id, request.method, request.url.path,
    )
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "event=http_request_failed request_id=%s method=%s path=%s",
            request_id, request.method, request.url.path,
        )
        raise
    response.headers["X-Request-Id"] = request_id
    logger.info(
        "event=http_request_finished request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
        request_id, request.method, request.url.path, response.status_code,
        (time.perf_counter() - started) * 1000,
    )
    return response


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


async def get_runtime_connection(
    runtime_id: str, user_id: str, request_id: str,
) -> dict[str, Any]:
    url = f"{RUNTIME_SERVICE_URL}/internal/runtimes/{runtime_id}/connection"
    headers = {
        "X-Lumen-User-Id": user_id,
        "X-Lumen-Internal-Secret": INTERNAL_SECRET,
        "X-Request-Id": request_id,
    }
    logger.info(
        "event=runtime_connection_requested request_id=%s user_id=%s runtime_id=%s",
        request_id, user_id, runtime_id,
    )
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            try:
                data = await response.json()
            except (aiohttp.ContentTypeError, json.JSONDecodeError):
                data = {"detail": await response.text()}
            if response.status == 404:
                raise HTTPException(status_code=404, detail="Runtime not found")
            if response.status == 409:
                raise HTTPException(status_code=409, detail=data)
            if response.status != 200:
                raise HTTPException(status_code=502, detail="Runtime Service connection lookup failed")
            return data


def authenticated_user_id(cookies) -> str:
    try:
        token = cookies.get("lumen_session")
        if not token:
            raise ValueError("missing")
        body, signature = token.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return str(payload["sub"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Login required")


def build_upstream_headers(request: Request, token: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        lower = key.lower()
        if lower in HOP_BY_HOP_REQUEST_HEADERS:
            continue
        if lower in {"authorization", "accept-encoding", "x-lumen-notebook-id"}:
            continue
        headers[key] = value
    headers["Authorization"] = f"token {token}"
    return headers


def build_response_headers(headers) -> dict[str, str]:
    return {key: value for key, value in headers.items() if key.lower() not in HOP_BY_HOP_RESPONSE_HEADERS}


@app.api_route(
    "/runtime-proxy/{runtime_id}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy_http(runtime_id: str, path: str, request: Request):
    request_id = request.state.request_id
    user_id = authenticated_user_id(request.cookies)
    connection = await get_runtime_connection(runtime_id, user_id, request_id)
    upstream_url = f"http://{connection['host']}:{connection['port']}/{path}"
    if request.url.query:
        upstream_url += f"?{request.url.query}"
    headers = build_upstream_headers(request, connection["token"])
    body = await request.body()

    notebook_id = request.headers.get("x-lumen-notebook-id")
    mapping_key = (user_id, runtime_id, notebook_id) if notebook_id else None
    guard: KernelCreationGuard | None = None
    if request.method == "POST" and path == "api/kernels" and mapping_key:
        guard = await acquire_kernel_creation_guard(mapping_key)
        existing = kernel_by_notebook.get(mapping_key)
        if existing:
            logger.info(
                "event=kernel_reused request_id=%s user_id=%s runtime_id=%s notebook_id=%s kernel_id=%s",
                request_id, user_id, runtime_id, notebook_id, existing.get("id"),
            )
            await release_kernel_creation_guard(mapping_key, guard)
            return Response(content=json.dumps(existing), status_code=200, media_type="application/json")

    try:
        async with aiohttp.ClientSession(auto_decompress=True) as session:
            async with session.request(
                method=request.method, url=upstream_url, headers=headers,
                data=body, allow_redirects=False,
            ) as upstream:
                response_body = await upstream.read()
                response_headers = build_response_headers(upstream.headers)
                if request.method == "POST" and path == "api/kernels" and mapping_key and upstream.status < 300:
                    try:
                        kernel = json.loads(response_body)
                        kernel_by_notebook[mapping_key] = kernel
                        logger.info(
                            "event=kernel_created request_id=%s user_id=%s runtime_id=%s notebook_id=%s kernel_id=%s",
                            request_id, user_id, runtime_id, notebook_id, kernel.get("id"),
                        )
                    except (TypeError, ValueError):
                        logger.warning(
                            "event=kernel_response_invalid request_id=%s runtime_id=%s notebook_id=%s",
                            request_id, runtime_id, notebook_id,
                        )
                if request.method == "DELETE" and path.startswith("api/kernels/"):
                    deleted_id = path.split("/")[2]
                    async with kernel_lock:
                        for key, value in list(kernel_by_notebook.items()):
                            if key[:2] == (user_id, runtime_id) and value.get("id") == deleted_id:
                                kernel_by_notebook.pop(key, None)
                    logger.info(
                        "event=kernel_deleted request_id=%s user_id=%s runtime_id=%s kernel_id=%s",
                        request_id, user_id, runtime_id, deleted_id,
                    )
                logger.info(
                    "event=jupyter_http_proxied request_id=%s user_id=%s runtime_id=%s method=%s path=%s status=%s",
                    request_id, user_id, runtime_id, request.method, path, upstream.status,
                )
                return Response(content=response_body, status_code=upstream.status, headers=response_headers)
    finally:
        if guard is not None and mapping_key is not None:
            await release_kernel_creation_guard(mapping_key, guard)


@app.websocket("/runtime-proxy/{runtime_id}/{path:path}")
async def proxy_websocket(websocket: WebSocket, runtime_id: str, path: str):
    request_id = websocket.headers.get("x-request-id") or websocket.query_params.get("trace_id") or uuid.uuid4().hex[:12]
    try:
        user_id = authenticated_user_id(websocket.cookies)
        connection = await get_runtime_connection(runtime_id, user_id, request_id)
    except HTTPException as error:
        close_code = 4401 if error.status_code == 401 else 4404 if error.status_code == 404 else 4409
        logger.warning(
            "event=websocket_denied request_id=%s runtime_id=%s status=%s",
            request_id, runtime_id, error.status_code,
        )
        await websocket.close(code=close_code)
        return

    upstream_url = f"ws://{connection['host']}:{connection['port']}/{path}"
    if websocket.url.query:
        upstream_url += f"?{websocket.url.query}"
    protocol_header = websocket.headers.get("sec-websocket-protocol")
    protocols = [item.strip() for item in protocol_header.split(",") if item.strip()] if protocol_header else []
    headers = {"Authorization": f"token {connection['token']}"}
    logger.info(
        "event=websocket_connecting request_id=%s user_id=%s runtime_id=%s path=%s",
        request_id, user_id, runtime_id, path,
    )
    async with aiohttp.ClientSession() as session:
        try:
            upstream = await session.ws_connect(upstream_url, headers=headers, protocols=protocols)
        except Exception:
            logger.exception(
                "event=websocket_upstream_failed request_id=%s user_id=%s runtime_id=%s path=%s",
                request_id, user_id, runtime_id, path,
            )
            await websocket.close(code=1011)
            return

        await websocket.accept(subprotocol=upstream.protocol)
        logger.info(
            "event=websocket_connected request_id=%s user_id=%s runtime_id=%s protocol=%s",
            request_id, user_id, runtime_id, upstream.protocol,
        )

        async def client_to_upstream():
            try:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        break
                    if message.get("text") is not None:
                        await upstream.send_str(message["text"])
                    elif message.get("bytes") is not None:
                        await upstream.send_bytes(message["bytes"])
            except Exception:
                logger.exception("event=websocket_client_to_upstream_failed request_id=%s", request_id)

        async def upstream_to_client():
            try:
                async for message in upstream:
                    if message.type == aiohttp.WSMsgType.TEXT:
                        await websocket.send_text(message.data)
                    elif message.type == aiohttp.WSMsgType.BINARY:
                        await websocket.send_bytes(message.data)
                    elif message.type in {aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR}:
                        break
            except Exception:
                logger.exception("event=websocket_upstream_to_client_failed request_id=%s", request_id)

        client_task = asyncio.create_task(client_to_upstream())
        upstream_task = asyncio.create_task(upstream_to_client())
        _done, pending = await asyncio.wait({client_task, upstream_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        await upstream.close()
        logger.info(
            "event=websocket_closed request_id=%s user_id=%s runtime_id=%s",
            request_id, user_id, runtime_id,
        )
