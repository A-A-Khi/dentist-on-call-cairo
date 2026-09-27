"""Operational & acquisition analytics for the Reports center."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_roles
from app.models.enums import UserRole, VisitStatus
from app.models.identity import DoctorProfile, User
from app.models.operations import CaseStream
from app.models.patients import Patient, Visit, VisitProcedure
from app.services.revenue_split import allocate_egp, split_basis_egp

router = APIRouter(prefix="/reports", tags=["reports"])


def _egp(minor: int | None) -> int:
    return (minor or 0) // 100


def _parse_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _period_bounds(
    *,
    preset: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[datetime, datetime, str]:
    today = datetime.now(UTC).date()
    preset_key = (preset or "month").lower()

    if date_from or date_to:
        start_d = _parse_day(date_from) or today.replace(day=1)
        end_d = _parse_day(date_to) or today
        if end_d < start_d:
            start_d, end_d = end_d, start_d
        return (
            datetime.combine(start_d, time.min, tzinfo=UTC),
            datetime.combine(end_d, time.max, tzinfo=UTC),
            "custom",
        )

    if preset_key in ("week", "this_week"):
        start_d = today - timedelta(days=today.weekday())
        end_d = today
        label = "week"
    elif preset_key in ("year", "ytd", "this_year"):
        start_d = today.replace(month=1, day=1)
        end_d = today
        label = "year"
    elif preset_key in ("quarter", "this_quarter"):
        q_month = ((today.month - 1) // 3) * 3 + 1
        start_d = today.replace(month=q_month, day=1)
        end_d = today
        label = "quarter"
    else:
        start_d = today.replace(day=1)
        end_d = today
        label = "month"

    return (
        datetime.combine(start_d, time.min, tzinfo=UTC),
        datetime.combine(end_d, time.max, tzinfo=UTC),
        label,
    )


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part * 100.0) / whole, 1)


@router.get("/analytics", dependencies=[Depends(require_roles(UserRole.ADMIN))])
def reports_analytics(
    current_user: CurrentUser,
    session: DatabaseSession,
    preset: str | None = Query(None, description="week | month | quarter | year"),
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    stream_id: UUID | None = Query(None),
    doctor_id: UUID | None = Query(None),
) -> dict[str, Any]:
    org_id = current_user.organization_id
    start_at, end_at, period_label = _period_bounds(
        preset=preset, date_from=date_from, date_to=date_to
    )

    streams = session.scalars(
        select(CaseStream)
        .where(CaseStream.organization_id == org_id)
        .order_by(CaseStream.name_en.asc())
    ).all()
    stream_by_id = {s.id: s for s in streams}

    doctors = session.scalars(
        select(DoctorProfile).where(DoctorProfile.organization_id == org_id)
    ).all()
    doctor_options: list[dict[str, Any]] = []
    for doc in doctors:
        user = session.get(User, doc.user_id)
        doctor_options.append(
            {
                "id": str(doc.id),
                "name": user.display_name if user else "Doctor",
            }
        )

    visit_query = (
        select(Visit, Patient)
        .join(Patient, Patient.id == Visit.patient_id)
        .where(
            Visit.organization_id == org_id,
            Visit.occurred_at >= start_at,
            Visit.occurred_at <= end_at,
            Visit.status.in_((VisitStatus.COMPLETED, VisitStatus.AMENDED)),
            Patient.deleted_at.is_(None),
        )
    )
    if doctor_id is not None:
        visit_query = visit_query.where(Visit.doctor_id == doctor_id)
    if stream_id is not None:
        visit_query = visit_query.where(Visit.source_stream_id == stream_id)

    rows = session.execute(visit_query.order_by(Visit.occurred_at.asc())).all()

    totals = {
        "visits": 0,
        "patients": 0,
        "grossCollectedEGP": 0,
        "caseCostsEGP": 0,
        "splitBasisEGP": 0,
        "treatmentValueEGP": 0,
        "doctorShareEGP": 0,
        "assistantShareEGP": 0,
        "referralShareEGP": 0,
        "clinicShareEGP": 0,
        "outstandingEGP": 0,
    }
    patient_ids: set[UUID] = set()
    by_source: dict[str, dict[str, Any]] = {}
    by_day: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"visits": 0, "paidEGP": 0, "clinicShareEGP": 0, "treatmentValueEGP": 0}
    )
    by_month: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"visits": 0, "paidEGP": 0, "clinicShareEGP": 0, "treatmentValueEGP": 0}
    )
    by_doctor: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"visits": 0, "paidEGP": 0, "clinicShareEGP": 0, "name": "—"}
    )
    visit_ids: list[UUID] = []
    cases: list[dict[str, Any]] = []

    for visit, patient in rows:
        visit_ids.append(visit.id)
        patient_ids.add(patient.id)
        paid = _egp(visit.paid_amount_minor)
        total = _egp(visit.total_cost_minor)
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
        cases.append(
            {
                "visitId": str(visit.id),
                "occurredAt": visit.occurred_at.astimezone(UTC).isoformat(),
                "patientName": patient.full_name,
                "paidEGP": paid,
                "caseCostEGP": case_cost,
                "caseCostNote": visit.case_cost_note,
                "splitBasisEGP": basis,
                "doctorEGP": shares["doctor"],
                "assistantEGP": shares["assistant"],
                "referralEGP": shares["referral"],
                "clinicEGP": shares["org"],
                "doctorPercent": visit.doctor_share_percent,
                "assistantPercent": visit.assistant_share_percent,
                "referralPercent": visit.referral_share_percent,
                "orgPercent": visit.org_share_percent,
            }
        )

        resolved_stream_id = visit.source_stream_id
        if resolved_stream_id and resolved_stream_id in stream_by_id:
            stream = stream_by_id[resolved_stream_id]
            source_key = str(stream.id)
            source_name_en = stream.name_en
            source_name_ar = stream.name_ar
            referral_pct = visit.referral_share_percent
            is_owned = referral_pct == 0
        else:
            # No source chosen on the visit => fully ours this time.
            source_key = "dentist_on_call"
            source_name_en = "Dentist on Call"
            source_name_ar = "دنتست أون كول"
            referral_pct = 0
            is_owned = True

        if source_key not in by_source:
            by_source[source_key] = {
                "streamId": None if source_key == "dentist_on_call" else source_key,
                "nameEn": source_name_en,
                "nameAr": source_name_ar,
                "referralPercent": referral_pct,
                "isOwnedChannel": is_owned,
                "visitCount": 0,
                "patientIds": set(),
                "paidEGP": 0,
                "treatmentValueEGP": 0,
                "clinicShareEGP": 0,
                "referralShareEGP": 0,
                "doctorShareEGP": 0,
                "assistantShareEGP": 0,
            }
        bucket = by_source[source_key]
        bucket["visitCount"] += 1
        bucket["patientIds"].add(patient.id)
        bucket["paidEGP"] += paid
        bucket["treatmentValueEGP"] += total
        bucket["clinicShareEGP"] += shares["org"]
        bucket["referralShareEGP"] += shares["referral"]
        bucket["doctorShareEGP"] += shares["doctor"]
        bucket["assistantShareEGP"] += shares["assistant"]

        day_key = visit.occurred_at.astimezone(UTC).strftime("%Y-%m-%d")
        by_day[day_key]["visits"] += 1
        by_day[day_key]["paidEGP"] += paid
        by_day[day_key]["clinicShareEGP"] += shares["org"]
        by_day[day_key]["treatmentValueEGP"] += total

        month_key = visit.occurred_at.astimezone(UTC).strftime("%Y-%m")
        by_month[month_key]["visits"] += 1
        by_month[month_key]["paidEGP"] += paid
        by_month[month_key]["clinicShareEGP"] += shares["org"]
        by_month[month_key]["treatmentValueEGP"] += total

        doc_key = str(visit.doctor_id)
        doc_opt = next((d for d in doctor_options if d["id"] == doc_key), None)
        by_doctor[doc_key]["name"] = doc_opt["name"] if doc_opt else "Doctor"
        by_doctor[doc_key]["visits"] += 1
        by_doctor[doc_key]["paidEGP"] += paid
        by_doctor[doc_key]["clinicShareEGP"] += shares["org"]

        totals["visits"] += 1
        totals["grossCollectedEGP"] += paid
        totals["caseCostsEGP"] += case_cost
        totals["splitBasisEGP"] += basis
        totals["treatmentValueEGP"] += total
        totals["doctorShareEGP"] += shares["doctor"]
        totals["assistantShareEGP"] += shares["assistant"]
        totals["referralShareEGP"] += shares["referral"]
        totals["clinicShareEGP"] += shares["org"]
        totals["outstandingEGP"] += max(total - paid, 0)

    totals["patients"] = len(patient_ids)
    cases.sort(key=lambda c: c["occurredAt"], reverse=True)

    new_patients = session.scalar(
        select(func.count())
        .select_from(Patient)
        .where(
            Patient.organization_id == org_id,
            Patient.deleted_at.is_(None),
            Patient.created_at >= start_at,
            Patient.created_at <= end_at,
        )
    ) or 0

    # Top procedures in period (aligned with visit filters)
    if not visit_ids:
        proc_rows = []
    else:
        proc_query = (
            select(
                VisitProcedure.procedure_name,
                func.count(VisitProcedure.id),
                func.coalesce(func.sum(VisitProcedure.cost_minor), 0),
            )
            .where(
                VisitProcedure.organization_id == org_id,
                VisitProcedure.visit_id.in_(visit_ids),
            )
            .group_by(VisitProcedure.procedure_name)
            .order_by(func.coalesce(func.sum(VisitProcedure.cost_minor), 0).desc())
            .limit(20)
        )
        proc_rows = session.execute(proc_query).all()
    proc_revenue_total = sum(_egp(int(cost or 0)) for _, _, cost in proc_rows) or 0
    top_procedures = [
        {
            "name": name,
            "count": int(count or 0),
            "revenueEGP": _egp(int(cost or 0)),
            "percentOfRevenue": _pct(_egp(int(cost or 0)), proc_revenue_total),
        }
        for name, count, cost in proc_rows
    ]

    visit_total = totals["visits"] or 0
    sources_out: list[dict[str, Any]] = []
    for key, bucket in by_source.items():
        patient_count = len(bucket.pop("patientIds"))
        sources_out.append(
            {
                **bucket,
                "patientCount": patient_count,
                "percentOfVisits": _pct(bucket["visitCount"], visit_total),
            }
        )
    sources_out.sort(key=lambda s: s["visitCount"], reverse=True)

    days_out = [
        {"date": day, **vals}
        for day, vals in sorted(by_day.items(), key=lambda x: x[0])
    ]
    months_out = [
        {"month": month, **vals}
        for month, vals in sorted(by_month.items(), key=lambda x: x[0])
    ]
    doctors_out = [
        {"doctorId": doc_id, **vals}
        for doc_id, vals in sorted(by_doctor.items(), key=lambda x: x[1]["visits"], reverse=True)
    ]

    peak_day = max(days_out, key=lambda d: d["visits"], default=None)
    peak_month = max(months_out, key=lambda m: m["visits"], default=None)

    return {
        "period": {
            "preset": period_label,
            "from": start_at.date().isoformat(),
            "to": end_at.date().isoformat(),
        },
        "totals": {
            **totals,
            "newPatients": int(new_patients),
            "avgPaidPerVisitEGP": (
                round(totals["grossCollectedEGP"] / visit_total) if visit_total else 0
            ),
            "collectionRatePercent": _pct(
                totals["grossCollectedEGP"], totals["treatmentValueEGP"]
            ),
        },
        "bySource": sources_out,
        "byDay": days_out,
        "byMonth": months_out,
        "byDoctor": doctors_out,
        "topProcedures": top_procedures,
        "cases": cases,
        "insights": {
            "peakDay": peak_day,
            "peakMonth": peak_month,
            "ownedChannelVisits": sum(
                s["visitCount"] for s in sources_out if s.get("isOwnedChannel")
            ),
            "referrerChannelVisits": sum(
                s["visitCount"] for s in sources_out if not s.get("isOwnedChannel")
            ),
        },
        "filterOptions": {
            "streams": [
                {
                    "id": str(s.id),
                    "nameEn": s.name_en,
                    "nameAr": s.name_ar,
                    "referralPercent": s.referral_percent,
                    "isActive": s.is_active,
                }
                for s in streams
            ],
            "doctors": doctor_options,
        },
    }
