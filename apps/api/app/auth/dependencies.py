import hmac
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.core.config import get_settings
from app.database.session import get_db_session
from app.models.enums import UserRole
from app.models.identity import DoctorProfile, RefreshSession, User
from app.models.patients import PatientCareAssignment, Visit
from app.models.scheduling import Appointment

DatabaseSession = Annotated[Session, Depends(get_db_session)]


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: UUID
    organization_id: UUID
    role: UserRole
    session_id: UUID
    email: str
    display_name: str


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_authenticated_user(request: Request, session: DatabaseSession) -> AuthenticatedUser:
    settings = get_settings()
    raw_token = request.cookies.get(settings.access_cookie_name)
    if not raw_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            raw_token = auth_header[7:].strip()
    if not raw_token:
        raise unauthorized()
    try:
        claims = decode_access_token(raw_token)
        user_id = UUID(claims["sub"])
        organization_id = UUID(claims["oid"])
        session_id = UUID(claims["sid"])
        role = UserRole(claims["role"])
    except (KeyError, ValueError, jwt.InvalidTokenError) as exc:
        raise unauthorized() from exc

    user = session.get(User, user_id)
    refresh_session = session.get(RefreshSession, session_id)
    if user is None or refresh_session is None:
        raise unauthorized()

    expires_at = (
        refresh_session.expires_at
        if refresh_session.expires_at.tzinfo is not None
        else refresh_session.expires_at.replace(tzinfo=UTC)
    )
    if (
        not user.is_active
        or user.organization_id != organization_id
        or user.role != role
        or refresh_session.user_id != user.id
        or refresh_session.organization_id != organization_id
        or refresh_session.revoked_at is not None
        or expires_at <= datetime.now(UTC)
    ):
        raise unauthorized()
    return AuthenticatedUser(user.id, organization_id, role, session_id, user.email, user.display_name)


CurrentUser = Annotated[AuthenticatedUser, Depends(require_authenticated_user)]


def require_csrf(request: Request) -> None:
    settings = get_settings()
    cookie_token = request.cookies.get(settings.csrf_cookie_name)
    header_token = request.headers.get("X-CSRF-Token")
    if cookie_token is None or header_token is None or not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed.")


def require_roles(*allowed_roles: UserRole) -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    def policy(current_user: CurrentUser) -> AuthenticatedUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission for this action.")
        return current_user

    return policy


def can_access_patient(session: Session, *, current_user: AuthenticatedUser, patient_id: UUID) -> bool:
    """Server-side care policy used by all future patient-bound endpoints."""
    if current_user.role == UserRole.ADMIN:
        return True
    doctor_id = session.scalar(
        select(DoctorProfile.id).where(
            DoctorProfile.user_id == current_user.user_id,
            DoctorProfile.organization_id == current_user.organization_id,
        )
    )
    if doctor_id is None:
        return False
    care_relation = exists().where(
        PatientCareAssignment.organization_id == current_user.organization_id,
        PatientCareAssignment.patient_id == patient_id,
        PatientCareAssignment.doctor_id == doctor_id,
        PatientCareAssignment.unassigned_at.is_(None),
    )
    visit_relation = exists().where(
        Visit.organization_id == current_user.organization_id,
        Visit.patient_id == patient_id,
        Visit.doctor_id == doctor_id,
    )
    appointment_relation = exists().where(
        Appointment.organization_id == current_user.organization_id,
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id,
    )
    return bool(session.scalar(select(care_relation | visit_relation | appointment_relation)))
