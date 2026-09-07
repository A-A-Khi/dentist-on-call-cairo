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
    paid_egp: int | None = None


class VisitPaymentRequest(BaseModel):
    amount_egp: int = Field(..., gt=0)


def _egp(minor: int | None) -> int:
    return (minor or 0) // 100


def _resolve_patient(session: DatabaseSession, organization_id: UUID, patient_identifier: str) -> Patient | None:
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


def _doctor_name(session: DatabaseSession, doctor_id: UUID) -> str:
    doc = session.get(DoctorProfile, doctor_id)
    doc_user = session.get(User, doc.user_id) if doc else None
    return doc_user.display_name if doc_user else "—"


def _revenue_category(session: DatabaseSession, organization_id: UUID) -> FinancialCategory | None:
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
    return session.scalar(
        select(FinancialCategory)
        .where(
            FinancialCategory.organization_id == organization_id,
            FinancialCategory.transaction_type == TransactionType.REVENUE,
            FinancialCategory.is_active.is_(True),
        )
        .limit(1)
    )


def _serialize_visit(
    session: DatabaseSession,
    visit: Visit,
    patient: Patient,
) -> dict[str, Any]:
    procs = session.scalars(select(VisitProcedure).where(VisitProcedure.visit_id == visit.id)).all()
    total = _egp(visit.total_cost_minor)
    paid = _egp(visit.paid_amount_minor)
    return {
        "id": str(visit.id),
        "patientId": patient.patient_code,
        "patientName": patient.full_name,
        "doctorName": _doctor_name(session, visit.doctor_id),
        "date": visit.occurred_at.strftime("%Y-%m-%d"),
        "time": visit.occurred_at.strftime("%I:%M %p"),
        "chiefComplaint": visit.chief_complaint or "—",
        "clinicalFindings": visit.clinical_findings or "—",
        "diagnosis": visit.diagnosis_text or "—",
        "procedures": [
            {
                "id": str(p.id),
                "name": p.procedure_name,
                "toothNumber": p.notes,
                "costEGP": _egp(p.cost_minor),
                "status": "Completed" if p.status == ProcedureStatus.COMPLETED else "Planned",
            }
            for p in procs
        ],
        "attachments": [],
        "doctorNotes": visit.doctor_notes or "—",
        "prescriptions": [visit.treatment_notes] if visit.treatment_notes else [],
        "status": "Completed" if visit.status == VisitStatus.COMPLETED else "Draft",
        "totalCostEGP": total,
        "paidAmountEGP": paid,
        "remainingEGP": max(total - paid, 0),
    }


def _post_visit_revenue(
    *,
    session: DatabaseSession,
    organization_id: UUID,
    user_id: UUID,
    patient: Patient,
    visit: Visit,
    doctor_id: UUID,
    amount_egp: int,
    description: str,
) -> None:
    if amount_egp <= 0:
        return
    cat = _revenue_category(session, organization_id)
    if not cat:
        return
    session.add(
        FinancialTransaction(
            id=uuid4(),
            organization_id=organization_id,
            type=TransactionType.REVENUE,
            category_id=cat.id,
            amount_minor=amount_egp * 100,
            currency_code="EGP",
            description=description,
            patient_id=patient.id,
            visit_id=visit.id,
            doctor_id=doctor_id,
            effective_on=date.today(),
            status=TransactionStatus.POSTED,
            created_by_user_id=user_id,
        )
    )


