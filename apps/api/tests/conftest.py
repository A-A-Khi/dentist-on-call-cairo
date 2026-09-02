import os
from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-long-enough-for-validation")
os.environ.setdefault("PASSWORD_RESET_SECRET", "test-reset-secret-that-is-long-enough-for-validation")

from app.auth.security import hash_password  # noqa: E402
from app.database.base import Base  # noqa: E402
from app.database.session import get_db_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models.enums import DoctorStatus, UserRole  # noqa: E402
from app.models.identity import DoctorProfile, Organization, User  # noqa: E402


# Register SQLite compilations for PostgreSQL specific types
@compiles(CITEXT, "sqlite")
def compile_citext(type_, compiler, **kw):  # type: ignore[no-untyped-def]
    return "TEXT"


@compiles(JSONB, "sqlite")
def compile_jsonb(type_, compiler, **kw):  # type: ignore[no-untyped-def]
    return "JSON"


@compiles(PG_UUID, "sqlite")
def compile_pg_uuid(type_, compiler, **kw):  # type: ignore[no-untyped-def]
    return "CHAR(36)"


# Setup SQLite in-memory engine with PostgreSQL dialect adaptations
test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_db() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db_session() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_get_db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def seeded_org(db_session: Session) -> Organization:
    org = Organization(
        id=uuid4(),
        name="Test Dental Clinic",
        timezone="Africa/Cairo",
        default_locale="en",
        currency_code="EGP",
        is_active=True,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def seeded_admin(db_session: Session, seeded_org: Organization) -> User:
    admin = User(
        id=uuid4(),
        organization_id=seeded_org.id,
        email="admin@test.eg",
        password_hash=hash_password("AdminSecurePass2026!"),
        role=UserRole.ADMIN,
        display_name="Admin User",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


@pytest.fixture
def seeded_doctor(db_session: Session, seeded_org: Organization) -> tuple[User, DoctorProfile]:
    doc_user = User(
        id=uuid4(),
        organization_id=seeded_org.id,
        email="doctor@test.eg",
        password_hash=hash_password("DoctorSecurePass2026!"),
        role=UserRole.DOCTOR,
        display_name="Dr. Test",
        is_active=True,
    )
    db_session.add(doc_user)
    db_session.flush()

    profile = DoctorProfile(
        id=uuid4(),
        organization_id=seeded_org.id,
        user_id=doc_user.id,
        doctor_code="DOC-TEST-01",
        status=DoctorStatus.ACTIVE,
    )
    db_session.add(profile)
    db_session.commit()
    db_session.refresh(doc_user)
    db_session.refresh(profile)
    return doc_user, profile
