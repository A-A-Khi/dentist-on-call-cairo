from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf
from app.models.audit import AuditLog
from app.models.enums import PatientStatus
from app.models.identity import DoctorProfile, User
from app.models.patients import (
    DentalHistory,
    MedicalHistory,
    Patient,
    PatientCareAssignment,
)

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
    assigned_doctor_id: UUID | None = None
    medical_history: MedicalHistoryPayload | None = None
    dental_history: DentalHistoryPayload | None = None


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

    result = []
    for p in patients:
        age = _calculate_age(p.date_of_birth)

        # Get assigned doctor
        doctor_name = "Dr. Tarek Omar"
        care_assignment = session.scalar(
            select(PatientCareAssignment)
            .where(
                PatientCareAssignment.patient_id == p.id,
                PatientCareAssignment.unassigned_at.is_(None),
            )
            .order_by(PatientCareAssignment.assigned_at.desc())
            .limit(1)
        )
        if care_assignment:
            doc_profile = session.get(DoctorProfile, care_assignment.doctor_id)
            if doc_profile:
                doc_user = session.get(User, doc_profile.user_id)
                if doc_user:
                    doctor_name = doc_user.display_name

        # Extract medical alerts
        alerts: list[str] = []
        med = session.scalar(select(MedicalHistory).where(MedicalHistory.patient_id == p.id))
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
                "assignedDoctor": doctor_name,
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
        },
    )
    session.add(audit)
    session.commit()

    return {
        "id": str(patient.id),
        "code": patient.patient_code,
        "fullName": patient.full_name,
        "status": patient.status.value,
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

    med = session.scalar(select(MedicalHistory).where(MedicalHistory.patient_id == patient.id))
    dental = session.scalar(select(DentalHistory).where(DentalHistory.patient_id == patient.id))

    alerts = []
    if med and med.drug_allergies_text:
        alerts.append(f"Allergy: {med.drug_allergies_text}")
    if med and med.conditions_text:
        alerts.append(med.conditions_text)

    # Care team
    doctor_name = "Dr. Tarek Omar"
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
