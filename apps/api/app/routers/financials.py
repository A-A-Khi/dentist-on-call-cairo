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
from app.models.patients import Patient

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


@router.get("/categories")
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
                "categoryId": str(tx.category_id),
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
