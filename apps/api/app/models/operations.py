from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.mixins import OrganizationScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AttachmentKind, AttachmentStatus, TransactionStatus, TransactionType

if TYPE_CHECKING:
    pass


class ProcedureCatalog(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "procedure_catalog"
    __table_args__ = (UniqueConstraint("organization_id", "name_en", name="uq_procedure_catalog_organization_name_en"),)

    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(160))
    is_custom: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    default_cost_minor: Mapped[int | None] = mapped_column(BigInteger)


class Attachment(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "attachments"
    __table_args__ = (UniqueConstraint("storage_key", name="uq_attachments_storage_key"),)

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    visit_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("visits.id", ondelete="RESTRICT"))
    uploaded_by_user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    kind: Mapped[AttachmentKind] = mapped_column(Enum(AttachmentKind, name="attachment_kind"), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    safe_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AttachmentStatus] = mapped_column(
        Enum(AttachmentStatus, name="attachment_status"), nullable=False, default=AttachmentStatus.PENDING
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AttachmentAccessEvent(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    """Immutable high-value access record for protected files."""

    __tablename__ = "attachment_access_events"

    attachment_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="RESTRICT")
    )
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip_hash: Mapped[str | None] = mapped_column(String(128))


class FinancialCategory(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "financial_categories"
    __table_args__ = (
        UniqueConstraint("organization_id", "transaction_type", "name_en", name="uq_financial_categories_org_type_name"),
    )

    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type"), nullable=False
    )
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CaseStream(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    """Acquisition / referral stream a registered case came from.

    referral_percent is the admin-configured share for that referrer
    (clinic / hospital / partner). Applied to future cases from this stream.
    """

    __tablename__ = "case_streams"
    __table_args__ = (UniqueConstraint("organization_id", "name_en", name="uq_case_streams_organization_name_en"),)

    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_ar: Mapped[str | None] = mapped_column(String(160))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # 0–50: leaves room for fixed doctor 35% + assistant 15%
    referral_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class FinancialTransaction(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "financial_transactions"

    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType, name="transaction_type"), nullable=False)
    category_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("financial_categories.id", ondelete="RESTRICT"))
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    patient_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    visit_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("visits.id", ondelete="RESTRICT"))
    doctor_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("doctor_profiles.id", ondelete="RESTRICT"))
    effective_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus, name="transaction_status"), nullable=False, default=TransactionStatus.POSTED
    )
    reversal_of_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("financial_transactions.id", ondelete="RESTRICT")
    )
    created_by_user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
