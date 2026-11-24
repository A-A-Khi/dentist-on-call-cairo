"""Case revenue share: doctor / assistant / referrer / Dentist on Call.

Doctor share (from 2026-11-11): progressive tiers on the doctor's monthly net
case basis (paid − case costs), in Africa/Cairo calendar months:

  0 – 50,000   → 35%
  50,001 – 100,000 → 20%
  100,001 – 200,000 → 10%
  above 200,000 → 5%

Visits before the policy date keep the legacy fixed 35% doctor share.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Sequence
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.operations import CaseStream
from app.models.patients import Patient, Visit

DOCTOR_SHARE_PERCENT = 35  # legacy fixed rate / first progressive band
ASSISTANT_SHARE_PERCENT = 15
MAX_REFERRAL_PERCENT = 100 - DOCTOR_SHARE_PERCENT - ASSISTANT_SHARE_PERCENT  # 50

# Progressive doctor commission (marginal brackets on monthly net basis EGP).
DOCTOR_SHARE_BRACKETS: tuple[tuple[int | None, int], ...] = (
    (50_000, 35),
    (100_000, 20),
    (200_000, 10),
    (None, 5),
)

POLICY_START_DATE = date(2026, 11, 11)
CLINIC_TZ = ZoneInfo("Africa/Cairo")


@dataclass(frozen=True)
class VisitShareInput:
    id: UUID
    doctor_id: UUID
    occurred_at: datetime
    paid_egp: int
    case_cost_egp: int
    assistant_percent: int
    referral_percent: int


def clamp_referral_percent(value: int | None) -> int:
    if value is None:
        return 0
    return max(0, min(int(value), MAX_REFERRAL_PERCENT))


def resolve_referral_percent_for_stream(session: Session, source_stream_id: UUID | None) -> int:
    """Referral % for a visit source. None/missing stream => fully ours (0%)."""
    if not source_stream_id:
        return 0
    stream = session.get(CaseStream, source_stream_id)
    if stream is None or not stream.is_active:
        return 0
    return clamp_referral_percent(stream.referral_percent)


def resolve_referral_percent(session: Session, patient: Patient) -> int:
    """Patient-level acquisition stream (registration). Visit splits use visit source."""
    return resolve_referral_percent_for_stream(session, patient.source_stream_id)


def build_share_percents(referral_percent: int, doctor_percent: int = DOCTOR_SHARE_PERCENT) -> dict[str, int]:
    referral = clamp_referral_percent(referral_percent)
    doctor = max(0, min(100, int(doctor_percent)))
    assistant = ASSISTANT_SHARE_PERCENT
    # Keep assistant + referral intact; org absorbs doctor-rate changes.
    max_doctor = max(0, 100 - assistant - referral)
    doctor = min(doctor, max_doctor)
    return {
        "doctor": doctor,
        "assistant": assistant,
        "referral": referral,
        "org": 100 - doctor - assistant - referral,
    }


def split_basis_egp(paid_egp: int, case_cost_egp: int = 0) -> int:
    """Amount to split after deducting case costs (lab, materials, etc.)."""
    return max(0, max(0, int(paid_egp)) - max(0, int(case_cost_egp)))


def allocate_egp(amount_egp: int, percents: dict[str, int]) -> dict[str, int]:
    """Split integer EGP by percent; leftover goes to org (Dentist on Call)."""
    amount = max(0, int(amount_egp))
    doctor = amount * percents["doctor"] // 100
    assistant = amount * percents["assistant"] // 100
    referral = amount * percents["referral"] // 100
    org = amount - doctor - assistant - referral
    return {
        "doctor": doctor,
        "assistant": assistant,
        "referral": referral,
        "org": org,
    }


def allocate_with_doctor_egp(
    amount_egp: int,
    *,
    doctor_egp: int,
    assistant_percent: int,
    referral_percent: int,
) -> dict[str, int]:
    """Split basis with an exact doctor EGP (progressive); leftover to org."""
    amount = max(0, int(amount_egp))
    doctor = max(0, min(amount, int(doctor_egp)))
    assistant = amount * max(0, int(assistant_percent)) // 100
    referral = amount * max(0, int(referral_percent)) // 100
    used = doctor + assistant + referral
    if used > amount:
        # Should not happen with max doctor band 35% + assistant 15% + referral ≤ 50%.
        overflow = used - amount
        doctor = max(0, doctor - overflow)
        used = doctor + assistant + referral
        if used > amount:
            referral = max(0, referral - (used - amount))
            used = doctor + assistant + referral
            if used > amount:
                assistant = max(0, assistant - (used - amount))
    org = amount - doctor - assistant - referral
    return {
        "doctor": doctor,
        "assistant": assistant,
        "referral": referral,
        "org": org,
    }


def visit_local_date(occurred_at: datetime) -> date:
    dt = occurred_at if occurred_at.tzinfo is not None else occurred_at.replace(tzinfo=UTC)
    return dt.astimezone(CLINIC_TZ).date()


def progressive_doctor_egp(basis_egp: int, prior_net_egp: int) -> int:
    """Marginal doctor share for `basis` given prior monthly net already counted."""
    remaining = max(0, int(basis_egp))
    cursor = max(0, int(prior_net_egp))
    doctor = 0
    for cap, rate in DOCTOR_SHARE_BRACKETS:
        if remaining <= 0:
            break
        if cap is not None:
            if cursor >= cap:
                continue
            room = cap - cursor
        else:
            room = remaining
        take = min(remaining, room)
        doctor += take * rate // 100
        remaining -= take
        cursor += take
    return doctor


def doctor_band_percent_at(prior_net_egp: int) -> int:
    """Which marginal rate applies to the next pound of monthly net."""
    cursor = max(0, int(prior_net_egp))
    for cap, rate in DOCTOR_SHARE_BRACKETS:
        if cap is None or cursor < cap:
            return rate
    return DOCTOR_SHARE_BRACKETS[-1][1]


def effective_doctor_percent(doctor_egp: int, basis_egp: int, *, fallback: int = DOCTOR_SHARE_PERCENT) -> int:
    basis = max(0, int(basis_egp))
    if basis <= 0:
        return fallback
    return max(0, min(100, int(round(max(0, int(doctor_egp)) * 100 / basis))))


def compute_share_amounts_by_visit(
    visits: Sequence[VisitShareInput],
) -> dict[UUID, dict[str, int]]:
    """Exact EGP shares per visit, applying progressive doctor tiers per doctor-month."""
    grouped: dict[tuple[UUID, int, int], list[VisitShareInput]] = {}
    for visit in visits:
        local = visit_local_date(visit.occurred_at)
        key = (visit.doctor_id, local.year, local.month)
        grouped.setdefault(key, []).append(visit)

    out: dict[UUID, dict[str, int]] = {}
    for rows in grouped.values():
        rows.sort(key=lambda v: (v.occurred_at, str(v.id)))
        progressive_prior = 0
        for visit in rows:
            basis = split_basis_egp(visit.paid_egp, visit.case_cost_egp)
            local = visit_local_date(visit.occurred_at)
            if local < POLICY_START_DATE:
                doctor_egp = basis * DOCTOR_SHARE_PERCENT // 100
                band = DOCTOR_SHARE_PERCENT
            else:
                doctor_egp = progressive_doctor_egp(basis, progressive_prior)
                band = doctor_band_percent_at(progressive_prior)
                progressive_prior += basis
            amounts = allocate_with_doctor_egp(
                basis,
                doctor_egp=doctor_egp,
                assistant_percent=visit.assistant_percent,
                referral_percent=visit.referral_percent,
            )
            doctor_percent = effective_doctor_percent(amounts["doctor"], basis, fallback=band)
            org_percent = max(
                0,
                100 - doctor_percent - visit.assistant_percent - visit.referral_percent,
            )
            out[visit.id] = {
                **amounts,
                "basis": basis,
                "doctor_percent": doctor_percent,
                "assistant_percent": visit.assistant_percent,
                "referral_percent": visit.referral_percent,
                "org_percent": org_percent,
            }
    return out


def visit_to_share_input(visit: Visit) -> VisitShareInput:
    return VisitShareInput(
        id=visit.id,
        doctor_id=visit.doctor_id,
        occurred_at=visit.occurred_at,
        paid_egp=(visit.paid_amount_minor or 0) // 100,
        case_cost_egp=(visit.case_cost_minor or 0) // 100,
        assistant_percent=visit.assistant_share_percent,
        referral_percent=visit.referral_share_percent,
    )


def compute_share_amounts_for_orm_visits(visits: Sequence[Visit]) -> dict[UUID, dict[str, int]]:
    return compute_share_amounts_by_visit([visit_to_share_input(v) for v in visits])


def compute_share_amounts_with_month_context(
    session: Session,
    visits: Sequence[Visit],
) -> dict[UUID, dict[str, int]]:
    """Like compute_share_amounts_for_orm_visits, but loads full doctor-months for correct tiers.

    Needed when `visits` is a date-filtered subset — progressive brackets depend on
    earlier same-month cases that may fall outside the filter window.
    """
    if not visits:
        return {}
    needed: set[tuple[UUID, datetime]] = set()
    for visit in visits:
        local = visit_local_date(visit.occurred_at)
        # One anchor datetime per doctor-month is enough for load_doctor_month_visits.
        needed.add((visit.doctor_id, datetime(local.year, local.month, 15, tzinfo=CLINIC_TZ)))

    by_id: dict[UUID, Visit] = {v.id: v for v in visits}
    for doctor_id, anchor in needed:
        for sibling in load_doctor_month_visits(session, doctor_id, anchor):
            by_id[sibling.id] = sibling
    return compute_share_amounts_for_orm_visits(list(by_id.values()))


def month_bounds_utc(around: datetime) -> tuple[datetime, datetime]:
    """Inclusive-start / exclusive-end UTC bounds for the Cairo calendar month of `around`."""
    dt = around if around.tzinfo is not None else around.replace(tzinfo=UTC)
    local = dt.astimezone(CLINIC_TZ)
    start_local = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_local.month == 12:
        end_local = start_local.replace(year=start_local.year + 1, month=1)
    else:
        end_local = start_local.replace(month=start_local.month + 1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def load_doctor_month_visits(session: Session, doctor_id: UUID, around: datetime) -> list[Visit]:
    start_at, end_at = month_bounds_utc(around)
    return list(
        session.scalars(
            select(Visit)
            .where(
                Visit.doctor_id == doctor_id,
                Visit.occurred_at >= start_at,
                Visit.occurred_at < end_at,
            )
            .order_by(Visit.occurred_at.asc(), Visit.id.asc())
        ).all()
    )


def persist_doctor_month_shares(session: Session, doctor_id: UUID, around: datetime) -> None:
    """Rewrite doctor/org % snapshots for all visits in that doctor's Cairo month."""
    visits = load_doctor_month_visits(session, doctor_id, around)
    if not visits:
        return
    amounts = compute_share_amounts_for_orm_visits(visits)
    for visit in visits:
        share = amounts[visit.id]
        visit.doctor_share_percent = share["doctor_percent"]
        visit.org_share_percent = share["org_percent"]


