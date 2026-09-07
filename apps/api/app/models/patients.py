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
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import OrganizationScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PatientStatus, ProcedureStatus, VisitStatus

if TYPE_CHECKING:
    from app.models.identity import DoctorProfile
    from app.models.scheduling import Appointment


class Patient(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "patients"
    __table_args__ = (
        UniqueConstraint("organization_id", "patient_number", name="uq_patients_organization_number"),
        UniqueConstraint("organization_id", "patient_code", name="uq_patients_organization_code"),
        Index("ix_patients_organization_phone", "organization_id", "phone"),
        Index("ix_patients_organization_created_at", "organization_id", "created_at"),
    )

    patient_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    patient_code: Mapped[str] = mapped_column(String(32), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(32))
    phone: Mapped[str | None] = mapped_column(String(32))
    whatsapp_phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    emergency_contact: Mapped[dict[str, str] | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    source_stream_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("case_streams.id", ondelete="SET NULL")
    )
    status: Mapped[PatientStatus] = mapped_column(
        Enum(PatientStatus, name="patient_status"), nullable=False, default=PatientStatus.ACTIVE
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    medical_history: Mapped["MedicalHistory | None"] = relationship(back_populates="patient", uselist=False)
    dental_history: Mapped["DentalHistory | None"] = relationship(back_populates="patient", uselist=False)
    visits: Mapped[list["Visit"]] = relationship(back_populates="patient")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="patient")
    care_assignments: Mapped[list["PatientCareAssignment"]] = relationship(back_populates="patient")


class MedicalHistory(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "medical_histories"
    __table_args__ = (UniqueConstraint("organization_id", "patient_id", name="uq_medical_histories_organization_patient"),)

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    conditions_text: Mapped[str | None] = mapped_column(Text)
    medications_text: Mapped[str | None] = mapped_column(Text)
    drug_allergies_text: Mapped[str | None] = mapped_column(Text)
    food_allergies_text: Mapped[str | None] = mapped_column(Text)
    surgeries_text: Mapped[str | None] = mapped_column(Text)
    hospitalization_text: Mapped[str | None] = mapped_column(Text)
    family_history_text: Mapped[str | None] = mapped_column(Text)
    smoking_status: Mapped[str | None] = mapped_column(String(64))
    additional_notes: Mapped[str | None] = mapped_column(Text)

    patient: Mapped[Patient] = relationship(back_populates="medical_history")
    flags: Mapped[list["MedicalHistoryFlag"]] = relationship(back_populates="medical_history")


class MedicalHistoryFlag(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "medical_history_flags"
    __table_args__ = (UniqueConstraint("medical_history_id", "code", name="uq_medical_history_flags_history_code"),)

    medical_history_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("medical_histories.id", ondelete="RESTRICT")
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    details: Mapped[str | None] = mapped_column(Text)

    medical_history: Mapped[MedicalHistory] = relationship(back_populates="flags")


class DentalHistory(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "dental_histories"
    __table_args__ = (UniqueConstraint("organization_id", "patient_id", name="uq_dental_histories_organization_patient"),)

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    previous_treatment_text: Mapped[str | None] = mapped_column(Text)
    extractions_text: Mapped[str | None] = mapped_column(Text)
    root_canal_text: Mapped[str | None] = mapped_column(Text)
    implants_text: Mapped[str | None] = mapped_column(Text)
    orthodontics_text: Mapped[str | None] = mapped_column(Text)
    gum_problems_text: Mapped[str | None] = mapped_column(Text)
    sensitivity_text: Mapped[str | None] = mapped_column(Text)
    bleeding_gums_text: Mapped[str | None] = mapped_column(Text)
    tmj_text: Mapped[str | None] = mapped_column(Text)
    trauma_text: Mapped[str | None] = mapped_column(Text)
    last_dental_visit_on: Mapped[date | None] = mapped_column(Date)
    other_text: Mapped[str | None] = mapped_column(Text)

    patient: Mapped[Patient] = relationship(back_populates="dental_history")


class PatientCareAssignment(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "patient_care_assignments"
    __table_args__ = (Index("ix_patient_care_assignments_patient_doctor", "patient_id", "doctor_id"),)

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    doctor_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("doctor_profiles.id", ondelete="RESTRICT"))
    assigned_by_user_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    unassigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    patient: Mapped[Patient] = relationship(back_populates="care_assignments")
    doctor: Mapped["DoctorProfile"] = relationship(back_populates="care_assignments")


class Visit(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "visits"
    __table_args__ = (
        Index("ix_visits_organization_patient_occurred_at", "organization_id", "patient_id", "occurred_at"),
        Index("ix_visits_doctor_occurred_at", "doctor_id", "occurred_at"),
    )

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    doctor_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("doctor_profiles.id", ondelete="RESTRICT"))
    appointment_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="RESTRICT"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    chief_complaint: Mapped[str | None] = mapped_column(Text)
    clinical_findings: Mapped[str | None] = mapped_column(Text)
    diagnosis_text: Mapped[str | None] = mapped_column(Text)
    treatment_notes: Mapped[str | None] = mapped_column(Text)
    doctor_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[VisitStatus] = mapped_column(
        Enum(VisitStatus, name="visit_status"), nullable=False, default=VisitStatus.DRAFT
    )
    total_cost_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    paid_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    patient: Mapped[Patient] = relationship(back_populates="visits")
    doctor: Mapped["DoctorProfile"] = relationship(back_populates="visits")
    procedures: Mapped[list["VisitProcedure"]] = relationship(back_populates="visit")


class VisitProcedure(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "visit_procedures"

    visit_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("visits.id", ondelete="RESTRICT"))
    catalog_procedure_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("procedure_catalog.id", ondelete="RESTRICT"))
    procedure_name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProcedureStatus] = mapped_column(
        Enum(ProcedureStatus, name="procedure_status"), nullable=False, default=ProcedureStatus.PLANNED
    )
    cost_minor: Mapped[int | None] = mapped_column(BigInteger)
    currency_code: Mapped[str | None] = mapped_column(String(3))
    notes: Mapped[str | None] = mapped_column(Text)
    performed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    visit: Mapped[Visit] = relationship(back_populates="procedures")


class PatientNote(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "patient_notes"

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    author_user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(String(32), nullable=False, default="CARE_TEAM")
