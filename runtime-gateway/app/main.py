from typing import Any
import base64
import hashlib
import hmac
import json
import logging
import os
import time

import aiohttp
import asyncio

from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
)

from fastapi.responses import Response

logger = logging.getLogger("runtime-gateway")
app = FastAPI()


RUNTIME_SERVICE_URL = os.getenv("LUMEN_RUNTIME_SERVICE_URL", "http://127.0.0.1:8100")
INTERNAL_SECRET = os.getenv("LUMEN_INTERNAL_SECRET", "development-internal-change-me")
SESSION_SECRET = os.getenv("LUMEN_SESSION_SECRET", "development-only-change-me").encode()
kernel_by_notebook: dict[tuple[str, str, str], dict[str, Any]] = {}
kernel_lock = asyncio.Lock()


HOP_BY_HOP_REQUEST_HEADERS = {
    "host",
    "connection",
    "upgrade",
    "proxy-connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "proxy-authorization",
    "proxy-authenticate",
}


HOP_BY_HOP_RESPONSE_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",

    # Response 对 body 重新生成 Content-Length。
    "content-length",

    # POC 阶段避免 aiohttp 自动解压后
    # 仍把原 Content-Encoding 返回给客户端。
    "content-encoding",
}


async def get_runtime_connection(
    runtime_id: str,
    user_id: str,
) -> dict[str, Any]:

    url = (
        f"{RUNTIME_SERVICE_URL}"
        f"/internal/runtimes/"
        f"{runtime_id}/connection"
    )

    async with aiohttp.ClientSession() as session:

        async with session.get(url, headers={"X-Lumen-User-Id": user_id, "X-Lumen-Internal-Secret": INTERNAL_SECRET}) as response:

            data = await response.json()

            if response.status == 404:
                raise HTTPException(
                    status_code=404,
                    detail="Runtime not found",
                )

            if response.status == 409:
                raise HTTPException(
                    status_code=409,
                    detail=data,
                )

            if response.status != 200:
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Runtime Service "
                        "connection lookup failed"
                    ),
                )

            return data

