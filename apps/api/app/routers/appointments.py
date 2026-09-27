from datetime import UTC, datetime, time, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.auth.dependencies import (
    CurrentUser,
    DatabaseSession,
    current_doctor_profile_id,
    ensure_doctor_owns_appointment,
    ensure_patient_access,
    require_csrf,
    require_roles,
    schedule_horizon_start,
)
from app.models.audit import AuditLog
from app.models.enums import AppointmentStatus, UserRole
from app.models.identity import DoctorProfile, User
from app.models.patients import Patient
from app.models.scheduling import Appointment, AppointmentStatusEvent
from app.services.clinical_purge import purge_appointment

router = APIRouter(prefix="/appointments", tags=["appointments"])


class AppointmentCreateRequest(BaseModel):
    patient_id_or_code: str
    doctor_name: str | None = None
    date: str  # YYYY-MM-DD
    time: str  # HH:MM or h:mm AM/PM
    duration_minutes: int = 30
    procedure: str | None = None
    chief_complaint: str | None = None
    location: str | None = "Room 1 — Main Operatory"
    notes: str | None = None


class AppointmentStatusUpdateRequest(BaseModel):
    status: str
    reason: str | None = None


class AppointmentUpdateRequest(BaseModel):
    date: str | None = None
    time: str | None = None
    duration_minutes: int | None = Field(None, ge=5, le=480)
    procedure: str | None = None
    chief_complaint: str | None = None
    location: str | None = None
    notes: str | None = None
    doctor_name: str | None = None


def _parse_appointment_start(date_str: str, time_str: str) -> datetime:
    raw = f"{date_str.strip()} {time_str.strip()}"
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %I:%M %p", "%Y-%m-%d %I:%M%p"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid date/time. Use YYYY-MM-DD and HH:MM or h:mm AM/PM.",
    )


def _resolve_doctor_by_name(
    session: DatabaseSession,
    organization_id: UUID,
    doctor_name: str,
) -> DoctorProfile | None:
    docs = session.scalars(
        select(DoctorProfile).where(DoctorProfile.organization_id == organization_id)
    ).all()
    for doc in docs:
        user = session.get(User, doc.user_id)
        if user and user.display_name == doctor_name:
            return doc
    return None


def _serialize_appointment(session: DatabaseSession, apt: Appointment) -> dict[str, Any]:
    patient = session.get(Patient, apt.patient_id)
    doctor_name = "Dr. Sayed El-Bahy"
    if apt.doctor_id:
        doc = session.get(DoctorProfile, apt.doctor_id)
        if doc:
            doc_user = session.get(User, doc.user_id)
            if doc_user:
                doctor_name = doc_user.display_name
    return {
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


def _parse_day_bound(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        day = datetime.strptime(value.strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
    clock = time.max if end_of_day else time.min
    return datetime.combine(day, clock, tzinfo=UTC)


def _serialize_appointment_joined(
    *,
    apt: Appointment,
    patient_code: str | None,
    patient_name: str | None,
    patient_phone: str | None,
    doctor_name: str | None,
) -> dict[str, Any]:
    return {
        "id": str(apt.id),
        "patientCode": patient_code or "DOC-000000",
        "patientName": patient_name or "Patient",
        "patientPhone": patient_phone or "—",
        "doctorName": doctor_name or "Dr. Sayed El-Bahy",
        "date": apt.starts_at.strftime("%Y-%m-%d"),
        "time": apt.starts_at.strftime("%I:%M %p"),
        "durationMinutes": apt.duration_minutes,
        "procedure": apt.reason or "Clinical Consultation",
        "chiefComplaint": apt.notes or apt.reason or "—",
        "location": apt.location or "Room 1",
        "status": apt.status.value,
        "notes": apt.notes or "",
    }


@router.get("")
def list_appointments(
    current_user: CurrentUser,
    session: DatabaseSession,
    status_filter: str | None = Query(None, alias="status"),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
) -> list[dict[str, Any]]:
    query = (
        select(
            Appointment,
            Patient.patient_code,
            Patient.full_name,
            Patient.phone,
            User.display_name,
        )
        .join(Patient, Patient.id == Appointment.patient_id)
        .outerjoin(DoctorProfile, DoctorProfile.id == Appointment.doctor_id)
        .outerjoin(User, User.id == DoctorProfile.user_id)
        .where(
            Appointment.organization_id == current_user.organization_id,
            Patient.deleted_at.is_(None),
        )
        .order_by(Appointment.starts_at.asc())
    )

    if status_filter and status_filter != "ALL":
        try:
            status_enum = AppointmentStatus(status_filter.upper())
            query = query.where(Appointment.status == status_enum)
        except ValueError:
            pass

    start_bound = _parse_day_bound(date_from, end_of_day=False)
    end_bound = _parse_day_bound(date_to, end_of_day=True)
    if start_bound is not None:
        query = query.where(Appointment.starts_at >= start_bound)
    if end_bound is not None:
        query = query.where(Appointment.starts_at <= end_bound)

    if current_user.role != UserRole.ADMIN:
        doctor_id = current_doctor_profile_id(session, current_user=current_user)
        if doctor_id is None:
            return []
        query = query.where(Appointment.doctor_id == doctor_id)
        # Doctors always stay within schedule horizon unless a tighter from was provided.
        horizon = schedule_horizon_start()
        if start_bound is None or start_bound < horizon:
            query = query.where(Appointment.starts_at >= horizon)

    rows = session.execute(query).all()
    return [
        _serialize_appointment_joined(
            apt=apt,
            patient_code=code,
            patient_name=name,
            patient_phone=phone,
            doctor_name=doc_name,
        )
        for apt, code, name, phone, doc_name in rows
    ]


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
    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)

    doc_profile: DoctorProfile | None = None
    if current_user.role == UserRole.DOCTOR:
        own_id = current_doctor_profile_id(session, current_user=current_user)
        if own_id:
            doc_profile = session.get(DoctorProfile, own_id)
        if doc_profile is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doctor profile not found for the current user.",
            )
    elif payload.doctor_name:
        doc_profile = _resolve_doctor_by_name(
            session, current_user.organization_id, payload.doctor_name
        )
        if doc_profile is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Doctor '{payload.doctor_name}' not found.",
            )
    if doc_profile is None:
        doc_profile = session.scalar(
            select(DoctorProfile).where(DoctorProfile.organization_id == current_user.organization_id).limit(1)
        )

    start_dt = _parse_appointment_start(payload.date, payload.time)
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


