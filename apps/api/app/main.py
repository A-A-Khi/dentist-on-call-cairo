from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.config import get_settings
from app.routers.appointments import router as appointments_router
from app.routers.audit import router as audit_router
from app.routers.auth import router as auth_router
from app.routers.case_streams import router as case_streams_router
from app.routers.doctors import router as doctors_router
from app.routers.financials import router as financials_router
from app.routers.health import router as health_router
from app.routers.patients import router as patients_router
from app.routers.visits import router as visits_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Reserve startup/shutdown hooks for managed resources."""
    if settings.app_env == "development":
        try:
            import logging

            from app.database.base import Base
            from app.database.seed import seed_database
            from app.database.session import engine
            import app.models  # noqa: F401
            from sqlalchemy import text

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
            seed_database()
        except Exception as exc:
            import logging
            logging.getLogger("app.startup").warning("Auto initialization skipped: %s", exc)
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs" if settings.app_env != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

_allowed_origins = [
    str(settings.web_origin),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
]
if settings.extra_web_origins:
    _allowed_origins.extend(
        o.strip() for o in settings.extra_web_origins.split(",") if o.strip()
    )

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
app.include_router(patients_router, prefix="/api/v1")
app.include_router(visits_router, prefix="/api/v1")
app.include_router(appointments_router, prefix="/api/v1")
app.include_router(financials_router, prefix="/api/v1")
app.include_router(case_streams_router, prefix="/api/v1")
app.include_router(doctors_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")

