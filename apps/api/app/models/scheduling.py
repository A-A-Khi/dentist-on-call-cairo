from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import OrganizationScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AppointmentStatus

if TYPE_CHECKING:
    from app.models.identity import DoctorProfile
    from app.models.patients import Patient


class Appointment(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appointments_organization_doctor_starts_at", "organization_id", "doctor_id", "starts_at"),
        Index("ix_appointments_organization_starts_at", "organization_id", "starts_at"),
    )

    patient_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"))
    doctor_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("doctor_profiles.id", ondelete="RESTRICT"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"), nullable=False, default=AppointmentStatus.PENDING
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    patient: Mapped["Patient"] = relationship(back_populates="appointments")
    doctor: Mapped["DoctorProfile | None"] = relationship(back_populates="appointments")
    status_events: Mapped[list["AppointmentStatusEvent"]] = relationship(back_populates="appointment")


class AppointmentStatusEvent(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    __tablename__ = "appointment_status_events"

    appointment_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="RESTRICT"))
    from_status: Mapped[AppointmentStatus | None] = mapped_column(Enum(AppointmentStatus, name="appointment_status"))
    to_status: Mapped[AppointmentStatus] = mapped_column(Enum(AppointmentStatus, name="appointment_status"), nullable=False)
    changed_by_user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    reason: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    appointment: Mapped[Appointment] = relationship(back_populates="status_events")
