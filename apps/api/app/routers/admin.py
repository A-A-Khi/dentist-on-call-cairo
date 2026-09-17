"""Admin maintenance endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf, require_roles
from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.services.clinical_purge import purge_all_operational_data

router = APIRouter(prefix="/admin", tags=["admin"])

CONFIRM_PHRASE = "DELETE_ALL_OPERATIONAL_DATA"


class ResetOperationalDataRequest(BaseModel):
    confirm: str = Field(
        ...,
        description=f'Must be exactly "{CONFIRM_PHRASE}"',
    )


@router.post(
    "/reset-operational-data",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
def reset_operational_data(
    body: ResetOperationalDataRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Admin-only: wipe patients, visits, appointments, financials, and audit noise.

    Keeps users, doctors, procedure catalog, financial categories, case streams, and settings.
    """
    if body.confirm != CONFIRM_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Confirmation required. Send {{"confirm":"{CONFIRM_PHRASE}"}}.',
        )

    stats = purge_all_operational_data(session)

    # Audit row is wiped by the purge; re-log after wipe for traceability.
    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="OPERATIONAL_DATA_RESET",
            target_type="organization",
            target_id=current_user.organization_id,
            description="Admin wiped all patient, financial, appointment, and related operational data.",
            occurred_at=datetime.now(UTC),
            metadata_json=dict(stats),
        )
    )
    session.commit()

    return {
        "ok": True,
        "wiped": True,
        "preserved": [
            "organizations",
            "users",
            "doctor_profiles",
            "procedure_catalog",
            "financial_categories",
            "case_streams",
            "settings",
        ],
        "stats": stats,
    }