@router.patch("/{appointment_id}", dependencies=[Depends(require_csrf)])
def update_appointment(
    appointment_id: UUID,
    payload: AppointmentUpdateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    apt = session.get(Appointment, appointment_id)
    if not apt or apt.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    ensure_doctor_owns_appointment(session, current_user=current_user, appointment=apt)
    ensure_patient_access(session, current_user=current_user, patient_id=apt.patient_id)

    date_str = payload.date or apt.starts_at.strftime("%Y-%m-%d")
    time_str = payload.time or apt.starts_at.strftime("%H:%M")
    duration = payload.duration_minutes if payload.duration_minutes is not None else apt.duration_minutes

    if payload.date is not None or payload.time is not None or payload.duration_minutes is not None:
        start_dt = _parse_appointment_start(date_str, time_str)
        apt.starts_at = start_dt
        apt.ends_at = start_dt + timedelta(minutes=duration)
        apt.duration_minutes = duration

    if payload.procedure is not None:
        apt.reason = payload.procedure
    if payload.chief_complaint is not None:
        apt.notes = payload.chief_complaint
    elif payload.notes is not None:
        apt.notes = payload.notes
    if payload.location is not None:
        apt.location = payload.location

    # Only admins may reassign appointments across doctors.
    if payload.doctor_name is not None and current_user.role == UserRole.ADMIN:
        resolved = _resolve_doctor_by_name(
            session, current_user.organization_id, payload.doctor_name
        )
        if resolved is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Doctor '{payload.doctor_name}' not found.",
            )
        apt.doctor_id = resolved.id

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="APPOINTMENT_UPDATED",
            target_type="appointments",
            target_id=apt.id,
            description=f"Updated appointment {apt.id}",
            occurred_at=datetime.now(UTC),
            metadata_json={"fields": sorted(payload.model_fields_set)},
        )
    )
    session.commit()
    session.refresh(apt)
    return _serialize_appointment(session, apt)


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
    ensure_doctor_owns_appointment(session, current_user=current_user, appointment=apt)
    ensure_patient_access(session, current_user=current_user, patient_id=apt.patient_id)

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


@router.delete(
    "/{appointment_id}",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
def delete_appointment(
    appointment_id: UUID,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Admin-only: remove a reservation and any linked visit money from the ledger."""
    apt = session.get(Appointment, appointment_id)
    if not apt or apt.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found.")

    patient = session.get(Patient, apt.patient_id)
    now = datetime.now(UTC)
    purge_stats = purge_appointment(session, apt, now=now)

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="APPOINTMENT_DELETED",
            target_type="appointments",
            target_id=appointment_id,
            description=(
                f"Deleted appointment for {patient.full_name if patient else 'patient'} "
                f"(purged {purge_stats.get('visits', 0)} visit(s), "
                f"{purge_stats.get('transactions', 0)} ledger row(s))"
            ),
            occurred_at=now,
            metadata_json={
                "mode": "purge",
                "patient_code": patient.patient_code if patient else None,
                **{k: v for k, v in purge_stats.items() if k != "appointmentDeleted"},
            },
        )
    )
    session.commit()
    return {
        "id": str(appointment_id),
        "deleted": True,
        "status": "DELETED",
        "purged": purge_stats,
    }
