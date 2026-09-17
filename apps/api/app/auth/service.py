from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.auth.security import new_opaque_token, token_digest, verify_password
from app.core.config import get_settings
from app.models.identity import (
    AuthLoginAttempt,
    Organization,
    PasswordResetToken,
    RefreshSession,
    User,
)


def _ensure_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)



def hash_identifier(value: str) -> str:
    return sha256(value.strip().lower().encode("utf-8")).hexdigest()


def login_is_rate_limited(session: Session, *, email: str, ip_address: str) -> bool:
    settings = get_settings()
    cutoff = datetime.now(UTC) - timedelta(minutes=settings.login_rate_limit_minutes)
    attempts: Select[tuple[AuthLoginAttempt]] = select(AuthLoginAttempt).where(
        AuthLoginAttempt.email_hash == hash_identifier(email),
        AuthLoginAttempt.ip_hash == hash_identifier(ip_address),
        AuthLoginAttempt.succeeded.is_(False),
        AuthLoginAttempt.occurred_at >= cutoff,
    )
    return len(session.scalars(attempts).all()) >= settings.login_rate_limit_attempts


def password_reset_is_rate_limited(session: Session, *, email: str, ip_address: str) -> bool:
    """Throttle password-reset requests per email+IP and per IP alone."""
    settings = get_settings()
    cutoff = datetime.now(UTC) - timedelta(minutes=settings.password_reset_rate_limit_minutes)
    per_email = select(AuthLoginAttempt).where(
        AuthLoginAttempt.email_hash == hash_identifier(f"reset:{email}"),
        AuthLoginAttempt.ip_hash == hash_identifier(ip_address),
        AuthLoginAttempt.occurred_at >= cutoff,
    )
    per_ip = select(AuthLoginAttempt).where(
        AuthLoginAttempt.email_hash == hash_identifier("reset:any"),
        AuthLoginAttempt.ip_hash == hash_identifier(ip_address),
        AuthLoginAttempt.occurred_at >= cutoff,
    )
    email_count = len(session.scalars(per_email).all())
    ip_count = len(session.scalars(per_ip).all())
    limit = settings.password_reset_rate_limit_attempts
    return email_count >= limit or ip_count >= (limit * 3)


def record_password_reset_attempt(session: Session, *, email: str, ip_address: str) -> None:
    now = datetime.now(UTC)
    session.add(
        AuthLoginAttempt(
            email_hash=hash_identifier(f"reset:{email}"),
            ip_hash=hash_identifier(ip_address),
            succeeded=False,
            occurred_at=now,
        )
    )
    session.add(
        AuthLoginAttempt(
            email_hash=hash_identifier("reset:any"),
            ip_hash=hash_identifier(ip_address),
            succeeded=False,
            occurred_at=now,
        )
    )


def record_login_attempt(session: Session, *, email: str, ip_address: str, succeeded: bool) -> None:
    session.add(
        AuthLoginAttempt(
            email_hash=hash_identifier(email),
            ip_hash=hash_identifier(ip_address),
            succeeded=succeeded,
            occurred_at=datetime.now(UTC),
        )
    )


def authenticate_user(session: Session, *, email: str, password: str) -> User | None:
    """Resolve the one active account for the single-organization MVP login surface."""
    query = (
        select(User)
        .join(Organization, Organization.id == User.organization_id)
        .where(User.email == email, User.is_active.is_(True), Organization.is_active.is_(True))
    )
    users = session.scalars(query).all()
    if len(users) != 1 or not verify_password(password, users[0].password_hash):
        return None
    return users[0]


def create_refresh_session(session: Session, *, user: User, rotated_from_id: UUID | None = None) -> tuple[RefreshSession, str]:
    settings = get_settings()
    raw_token = new_opaque_token()
    refresh_session = RefreshSession(
        organization_id=user.organization_id,
        user_id=user.id,
        token_hash=token_digest(raw_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
        rotated_from_id=rotated_from_id,
    )
    session.add(refresh_session)
    session.flush()
    return refresh_session, raw_token


def rotate_refresh_session(session: Session, *, raw_token: str) -> tuple[User, RefreshSession, str] | None:
    query = (
        select(RefreshSession)
        .where(RefreshSession.token_hash == token_digest(raw_token))
        .with_for_update()
    )
    existing = session.scalar(query)
    if existing is None:
        return None

    # Reuse of an already-rotated/revoked refresh token → revoke the whole family.
    if existing.revoked_at is not None:
        user_sessions = session.scalars(
            select(RefreshSession).where(
                RefreshSession.user_id == existing.user_id,
                RefreshSession.revoked_at.is_(None),
            )
        ).all()
        now = datetime.now(UTC)
        for s in user_sessions:
            s.revoked_at = now
        return None

    if _ensure_utc(existing.expires_at) <= datetime.now(UTC):
        return None
    user = session.get(User, existing.user_id)
    if user is None or not user.is_active or user.organization_id != existing.organization_id:
        return None
    existing.revoked_at = datetime.now(UTC)
    new_session, new_raw_token = create_refresh_session(session, user=user, rotated_from_id=existing.id)
    return user, new_session, new_raw_token


def revoke_session(session: Session, *, session_id: UUID) -> None:
    db_session = session.get(RefreshSession, session_id)
    if db_session is not None and db_session.revoked_at is None:
        db_session.revoked_at = datetime.now(UTC)


def create_password_reset_token(session: Session, *, email: str) -> str | None:
    query = (
        select(User)
        .join(Organization, Organization.id == User.organization_id)
        .where(User.email == email, User.is_active.is_(True), Organization.is_active.is_(True))
    )
    user = session.scalar(query)
    if user is None:
        return None

    raw_token = new_opaque_token()
    token_record = PasswordResetToken(
        organization_id=user.organization_id,
        user_id=user.id,
        token_hash=token_digest(raw_token),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    session.add(token_record)
    session.flush()
    return raw_token


def reset_password_with_token(session: Session, *, raw_token: str, new_password: str) -> bool:
    from app.auth.security import hash_password

    query = (
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_digest(raw_token))
        .with_for_update()
    )
    token_record = session.scalar(query)
    if (
        token_record is None
        or token_record.used_at is not None
        or _ensure_utc(token_record.expires_at) <= datetime.now(UTC)
    ):
        return False

    user = session.get(User, token_record.user_id)
    if user is None or not user.is_active:
        return False

    token_record.used_at = datetime.now(UTC)
    user.password_hash = hash_password(new_password)

    # Revoke all active sessions for this user for security
    user_sessions = session.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
    ).all()
    for s in user_sessions:
        s.revoked_at = datetime.now(UTC)

    return True

