from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from app.auth.dependencies import CurrentUser, DatabaseSession
from app.models.audit import AuditLog
from app.models.identity import User

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
def list_audit_logs(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    query = (
        select(AuditLog)
        .where(AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.occurred_at.desc())
        .limit(50)
    )
    logs = session.scalars(query).all()

    result: list[dict[str, Any]] = []
    for entry in logs:
        actor = session.get(User, entry.actor_user_id) if entry.actor_user_id else None
        user_name = actor.display_name if actor else "System"
        role = entry.actor_role or (actor.role.value if actor else "SYSTEM")

        result.append(
            {
                "id": str(entry.id),
                "time": entry.occurred_at.strftime("%Y-%m-%d %H:%M"),
                "user": user_name,
                "role": role,
                "action": entry.action,
                "target": f"{entry.target_type} ({str(entry.target_id)[:8]}...)" if entry.target_id else entry.target_type,
                "description": entry.description,
            }
        )

    return result
