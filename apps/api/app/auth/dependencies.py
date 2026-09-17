import hmac
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.core.config import get_settings
from app.database.session import get_db_session
from app.models.enums import AppointmentStatus, UserRole
from app.models.identity import DoctorProfile, RefreshSession, User
from app.models.patients import Patient, PatientCareAssignment, Visit
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
    # Prefer Authorization Bearer (localStorage) over access cookie so expired
    # short-lived cookies do not shadow a still-valid refreshed Bearer token.
    raw_token: str | None = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        raw_token = auth_header[7:].strip()
    if not raw_token:
        raw_token = request.cookies.get(settings.access_cookie_name)
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
    """Double-submit CSRF for cookie sessions.

    Cross-origin SPAs cannot read the API's CSRF cookie via document.cookie, so
    requests authenticated with an Authorization Bearer token skip this check
    (classic CSRF cannot forge custom headers / Authorization).
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return

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


def current_doctor_profile_id(session: Session, *, current_user: AuthenticatedUser) -> UUID | None:
    return session.scalar(
        select(DoctorProfile.id).where(
            DoctorProfile.user_id == current_user.user_id,
            DoctorProfile.organization_id == current_user.organization_id,
        )
    )


def schedule_horizon_start() -> datetime:
    """Start of 'current schedule' window (UTC midnight today)."""
    return datetime.combine(date.today(), time.min, tzinfo=UTC)


def can_access_patient(session: Session, *, current_user: AuthenticatedUser, patient_id: UUID) -> bool:
    """Doctors: active care assignment, or own current/upcoming schedule only."""
    if current_user.role == UserRole.ADMIN:
        return True
    doctor_id = current_doctor_profile_id(session, current_user=current_user)
    if doctor_id is None:
        return False

    horizon = schedule_horizon_start()
    care_relation = exists().where(
        PatientCareAssignment.organization_id == current_user.organization_id,
        PatientCareAssignment.patient_id == patient_id,
        PatientCareAssignment.doctor_id == doctor_id,
        PatientCareAssignment.unassigned_at.is_(None),
    )
    upcoming_appointment = exists().where(
        Appointment.organization_id == current_user.organization_id,
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id,
        Appointment.starts_at >= horizon,
        Appointment.status.in_((AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)),
    )
    today_or_open_visit = exists().where(
        Visit.organization_id == current_user.organization_id,
        Visit.patient_id == patient_id,
        Visit.doctor_id == doctor_id,
        Visit.occurred_at >= horizon,
    )
    return bool(session.scalar(select(care_relation | upcoming_appointment | today_or_open_visit)))


def ensure_patient_access(session: Session, *, current_user: AuthenticatedUser, patient_id: UUID) -> None:
    """Raise 404 when the caller may not access the patient (avoids IDOR probes)."""
    if not can_access_patient(session, current_user=current_user, patient_id=patient_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")


def patient_access_clause(current_user: AuthenticatedUser, doctor_id: UUID | None):
    """SQLAlchemy boolean expression limiting Patient rows to the caller's care scope."""
    if current_user.role == UserRole.ADMIN:
        return True
    if doctor_id is None:
        return False
    horizon = schedule_horizon_start()
    care_relation = exists().where(
        PatientCareAssignment.organization_id == current_user.organization_id,
        PatientCareAssignment.patient_id == Patient.id,
        PatientCareAssignment.doctor_id == doctor_id,
        PatientCareAssignment.unassigned_at.is_(None),
    )
    upcoming_appointment = exists().where(
        Appointment.organization_id == current_user.organization_id,
        Appointment.patient_id == Patient.id,
        Appointment.doctor_id == doctor_id,
        Appointment.starts_at >= horizon,
        Appointment.status.in_((AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)),
    )
    today_or_open_visit = exists().where(
        Visit.organization_id == current_user.organization_id,
        Visit.patient_id == Patient.id,
        Visit.doctor_id == doctor_id,
        Visit.occurred_at >= horizon,
    )
    return care_relation | upcoming_appointment | today_or_open_visit


def ensure_doctor_owns_appointment(
    session: Session,
    *,
    current_user: AuthenticatedUser,
    appointment: Appointment,
) -> None:
    """Admins may manage any appointment; doctors only their own."""
    if current_user.role == UserRole.ADMIN:
        return
    doctor_id = current_doctor_profile_id(session, current_user=current_user)
    if doctor_id is None or appointment.doctor_id != doctor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")


def ensure_doctor_owns_visit(
    session: Session,
    *,
    current_user: AuthenticatedUser,
    visit: Visit,
) -> None:
    """Admins may manage any visit; doctors only visits assigned to them."""
    if current_user.role == UserRole.ADMIN:
        return
    doctor_id = current_doctor_profile_id(session, current_user=current_user)
    if doctor_id is None or visit.doctor_id != doctor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found.")
