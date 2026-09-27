from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from app.auth.dependencies import CurrentUser, DatabaseSession, current_doctor_profile_id
from app.models.enums import UserRole, VisitStatus
from app.models.identity import DoctorProfile, User
from app.models.patients import PatientCareAssignment, Visit

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("")
def list_doctors(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    query = (
        select(DoctorProfile, User.display_name)
        .outerjoin(User, User.id == DoctorProfile.user_id)
        .where(DoctorProfile.organization_id == current_user.organization_id)
        .order_by(DoctorProfile.created_at.asc())
    )

    # Doctors only see their own profile — no org-wide roster or business metrics.
    if current_user.role != UserRole.ADMIN:
        own_id = current_doctor_profile_id(session, current_user=current_user)
        if own_id is None:
            return []
        query = query.where(DoctorProfile.id == own_id)

    rows = session.execute(query).all()
    include_metrics = current_user.role == UserRole.ADMIN
    doctor_ids = [d.id for d, _ in rows]

    care_counts: dict[Any, int] = {}
    visit_counts: dict[Any, int] = {}
    if include_metrics and doctor_ids:
        care_rows = session.execute(
            select(PatientCareAssignment.doctor_id, func.count(PatientCareAssignment.id))
            .where(
                PatientCareAssignment.doctor_id.in_(doctor_ids),
                PatientCareAssignment.unassigned_at.is_(None),
            )
            .group_by(PatientCareAssignment.doctor_id)
        ).all()
        care_counts = {doctor_id: int(count) for doctor_id, count in care_rows}

        month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        visit_rows = session.execute(
            select(Visit.doctor_id, func.count(Visit.id))
            .where(
                Visit.doctor_id.in_(doctor_ids),
                Visit.occurred_at >= month_start,
                Visit.status.in_([VisitStatus.COMPLETED, VisitStatus.AMENDED]),
            )
            .group_by(Visit.doctor_id)
        ).all()
        visit_counts = {doctor_id: int(count) for doctor_id, count in visit_rows}

    result: list[dict[str, Any]] = []
    for d, display_name in rows:
        row: dict[str, Any] = {
            "id": str(d.id),
            "code": d.doctor_code,
            "name": display_name or "Specialist",
            "specialization": d.specialization or "General Dentistry",
            "phone": d.phone or "—",
            "status": d.status.value,
        }
        if include_metrics:
            row["activePatients"] = care_counts.get(d.id, 0)
            row["completedVisitsThisMonth"] = visit_counts.get(d.id, 0)
        else:
            row["activePatients"] = 0
            row["completedVisitsThisMonth"] = 0
        result.append(row)

    return result
