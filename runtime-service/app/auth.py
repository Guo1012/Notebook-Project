import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from fastapi import Cookie, HTTPException, status

COOKIE_NAME = "lumen_session"
SESSION_SECRET = os.getenv("LUMEN_SESSION_SECRET", "development-only-change-me").encode()

@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    username: str
    display_name: str

def require_user(lumen_session: str | None = Cookie(default=None)) -> CurrentUser:
    try:
        if not lumen_session: raise ValueError("missing")
        body, signature = lumen_session.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET, body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected): raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(payload["exp"]) < int(time.time()): raise ValueError("expired")
        return CurrentUser(str(payload["sub"]), str(payload["username"]), str(payload["displayName"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHENTICATED", "message": "Login required"})
