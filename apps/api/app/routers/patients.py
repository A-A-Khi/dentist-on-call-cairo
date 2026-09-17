from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.auth.dependencies import (
    CurrentUser,
    DatabaseSession,
    current_doctor_profile_id,
    ensure_patient_access,
    patient_access_clause,
    require_csrf,
    require_roles,
)
from app.models.audit import AuditLog
from app.models.enums import PatientStatus, UserRole
from app.models.identity import DoctorProfile, User
from app.models.operations import CaseStream
from app.models.patients import (
    DentalHistory,
    MedicalHistory,
    Patient,
    PatientCareAssignment,
)
from app.services.clinical_purge import purge_patient_clinical_and_money

router = APIRouter(prefix="/patients", tags=["patients"])


class EmergencyContact(BaseModel):
    name: str = ""
    relationship: str = ""
    phone: str = ""


class MedicalHistoryPayload(BaseModel):
    allergies: str | None = None
    conditions: str | None = None
    medications: str | None = None
    surgeries: str | None = None
    smoking_status: str | None = None
    additional_notes: str | None = None


class DentalHistoryPayload(BaseModel):
    previous_treatment: str | None = None
    extractions: str | None = None
    root_canals: str | None = None
    gum_problems: str | None = None
    sensitivity: str | None = None
    other: str | None = None


class PatientCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    date_of_birth: date | None = None
    gender: str | None = "Male"
    phone: str | None = None
    whatsapp_phone: str | None = None
    email: str | None = None
    address: str | None = None
    emergency_contact: EmergencyContact | None = None
    notes: str | None = None
    source_stream_id: UUID | None = None
    assigned_doctor_id: UUID | None = None
    medical_history: MedicalHistoryPayload | None = None
    dental_history: DentalHistoryPayload | None = None