@router.get("/visits/outstanding")
def list_outstanding_visits(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    visits = session.scalars(
        select(Visit)
        .where(
            Visit.organization_id == current_user.organization_id,
            Visit.paid_amount_minor < Visit.total_cost_minor,
            Visit.total_cost_minor > 0,
        )
        .order_by(Visit.occurred_at.desc())
    ).all()

    result: list[dict[str, Any]] = []
    for visit in visits:
        patient = session.get(Patient, visit.patient_id)
        if not patient or patient.deleted_at is not None:
            continue
        result.append(_serialize_visit(session, visit, patient))
    return result


@router.get("/patients/{patient_identifier}/visits")
def list_patient_visits(
    patient_identifier: str,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    patient = _resolve_patient(session, current_user.organization_id, patient_identifier)
    if not patient:
        return []

    visits = session.scalars(
        select(Visit).where(Visit.patient_id == patient.id).order_by(Visit.occurred_at.desc())
    ).all()

    return [_serialize_visit(session, v, patient) for v in visits]


@router.post(
    "/patients/{patient_identifier}/visits",
    dependencies=[Depends(require_csrf)],
    status_code=status.HTTP_201_CREATED,
)
def create_visit(
    patient_identifier: str,
    payload: VisitCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    patient = _resolve_patient(session, current_user.organization_id, patient_identifier)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    doc_profile = session.scalar(
        select(DoctorProfile).where(DoctorProfile.organization_id == current_user.organization_id).limit(1)
    )
    if not doc_profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active doctor on duty.")

    visit_status_enum = VisitStatus.COMPLETED if payload.status.upper() == "COMPLETED" else VisitStatus.DRAFT

    total_cost_egp = sum(max(p.cost_egp, 0) for p in payload.procedures)
    paid_egp = total_cost_egp if payload.paid_egp is None else max(0, min(payload.paid_egp, total_cost_egp))

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
        total_cost_minor=total_cost_egp * 100,
        paid_amount_minor=paid_egp * 100,
    )
    session.add(visit)
    session.flush()

    for p in payload.procedures:
        cost_minor = max(p.cost_egp, 0) * 100
        session.add(
            VisitProcedure(
                id=uuid4(),
                organization_id=current_user.organization_id,
                visit_id=visit.id,
                procedure_name=p.name,
                cost_minor=cost_minor,
                currency_code="EGP",
                notes=p.tooth_number,
                status=ProcedureStatus.COMPLETED
                if visit_status_enum == VisitStatus.COMPLETED
                else ProcedureStatus.PLANNED,
                performed_at=datetime.now(UTC) if visit_status_enum == VisitStatus.COMPLETED else None,
            )
        )

    if visit_status_enum == VisitStatus.COMPLETED and paid_egp > 0:
        proc_details = [
            f"{p.name} (#{p.tooth_number})" if p.tooth_number else p.name for p in payload.procedures
        ]
        proc_str = ", ".join(proc_details) if proc_details else "Treatment"
        remaining = total_cost_egp - paid_egp
        payment_note = (
            f"Partial payment {paid_egp} of {total_cost_egp} EGP (remaining {remaining})"
            if remaining > 0
            else f"Full payment {paid_egp} EGP"
        )
        _post_visit_revenue(
            session=session,
            organization_id=current_user.organization_id,
            user_id=current_user.user_id,
            patient=patient,
            visit=visit,
            doctor_id=doc_profile.id,
            amount_egp=paid_egp,
            description=f"{payment_note}: {proc_str} - {patient.full_name} ({patient.patient_code})",
        )

    session.add(
        AuditLog(
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
                "paid_egp": paid_egp,
                "remaining_egp": total_cost_egp - paid_egp,
            },
        )
    )
    session.commit()

    return {
        "id": str(visit.id),
        "patientCode": patient.patient_code,
        "status": visit.status.value,
        "totalCostEGP": total_cost_egp,
        "paidAmountEGP": paid_egp,
        "remainingEGP": total_cost_egp - paid_egp,
    }


@router.post("/visits/{visit_id}/payments", dependencies=[Depends(require_csrf)])
def record_visit_payment(
    visit_id: UUID,
    payload: VisitPaymentRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    visit = session.scalar(
        select(Visit).where(
            Visit.id == visit_id,
            Visit.organization_id == current_user.organization_id,
        )
    )
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found.")

    patient = session.get(Patient, visit.patient_id)
    if not patient or patient.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    remaining_egp = _egp(visit.total_cost_minor) - _egp(visit.paid_amount_minor)
    if remaining_egp <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Visit is already fully paid.")
    if payload.amount_egp > remaining_egp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment exceeds remaining balance of {remaining_egp} EGP.",
        )

    visit.paid_amount_minor = (visit.paid_amount_minor or 0) + (payload.amount_egp * 100)
    new_remaining = _egp(visit.total_cost_minor) - _egp(visit.paid_amount_minor)

    _post_visit_revenue(
        session=session,
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        patient=patient,
        visit=visit,
        doctor_id=visit.doctor_id,
        amount_egp=payload.amount_egp,
        description=(
            f"Visit balance payment {payload.amount_egp} EGP "
            f"(remaining {new_remaining}) - {patient.full_name} ({patient.patient_code})"
        ),
    )

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="VISIT_PAYMENT",
            target_type="visits",
            target_id=visit.id,
            description=f"Recorded payment of {payload.amount_egp} EGP for visit {visit.id}",
            occurred_at=datetime.now(UTC),
            metadata_json={
                "patient_code": patient.patient_code,
                "amount_egp": payload.amount_egp,
                "paid_egp": _egp(visit.paid_amount_minor),
                "remaining_egp": new_remaining,
            },
        )
    )
    session.commit()

    return {
        "id": str(visit.id),
        "totalCostEGP": _egp(visit.total_cost_minor),
        "paidAmountEGP": _egp(visit.paid_amount_minor),
        "remainingEGP": new_remaining,
    }
