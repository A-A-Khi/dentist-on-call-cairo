from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf
from app.models.audit import AuditLog
from app.models.enums import ProcedureStatus, TransactionStatus, TransactionType, VisitStatus
from app.models.identity import DoctorProfile, User
from app.models.operations import FinancialCategory, FinancialTransaction
from app.models.patients import Patient, Visit, VisitProcedure

router = APIRouter(tags=["visits"])


class ProcedureInput(BaseModel):
    name: str = Field(..., min_length=2)
    tooth_number: str | None = None
    cost_egp: int = 0
    notes: str | None = None


class VisitCreateRequest(BaseModel):
    chief_complaint: str | None = None
    clinical_findings: str | None = None
    diagnosis: str | None = None
    doctor_notes: str | None = None
    prescriptions: str | None = None
    procedures: list[ProcedureInput] = []
    status: str = "Completed"


@router.get("/patients/{patient_identifier}/visits")
def list_patient_visits(
    patient_identifier: str,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
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
        return []

    visits = session.scalars(
        select(Visit)
        .where(Visit.patient_id == patient.id)
        .order_by(Visit.occurred_at.desc())
    ).all()

    result = []
    for v in visits:
        doc = session.get(DoctorProfile, v.doctor_id)
        doc_user = session.get(User, doc.user_id) if doc else None
        doctor_name = doc_user.display_name if doc_user else "Dr. Tarek Omar"

        procs = session.scalars(
            select(VisitProcedure).where(VisitProcedure.visit_id == v.id)
        ).all()

        result.append(
            {
                "id": str(v.id),
                "patientId": patient.patient_code,
                "doctorName": doctor_name,
                "date": v.occurred_at.strftime("%Y-%m-%d"),
                "time": v.occurred_at.strftime("%I:%M %p"),
                "chiefComplaint": v.chief_complaint or "—",
                "clinicalFindings": v.clinical_findings or "—",
                "diagnosis": v.diagnosis_text or "—",
                "procedures": [
                    {
                        "id": str(p.id),
                        "name": p.procedure_name,
                        "toothNumber": p.notes,
                        "costEGP": (p.cost_minor // 100) if p.cost_minor else 0,
                        "status": "Completed" if p.status == ProcedureStatus.COMPLETED else "Planned",
                    }
                    for p in procs
                ],
                "attachments": [],
                "doctorNotes": v.doctor_notes or "—",
                "prescriptions": [v.treatment_notes] if v.treatment_notes else [],
                "status": "Completed" if v.status == VisitStatus.COMPLETED else "Draft",
            }
        )

    return result


@router.post("/patients/{patient_identifier}/visits", dependencies=[Depends(require_csrf)], status_code=status.HTTP_201_CREATED)
def create_visit(
    patient_identifier: str,
    payload: VisitCreateRequest,
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

    doc_profile = session.scalar(
        select(DoctorProfile).where(DoctorProfile.organization_id == current_user.organization_id).limit(1)
    )
    if not doc_profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active doctor on duty.")

    visit_status_enum = VisitStatus.COMPLETED if payload.status.upper() == "COMPLETED" else VisitStatus.DRAFT

    visit = Visit(
        id=uuid4(),
        organization_id=current_user.organization_id,
        patient_id=patient.id,
        doctor_id=doc_profile.id,
        occurred_at=datetime.now(UTC),
        chief_complaint=payload.chief_complaint,
        clinical_findings=payload.clinical_findings,
        diagnosis_text=payload.diagnosis,
        doctor_notes=payload.doctor_notes,
        treatment_notes=payload.prescriptions,
        status=visit_status_enum,
    )
    session.add(visit)
    session.flush()

    total_cost_egp = 0
    for p in payload.procedures:
        cost_minor = p.cost_egp * 100
        total_cost_egp += p.cost_egp
        proc = VisitProcedure(
            id=uuid4(),
            organization_id=current_user.organization_id,
            visit_id=visit.id,
            procedure_name=p.name,
            cost_minor=cost_minor,
            currency_code="EGP",
            notes=p.tooth_number,
            status=ProcedureStatus.COMPLETED if visit_status_enum == VisitStatus.COMPLETED else ProcedureStatus.PLANNED,
            performed_at=datetime.now(UTC) if visit_status_enum == VisitStatus.COMPLETED else None,
        )
        session.add(proc)

    # If completed and procedures had costs, automatically post a revenue transaction!
    if visit_status_enum == VisitStatus.COMPLETED and total_cost_egp > 0:
        cat = session.scalar(
            select(FinancialCategory).where(
                FinancialCategory.organization_id == current_user.organization_id,
                FinancialCategory.transaction_type == TransactionType.REVENUE,
            ).limit(1)
        )
        if cat:
            proc_details = [
                f"{p.name} (#{p.tooth_number})" if p.tooth_number else p.name
                for p in payload.procedures
            ]
            proc_str = ", ".join(proc_details) if proc_details else "Treatment"
            tx = FinancialTransaction(
                id=uuid4(),
                organization_id=current_user.organization_id,
                type=TransactionType.REVENUE,
                category_id=cat.id,
                amount_minor=total_cost_egp * 100,
                currency_code="EGP",
                description=f"Procedures fee: {proc_str} - {patient.full_name} ({patient.patient_code})",
                patient_id=patient.id,
                visit_id=visit.id,
                doctor_id=doc_profile.id,
                effective_on=date.today(),
                status=TransactionStatus.POSTED,
                created_by_user_id=current_user.user_id,
            )
            session.add(tx)

    # Audit log
    audit = AuditLog(
        id=uuid4(),
        organization_id=current_user.organization_id,
        actor_user_id=current_user.user_id,
        actor_role=current_user.role.value,
        action="VISIT_RECORDED",
        target_type="visits",
        target_id=visit.id,
        description=f"Recorded clinical visit for {patient.full_name} ({patient.patient_code})",
        occurred_at=datetime.now(UTC),
        metadata_json={
            "patient_code": patient.patient_code,
            "procedures_count": len(payload.procedures),
            "total_egp": total_cost_egp,
        },
    )
    session.add(audit)
    session.commit()

    return {
        "id": str(visit.id),
        "patientCode": patient.patient_code,
        "status": visit.status.value,
    }