def authenticated_user_id(cookies) -> str:
    try:
        token = cookies.get("lumen_session")
        if not token: raise ValueError("missing")
        body, signature = token.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected): raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload["exp"]) < int(time.time()): raise ValueError("expired")
        return str(payload["sub"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Login required")


def build_upstream_headers(
    request: Request,
    token: str,
) -> dict[str, str]:

    headers: dict[str, str] = {}

    for key, value in request.headers.items():

        lower = key.lower()

        if (
            lower
            in HOP_BY_HOP_REQUEST_HEADERS
        ):
            continue

        # Gateway 控制 Jupyter credential。
        if lower == "authorization":
            continue

        # 避免压缩响应处理复杂化。
        if lower == "accept-encoding":
            continue
        if lower == "x-lumen-notebook-id":
            continue

        headers[key] = value

    headers["Authorization"] = (
        f"token {token}"
    )

    return headers


def build_response_headers(
    headers,
) -> dict[str, str]:

    result: dict[str, str] = {}

    for key, value in headers.items():

        if (
            key.lower()
            in HOP_BY_HOP_RESPONSE_HEADERS
        ):
            continue

        result[key] = value

    return result


@app.api_route(
    "/runtime-proxy/{runtime_id}/{path:path}",
    methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
        "HEAD",
    ],
)
async def proxy_http(
    runtime_id: str,
    path: str,
    request: Request,
):

    user_id = authenticated_user_id(request.cookies)
    connection = await get_runtime_connection(runtime_id, user_id)

    host = connection["host"]
    port = connection["port"]
    token = connection["token"]

    upstream_url = (
        f"http://{host}:{port}/{path}"
    )

    query = request.url.query

    if query:
        upstream_url += f"?{query}"

    headers = build_upstream_headers(
        request,
        token,
    )

    body = await request.body()

    notebook_id = request.headers.get("x-lumen-notebook-id")
    mapping_key = (user_id, runtime_id, notebook_id) if notebook_id else None
    if request.method == "POST" and path == "api/kernels" and mapping_key:
        async with kernel_lock:
            existing = kernel_by_notebook.get(mapping_key)
            if existing:
                return Response(content=json.dumps(existing), status_code=200, media_type="application/json")

    async with aiohttp.ClientSession(
        auto_decompress=True,
    ) as session:

        async with session.request(
            method=request.method,
            url=upstream_url,
            headers=headers,
            data=body,
            allow_redirects=False,
        ) as upstream:

            response_body = (
                await upstream.read()
            )

            response_headers = (
                build_response_headers(
                    upstream.headers
                )
            )

            if request.method == "POST" and path == "api/kernels" and mapping_key and upstream.status < 300:
                try:
                    kernel_by_notebook[mapping_key] = json.loads(response_body)
                except (TypeError, ValueError):
                    pass
            if request.method == "DELETE" and path.startswith("api/kernels/"):
                deleted_id = path.split("/")[2]
                for key, value in list(kernel_by_notebook.items()):
                    if key[:2] == (user_id, runtime_id) and value.get("id") == deleted_id:
                        kernel_by_notebook.pop(key, None)

            return Response(
                content=response_body,
                status_code=upstream.status,
                headers=response_headers,
            )

@app.websocket(
    "/runtime-proxy/{runtime_id}/{path:path}"
)
async def proxy_websocket(
    websocket: WebSocket,
    runtime_id: str,
    path: str,
):
    # 1. 找到 Runtime 的真实连接信息
    try:
        user_id = authenticated_user_id(websocket.cookies)
        connection = await get_runtime_connection(runtime_id, user_id)
    except HTTPException as error:
        if error.status_code == 404:
            await websocket.close(code=4404)
        else:
            await websocket.close(code=4409)

        return

    host = connection["host"]
    port = connection["port"]
    token = connection["token"]

    # 2. 构造真实 Jupyter WebSocket URL
    upstream_url = (
        f"ws://{host}:{port}/{path}"
    )

    query = websocket.url.query

    if query:
        upstream_url += f"?{query}"

    # Jupyter 新版 kernel websocket
    # 可能协商 subprotocol。
    protocol_header = websocket.headers.get(
        "sec-websocket-protocol"
    )

    protocols: list[str] = []

    if protocol_header:
        protocols = [
            item.strip()
            for item
            in protocol_header.split(",")
            if item.strip()
        ]

    # 3. Gateway → Jupyter Server
    #
    # 浏览器不知道 Jupyter Token。
    # Gateway 在这里注入 credential。
    headers = {
        "Authorization": (
            f"token {token}"
        )
    }

    async with aiohttp.ClientSession() as session:

        try:
            upstream = (
                await session.ws_connect(
                    upstream_url,
                    headers=headers,
                    protocols=protocols,
                )
            )
            logger.info(
                "WS upstream connected url=%s protocol=%s",
                upstream_url,
                upstream.protocol,
            )
        except Exception:
            logger.exception(
                "Failed to connect upstream WebSocket: %s",
                upstream_url,
            )
            await websocket.close(code=1011)
            return

        # 上游 Jupyter 选择了哪个 protocol，
        # Gateway 就用同一个 protocol
        # 接受浏览器连接。
        await websocket.accept(
            subprotocol=upstream.protocol
        )
        logger.info(
            "WS downstream accepted protocol=%s",
            upstream.protocol,
        )

        async def client_to_upstream():
            try:
                while True:
                    message = (
                        await websocket.receive()
                    )

                    message_type = (
                        message["type"]
                    )

                    if (
                        message_type
                        == "websocket.disconnect"
                    ):
                        break

                    text = message.get("text")
                    data = message.get("bytes")

                    if text is not None:
                        await upstream.send_str(
                            text
                        )

                    elif data is not None:
                        await upstream.send_bytes(
                            data
                        )

            except Exception:
                logger.exception(
                    "client_to_upstream failed"
                )

        async def upstream_to_client():
            try:
                async for message in upstream:

                    if (
                        message.type
                        == aiohttp.WSMsgType.TEXT
                    ):
                        await websocket.send_text(
                            message.data
                        )

                    elif (
                        message.type
                        == aiohttp.WSMsgType.BINARY
                    ):
                        await websocket.send_bytes(
                            message.data
                        )

                    elif message.type in {
                        aiohttp.WSMsgType.CLOSE,
                        aiohttp.WSMsgType.CLOSED,
                        aiohttp.WSMsgType.ERROR,
                    }:
                        break

            except Exception:
                logger.exception(
                    "upstream_to_client failed"
        )

        client_task = asyncio.create_task(
            client_to_upstream()
        )

        upstream_task = asyncio.create_task(
            upstream_to_client()
        )

        done, pending = await asyncio.wait(
            {
                client_task,
                upstream_task,
            },
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()

        await asyncio.gather(
            *pending,
            return_exceptions=True,
        )

        await upstream.close()