class PatientUpdateRequest(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    date_of_birth: date | None = None
    gender: str | None = None
    phone: str | None = None
    whatsapp_phone: str | None = None
    email: str | None = None
    address: str | None = None
    emergency_contact: EmergencyContact | None = None
    notes: str | None = None
    source_stream_id: UUID | None = None
    assigned_doctor_id: UUID | None = None
    status: str | None = None
    medical_history: MedicalHistoryPayload | None = None
    dental_history: DentalHistoryPayload | None = None


def _stream_name(session: DatabaseSession, stream_id: UUID | None) -> str | None:
    if not stream_id:
        return None
    stream = session.get(CaseStream, stream_id)
    return stream.name_en if stream else None


def _calculate_age(dob: date | None) -> int:
    if not dob:
        return 0
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


@router.get("")
def list_patients(
    current_user: CurrentUser,
    session: DatabaseSession,
    q: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
) -> list[dict[str, Any]]:
    query = select(Patient).where(
        Patient.organization_id == current_user.organization_id,
        Patient.deleted_at.is_(None),
    )

    if current_user.role != UserRole.ADMIN:
        doctor_id = current_doctor_profile_id(session, current_user=current_user)
        access = patient_access_clause(current_user, doctor_id)
        if access is False:
            return []
        if access is not True:
            query = query.where(access)

    if q:
        search = f"%{q.strip()}%"
        query = query.where(
            or_(
                Patient.full_name.ilike(search),
                Patient.patient_code.ilike(search),
                Patient.phone.ilike(search),
            )
        )

    if status_filter and status_filter != "ALL":
        try:
            status_enum = PatientStatus(status_filter)
            query = query.where(Patient.status == status_enum)
        except ValueError:
            pass

    query = query.order_by(Patient.created_at.desc())
    patients = session.scalars(query).all()
    if not patients:
        return []

    patient_ids = [p.id for p in patients]

    # Batch active care assignments (latest per patient).
    care_rows = session.execute(
        select(PatientCareAssignment, User.display_name)
        .join(DoctorProfile, DoctorProfile.id == PatientCareAssignment.doctor_id)
        .join(User, User.id == DoctorProfile.user_id)
        .where(
            PatientCareAssignment.patient_id.in_(patient_ids),
            PatientCareAssignment.unassigned_at.is_(None),
        )
        .order_by(PatientCareAssignment.assigned_at.desc())
    ).all()
    doctor_by_patient: dict[UUID, str] = {}
    for assignment, display_name in care_rows:
        if assignment.patient_id not in doctor_by_patient:
            doctor_by_patient[assignment.patient_id] = display_name or "Unassigned"

    # Batch medical histories.
    med_rows = session.scalars(
        select(MedicalHistory).where(MedicalHistory.patient_id.in_(patient_ids))
    ).all()
    med_by_patient = {m.patient_id: m for m in med_rows}

    # Batch case stream names.
    stream_ids = {p.source_stream_id for p in patients if p.source_stream_id}
    stream_name_by_id: dict[UUID, str] = {}
    if stream_ids:
        streams = session.scalars(select(CaseStream).where(CaseStream.id.in_(stream_ids))).all()
        stream_name_by_id = {s.id: s.name_en for s in streams}

    result = []
    for p in patients:
        age = _calculate_age(p.date_of_birth)
        alerts: list[str] = []
        med = med_by_patient.get(p.id)
        if med and med.drug_allergies_text:
            alerts.append(f"Allergy: {med.drug_allergies_text}")
        if med and med.conditions_text:
            alerts.append(med.conditions_text)

        result.append(
            {
                "id": str(p.id),
                "code": p.patient_code,
                "fullName": p.full_name,
                "dob": p.date_of_birth.isoformat() if p.date_of_birth else "",
                "age": age,
                "gender": p.gender or "Male",
                "phone": p.phone or "—",
                "whatsappPhone": p.whatsapp_phone or "—",
                "email": p.email or "",
                "address": p.address or "",
                "sourceStreamId": str(p.source_stream_id) if p.source_stream_id else None,
                "sourceStream": stream_name_by_id.get(p.source_stream_id) if p.source_stream_id else None,
                "assignedDoctor": doctor_by_patient.get(p.id, "Unassigned"),
                "status": "Active" if p.status == PatientStatus.ACTIVE else p.status.value,
                "lastVisit": p.created_at.strftime("%Y-%m-%d"),
                "nextAppointment": None,
                "medicalAlerts": alerts,
            }
        )

    return result


@router.post("", dependencies=[Depends(require_csrf)], status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    max_num = session.scalar(
        select(func.coalesce(func.max(Patient.patient_number), 100)).where(
            Patient.organization_id == current_user.organization_id
        )
    )
    patient_number = (max_num or 100) + 1
    patient_code = f"DOC-{patient_number:06d}"

    source_stream_id = payload.source_stream_id
    if source_stream_id is not None:
        stream = session.get(CaseStream, source_stream_id)
        if (
            stream is None
            or stream.organization_id != current_user.organization_id
            or not stream.is_active
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid case stream.")

    patient = Patient(
        id=uuid4(),
        organization_id=current_user.organization_id,
        patient_number=patient_number,
        patient_code=patient_code,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        phone=payload.phone,
        whatsapp_phone=payload.whatsapp_phone,
        email=payload.email,
        address=payload.address,
        emergency_contact=payload.emergency_contact.model_dump() if payload.emergency_contact else None,
        notes=payload.notes,
        source_stream_id=source_stream_id,
        status=PatientStatus.ACTIVE,
    )
    session.add(patient)
    session.flush()

    # Medical History
    if payload.medical_history:
        med_history = MedicalHistory(
            id=uuid4(),
            organization_id=current_user.organization_id,
            patient_id=patient.id,
            conditions_text=payload.medical_history.conditions,
            medications_text=payload.medical_history.medications,
            drug_allergies_text=payload.medical_history.allergies,
            surgeries_text=payload.medical_history.surgeries,
            smoking_status=payload.medical_history.smoking_status,
            additional_notes=payload.medical_history.additional_notes,
        )
        session.add(med_history)

    # Dental History
    if payload.dental_history:
        dental_history = DentalHistory(
            id=uuid4(),
            organization_id=current_user.organization_id,
            patient_id=patient.id,
            previous_treatment_text=payload.dental_history.previous_treatment,
            extractions_text=payload.dental_history.extractions,
            root_canal_text=payload.dental_history.root_canals,
            gum_problems_text=payload.dental_history.gum_problems,
            sensitivity_text=payload.dental_history.sensitivity,
            other_text=payload.dental_history.other,
        )
        session.add(dental_history)

    # Doctor assignment
    doc_id = payload.assigned_doctor_id
    if not doc_id and current_user.role == UserRole.DOCTOR:
        own_profile = current_doctor_profile_id(session, current_user=current_user)
        if own_profile:
            doc_id = own_profile
    if not doc_id:
        # Default to first active doctor
        doc_profile = session.scalar(
            select(DoctorProfile).where(DoctorProfile.organization_id == current_user.organization_id).limit(1)
        )
        if doc_profile:
            doc_id = doc_profile.id

    if doc_id:
        assignment = PatientCareAssignment(
            id=uuid4(),
            organization_id=current_user.organization_id,
            patient_id=patient.id,
            doctor_id=doc_id,
            assigned_by_user_id=current_user.user_id,
            assigned_at=datetime.now(UTC),
        )
        session.add(assignment)

    # Audit log
    audit = AuditLog(
        id=uuid4(),
        organization_id=current_user.organization_id,
        actor_user_id=current_user.user_id,
        actor_role=current_user.role.value,
        action="PATIENT_CREATED",
        target_type="patients",
        target_id=patient.id,
        description=f"Created patient {patient.full_name} ({patient.patient_code})",
        occurred_at=datetime.now(UTC),
        metadata_json={
            "patient_code": patient.patient_code,
            "full_name": patient.full_name,
            "source_stream_id": str(source_stream_id) if source_stream_id else None,
        },
    )
    session.add(audit)
    session.commit()

    return {
        "id": str(patient.id),
        "code": patient.patient_code,
        "fullName": patient.full_name,
        "status": patient.status.value,
        "sourceStreamId": str(source_stream_id) if source_stream_id else None,
        "sourceStream": _stream_name(session, source_stream_id),
    }


@router.get("/{patient_identifier}")
def get_patient(
    patient_identifier: str,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    query = select(Patient).where(
        Patient.organization_id == current_user.organization_id,
        Patient.deleted_at.is_(None),
    )
    try:
        uuid_obj = UUID(patient_identifier)
        query = query.where(or_(Patient.id == uuid_obj, Patient.patient_code == patient_identifier))
    except ValueError:
        query = query.where(Patient.patient_code == patient_identifier)

    patient = session.scalar(query)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)

    med = session.scalar(select(MedicalHistory).where(MedicalHistory.patient_id == patient.id))
    dental = session.scalar(select(DentalHistory).where(DentalHistory.patient_id == patient.id))

    alerts = []
    if med and med.drug_allergies_text:
        alerts.append(f"Allergy: {med.drug_allergies_text}")
    if med and med.conditions_text:
        alerts.append(med.conditions_text)

    # Care team
    doctor_name = "Unassigned"
    assignment = session.scalar(
        select(PatientCareAssignment)
        .where(
            PatientCareAssignment.patient_id == patient.id,
            PatientCareAssignment.unassigned_at.is_(None),
        )
        .order_by(PatientCareAssignment.assigned_at.desc())
        .limit(1)
    )
    if assignment:
        doc_profile = session.get(DoctorProfile, assignment.doctor_id)
        if doc_profile:
            doc_user = session.get(User, doc_profile.user_id)
            if doc_user:
                doctor_name = doc_user.display_name

    return {
        "id": str(patient.id),
        "code": patient.patient_code,
        "fullName": patient.full_name,
        "dob": patient.date_of_birth.isoformat() if patient.date_of_birth else "",
        "age": _calculate_age(patient.date_of_birth),
        "gender": patient.gender or "Male",
        "phone": patient.phone or "—",
        "whatsappPhone": patient.whatsapp_phone or "—",
        "email": patient.email or "",
        "address": patient.address or "",
        "sourceStreamId": str(patient.source_stream_id) if patient.source_stream_id else None,
        "sourceStream": _stream_name(session, patient.source_stream_id),
        "emergencyContact": patient.emergency_contact or {"name": "—", "relationship": "—", "phone": "—"},
        "assignedDoctor": doctor_name,
        "status": "Active" if patient.status == PatientStatus.ACTIVE else patient.status.value,
        "lastVisit": patient.created_at.strftime("%Y-%m-%d"),
        "nextAppointment": None,
        "medicalAlerts": alerts,
        "medicalHistory": {
            "allergies": med.drug_allergies_text if med else "None reported",
            "conditions": [med.conditions_text] if (med and med.conditions_text) else [],
            "medications": med.medications_text if med else "None",
            "surgeries": med.surgeries_text if med else "None",
            "smokingStatus": med.smoking_status if med else "Non-smoker",
            "additionalNotes": med.additional_notes if med else "",
        },
        "dentalHistory": {
            "previousTreatment": dental.previous_treatment_text if dental else "None",
            "extractions": dental.extractions_text if dental else "None",
            "rootCanals": dental.root_canal_text if dental else "None",
            "gumProblems": dental.gum_problems_text if dental else "None",
            "sensitivity": dental.sensitivity_text if dental else "None",
            "lastVisitDate": "None",
        },
    }


def _resolve_patient(
    session: DatabaseSession,
    organization_id: UUID,
    patient_identifier: str,
) -> Patient | None:
    query = select(Patient).where(
        Patient.organization_id == organization_id,
        Patient.deleted_at.is_(None),
    )
    try:
        uuid_obj = UUID(patient_identifier)
        query = query.where(or_(Patient.id == uuid_obj, Patient.patient_code == patient_identifier))
    except ValueError:
        query = query.where(Patient.patient_code == patient_identifier)
    return session.scalar(query)


@router.patch("/{patient_identifier}", dependencies=[Depends(require_csrf)])
def update_patient(
    patient_identifier: str,
    payload: PatientUpdateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    patient = _resolve_patient(session, current_user.organization_id, patient_identifier)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)

    if payload.full_name is not None:
        patient.full_name = payload.full_name
    if "date_of_birth" in payload.model_fields_set:
        patient.date_of_birth = payload.date_of_birth
    if payload.gender is not None:
        patient.gender = payload.gender
    if "phone" in payload.model_fields_set:
        patient.phone = payload.phone
    if "whatsapp_phone" in payload.model_fields_set:
        patient.whatsapp_phone = payload.whatsapp_phone
    if "email" in payload.model_fields_set:
        patient.email = payload.email
    if "address" in payload.model_fields_set:
        patient.address = payload.address
    if "notes" in payload.model_fields_set:
        patient.notes = payload.notes
    if payload.emergency_contact is not None:
        patient.emergency_contact = payload.emergency_contact.model_dump()

    admin_only_fields = {"source_stream_id", "assigned_doctor_id", "status"}
    if current_user.role != UserRole.ADMIN and admin_only_fields & payload.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can change referral stream, assignment, or patient status.",
        )

    if "source_stream_id" in payload.model_fields_set:
        source_stream_id = payload.source_stream_id
        if source_stream_id is not None:
            stream = session.get(CaseStream, source_stream_id)
            if (
                stream is None
                or stream.organization_id != current_user.organization_id
                or not stream.is_active
            ):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid case stream.")
        patient.source_stream_id = source_stream_id

    if payload.status is not None:
        try:
            patient.status = PatientStatus(payload.status.upper())
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status.") from exc

    if payload.medical_history is not None:
        med = session.scalar(select(MedicalHistory).where(MedicalHistory.patient_id == patient.id))
        if med is None:
            med = MedicalHistory(
                id=uuid4(),
                organization_id=current_user.organization_id,
                patient_id=patient.id,
            )
            session.add(med)
        mh = payload.medical_history
        if "allergies" in mh.model_fields_set:
            med.drug_allergies_text = mh.allergies
        if "conditions" in mh.model_fields_set:
            med.conditions_text = mh.conditions
        if "medications" in mh.model_fields_set:
            med.medications_text = mh.medications
        if "surgeries" in mh.model_fields_set:
            med.surgeries_text = mh.surgeries
        if "smoking_status" in mh.model_fields_set:
            med.smoking_status = mh.smoking_status
        if "additional_notes" in mh.model_fields_set:
            med.additional_notes = mh.additional_notes

    if payload.dental_history is not None:
        dental = session.scalar(select(DentalHistory).where(DentalHistory.patient_id == patient.id))
        if dental is None:
            dental = DentalHistory(
                id=uuid4(),
                organization_id=current_user.organization_id,
                patient_id=patient.id,
            )
            session.add(dental)
        dh = payload.dental_history
        if "previous_treatment" in dh.model_fields_set:
            dental.previous_treatment_text = dh.previous_treatment
        if "extractions" in dh.model_fields_set:
            dental.extractions_text = dh.extractions
        if "root_canals" in dh.model_fields_set:
            dental.root_canal_text = dh.root_canals
        if "gum_problems" in dh.model_fields_set:
            dental.gum_problems_text = dh.gum_problems
        if "sensitivity" in dh.model_fields_set:
            dental.sensitivity_text = dh.sensitivity
        if "other" in dh.model_fields_set:
            dental.other_text = dh.other

    if payload.assigned_doctor_id is not None:
        doc = session.get(DoctorProfile, payload.assigned_doctor_id)
        if doc is None or doc.organization_id != current_user.organization_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid doctor.")
        active = session.scalars(
            select(PatientCareAssignment).where(
                PatientCareAssignment.patient_id == patient.id,
                PatientCareAssignment.unassigned_at.is_(None),
            )
        ).all()
        now = datetime.now(UTC)
        for assignment in active:
            if assignment.doctor_id != payload.assigned_doctor_id:
                assignment.unassigned_at = now
        if not any(a.doctor_id == payload.assigned_doctor_id for a in active):
            session.add(
                PatientCareAssignment(
                    id=uuid4(),
                    organization_id=current_user.organization_id,
                    patient_id=patient.id,
                    doctor_id=payload.assigned_doctor_id,
                    assigned_by_user_id=current_user.user_id,
                    assigned_at=now,
                )
            )

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="PATIENT_UPDATED",
            target_type="patients",
            target_id=patient.id,
            description=f"Updated patient {patient.full_name} ({patient.patient_code})",
            occurred_at=datetime.now(UTC),
            metadata_json={"patient_code": patient.patient_code, "fields": sorted(payload.model_fields_set)},
        )
    )
    session.commit()

    return get_patient(patient.patient_code, current_user, session)


@router.delete(
    "/{patient_identifier}",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
def delete_patient(
    patient_identifier: str,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Admin-only: soft-delete patient and purge visits, reservations, and money."""
    patient = _resolve_patient(session, current_user.organization_id, patient_identifier)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    now = datetime.now(UTC)
    purge_stats = purge_patient_clinical_and_money(session, patient.id, now=now)

    patient.deleted_at = now
    if patient.status == PatientStatus.ACTIVE:
        patient.status = PatientStatus.INACTIVE

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="PATIENT_DELETED",
            target_type="patients",
            target_id=patient.id,
            description=(
                f"Deleted patient {patient.full_name} ({patient.patient_code}) "
                f"— purged {purge_stats.get('visits', 0)} visit(s), "
                f"{purge_stats.get('transactions', 0) + purge_stats.get('orphanTransactions', 0)} ledger row(s)"
            ),
            occurred_at=now,
            metadata_json={
                "patient_code": patient.patient_code,
                **purge_stats,
            },
        )
    )
    session.commit()
    return {
        "id": str(patient.id),
        "code": patient.patient_code,
        "deleted": True,
        "purged": purge_stats,
    }
