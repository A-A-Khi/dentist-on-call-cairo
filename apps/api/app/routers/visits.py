from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_, select

from app.auth.dependencies import (
    CurrentUser,
    DatabaseSession,
    current_doctor_profile_id,
    ensure_doctor_owns_visit,
    ensure_patient_access,
    require_csrf,
    require_roles,
)
from app.models.audit import AuditLog
from app.models.enums import (
    AppointmentStatus,
    ProcedureStatus,
    TransactionStatus,
    TransactionType,
    UserRole,
    VisitStatus,
)
from app.models.identity import DoctorProfile, User
from app.models.operations import CaseStream, FinancialCategory, FinancialTransaction
from app.models.patients import Patient, Visit, VisitProcedure
from app.models.scheduling import Appointment, AppointmentStatusEvent
from app.services.revenue_split import serialize_revenue_share, visit_share_snapshot

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
    case_cost_egp: int = 0
    case_cost_note: str | None = None
    source_stream_id: UUID | None = None
    appointment_id: UUID | None = None


class VisitPaymentRequest(BaseModel):
    amount_egp: int = Field(..., gt=0)


class VisitUpdateRequest(BaseModel):
    chief_complaint: str | None = None
    clinical_findings: str | None = None
    diagnosis: str | None = None
    doctor_notes: str | None = None
    prescriptions: str | None = None
    procedures: list[ProcedureInput] | None = None
    status: str | None = None
    case_cost_egp: int | None = None
    case_cost_note: str | None = None
    paid_egp: int | None = Field(default=None, ge=0)


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
    *,
    include_financials: bool = True,
) -> dict[str, Any]:
    procs = session.scalars(select(VisitProcedure).where(VisitProcedure.visit_id == visit.id)).all()
    total = _egp(visit.total_cost_minor)
    paid = _egp(visit.paid_amount_minor)
    case_cost = _egp(visit.case_cost_minor)
    source_stream = session.get(CaseStream, visit.source_stream_id) if visit.source_stream_id else None
    payload: dict[str, Any] = {
        "id": str(visit.id),
        "patientId": patient.patient_code,
        "patientName": patient.full_name,
        "doctorName": _doctor_name(session, visit.doctor_id),
        "date": visit.occurred_at.strftime("%Y-%m-%d"),
        "time": visit.occurred_at.strftime("%I:%M %p"),
        "chiefComplaint": visit.chief_complaint or "—",
        "clinicalFindings": visit.clinical_findings or "—",
        "diagnosis": visit.diagnosis_text or "—",
        "sourceStreamId": str(visit.source_stream_id) if visit.source_stream_id else None,
        "sourceStream": source_stream.name_en if source_stream else "Dentist on Call",
        "procedures": [
            {
                "id": str(p.id),
                "name": p.procedure_name,
                "toothNumber": p.notes,
                # Procedure fee is operational finance — hide from medical staff.
                "costEGP": _egp(p.cost_minor) if include_financials else None,
                "status": "Completed" if p.status == ProcedureStatus.COMPLETED else "Planned",
            }
            for p in procs
        ],
        "attachments": [],
        "doctorNotes": visit.doctor_notes or "—",
        "prescriptions": [visit.treatment_notes] if visit.treatment_notes else [],
        "status": (
            "Completed"
            if visit.status in (VisitStatus.COMPLETED, VisitStatus.AMENDED)
            else "Draft"
        ),
    }
    if include_financials:
        payload.update(
            {
                "totalCostEGP": total,
                "paidAmountEGP": paid,
                "remainingEGP": max(total - paid, 0),
                "caseCostEGP": case_cost,
                "caseCostNote": visit.case_cost_note,
                "revenueShare": serialize_revenue_share(
                    doctor_percent=visit.doctor_share_percent,
                    assistant_percent=visit.assistant_share_percent,
                    referral_percent=visit.referral_share_percent,
                    org_percent=visit.org_share_percent,
                    paid_egp=paid,
                    case_cost_egp=case_cost,
                    case_cost_note=visit.case_cost_note,
                ),
            }
        )
    return payload


def _reduce_posted_visit_revenue(session: DatabaseSession, visit: Visit, reduce_egp: int) -> None:
    """Shrink or void posted visit revenue so a lower collected amount stays in the ledger."""
    remaining_minor = max(0, int(reduce_egp)) * 100
    if remaining_minor <= 0:
        return
    txs = session.scalars(
        select(FinancialTransaction)
        .where(
            FinancialTransaction.visit_id == visit.id,
            FinancialTransaction.organization_id == visit.organization_id,
            FinancialTransaction.type == TransactionType.REVENUE,
            FinancialTransaction.status == TransactionStatus.POSTED,
        )
        .order_by(desc(FinancialTransaction.created_at))
    ).all()
    for tx in txs:
        if remaining_minor <= 0:
            break
        amount = tx.amount_minor or 0
        if amount <= remaining_minor:
            tx.status = TransactionStatus.VOIDED
            tx.voided_at = datetime.now(UTC)
            remaining_minor -= amount
        else:
            tx.amount_minor = amount - remaining_minor
            remaining_minor = 0