def visit_share_snapshot(session: Session, source_stream_id: UUID | None = None) -> dict[str, int]:
    """Initial share % snapshot (doctor starts at first-band 35%; recalc may adjust)."""
    return build_share_percents(resolve_referral_percent_for_stream(session, source_stream_id))


def serialize_revenue_share(
    *,
    doctor_percent: int,
    assistant_percent: int,
    referral_percent: int,
    org_percent: int,
    paid_egp: int,
    case_cost_egp: int = 0,
    case_cost_note: str | None = None,
    doctor_egp: int | None = None,
    assistant_egp: int | None = None,
    referral_egp: int | None = None,
    org_egp: int | None = None,
    basis_egp: int | None = None,
) -> dict[str, Any]:
    paid = max(0, int(paid_egp))
    costs = max(0, int(case_cost_egp))
    basis = split_basis_egp(paid, costs) if basis_egp is None else max(0, int(basis_egp))
    if doctor_egp is None:
        amounts = allocate_egp(
            basis,
            {
                "doctor": doctor_percent,
                "assistant": assistant_percent,
                "referral": referral_percent,
                "org": org_percent,
            },
        )
    else:
        amounts = {
            "doctor": max(0, int(doctor_egp)),
            "assistant": max(0, int(assistant_egp or 0)),
            "referral": max(0, int(referral_egp or 0)),
            "org": max(0, int(org_egp or 0)),
        }
        if assistant_egp is None or referral_egp is None or org_egp is None:
            amounts = allocate_with_doctor_egp(
                basis,
                doctor_egp=doctor_egp,
                assistant_percent=assistant_percent,
                referral_percent=referral_percent,
            )
    return {
        "doctorPercent": doctor_percent,
        "assistantPercent": assistant_percent,
        "referralPercent": referral_percent,
        "orgPercent": org_percent,
        "paidEGP": paid,
        "caseCostEGP": costs,
        "caseCostNote": case_cost_note,
        "basisEGP": basis,
        "doctorEGP": amounts["doctor"],
        "assistantEGP": amounts["assistant"],
        "referralEGP": amounts["referral"],
        "orgEGP": amounts["org"],
    }


