from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf
from app.models.audit import AuditLog
from app.models.enums import TransactionStatus, TransactionType
from app.models.identity import DoctorProfile, User
from app.models.operations import FinancialCategory, FinancialTransaction
from app.models.patients import Patient

router = APIRouter(prefix="/financials", tags=["financials"])


class TransactionCreateRequest(BaseModel):
    type: str = "REVENUE"  # REVENUE or EXPENSE
    category_name: str = "Clinical Treatment"
    amount_egp: int = Field(..., gt=0)
    description: str | None = None
    patient_id_or_code: str | None = None


@router.get("/transactions")
def list_transactions(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    query = (
        select(FinancialTransaction)
        .where(FinancialTransaction.organization_id == current_user.organization_id)
        .order_by(FinancialTransaction.created_at.desc())
    )
    transactions = session.scalars(query).all()

    result: list[dict[str, Any]] = []
    for tx in transactions:
        category = session.get(FinancialCategory, tx.category_id)
        category_name = category.name_en if category else "General"

        patient_name = None
        patient_code = None
        if tx.patient_id:
            p = session.get(Patient, tx.patient_id)
            if p:
                patient_name = p.full_name
                patient_code = p.patient_code

        doctor_name = None
        if tx.doctor_id:
            d = session.get(DoctorProfile, tx.doctor_id)
            if d:
                du = session.get(User, d.user_id)
                if du:
                    doctor_name = du.display_name

        result.append(
            {
                "id": str(tx.id),
                "date": tx.effective_on.isoformat(),
                "type": tx.type.value,
                "category": category_name,
                "amountEGP": tx.amount_minor // 100,
                "patientName": patient_name,
                "patientCode": patient_code,
                "doctorName": doctor_name,
                "description": tx.description or "Transaction",
                "status": tx.status.value,
            }
        )

    return result


@router.post("/transactions", dependencies=[Depends(require_csrf)], status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    tx_type = TransactionType.REVENUE if payload.type.upper() == "REVENUE" else TransactionType.EXPENSE

    category = session.scalar(
        select(FinancialCategory).where(
            FinancialCategory.organization_id == current_user.organization_id,
            FinancialCategory.transaction_type == tx_type,
        ).limit(1)
    )
    if not category:
        category = FinancialCategory(
            id=uuid4(),
            organization_id=current_user.organization_id,
            transaction_type=tx_type,
            name_en=payload.category_name,
        )
        session.add(category)
        session.flush()

    patient_id = None
    if payload.patient_id_or_code:
        p = session.scalar(
            select(Patient).where(
                Patient.organization_id == current_user.organization_id,
                Patient.patient_code == payload.patient_id_or_code,
            )
        )
        if p:
            patient_id = p.id

    tx = FinancialTransaction(
        id=uuid4(),
        organization_id=current_user.organization_id,
        type=tx_type,
        category_id=category.id,
        amount_minor=payload.amount_egp * 100,
        currency_code="EGP",
        description=payload.description or f"Manual {tx_type.value} entry",
        patient_id=patient_id,
        effective_on=date.today(),
        status=TransactionStatus.POSTED,
        created_by_user_id=current_user.user_id,
    )
    session.add(tx)

    audit = AuditLog(
        id=uuid4(),
        organization_id=current_user.organization_id,
        actor_user_id=current_user.user_id,
        actor_role=current_user.role.value,
        action="TRANSACTION_POSTED",
        target_type="financial_transactions",
        target_id=tx.id,
        description=f"Posted {tx_type.value} of {payload.amount_egp} EGP",
        occurred_at=datetime.now(UTC),
        metadata_json={
            "type": tx_type.value,
            "amount_egp": payload.amount_egp,
            "description": payload.description,
        },
    )
    session.add(audit)
    session.commit()

    return {"id": str(tx.id), "status": tx.status.value, "amountEGP": payload.amount_egp}


@router.post("/transactions/{transaction_id}/reverse", dependencies=[Depends(require_csrf)])
def reverse_transaction(
    transaction_id: UUID,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    orig = session.get(FinancialTransaction, transaction_id)
    if not orig or orig.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    if orig.status == TransactionStatus.VOIDED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transaction already voided.")

    orig.status = TransactionStatus.VOIDED
    orig.voided_at = datetime.now(UTC)

    session.commit()
    return {"id": str(orig.id), "status": "VOIDED"}
