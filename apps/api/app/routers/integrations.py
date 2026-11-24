"""Server-to-server sync from call-center / doctor calendar into clinical records."""

from __future__ import annotations

import hmac
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database.session import get_db_session
from app.models.audit import AuditLog
from app.models.enums import (
    AppointmentStatus,
    PatientStatus,
    ProcedureStatus,
    TransactionStatus,
    TransactionType,
    UserRole,
    VisitStatus,
)
from app.models.identity import DoctorProfile, Organization, User
from app.models.operations import FinancialCategory, FinancialTransaction
from app.models.patients import MedicalHistory, Patient, PatientCareAssignment, Visit, VisitProcedure
from app.models.scheduling import Appointment, AppointmentStatusEvent
from app.services.revenue_split import persist_doctor_month_shares, visit_share_snapshot

router = APIRouter(prefix="/integrations", tags=["integrations"])


class IntegrationPatient(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    phone: str = Field(..., min_length=7, max_length=32)
    whatsapp_phone: str | None = None
    address: str | None = None
    notes: str | None = None
    gender: str = "Male"
    city: str | None = None


class IntegrationDoctor(BaseModel):
    display_name: str | None = None
    doctor_code: str | None = None


class IntegrationAppointment(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD")
    time: str = Field(..., description="HH:MM")
    duration_minutes: int = Field(default=30, ge=5, le=480)
    location: str | None = "Home visit"
    reason: str | None = None


class IntegrationVisit(BaseModel):
    service_name: str = Field(..., min_length=2, max_length=160)
    cost_egp: int = Field(..., ge=0)
    paid_egp: int = Field(..., ge=0)
    clinical_notes: str | None = None
    chief_complaint: str | None = None
    diagnosis: str | None = None
    doctor_notes: str | None = None


class DoctorVisitSyncRequest(BaseModel):
    external_source: str = Field(default="callcenter-firebase", max_length=64)
    external_id: str = Field(..., min_length=4, max_length=128)
    completed_at: str | None = None
    patient: IntegrationPatient
    doctor: IntegrationDoctor | None = None
    appointment: IntegrationAppointment
    visit: IntegrationVisit


def _require_integration_key(
    x_integration_key: str | None = Header(default=None, alias="X-Integration-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = (settings.integration_api_key or "").strip()
    provided = (x_integration_key or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integration API key is not configured (INTEGRATION_API_KEY).",
        )
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid integration key.",
        )


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("0020") and len(digits) > 4:
        digits = "0" + digits[4:]
    elif digits.startswith("20") and len(digits) >= 11:
        digits = "0" + digits[2:]
    return digits


def _phones_match(stored: str | None, incoming: str) -> bool:
    if not stored:
        return False
    a = _normalize_phone(stored)
    b = _normalize_phone(incoming)
    if not a or not b:
        return False
    return a == b or a.endswith(b[-10:]) or b.endswith(a[-10:])


def _parse_completed_at(raw: str | None) -> datetime:
    if not raw:
        return datetime.now(UTC)
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid completed_at. Use ISO-8601 datetime.",
        ) from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _parse_appointment_start(date_str: str, time_str: str) -> datetime:
    raw = f"{date_str.strip()} {time_str.strip()}"
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %I:%M %p", "%Y-%m-%d %I:%M%p"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid appointment date/time. Use YYYY-MM-DD and HH:MM.",
    )


def _resolve_org_and_actor(session: Session, settings: Settings) -> tuple[UUID, UUID, UserRole]:
    org_id: UUID | None = None
    if settings.integration_org_id:
        try:
            org_id = UUID(settings.integration_org_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="INTEGRATION_ORG_ID is not a valid UUID.",
            ) from exc
        org = session.get(Organization, org_id)
        if org is None or not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="INTEGRATION_ORG_ID does not match an active organization.",
            )
    else:
        org = session.scalar(select(Organization).where(Organization.is_active.is_(True)).limit(1))
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No active organization found for integration.",
            )
        org_id = org.id

    user: User | None = None
    if settings.integration_user_id:
        try:
            user_id = UUID(settings.integration_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="INTEGRATION_USER_ID is not a valid UUID.",
            ) from exc
        user = session.get(User, user_id)
        if user is None or user.organization_id != org_id or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="INTEGRATION_USER_ID is invalid for this organization.",
            )
    else:
        user = session.scalar(
            select(User)
            .where(
                User.organization_id == org_id,
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
            )
            .limit(1)
        )
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No ADMIN user available for integration actor.",
            )

    return org_id, user.id, user.role


def _resolve_doctor(
    session: Session,
    organization_id: UUID,
    doctor: IntegrationDoctor | None,
) -> DoctorProfile:
    if doctor and doctor.doctor_code:
        found = session.scalar(
            select(DoctorProfile).where(
                DoctorProfile.organization_id == organization_id,
                DoctorProfile.doctor_code == doctor.doctor_code.strip(),
            )
        )
        if found:
            return found

    if doctor and doctor.display_name:
        name = doctor.display_name.strip()
        docs = session.scalars(
            select(DoctorProfile).where(DoctorProfile.organization_id == organization_id)
        ).all()
        for doc in docs:
            user = session.get(User, doc.user_id)
            if user and user.display_name.strip().lower() == name.lower():
                return doc

    fallback = session.scalar(
        select(DoctorProfile).where(DoctorProfile.organization_id == organization_id).limit(1)
    )
    if fallback is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No doctor profile found in the organization.",
        )
    return fallback