def _apply_visit_paid(
    *,
    session: DatabaseSession,
    organization_id: UUID,
    user_id: UUID,
    patient: Patient,
    visit: Visit,
    target_paid_egp: int,
) -> None:
    target = max(0, int(target_paid_egp))
    total = _egp(visit.total_cost_minor)
    if target > total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Paid amount cannot exceed the visit total of {total} EGP.",
        )
    old = _egp(visit.paid_amount_minor)
    if target == old:
        return
    if target > old:
        _post_visit_revenue(
            session=session,
            organization_id=organization_id,
            user_id=user_id,
            patient=patient,
            visit=visit,
            doctor_id=visit.doctor_id,
            amount_egp=target - old,
            description=(
                f"Payment adjusted to {target} EGP (+{target - old}) "
                f"- {patient.full_name} ({patient.patient_code})"
            ),
        )
    else:
        _reduce_posted_visit_revenue(session, visit, old - target)
    visit.paid_amount_minor = target * 100


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
    query = (
        select(Visit)
        .where(
            Visit.organization_id == current_user.organization_id,
            Visit.paid_amount_minor < Visit.total_cost_minor,
            Visit.total_cost_minor > 0,
        )
        .order_by(Visit.occurred_at.desc())
    )
    if current_user.role != UserRole.ADMIN:
        doctor_id = current_doctor_profile_id(session, current_user=current_user)
        if doctor_id is None:
            return []
        query = query.where(Visit.doctor_id == doctor_id)

    visits = session.scalars(query).all()

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)

    query = select(Visit).where(Visit.patient_id == patient.id)
    include_financials = current_user.role == UserRole.ADMIN
    if current_user.role != UserRole.ADMIN:
        doctor_id = current_doctor_profile_id(session, current_user=current_user)
        if doctor_id is None:
            return []
        # Doctors only see their own assigned visits on the current/upcoming horizon
        # plus any earlier visits they themselves recorded for continuity of care notes.
        query = query.where(Visit.doctor_id == doctor_id)
    visits = session.scalars(query.order_by(Visit.occurred_at.desc())).all()

    return [
        _serialize_visit(session, v, patient, include_financials=include_financials) for v in visits
    ]


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
    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)

    linked_appointment: Appointment | None = None
    if payload.appointment_id is not None:
        linked_appointment = session.get(Appointment, payload.appointment_id)
        if (
            linked_appointment is None
            or linked_appointment.organization_id != current_user.organization_id
            or linked_appointment.patient_id != patient.id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid appointment for this patient.",
            )
        if linked_appointment.status in {AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a visit from a cancelled or no-show appointment.",
            )

    # Prefer the appointment's doctor so calendar → visit keeps attribution.
    doc_profile: DoctorProfile | None = None
    if linked_appointment is not None and linked_appointment.doctor_id is not None:
        appointment_doctor = session.get(DoctorProfile, linked_appointment.doctor_id)
        if (
            appointment_doctor is not None
            and appointment_doctor.organization_id == current_user.organization_id
        ):
            doc_profile = appointment_doctor

    if doc_profile is None and current_user.role == UserRole.DOCTOR:
        own_id = current_doctor_profile_id(session, current_user=current_user)
        if own_id:
            doc_profile = session.get(DoctorProfile, own_id)
        if doc_profile is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Doctor profile not found for the current user.",
            )

    if doc_profile is None:
        doc_profile = session.scalar(
            select(DoctorProfile).where(DoctorProfile.organization_id == current_user.organization_id).limit(1)
        )
    if not doc_profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active doctor on duty.")

    visit_status_enum = VisitStatus.COMPLETED if payload.status.upper() == "COMPLETED" else VisitStatus.DRAFT

    total_cost_egp = sum(max(p.cost_egp, 0) for p in payload.procedures)
    paid_egp = total_cost_egp if payload.paid_egp is None else max(0, min(payload.paid_egp, total_cost_egp))
    # Case costs & revenue economics are admin-managed; doctors cannot set them.
    if current_user.role == UserRole.ADMIN:
        case_cost_egp = max(0, int(payload.case_cost_egp or 0))
        case_cost_note = (payload.case_cost_note or "").strip() or None
        if case_cost_note and len(case_cost_note) > 160:
            case_cost_note = case_cost_note[:160]
    else:
        case_cost_egp = 0
        case_cost_note = None
        # Doctors may chart fees but not post collections — admin collects later.
        paid_egp = 0

    # Per-visit source: chosen stream applies only to this visit.
    # Empty / null => fully ours (Dentist on Call) — no referral share.
    visit_source_stream_id: UUID | None = None
    if payload.source_stream_id is not None:
        stream = session.get(CaseStream, payload.source_stream_id)
        if (
            stream is None
            or stream.organization_id != current_user.organization_id
            or not stream.is_active
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or inactive referrer / case stream.",
            )
        visit_source_stream_id = stream.id

    shares = visit_share_snapshot(session, visit_source_stream_id)

    visit = Visit(
        id=uuid4(),
        organization_id=current_user.organization_id,
        patient_id=patient.id,
        doctor_id=doc_profile.id,
        appointment_id=linked_appointment.id if linked_appointment else None,
        occurred_at=datetime.now(UTC),
        chief_complaint=payload.chief_complaint,
        clinical_findings=payload.clinical_findings,
        diagnosis_text=payload.diagnosis,
        doctor_notes=payload.doctor_notes,
        treatment_notes=payload.prescriptions,
        status=visit_status_enum,
        total_cost_minor=total_cost_egp * 100,
        paid_amount_minor=paid_egp * 100,
        case_cost_minor=case_cost_egp * 100,
        case_cost_note=case_cost_note,
        source_stream_id=visit_source_stream_id,
        doctor_share_percent=shares["doctor"],
        assistant_share_percent=shares["assistant"],
        referral_share_percent=shares["referral"],
        org_share_percent=shares["org"],
    )
    session.add(visit)
    session.flush()

    if linked_appointment is not None and visit_status_enum == VisitStatus.COMPLETED:
        if linked_appointment.status != AppointmentStatus.COMPLETED:
            old_status = linked_appointment.status
            linked_appointment.status = AppointmentStatus.COMPLETED
            linked_appointment.completed_at = datetime.now(UTC)
            session.add(
                AppointmentStatusEvent(
                    id=uuid4(),
                    organization_id=current_user.organization_id,
                    appointment_id=linked_appointment.id,
                    from_status=old_status,
                    to_status=AppointmentStatus.COMPLETED,
                    changed_by_user_id=current_user.user_id,
                    reason="Visit recorded from calendar",
                    occurred_at=datetime.now(UTC),
                )
            )

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
                "appointment_id": str(linked_appointment.id) if linked_appointment else None,
                "procedures_count": len(payload.procedures),
                "total_egp": total_cost_egp,
                "paid_egp": paid_egp,
                "case_cost_egp": case_cost_egp,
                "remaining_egp": total_cost_egp - paid_egp,
                "revenue_share": shares,
            },
        )
    )
    session.commit()

    include_financials = current_user.role == UserRole.ADMIN
    result: dict[str, Any] = {
        "id": str(visit.id),
        "patientCode": patient.patient_code,
        "status": visit.status.value,
    }
    if include_financials:
        result.update(
            {
                "totalCostEGP": total_cost_egp,
                "paidAmountEGP": paid_egp,
                "remainingEGP": total_cost_egp - paid_egp,
                "caseCostEGP": case_cost_egp,
                "caseCostNote": case_cost_note,
                "revenueShare": serialize_revenue_share(
                    doctor_percent=shares["doctor"],
                    assistant_percent=shares["assistant"],
                    referral_percent=shares["referral"],
                    org_percent=shares["org"],
                    paid_egp=paid_egp,
                    case_cost_egp=case_cost_egp,
                    case_cost_note=case_cost_note,
                ),
            }
        )
    return result


