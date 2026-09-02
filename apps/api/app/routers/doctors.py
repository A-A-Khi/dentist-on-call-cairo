from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from app.auth.dependencies import CurrentUser, DatabaseSession
from app.models.identity import DoctorProfile, User
from app.models.patients import PatientCareAssignment, Visit

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("")
def list_doctors(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    query = (
        select(DoctorProfile)
        .where(DoctorProfile.organization_id == current_user.organization_id)
        .order_by(DoctorProfile.created_at.asc())
    )
    doctors = session.scalars(query).all()

    result: list[dict[str, Any]] = []
    for d in doctors:
        user = session.get(User, d.user_id)
        name = user.display_name if user else "Specialist"

        active_patients = session.scalar(
            select(func.count(PatientCareAssignment.id)).where(
                PatientCareAssignment.doctor_id == d.id,
                PatientCareAssignment.unassigned_at.is_(None),
            )
        ) or 0

        completed_visits = session.scalar(
            select(func.count(Visit.id)).where(
                Visit.doctor_id == d.id,
            )
        ) or 0

        result.append(
            {
                "id": str(d.id),
                "code": d.doctor_code,
                "name": name,
                "specialization": d.specialization or "General Dentistry",
                "phone": d.phone or "—",
                "activePatients": active_patients,
                "completedVisitsThisMonth": completed_visits,
                "status": d.status.value,
            }
        )

    return result
