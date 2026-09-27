from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf, require_roles
from app.models.audit import AuditLog
from app.models.enums import TransactionStatus, TransactionType, UserRole
from app.models.identity import DoctorProfile, User
from app.models.operations import FinancialCategory, FinancialTransaction
from app.models.patients import Patient, Visit
from app.services.revenue_split import allocate_egp, split_basis_egp

router = APIRouter(prefix="/financials", tags=["financials"])


class CategoryCreateRequest(BaseModel):
    transaction_type: str = Field(..., description="REVENUE or EXPENSE")
    name_en: str = Field(..., min_length=2, max_length=160)
    name_ar: str | None = Field(None, max_length=160)


class CategoryUpdateRequest(BaseModel):
    name_en: str | None = Field(None, min_length=2, max_length=160)
    name_ar: str | None = Field(None, max_length=160)
    is_active: bool | None = None


class TransactionCreateRequest(BaseModel):
    type: str = "REVENUE"  # REVENUE or EXPENSE
    category_id: UUID | None = None
    category_name: str | None = None
    amount_egp: int = Field(..., gt=0)
    description: str | None = None
    patient_id_or_code: str | None = None


class TransactionUpdateRequest(BaseModel):
    type: str | None = None  # REVENUE or EXPENSE
    category_id: UUID | None = None
    category_name: str | None = None
    amount_egp: int | None = Field(None, gt=0)
    description: str | None = None
    effective_on: date | None = None


def _parse_tx_type(raw: str) -> TransactionType:
    normalized = raw.strip().upper()
    if normalized == "REVENUE":
        return TransactionType.REVENUE
    if normalized == "EXPENSE":
        return TransactionType.EXPENSE
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="type must be REVENUE or EXPENSE.")


def _category_payload(category: FinancialCategory) -> dict[str, Any]:
    return {
        "id": str(category.id),
        "transactionType": category.transaction_type.value,
        "nameEn": category.name_en,
        "nameAr": category.name_ar,
        "isActive": category.is_active,
    }


def _resolve_category(
    *,
    session: DatabaseSession,
    organization_id: UUID,
    tx_type: TransactionType,
    category_id: UUID | None,
    category_name: str | None,
) -> FinancialCategory:
    if category_id is not None:
        category = session.get(FinancialCategory, category_id)
        if (
            category is None
            or category.organization_id != organization_id
            or category.transaction_type != tx_type
            or not category.is_active
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid financial category.")
        return category

    if category_name:
        name = category_name.strip()
        category = session.scalar(
            select(FinancialCategory).where(
                FinancialCategory.organization_id == organization_id,
                FinancialCategory.transaction_type == tx_type,
                FinancialCategory.name_en == name,
                FinancialCategory.is_active.is_(True),
            )
        )
        if category:
            return category
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{name}' not found for {tx_type.value}. Add it in Settings first.",
        )

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="category_id or category_name is required.")


@router.get("/categories", dependencies=[Depends(require_roles(UserRole.ADMIN))])
def list_categories(
    current_user: CurrentUser,
    session: DatabaseSession,
    transaction_type: str | None = Query(None, alias="type"),
    include_inactive: bool = Query(False),
) -> list[dict[str, Any]]:
    query = select(FinancialCategory).where(FinancialCategory.organization_id == current_user.organization_id)
    if transaction_type:
        tx_type = _parse_tx_type(transaction_type)
        query = query.where(FinancialCategory.transaction_type == tx_type)
    if not include_inactive:
        query = query.where(FinancialCategory.is_active.is_(True))
    query = query.order_by(FinancialCategory.transaction_type.asc(), FinancialCategory.name_en.asc())
    return [_category_payload(c) for c in session.scalars(query).all()]


