"""Hard-purge helpers for admin delete of reservations / patients and their money."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.identity import AuthLoginAttempt, PasswordResetToken, RefreshSession
from app.models.notifications import Notification, OutboxEvent, PushSubscription
from app.models.operations import Attachment, AttachmentAccessEvent, FinancialTransaction
from app.models.patients import (
    DentalHistory,
    MedicalHistory,
    MedicalHistoryFlag,
    Patient,
    PatientCareAssignment,
    PatientNote,
    Visit,
    VisitProcedure,
)
from app.models.scheduling import Appointment, AppointmentStatusEvent


def _delete_financial_transactions_for_visits(session: Session, visit_ids: list[UUID]) -> int:
    if not visit_ids:
        return 0
    txs = session.scalars(
        select(FinancialTransaction).where(FinancialTransaction.visit_id.in_(visit_ids))
    ).all()
    # Break self-referential RESTRICT links before delete.
    for tx in txs:
        tx.reversal_of_id = None
    session.flush()
    for tx in txs:
        session.delete(tx)
    return len(txs)


def _detach_attachments_from_visits(session: Session, visit_ids: list[UUID], *, now: datetime) -> int:
    if not visit_ids:
        return 0
    attachments = session.scalars(select(Attachment).where(Attachment.visit_id.in_(visit_ids))).all()
    for att in attachments:
        att.visit_id = None
        if att.deleted_at is None:
            att.deleted_at = now
    return len(attachments)


def purge_visits(session: Session, visits: list[Visit], *, now: datetime | None = None) -> dict[str, int]:
    """Remove visits, their procedures, and visit-linked ledger money."""
    if not visits:
        return {"visits": 0, "procedures": 0, "transactions": 0, "attachmentsDetached": 0}

    stamp = now or datetime.now(UTC)
    visit_ids = [v.id for v in visits]

    procedures = session.scalars(select(VisitProcedure).where(VisitProcedure.visit_id.in_(visit_ids))).all()
    for proc in procedures:
        session.delete(proc)

    tx_count = _delete_financial_transactions_for_visits(session, visit_ids)
    att_count = _detach_attachments_from_visits(session, visit_ids, now=stamp)

    session.flush()
    for visit in visits:
        session.delete(visit)

    return {
        "visits": len(visits),
        "procedures": len(procedures),
        "transactions": tx_count,
        "attachmentsDetached": att_count,
    }


def purge_appointment(
    session: Session,
    appointment: Appointment,
    *,
    now: datetime | None = None,
) -> dict[str, int | bool]:
    """Delete a reservation and any visits/money tied to it."""
    stamp = now or datetime.now(UTC)
    linked_visits = session.scalars(select(Visit).where(Visit.appointment_id == appointment.id)).all()
    stats = purge_visits(session, list(linked_visits), now=stamp)

    for event in session.scalars(
        select(AppointmentStatusEvent).where(AppointmentStatusEvent.appointment_id == appointment.id)
    ).all():
        session.delete(event)

    session.flush()
    session.delete(appointment)
    return {**stats, "appointmentDeleted": True}


def purge_patient_clinical_and_money(
    session: Session,
    patient_id: UUID,
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    """Remove all visits, money, and appointments for a patient (patient row kept for soft-delete)."""
    stamp = now or datetime.now(UTC)

    visits = session.scalars(select(Visit).where(Visit.patient_id == patient_id)).all()
    stats = purge_visits(session, list(visits), now=stamp)

    # Manual / patient-scoped ledger rows not tied to a (now deleted) visit.
    orphan_txs = session.scalars(
        select(FinancialTransaction).where(FinancialTransaction.patient_id == patient_id)
    ).all()
    for tx in orphan_txs:
        tx.reversal_of_id = None
    session.flush()
    for tx in orphan_txs:
        session.delete(tx)

    appointments = session.scalars(select(Appointment).where(Appointment.patient_id == patient_id)).all()
    for apt in appointments:
        for event in session.scalars(
            select(AppointmentStatusEvent).where(AppointmentStatusEvent.appointment_id == apt.id)
        ).all():
            session.delete(event)
    session.flush()
    for apt in appointments:
        session.delete(apt)

    # Soft-delete remaining patient attachments (no visit link required).
    attachments = session.scalars(
        select(Attachment).where(Attachment.patient_id == patient_id, Attachment.deleted_at.is_(None))
    ).all()
    for att in attachments:
        att.deleted_at = stamp

    return {
        **stats,
        "orphanTransactions": len(orphan_txs),
        "appointments": len(appointments),
        "attachmentsSoftDeleted": len(attachments),
    }


OPERATIONAL_TABLES = (
    "attachment_access_events",
    "financial_transactions",
    "visit_procedures",
    "appointment_status_events",
    "medical_history_flags",
    "patient_notes",
    "patient_care_assignments",
    "medical_histories",
    "dental_histories",
    "attachments",
    "visits",
    "appointments",
    "patients",
    "audit_logs",
    "notifications",
    "push_subscriptions",
    "outbox_events",
    "refresh_sessions",
    "password_reset_tokens",
    "auth_login_attempts",
)


def purge_all_operational_data(session: Session) -> dict[str, int | str]:
    """Hard-wipe all user-entered clinical, financial, and related operational rows.

    Preserves organizations, users, doctor_profiles, procedure_catalog,
    financial_categories, case_streams, and settings.
    """
    bind = session.get_bind()
    dialect = bind.dialect.name if bind is not None else "unknown"

    if dialect == "postgresql":
        session.execute(text("UPDATE financial_transactions SET reversal_of_id = NULL"))
        session.execute(
            text(
                "TRUNCATE TABLE "
                + ", ".join(OPERATIONAL_TABLES)
                + " RESTART IDENTITY CASCADE"
            )
        )
        session.flush()
        return {"mode": "truncate", "tables": len(OPERATIONAL_TABLES)}

    session.execute(update(FinancialTransaction).values(reversal_of_id=None))
    session.flush()

    counts: dict[str, int | str] = {"mode": "delete"}
    for model in (
        AttachmentAccessEvent,
        FinancialTransaction,
        VisitProcedure,
        AppointmentStatusEvent,
        MedicalHistoryFlag,
        PatientNote,
        PatientCareAssignment,
        MedicalHistory,
        DentalHistory,
        Attachment,
        Visit,
        Appointment,
        Patient,
        AuditLog,
        Notification,
        PushSubscription,
        OutboxEvent,
        RefreshSession,
        PasswordResetToken,
        AuthLoginAttempt,
    ):
        result = session.execute(delete(model))
        counts[model.__tablename__] = int(result.rowcount or 0)

    session.flush()
    return counts