def serialize_visit_revenue_share(session: Session, visit: Visit) -> dict[str, Any]:
    """Revenue share for one visit using progressive month context when applicable."""
    siblings = load_doctor_month_visits(session, visit.doctor_id, visit.occurred_at)
    amounts = compute_share_amounts_for_orm_visits(siblings)
    share = amounts.get(visit.id)
    if share is None:
        return serialize_revenue_share(
            doctor_percent=visit.doctor_share_percent,
            assistant_percent=visit.assistant_share_percent,
            referral_percent=visit.referral_share_percent,
            org_percent=visit.org_share_percent,
            paid_egp=(visit.paid_amount_minor or 0) // 100,
            case_cost_egp=(visit.case_cost_minor or 0) // 100,
            case_cost_note=visit.case_cost_note,
        )
    return serialize_revenue_share(
        doctor_percent=share["doctor_percent"],
        assistant_percent=share["assistant_percent"],
        referral_percent=share["referral_percent"],
        org_percent=share["org_percent"],
        paid_egp=(visit.paid_amount_minor or 0) // 100,
        case_cost_egp=(visit.case_cost_minor or 0) // 100,
        case_cost_note=visit.case_cost_note,
        doctor_egp=share["doctor"],
        assistant_egp=share["assistant"],
        referral_egp=share["referral"],
        org_egp=share["org"],
        basis_egp=share["basis"],
    )


def backfill_progressive_doctor_shares(session: Session) -> int:
    """Recalc snapshots for every doctor-month that has visits on/after the policy date."""
    start_at = datetime.combine(POLICY_START_DATE, datetime.min.time(), tzinfo=CLINIC_TZ).astimezone(UTC)
    visits = session.scalars(
        select(Visit).where(Visit.occurred_at >= start_at).order_by(Visit.occurred_at.asc(), Visit.id.asc())
    ).all()
    seen: set[tuple[UUID, int, int]] = set()
    for visit in visits:
        local = visit_local_date(visit.occurred_at)
        key = (visit.doctor_id, local.year, local.month)
        if key in seen:
            continue
        seen.add(key)
        persist_doctor_month_shares(session, visit.doctor_id, visit.occurred_at)
    return len(seen)