@router.post(
    "/categories",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: CategoryCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    tx_type = _parse_tx_type(payload.transaction_type)
    name_en = payload.name_en.strip()
    existing = session.scalar(
        select(FinancialCategory).where(
            FinancialCategory.organization_id == current_user.organization_id,
            FinancialCategory.transaction_type == tx_type,
            FinancialCategory.name_en == name_en,
        )
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.name_ar = payload.name_ar.strip() if payload.name_ar else existing.name_ar
            session.commit()
            return _category_payload(existing)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists.")

    category = FinancialCategory(
        id=uuid4(),
        organization_id=current_user.organization_id,
        transaction_type=tx_type,
        name_en=name_en,
        name_ar=payload.name_ar.strip() if payload.name_ar else None,
        is_active=True,
    )
    session.add(category)
    session.commit()
    return _category_payload(category)


@router.patch(
    "/categories/{category_id}",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
def update_category(
    category_id: UUID,
    payload: CategoryUpdateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    category = session.get(FinancialCategory, category_id)
    if category is None or category.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    if payload.name_en is not None:
        category.name_en = payload.name_en.strip()
    if payload.name_ar is not None:
        category.name_ar = payload.name_ar.strip() or None
    if payload.is_active is not None:
        category.is_active = payload.is_active

    session.commit()
    return _category_payload(category)


@router.get("/transactions", dependencies=[Depends(require_roles(UserRole.ADMIN))])
def list_transactions(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> list[dict[str, Any]]:
    query = (
        select(FinancialTransaction)
        .where(
            FinancialTransaction.organization_id == current_user.organization_id,
            FinancialTransaction.status == TransactionStatus.POSTED,
        )
        .order_by(FinancialTransaction.created_at.desc())
    )
    transactions = session.scalars(query).all()

    result: list[dict[str, Any]] = []
    for tx in transactions:
        if tx.patient_id:
            p = session.get(Patient, tx.patient_id)
            if p is not None and p.deleted_at is not None:
                continue

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

        is_manual = tx.visit_id is None
        result.append(
            {
                "id": str(tx.id),
                "date": tx.effective_on.isoformat(),
                "type": tx.type.value,
                "category": category_name,
                "categoryId": str(tx.category_id),
                "amountEGP": tx.amount_minor // 100,
                "patientName": patient_name,
                "patientCode": patient_code,
                "doctorName": doctor_name,
                "description": tx.description or "Transaction",
                "status": tx.status.value,
                "visitId": str(tx.visit_id) if tx.visit_id else None,
                "isManual": is_manual,
            }
        )

    return result


@router.get("/summary", dependencies=[Depends(require_roles(UserRole.ADMIN))])
def financial_summary(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Clinic P&L using case revenue split (doctor / assistant / referrer / org)."""
    visits = session.scalars(
        select(Visit)
        .join(Patient, Patient.id == Visit.patient_id)
        .where(
            Visit.organization_id == current_user.organization_id,
            Visit.paid_amount_minor > 0,
            Patient.deleted_at.is_(None),
        )
    ).all()

    gross_collected = 0
    total_case_costs = 0
    doctor_share = 0
    assistant_share = 0
    referral_share = 0
    clinic_share = 0

    for visit in visits:
        paid_egp = (visit.paid_amount_minor or 0) // 100
        if paid_egp <= 0:
            continue
        case_cost_egp = (visit.case_cost_minor or 0) // 100
        basis_egp = split_basis_egp(paid_egp, case_cost_egp)
        amounts = allocate_egp(
            basis_egp,
            {
                "doctor": visit.doctor_share_percent,
                "assistant": visit.assistant_share_percent,
                "referral": visit.referral_share_percent,
                "org": visit.org_share_percent,
            },
        )
        gross_collected += paid_egp
        total_case_costs += case_cost_egp
        doctor_share += amounts["doctor"]
        assistant_share += amounts["assistant"]
        referral_share += amounts["referral"]
        clinic_share += amounts["org"]

    # Manual ledger revenue (not tied to a visit) counts fully as clinic income.
    manual_revenue_txs = session.scalars(
        select(FinancialTransaction).where(
            FinancialTransaction.organization_id == current_user.organization_id,
            FinancialTransaction.type == TransactionType.REVENUE,
            FinancialTransaction.status == TransactionStatus.POSTED,
            FinancialTransaction.visit_id.is_(None),
        )
    ).all()
    manual_revenue = sum(tx.amount_minor // 100 for tx in manual_revenue_txs)
    clinic_share += manual_revenue
    gross_collected += manual_revenue

    expense_txs = session.scalars(
        select(FinancialTransaction).where(
            FinancialTransaction.organization_id == current_user.organization_id,
            FinancialTransaction.type == TransactionType.EXPENSE,
            FinancialTransaction.status == TransactionStatus.POSTED,
        )
    ).all()
    total_expenses = sum(tx.amount_minor // 100 for tx in expense_txs)

    paid_visit_count = sum(1 for v in visits if (v.paid_amount_minor or 0) > 0)
    visit_collected = max(0, gross_collected - manual_revenue)
    avg_case = round(visit_collected / paid_visit_count) if paid_visit_count else 0
    net_clinic_profit = clinic_share - total_expenses

    return {
        "grossCollectedEGP": gross_collected,
        "caseCostsEGP": total_case_costs,
        "splitBasisEGP": max(0, gross_collected - manual_revenue - total_case_costs),
        "doctorShareEGP": doctor_share,
        "assistantShareEGP": assistant_share,
        "referralShareEGP": referral_share,
        "clinicShareEGP": clinic_share,
        "manualRevenueEGP": manual_revenue,
        "totalExpensesEGP": total_expenses,
        "netClinicProfitEGP": net_clinic_profit,
        "paidVisitCount": paid_visit_count,
        "avgCaseEGP": avg_case,
    }


@router.post(
    "/transactions",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    payload: TransactionCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    tx_type = _parse_tx_type(payload.type)
    category = _resolve_category(
        session=session,
        organization_id=current_user.organization_id,
        tx_type=tx_type,
        category_id=payload.category_id,
        category_name=payload.category_name,
    )

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
        description=f"Posted {tx_type.value} of {payload.amount_egp} EGP ({category.name_en})",
        occurred_at=datetime.now(UTC),
        metadata_json={
            "type": tx_type.value,
            "amount_egp": payload.amount_egp,
            "category_id": str(category.id),
            "category": category.name_en,
            "description": payload.description,
        },
    )
    session.add(audit)
    session.commit()

    return {
        "id": str(tx.id),
        "status": tx.status.value,
        "amountEGP": payload.amount_egp,
        "category": category.name_en,
        "categoryId": str(category.id),
    }


@router.patch(
    "/transactions/{transaction_id}",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    tx = session.get(FinancialTransaction, transaction_id)
    if tx is None or tx.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    if tx.status != TransactionStatus.POSTED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only posted transactions can be edited.")

    visit = session.get(Visit, tx.visit_id) if tx.visit_id is not None else None
    if tx.visit_id is not None and (
        visit is None or visit.organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found.")
    if (
        visit is not None
        and tx.type == TransactionType.REVENUE
        and payload.type is not None
        and _parse_tx_type(payload.type) != TransactionType.REVENUE
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visit payments stay recorded as revenue. Change the amount instead.",
        )

    before = {
        "type": tx.type.value,
        "amount_egp": tx.amount_minor // 100,
        "category_id": str(tx.category_id),
        "description": tx.description,
        "effective_on": tx.effective_on.isoformat(),
    }

    tx_type = tx.type
    if payload.type is not None:
        tx_type = _parse_tx_type(payload.type)
        tx.type = tx_type

    category_changed = payload.category_id is not None or (
        payload.category_name is not None and payload.category_name.strip() != ""
    )
    type_changed = payload.type is not None and tx_type != TransactionType(before["type"])
    if category_changed or type_changed:
        category = _resolve_category(
            session=session,
            organization_id=current_user.organization_id,
            tx_type=tx_type,
            category_id=payload.category_id,
            category_name=payload.category_name,
        )
        tx.category_id = category.id
    else:
        category = session.get(FinancialCategory, tx.category_id)
        if category is None or category.transaction_type != tx_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Choose a category that matches the transaction type.",
            )

    if payload.amount_egp is not None:
        if visit is not None and tx.type == TransactionType.REVENUE:
            old_amount = tx.amount_minor // 100
            new_paid = (visit.paid_amount_minor or 0) // 100 + (payload.amount_egp - old_amount)
            total = (visit.total_cost_minor or 0) // 100
            if new_paid < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This amount would make the visit paid total negative.",
                )
            if new_paid > total:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Paid amount cannot exceed the visit total of {total} EGP.",
                )
            visit.paid_amount_minor = new_paid * 100
        tx.amount_minor = payload.amount_egp * 100

    if payload.description is not None:
        cleaned = payload.description.strip()
        tx.description = cleaned or f"Manual {tx_type.value} entry"

    if payload.effective_on is not None:
        tx.effective_on = payload.effective_on

    amount_egp = tx.amount_minor // 100
    category_name = category.name_en if category else "General"

    audit = AuditLog(
        id=uuid4(),
        organization_id=current_user.organization_id,
        actor_user_id=current_user.user_id,
        actor_role=current_user.role.value,
        action="TRANSACTION_UPDATED",
        target_type="financial_transactions",
        target_id=tx.id,
        description=f"Updated {tx_type.value} of {amount_egp} EGP ({category_name})",
        occurred_at=datetime.now(UTC),
        metadata_json={
            "before": before,
            "after": {
                "type": tx.type.value,
                "amount_egp": amount_egp,
                "category_id": str(tx.category_id),
                "category": category_name,
                "description": tx.description,
                "effective_on": tx.effective_on.isoformat(),
            },
        },
    )
    session.add(audit)
    session.commit()

    return {
        "id": str(tx.id),
        "status": tx.status.value,
        "type": tx.type.value,
        "amountEGP": amount_egp,
        "category": category_name,
        "categoryId": str(tx.category_id),
        "description": tx.description,
        "date": tx.effective_on.isoformat(),
        "isManual": True,
    }


@router.post(
    "/transactions/{transaction_id}/reverse",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
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

    # Keep visit balances consistent when voiding visit-linked revenue.
    if orig.visit_id is not None and orig.type == TransactionType.REVENUE:
        visit = session.get(Visit, orig.visit_id)
        if visit is not None and visit.organization_id == current_user.organization_id:
            visit.paid_amount_minor = max(0, (visit.paid_amount_minor or 0) - (orig.amount_minor or 0))

    session.commit()
    return {"id": str(orig.id), "status": "VOIDED"}
