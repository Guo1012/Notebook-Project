import hashlib
import hmac
import os

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from ..auth import COOKIE_NAME, CurrentUser, create_session_token, require_user


router = APIRouter(
    prefix="/api/auth",
    tags=["Development authentication"],
    include_in_schema=False,
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class UserResponse(BaseModel):
    id: str
    username: str
    displayName: str


def user_response(user: CurrentUser) -> UserResponse:
    return UserResponse(
        id=user.user_id, username=user.username, displayName=user.display_name
    )


@router.post("/login", response_model=UserResponse)
def login(request: LoginRequest, response: Response):
    expected_password = os.getenv("LUMEN_DEV_PASSWORD", "lumen")
    if not hmac.compare_digest(request.password, expected_password):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid username or password"},
        )
    user = CurrentUser(
        user_id=f"usr_{hashlib.sha256(request.username.encode()).hexdigest()[:12]}",
        username=request.username,
        display_name=request.username,
    )
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user),
        httponly=True,
        secure=os.getenv("LUMEN_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=28800,
        path="/",
    )
    return user_response(user)


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser = Depends(require_user)):
    return user_response(user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
