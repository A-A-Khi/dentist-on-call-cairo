"""Slim dashboard overview — counts and small slices, not full list payloads."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select

from app.auth.dependencies import (
    CurrentUser,
    DatabaseSession,
    current_doctor_profile_id,
    patient_access_clause,
)
from app.models.enums import AppointmentStatus, TransactionStatus, TransactionType, UserRole, VisitStatus
from app.models.identity import DoctorProfile, User
from app.models.operations import FinancialTransaction
from app.models.patients import Patient, Visit
from app.models.scheduling import Appointment
from app.services.revenue_split import allocate_egp, split_basis_egp

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _egp(minor: int | None) -> int:
    return (minor or 0) // 100


def _today_bounds() -> tuple[datetime, datetime, date]:
    today = datetime.now(UTC).date()
    start = datetime.combine(today, time.min, tzinfo=UTC)
    end = datetime.combine(today, time.max, tzinfo=UTC)
    return start, end, today


def _month_bounds() -> tuple[datetime, datetime, date, date]:
    today = datetime.now(UTC).date()
    start_d = today.replace(day=1)
    return (
        datetime.combine(start_d, time.min, tzinfo=UTC),
        datetime.combine(today, time.max, tzinfo=UTC),
        start_d,
        today,
    )


def _serialize_appointment_row(
    *,
    apt: Appointment,
    patient_code: str,
    patient_name: str,
    patient_phone: str,
    doctor_name: str,
) -> dict[str, Any]:
    return {
        "id": str(apt.id),
        "patientCode": patient_code,
        "patientName": patient_name,
        "patientPhone": patient_phone or "—",
        "doctorName": doctor_name,
        "date": apt.starts_at.strftime("%Y-%m-%d"),
        "time": apt.starts_at.strftime("%I:%M %p"),
        "durationMinutes": apt.duration_minutes,
        "procedure": apt.reason or "Clinical Consultation",
        "chiefComplaint": apt.notes or apt.reason or "—",
        "location": apt.location or "Room 1",
        "status": apt.status.value,
        "notes": apt.notes or "",
    }


def _joined_appointments(
    session: DatabaseSession,
    *,
    org_id: UUID,
    start_at: datetime,
    end_at: datetime,
    doctor_id: UUID | None = None,
    exclude_statuses: tuple[AppointmentStatus, ...] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    query = (
        select(
            Appointment,
            Patient.patient_code,
            Patient.full_name,
            Patient.phone,
            User.display_name,
        )
        .join(Patient, Patient.id == Appointment.patient_id)
        .outerjoin(DoctorProfile, DoctorProfile.id == Appointment.doctor_id)
        .outerjoin(User, User.id == DoctorProfile.user_id)
        .where(
            Appointment.organization_id == org_id,
            Appointment.starts_at >= start_at,
            Appointment.starts_at <= end_at,
            Patient.deleted_at.is_(None),
        )
        .order_by(Appointment.starts_at.asc())
    )
    if doctor_id is not None:
        query = query.where(Appointment.doctor_id == doctor_id)
    if exclude_statuses:
        query = query.where(Appointment.status.notin_(exclude_statuses))
    if limit is not None:
        query = query.limit(limit)

    rows = session.execute(query).all()
    return [
        _serialize_appointment_row(
            apt=apt,
            patient_code=code or "DOC-000000",
            patient_name=name or "Patient",
            patient_phone=phone or "—",
            doctor_name=doc_name or "Dr. Sayed El-Bahy",
        )
        for apt, code, name, phone, doc_name in rows
    ]


def _month_finance(session: DatabaseSession, org_id: UUID) -> dict[str, Any]:
    start_at, end_at, start_d, end_d = _month_bounds()

    visits = session.scalars(
        select(Visit)
        .join(Patient, Patient.id == Visit.patient_id)
        .where(
            Visit.organization_id == org_id,
            Visit.occurred_at >= start_at,
            Visit.occurred_at <= end_at,
            Visit.status.in_((VisitStatus.COMPLETED, VisitStatus.AMENDED)),
            Visit.paid_amount_minor > 0,
            Patient.deleted_at.is_(None),
        )
    ).all()

    gross_collected = 0
    clinic_share = 0
    by_day: dict[str, dict[str, int]] = defaultdict(lambda: {"paidEGP": 0, "clinicShareEGP": 0})

    for visit in visits:
        paid = _egp(visit.paid_amount_minor)
        if paid <= 0:
            continue
        case_cost = _egp(visit.case_cost_minor)
        basis = split_basis_egp(paid, case_cost)
        shares = allocate_egp(
            basis,
            {
                "doctor": visit.doctor_share_percent,
                "assistant": visit.assistant_share_percent,
                "referral": visit.referral_share_percent,
                "org": visit.org_share_percent,
            },
        )
        gross_collected += paid
        clinic_share += shares["org"]
        day_key = visit.occurred_at.astimezone(UTC).date().isoformat()
        by_day[day_key]["paidEGP"] += paid
        by_day[day_key]["clinicShareEGP"] += shares["org"]

    manual_revenue = session.scalar(
        select(func.coalesce(func.sum(FinancialTransaction.amount_minor), 0)).where(
            FinancialTransaction.organization_id == org_id,
            FinancialTransaction.type == TransactionType.REVENUE,
            FinancialTransaction.status == TransactionStatus.POSTED,
            FinancialTransaction.visit_id.is_(None),
            FinancialTransaction.effective_on >= start_d,
            FinancialTransaction.effective_on <= end_d,
        )
    ) or 0
    manual_egp = int(manual_revenue) // 100
    clinic_share += manual_egp
    gross_collected += manual_egp

    # Spread manual revenue onto effective day for sparkline continuity.
    if manual_egp > 0:
        manual_rows = session.execute(
            select(FinancialTransaction.effective_on, func.sum(FinancialTransaction.amount_minor))
            .where(
                FinancialTransaction.organization_id == org_id,
                FinancialTransaction.type == TransactionType.REVENUE,
                FinancialTransaction.status == TransactionStatus.POSTED,
                FinancialTransaction.visit_id.is_(None),
                FinancialTransaction.effective_on >= start_d,
                FinancialTransaction.effective_on <= end_d,
            )
            .group_by(FinancialTransaction.effective_on)
        ).all()
        for eff_on, minor_sum in manual_rows:
            day_key = eff_on.isoformat() if isinstance(eff_on, date) else str(eff_on)[:10]
            amount = int(minor_sum or 0) // 100
            by_day[day_key]["paidEGP"] += amount
            by_day[day_key]["clinicShareEGP"] += amount

    expenses = session.scalar(
        select(func.coalesce(func.sum(FinancialTransaction.amount_minor), 0)).where(
            FinancialTransaction.organization_id == org_id,
            FinancialTransaction.type == TransactionType.EXPENSE,
            FinancialTransaction.status == TransactionStatus.POSTED,
            FinancialTransaction.effective_on >= start_d,
            FinancialTransaction.effective_on <= end_d,
        )
    ) or 0
    expenses_egp = int(expenses) // 100
    net_clinic = clinic_share - expenses_egp

    days_out: list[dict[str, Any]] = []
    cursor = start_d
    while cursor <= end_d:
        key = cursor.isoformat()
        bucket = by_day.get(key, {"paidEGP": 0, "clinicShareEGP": 0})
        days_out.append(
            {
                "date": key,
                "paidEGP": bucket["paidEGP"],
                "clinicShareEGP": bucket["clinicShareEGP"],
            }
        )
        cursor += timedelta(days=1)

    return {
        "from": start_d.isoformat(),
        "to": end_d.isoformat(),
        "grossCollectedEGP": gross_collected,
        "clinicShareEGP": clinic_share,
        "netClinicProfitEGP": net_clinic,
        "byDay": days_out,
    }


@router.get("/overview")
def dashboard_overview(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    org_id = current_user.organization_id
    today_start, today_end, _today = _today_bounds()

    if current_user.role == UserRole.ADMIN:
        patients_count = session.scalar(
            select(func.count(Patient.id)).where(
                Patient.organization_id == org_id,
                Patient.deleted_at.is_(None),
            )
        ) or 0
        doctors_count = session.scalar(
            select(func.count(DoctorProfile.id)).where(DoctorProfile.organization_id == org_id)
        ) or 0
        today_count = session.scalar(
            select(func.count(Appointment.id)).where(
                Appointment.organization_id == org_id,
                Appointment.starts_at >= today_start,
                Appointment.starts_at <= today_end,
            )
        ) or 0

        today_schedule = _joined_appointments(
            session,
            org_id=org_id,
            start_at=today_start,
            end_at=today_end,
            limit=5,
        )

        recent = session.scalars(
            select(Patient)
            .where(Patient.organization_id == org_id, Patient.deleted_at.is_(None))
            .order_by(Patient.created_at.desc())
            .limit(4)
        ).all()
        recent_patients = [
            {
                "id": str(p.id),
                "code": p.patient_code,
                "fullName": p.full_name,
                "lastVisit": p.created_at.strftime("%Y-%m-%d"),
            }
            for p in recent
        ]

        return {
            "role": "ADMIN",
            "counts": {
                "patients": int(patients_count),
                "doctors": int(doctors_count),
                "todayAppointments": int(today_count),
            },
            "month": _month_finance(session, org_id),
            "todaySchedule": today_schedule,
            "recentPatients": recent_patients,
        }

    # Doctor path
    doctor_id = current_doctor_profile_id(session, current_user=current_user)
    if doctor_id is None:
        return {
            "role": "DOCTOR",
            "counts": {"todayQueue": 0, "patientsInCare": 0},
            "todayQueue": [],
        }

    excluded = (AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW)
    today_queue = _joined_appointments(
        session,
        org_id=org_id,
        start_at=today_start,
        end_at=today_end,
        doctor_id=doctor_id,
        exclude_statuses=excluded,
    )

    access = patient_access_clause(current_user, doctor_id)
    care_query = select(func.count(Patient.id)).where(
        Patient.organization_id == org_id,
        Patient.deleted_at.is_(None),
    )
    if access is False:
        patients_in_care = 0
    elif access is True:
        patients_in_care = session.scalar(care_query) or 0
    else:
        patients_in_care = session.scalar(care_query.where(access)) or 0

    return {
        "role": "DOCTOR",
        "counts": {
            "todayQueue": len(today_queue),
            "patientsInCare": int(patients_in_care),
        },
        "todayQueue": today_queue,
    }
