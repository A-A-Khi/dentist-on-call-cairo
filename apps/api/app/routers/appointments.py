from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf
from app.models.audit import AuditLog
from app.models.enums import AppointmentStatus
from app.models.identity import DoctorProfile, User
from app.models.patients import Patient
from app.models.scheduling import Appointment, AppointmentStatusEvent

router = APIRouter(prefix="/appointments", tags=["appointments"])


class AppointmentCreateRequest(BaseModel):
    patient_id_or_code: str
    doctor_name: str | None = None
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    duration_minutes: int = 30
    procedure: str | None = None
    chief_complaint: str | None = None
    location: str | None = "Room 1 — Main Operatory"
    notes: str | None = None


class AppointmentStatusUpdateRequest(BaseModel):
    status: str
    reason: str | None = None


@router.get("")
def list_appointments(
    current_user: CurrentUser,
    session: DatabaseSession,
    status_filter: str | None = Query(None, alias="status"),
) -> list[dict[str, Any]]:
    query = (
        select(Appointment)
        .where(Appointment.organization_id == current_user.organization_id)
        .order_by(Appointment.starts_at.asc())
    )

    if status_filter and status_filter != "ALL":
        try:
            status_enum = AppointmentStatus(status_filter.upper())
            query = query.where(Appointment.status == status_enum)
        except ValueError:
            pass

    appointments = session.scalars(query).all()

    result = []
    for apt in appointments:
        patient = session.get(Patient, apt.patient_id)
        doctor_name = "Dr. Tarek Omar"
        if apt.doctor_id:
            doc = session.get(DoctorProfile, apt.doctor_id)
            if doc:
                doc_user = session.get(User, doc.user_id)
                if doc_user:
                    doctor_name = doc_user.display_name

        result.append(
            {
                "id": str(apt.id),
                "patientCode": patient.patient_code if patient else "DOC-000000",
                "patientName": patient.full_name if patient else "Patient",
                "patientPhone": (patient.phone if patient else "—") or "—",
                "doctorName": doctor_name,
                "date": apt.starts_at.strftime("%Y-%m-%d"),
                "time": apt.starts_at.strftime("%I:%M %p"),
                "durationMinutes": apt.duration_minutes,
                "procedure": apt.reason or "Clinical Consultation",
                "chiefComplaint": apt.notes or apt.reason or "—",
                "location": apt.location or "Room 1",
                "status": apt.status.value,
                "notes": apt.notes or "",
            }
        )

    return result


@router.post("", dependencies=[Depends(require_csrf)], status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    query = select(Patient).where(
        Patient.organization_id == current_user.organization_id,
        Patient.deleted_at.is_(None),
    )
    try:
        uuid_obj = UUID(payload.patient_id_or_code)
        query = query.where(or_(Patient.id == uuid_obj, Patient.patient_code == payload.patient_id_or_code))
    except ValueError:
        query = query.where(Patient.patient_code == payload.patient_id_or_code)

    patient = session.scalar(query)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    doc_profile = session.scalar(
        select(DoctorProfile).where(DoctorProfile.organization_id == current_user.organization_id).limit(1)
    )

    try:
        start_dt = datetime.strptime(f"{payload.date} {payload.time}", "%Y-%m-%d %H:%M").replace(tzinfo=UTC)
    except ValueError:
        start_dt = datetime.now(UTC) + timedelta(hours=1)
    end_dt = start_dt + timedelta(minutes=payload.duration_minutes)

    apt = Appointment(
        id=uuid4(),
        organization_id=current_user.organization_id,
        patient_id=patient.id,
        doctor_id=doc_profile.id if doc_profile else None,
        starts_at=start_dt,
        ends_at=end_dt,
        duration_minutes=payload.duration_minutes,
        reason=payload.procedure or payload.chief_complaint or "Clinical Consultation",
        location=payload.location,
        status=AppointmentStatus.PENDING,
        notes=payload.chief_complaint or payload.notes,
        created_by_user_id=current_user.user_id,
    )
    session.add(apt)
    session.flush()

    audit = AuditLog(
        id=uuid4(),
        organization_id=current_user.organization_id,
        actor_user_id=current_user.user_id,
        actor_role=current_user.role.value,
        action="APPOINTMENT_SCHEDULED",
        target_type="appointments",
        target_id=apt.id,
        description=f"Scheduled appointment for {patient.full_name} on {payload.date}",
        occurred_at=datetime.now(UTC),
        metadata_json={
            "patient_code": patient.patient_code,
            "starts_at": start_dt.isoformat(),
            "reason": payload.procedure,
        },
    )
    session.add(audit)
    session.commit()

    return {
        "id": str(apt.id),
        "status": apt.status.value,
        "startsAt": apt.starts_at.isoformat(),
    }


@router.patch("/{appointment_id}/status", dependencies=[Depends(require_csrf)])
def update_appointment_status(
    appointment_id: UUID,
    payload: AppointmentStatusUpdateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    apt = session.get(Appointment, appointment_id)
    if not apt or apt.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

    try:
        new_status = AppointmentStatus(payload.status.upper())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status.") from None

    old_status = apt.status
    apt.status = new_status
    if new_status == AppointmentStatus.COMPLETED:
        apt.completed_at = datetime.now(UTC)
    elif new_status == AppointmentStatus.CANCELLED:
        apt.cancelled_at = datetime.now(UTC)

    event = AppointmentStatusEvent(
        id=uuid4(),
        organization_id=current_user.organization_id,
        appointment_id=apt.id,
        from_status=old_status,
        to_status=new_status,
        changed_by_user_id=current_user.user_id,
        reason=payload.reason,
        occurred_at=datetime.now(UTC),
    )
    session.add(event)
    session.commit()

    return {"id": str(apt.id), "status": apt.status.value}