def _find_patient_by_phone(session: Session, organization_id: UUID, phone: str) -> Patient | None:
    candidates = session.scalars(
        select(Patient).where(
            Patient.organization_id == organization_id,
            Patient.deleted_at.is_(None),
            or_(Patient.phone.is_not(None), Patient.whatsapp_phone.is_not(None)),
        )
    ).all()
    for patient in candidates:
        if _phones_match(patient.phone, phone) or _phones_match(patient.whatsapp_phone, phone):
            return patient
    return None


def _create_patient(
    *,
    session: Session,
    organization_id: UUID,
    actor_user_id: UUID,
    actor_role: UserRole,
    payload: IntegrationPatient,
    doctor_id: UUID,
) -> Patient:
    max_num = session.scalar(
        select(func.coalesce(func.max(Patient.patient_number), 100)).where(
            Patient.organization_id == organization_id
        )
    )
    patient_number = (max_num or 100) + 1
    patient_code = f"DOC-{patient_number:06d}"
    notes_parts = [payload.notes or "", f"city: {payload.city}" if payload.city else ""]
    notes = " | ".join(p for p in notes_parts if p).strip() or None

    patient = Patient(
        id=uuid4(),
        organization_id=organization_id,
        patient_number=patient_number,
        patient_code=patient_code,
        full_name=payload.full_name.strip(),
        gender=payload.gender or "Male",
        phone=_normalize_phone(payload.phone) or payload.phone.strip(),
        whatsapp_phone=(
            _normalize_phone(payload.whatsapp_phone) if payload.whatsapp_phone else None
        ),
        address=payload.address,
        notes=notes,
        status=PatientStatus.ACTIVE,
    )
    session.add(patient)
    session.flush()

    session.add(
        MedicalHistory(
            id=uuid4(),
            organization_id=organization_id,
            patient_id=patient.id,
        )
    )
    session.add(
        PatientCareAssignment(
            id=uuid4(),
            organization_id=organization_id,
            patient_id=patient.id,
            doctor_id=doctor_id,
            assigned_by_user_id=actor_user_id,
            assigned_at=datetime.now(UTC),
        )
    )
    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role.value,
            action="PATIENT_CREATED",
            target_type="patients",
            target_id=patient.id,
            description=f"Synced patient {patient.full_name} ({patient.patient_code})",
            occurred_at=datetime.now(UTC),
            metadata_json={"source": "callcenter-sync", "phone": patient.phone},
        )
    )
    return patient


def _revenue_category(session: Session, organization_id: UUID) -> FinancialCategory:
    cat = session.scalar(
        select(FinancialCategory)
        .where(
            FinancialCategory.organization_id == organization_id,
            FinancialCategory.transaction_type == TransactionType.REVENUE,
            FinancialCategory.is_active.is_(True),
            FinancialCategory.name_en == "Clinical Services",
        )
        .limit(1)
    )
    if cat:
        return cat
    cat = session.scalar(
        select(FinancialCategory)
        .where(
            FinancialCategory.organization_id == organization_id,
            FinancialCategory.transaction_type == TransactionType.REVENUE,
            FinancialCategory.is_active.is_(True),
        )
        .limit(1)
    )
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No active REVENUE financial category (e.g. Clinical Services).",
        )
    return cat


