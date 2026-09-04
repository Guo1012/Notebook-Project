import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass

from fastapi import Cookie, HTTPException, status

COOKIE_NAME = "lumen_session"
SESSION_TTL_SECONDS = int(os.getenv("LUMEN_SESSION_TTL_SECONDS", "28800"))
SESSION_SECRET = os.getenv("LUMEN_SESSION_SECRET", "development-only-change-me").encode()

@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    username: str
    display_name: str

def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"

def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_text, expected_text = encoded.split("$", 2)
        if algorithm != "pbkdf2_sha256": return False
        salt = base64.urlsafe_b64decode(salt_text)
        expected = base64.urlsafe_b64decode(expected_text)
    except (ValueError, TypeError): return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return hmac.compare_digest(actual, expected)

def create_session_token(user: CurrentUser) -> str:
    payload = {"sub": user.user_id, "username": user.username, "displayName": user.display_name, "exp": int(time.time()) + SESSION_TTL_SECONDS}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(SESSION_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"

def parse_session_token(token: str) -> CurrentUser:
    try:
        body, signature = token.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected): raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload["exp"]) < int(time.time()): raise ValueError("expired")
        return CurrentUser(str(payload["sub"]), str(payload["username"]), str(payload["displayName"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHENTICATED", "message": "Login required"})

def require_user(lumen_session: str | None = Cookie(default=None)) -> CurrentUser:
    if not lumen_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHENTICATED", "message": "Login required"})
    return parse_session_token(lumen_session)
