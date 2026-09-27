from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import get_settings
from app.routers.appointments import router as appointments_router
from app.routers.audit import router as audit_router
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.case_streams import router as case_streams_router
from app.routers.dashboard import router as dashboard_router
from app.routers.doctors import router as doctors_router
from app.routers.financials import router as financials_router
from app.routers.health import router as health_router
from app.routers.patients import router as patients_router
from app.routers.reports import router as reports_router
from app.routers.visits import router as visits_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Reserve startup/shutdown hooks for managed resources."""
    import logging

    log = logging.getLogger("app.startup")
    try:
        from sqlalchemy import text

        from app.database.session import engine

        # Safe additive schema patches for hosted DBs (create_all / Alembic may lag).
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE case_streams
                      ADD COLUMN IF NOT EXISTS referral_percent integer NOT NULL DEFAULT 0
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE visits
                      ADD COLUMN IF NOT EXISTS source_stream_id uuid
                      REFERENCES case_streams(id) ON DELETE SET NULL
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE visits
                      ADD COLUMN IF NOT EXISTS case_cost_minor bigint NOT NULL DEFAULT 0
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE visits
                      ADD COLUMN IF NOT EXISTS case_cost_note varchar(160)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    ALTER TABLE visits
                      ADD COLUMN IF NOT EXISTS doctor_share_percent integer NOT NULL DEFAULT 35,
                      ADD COLUMN IF NOT EXISTS assistant_share_percent integer NOT NULL DEFAULT 15,
                      ADD COLUMN IF NOT EXISTS referral_share_percent integer NOT NULL DEFAULT 0,
                      ADD COLUMN IF NOT EXISTS org_share_percent integer NOT NULL DEFAULT 50
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE visits v
                       SET source_stream_id = p.source_stream_id
                      FROM patients p
                     WHERE v.patient_id = p.id
                       AND v.source_stream_id IS NULL
                       AND p.source_stream_id IS NOT NULL
                    """
                )
            )
    except Exception as exc:
        log.warning("Schema forward-compat patch skipped: %s", exc)

    if settings.app_env == "development":
        try:
            import app.models  # noqa: F401
            from sqlalchemy import text

            from app.database.base import Base
            from app.database.seed import seed_database
            from app.database.session import engine

            Base.metadata.create_all(bind=engine)
            # Lightweight forward-compat for existing local DBs (create_all does not ALTER).
            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS case_streams (
                          id uuid PRIMARY KEY,
                          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
                          name_en varchar(160) NOT NULL,
                          name_ar varchar(160),
                          referral_percent integer NOT NULL DEFAULT 0,
                          is_active boolean NOT NULL DEFAULT true,
                          created_at timestamptz NOT NULL DEFAULT now(),
                          updated_at timestamptz NOT NULL DEFAULT now(),
                          CONSTRAINT uq_case_streams_organization_name_en UNIQUE (organization_id, name_en)
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        ALTER TABLE patients
                          ADD COLUMN IF NOT EXISTS source_stream_id uuid
                          REFERENCES case_streams(id) ON DELETE SET NULL
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        ALTER TABLE visits
                          ADD COLUMN IF NOT EXISTS source_stream_id uuid
                          REFERENCES case_streams(id) ON DELETE SET NULL
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        ALTER TABLE case_streams
                          ADD COLUMN IF NOT EXISTS referral_percent integer NOT NULL DEFAULT 0
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        ALTER TABLE visits
                          ADD COLUMN IF NOT EXISTS case_cost_minor bigint NOT NULL DEFAULT 0,
                          ADD COLUMN IF NOT EXISTS case_cost_note varchar(160),
                          ADD COLUMN IF NOT EXISTS doctor_share_percent integer NOT NULL DEFAULT 35,
                          ADD COLUMN IF NOT EXISTS assistant_share_percent integer NOT NULL DEFAULT 15,
                          ADD COLUMN IF NOT EXISTS referral_share_percent integer NOT NULL DEFAULT 0,
                          ADD COLUMN IF NOT EXISTS org_share_percent integer NOT NULL DEFAULT 50
                        """
                    )
                )
            if settings.seed_demo_data:
                seed_database()
            else:
                log.info("Skipping demo seed (set SEED_DEMO_DATA=true to enable).")
        except Exception as exc:
            log.warning("Auto initialization skipped: %s", exc)
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response


settings = get_settings()
_docs_enabled = not settings.is_production
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url="/api/v1/openapi.json" if _docs_enabled else None,
    docs_url="/api/v1/docs" if _docs_enabled else None,
    redoc_url=None,
    lifespan=lifespan,
)

_allowed_origins = [str(settings.web_origin)]
if not settings.is_production:
    _allowed_origins.extend(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
        ]
    )
if settings.extra_web_origins:
    _allowed_origins.extend(o.strip() for o in settings.extra_web_origins.split(",") if o.strip())
# De-dupe while preserving order
_seen: set[str] = set()
_allowed_origins = [o for o in _allowed_origins if not (o in _seen or _seen.add(o))]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "X-Request-ID",
        "Accept",
        "Origin",
        "Cache-Control",
    ],
)
app.add_middleware(SecurityHeadersMiddleware)
app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(patients_router, prefix="/api/v1")
app.include_router(visits_router, prefix="/api/v1")
app.include_router(appointments_router, prefix="/api/v1")
app.include_router(financials_router, prefix="/api/v1")
app.include_router(case_streams_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(doctors_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