@router.post(
    "/doctor-visits",
    dependencies=[Depends(_require_integration_key)],
    status_code=status.HTTP_201_CREATED,
)
def sync_doctor_visit(
    payload: DoctorVisitSyncRequest,
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if payload.visit.paid_egp > payload.visit.cost_egp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="paid_egp cannot exceed cost_egp.",
        )

    organization_id, actor_user_id, actor_role = _resolve_org_and_actor(session, settings)
    external_source = payload.external_source.strip() or "callcenter-firebase"
    external_id = payload.external_id.strip()

    existing = session.scalar(
        select(Visit).where(
            Visit.organization_id == organization_id,
            Visit.external_source == external_source,
            Visit.external_ref == external_id,
        )
    )
    if existing is not None:
        patient = session.get(Patient, existing.patient_id)
        return {
            "created": False,
            "visitId": str(existing.id),
            "appointmentId": str(existing.appointment_id) if existing.appointment_id else None,
            "patientCode": patient.patient_code if patient else None,
            "patientId": str(existing.patient_id),
            "externalId": external_id,
        }

    completed_at = _parse_completed_at(payload.completed_at)
    doctor = _resolve_doctor(session, organization_id, payload.doctor)
    patient = _find_patient_by_phone(session, organization_id, payload.patient.phone)
    patient_created = False
    if patient is None:
        patient = _create_patient(
            session=session,
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            payload=payload.patient,
            doctor_id=doctor.id,
        )
        patient_created = True

    start_dt = _parse_appointment_start(payload.appointment.date, payload.appointment.time)
    end_dt = start_dt + timedelta(minutes=payload.appointment.duration_minutes)
    reason = (
        payload.appointment.reason
        or payload.visit.service_name
        or "Home visit"
    )

    appointment = Appointment(
        id=uuid4(),
        organization_id=organization_id,
        patient_id=patient.id,
        doctor_id=doctor.id,
        starts_at=start_dt,
        ends_at=end_dt,
        duration_minutes=payload.appointment.duration_minutes,
        reason=reason,
        location=payload.appointment.location or "Home visit",
        status=AppointmentStatus.COMPLETED,
        notes=payload.visit.clinical_notes,
        created_by_user_id=actor_user_id,
        completed_at=completed_at,
    )
    session.add(appointment)
    session.flush()
    session.add(
        AppointmentStatusEvent(
            id=uuid4(),
            organization_id=organization_id,
            appointment_id=appointment.id,
            from_status=AppointmentStatus.PENDING,
            to_status=AppointmentStatus.COMPLETED,
            changed_by_user_id=actor_user_id,
            reason="Synced completed visit from doctor app",
            occurred_at=completed_at,
        )
    )

    cost_egp = int(payload.visit.cost_egp)
    paid_egp = int(payload.visit.paid_egp)
    shares = visit_share_snapshot(session, None)
    clinical = (payload.visit.clinical_notes or "").strip() or None

    visit = Visit(
        id=uuid4(),
        organization_id=organization_id,
        patient_id=patient.id,
        doctor_id=doctor.id,
        appointment_id=appointment.id,
        occurred_at=completed_at,
        chief_complaint=payload.visit.chief_complaint or clinical,
        clinical_findings=clinical,
        diagnosis_text=payload.visit.diagnosis or clinical,
        doctor_notes=payload.visit.doctor_notes,
        treatment_notes=None,
        status=VisitStatus.COMPLETED,
        total_cost_minor=cost_egp * 100,
        paid_amount_minor=paid_egp * 100,
        case_cost_minor=0,
        case_cost_note=None,
        source_stream_id=None,
        doctor_share_percent=shares["doctor"],
        assistant_share_percent=shares["assistant"],
        referral_share_percent=shares["referral"],
        org_share_percent=shares["org"],
        external_source=external_source,
        external_ref=external_id,
    )
    session.add(visit)
    session.flush()
    persist_doctor_month_shares(session, doctor.id, completed_at)

    session.add(
        VisitProcedure(
            id=uuid4(),
            organization_id=organization_id,
            visit_id=visit.id,
            procedure_name=payload.visit.service_name.strip(),
            cost_minor=cost_egp * 100,
            currency_code="EGP",
            status=ProcedureStatus.COMPLETED,
            performed_at=completed_at,
            notes="Synced from doctor app",
        )
    )

    if paid_egp > 0:
        cat = _revenue_category(session, organization_id)
        remaining = cost_egp - paid_egp
        payment_note = (
            f"Partial payment {paid_egp} of {cost_egp} EGP (remaining {remaining})"
            if remaining > 0
            else f"Full payment {paid_egp} EGP"
        )
        session.add(
            FinancialTransaction(
                id=uuid4(),
                organization_id=organization_id,
                type=TransactionType.REVENUE,
                category_id=cat.id,
                amount_minor=paid_egp * 100,
                currency_code="EGP",
                description=(
                    f"{payment_note}: {payload.visit.service_name} - "
                    f"{patient.full_name} ({patient.patient_code}) [callcenter-sync]"
                ),
                patient_id=patient.id,
                visit_id=visit.id,
                doctor_id=doctor.id,
                effective_on=completed_at.date(),
                status=TransactionStatus.POSTED,
                created_by_user_id=actor_user_id,
            )
        )

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role.value,
            action="VISIT_SYNCED",
            target_type="visits",
            target_id=visit.id,
            description=f"Synced visit for {patient.full_name} ({patient.patient_code})",
            occurred_at=datetime.now(UTC),
            metadata_json={
                "external_source": external_source,
                "external_id": external_id,
                "patient_created": patient_created,
                "cost_egp": cost_egp,
                "paid_egp": paid_egp,
                "service_name": payload.visit.service_name,
            },
        )
    )
    session.commit()

    return {
        "created": True,
        "visitId": str(visit.id),
        "appointmentId": str(appointment.id),
        "patientCode": patient.patient_code,
        "patientId": str(patient.id),
        "patientCreated": patient_created,
        "externalId": external_id,
        "totalEgp": cost_egp,
        "paidEgp": paid_egp,
    }


@router.get("/health", dependencies=[Depends(_require_integration_key)])
def integration_health(
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    organization_id, actor_user_id, _ = _resolve_org_and_actor(session, settings)
    return {
        "ok": True,
        "organizationId": str(organization_id),
        "actorUserId": str(actor_user_id),
        "endpoint": "/api/v1/integrations/doctor-visits",
    }
