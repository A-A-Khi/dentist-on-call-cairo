from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth.dependencies import (
    CurrentUser,
    DatabaseSession,
    require_csrf,
)
from app.auth.schemas import (
    AuthenticatedUserResponse,
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshRequest,
)
from app.auth.security import issue_access_token, new_csrf_token
from app.auth.service import (
    authenticate_user,
    create_password_reset_token,
    create_refresh_session,
    login_is_rate_limited,
    password_reset_is_rate_limited,
    record_login_attempt,
    record_password_reset_attempt,
    reset_password_with_token,
    revoke_session,
    rotate_refresh_session,
)
from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    settings = get_settings()

    response.set_cookie(
        key=settings.access_cookie_name,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
        max_age=settings.access_token_minutes * 60,
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/api/v1/auth",
        max_age=settings.refresh_token_days * 86400,
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
        max_age=settings.refresh_token_days * 86400,
    )


def _clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.access_cookie_name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/api/v1/auth",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    response.delete_cookie(
        key=settings.csrf_cookie_name,
        path="/",
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


@router.post("/login", response_model=AuthenticatedUserResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> AuthenticatedUserResponse:
    ip_address = request.client.host if request.client else "127.0.0.1"

    if login_is_rate_limited(session, email=payload.email, ip_address=ip_address):
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please wait before trying again.",
        )

    user = authenticate_user(session, email=payload.email, password=payload.password)
    if user is None:
        record_login_attempt(session, email=payload.email, ip_address=ip_address, succeeded=False)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    record_login_attempt(session, email=payload.email, ip_address=ip_address, succeeded=True)
    user.last_login_at = datetime.now(UTC)

    refresh_session, raw_refresh_token = create_refresh_session(session, user=user)
    access_token = issue_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        role=user.role,
        session_id=refresh_session.id,
    )
    csrf_token = new_csrf_token()

    session.commit()

    _set_auth_cookies(
        response,
        access_token=access_token,
        refresh_token=raw_refresh_token,
        csrf_token=csrf_token,
    )

    return AuthenticatedUserResponse(
        id=str(user.id),
        organization_id=str(user.organization_id),
        email=user.email,
        display_name=user.display_name,
        role=user.role.value,
        # Tokens live in HttpOnly cookies only — never echo secrets to JS.
        csrf_token=csrf_token,
    )


@router.post("/refresh", response_model=AuthenticatedUserResponse)
def refresh(
    request: Request,
    response: Response,
    session: DatabaseSession,
    payload: RefreshRequest | None = None,
) -> AuthenticatedUserResponse:
    settings = get_settings()
    raw_refresh_token = (payload.refresh_token if payload else None) or request.cookies.get(
        settings.refresh_cookie_name
    )
    if not raw_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing.",
        )

    result = rotate_refresh_session(session, raw_token=raw_refresh_token)
    if result is None:
        _clear_auth_cookies(response)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh session.",
        )

    user, new_session, new_raw_token = result
    access_token = issue_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        role=user.role,
        session_id=new_session.id,
    )
    csrf_token = new_csrf_token()

    session.commit()

    _set_auth_cookies(
        response,
        access_token=access_token,
        refresh_token=new_raw_token,
        csrf_token=csrf_token,
    )

    return AuthenticatedUserResponse(
        id=str(user.id),
        organization_id=str(user.organization_id),
        email=user.email,
        display_name=user.display_name,
        role=user.role.value,
        csrf_token=csrf_token,
    )


@router.post("/logout")
def logout(
    current_user: CurrentUser,
    response: Response,
    session: DatabaseSession,
    _: None = Depends(require_csrf),
) -> dict[str, str]:
    revoke_session(session, session_id=current_user.session_id)
    session.commit()
    _clear_auth_cookies(response)
    return {"status": "ok", "message": "Successfully logged out."}


@router.get("/me", response_model=AuthenticatedUserResponse)
def get_me(current_user: CurrentUser, response: Response) -> AuthenticatedUserResponse:
    # Re-issue readable CSRF so cross-origin clients can store it after page reload.
    settings = get_settings()
    csrf_token = new_csrf_token()
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
        max_age=settings.refresh_token_days * 86400,
    )
    return AuthenticatedUserResponse(
        id=str(current_user.user_id),
        organization_id=str(current_user.organization_id),
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role.value,
        csrf_token=csrf_token,
    )


@router.post("/password-reset/request")
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    session: DatabaseSession,
) -> dict[str, str]:
    ip_address = request.client.host if request.client else "127.0.0.1"
    if password_reset_is_rate_limited(session, email=payload.email, ip_address=ip_address):
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please wait before trying again.",
        )
    record_password_reset_attempt(session, email=payload.email, ip_address=ip_address)
    create_password_reset_token(session, email=payload.email)
    session.commit()
    return {
        "status": "ok",
        "message": "If an active account with that email exists, a password reset token has been created.",
    }


@router.post("/password-reset/confirm")
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    session: DatabaseSession,
) -> dict[str, str]:
    success = reset_password_with_token(
        session,
        raw_token=payload.token,
        new_password=payload.new_password,
    )
    if not success:
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The password reset link is invalid, expired, or has already been used.",
        )

    session.commit()
    return {"status": "ok", "message": "Your password has been successfully updated."}