@router.get("/visits/{visit_id}")
def get_visit(
    visit_id: UUID,
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
    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)
    ensure_doctor_owns_visit(session, current_user=current_user, visit=visit)
    return _serialize_visit(
        session,
        visit,
        patient,
        include_financials=current_user.role == UserRole.ADMIN,
    )


@router.patch("/visits/{visit_id}", dependencies=[Depends(require_csrf)])
def update_visit(
    visit_id: UUID,
    payload: VisitUpdateRequest,
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
    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)
    ensure_doctor_owns_visit(session, current_user=current_user, visit=visit)

    # Doctors may only edit draft visits; completed/amended records require admin.
    if current_user.role != UserRole.ADMIN and visit.status != VisitStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can amend completed visits.",
        )

    if "chief_complaint" in payload.model_fields_set:
        visit.chief_complaint = payload.chief_complaint
    if "clinical_findings" in payload.model_fields_set:
        visit.clinical_findings = payload.clinical_findings
    if "diagnosis" in payload.model_fields_set:
        visit.diagnosis_text = payload.diagnosis
    if "doctor_notes" in payload.model_fields_set:
        visit.doctor_notes = payload.doctor_notes
    if "prescriptions" in payload.model_fields_set:
        visit.treatment_notes = payload.prescriptions
    # Doctors may not change case-cost economics.
    if current_user.role == UserRole.ADMIN:
        if "case_cost_egp" in payload.model_fields_set and payload.case_cost_egp is not None:
            visit.case_cost_minor = max(0, int(payload.case_cost_egp)) * 100
        if "case_cost_note" in payload.model_fields_set:
            note = (payload.case_cost_note or "").strip() or None
            if note and len(note) > 160:
                note = note[:160]
            visit.case_cost_note = note

    paid_requested = (
        current_user.role == UserRole.ADMIN
        and "paid_egp" in payload.model_fields_set
        and payload.paid_egp is not None
    )
    old_paid = _egp(visit.paid_amount_minor)
    target_paid = max(0, int(payload.paid_egp)) if paid_requested else old_paid
    new_total = (
        sum(max(p.cost_egp, 0) for p in payload.procedures)
        if payload.procedures is not None
        else _egp(visit.total_cost_minor)
    )
    if target_paid > new_total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Paid amount cannot exceed the visit total of {new_total} EGP.",
        )

    # Lower the collected amount before shrinking the fee so the paid<=total check holds.
    if paid_requested and target_paid < old_paid:
        _apply_visit_paid(
            session=session,
            organization_id=current_user.organization_id,
            user_id=current_user.user_id,
            patient=patient,
            visit=visit,
            target_paid_egp=target_paid,
        )

    if payload.procedures is not None:
        total_cost_egp = new_total
        existing = session.scalars(select(VisitProcedure).where(VisitProcedure.visit_id == visit.id)).all()
        for proc in existing:
            session.delete(proc)
        session.flush()

        visit.total_cost_minor = total_cost_egp * 100
        completed_like = visit.status in (VisitStatus.COMPLETED, VisitStatus.AMENDED)
        for p in payload.procedures:
            session.add(
                VisitProcedure(
                    id=uuid4(),
                    organization_id=current_user.organization_id,
                    visit_id=visit.id,
                    procedure_name=p.name,
                    cost_minor=max(p.cost_egp, 0) * 100,
                    currency_code="EGP",
                    notes=p.tooth_number,
                    status=ProcedureStatus.COMPLETED if completed_like else ProcedureStatus.PLANNED,
                    performed_at=datetime.now(UTC) if completed_like else None,
                )
            )

    if paid_requested and _egp(visit.paid_amount_minor) < target_paid:
        _apply_visit_paid(
            session=session,
            organization_id=current_user.organization_id,
            user_id=current_user.user_id,
            patient=patient,
            visit=visit,
            target_paid_egp=target_paid,
        )

    if payload.status is not None:
        status_key = payload.status.strip().upper()
        if status_key == "COMPLETED":
            visit.status = VisitStatus.COMPLETED
        elif status_key == "DRAFT":
            visit.status = VisitStatus.DRAFT
        elif status_key == "AMENDED":
            visit.status = VisitStatus.AMENDED
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid visit status.")
    elif visit.status == VisitStatus.COMPLETED and payload.model_fields_set:
        visit.status = VisitStatus.AMENDED

    session.add(
        AuditLog(
            id=uuid4(),
            organization_id=current_user.organization_id,
            actor_user_id=current_user.user_id,
            actor_role=current_user.role.value,
            action="VISIT_UPDATED",
            target_type="visits",
            target_id=visit.id,
            description=f"Updated clinical visit for {patient.full_name} ({patient.patient_code})",
            occurred_at=datetime.now(UTC),
            metadata_json={
                "patient_code": patient.patient_code,
                "fields": sorted(payload.model_fields_set),
            },
        )
    )
    session.commit()
    session.refresh(visit)
    return _serialize_visit(
        session,
        visit,
        patient,
        include_financials=current_user.role == UserRole.ADMIN,
    )


@router.post(
    "/visits/{visit_id}/payments",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
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
    ensure_patient_access(session, current_user=current_user, patient_id=patient.id)

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
        "caseCostEGP": _egp(visit.case_cost_minor),
        "caseCostNote": visit.case_cost_note,
        "revenueShare": serialize_revenue_share(
            doctor_percent=visit.doctor_share_percent,
            assistant_percent=visit.assistant_share_percent,
            referral_percent=visit.referral_share_percent,
            org_percent=visit.org_share_percent,
            paid_egp=_egp(visit.paid_amount_minor),
            case_cost_egp=_egp(visit.case_cost_minor),
            case_cost_note=visit.case_cost_note,
        ),
    }
