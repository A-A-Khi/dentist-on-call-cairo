"""Case revenue share: doctor / assistant / referrer / Dentist on Call."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.operations import CaseStream
from app.models.patients import Patient

DOCTOR_SHARE_PERCENT = 35
ASSISTANT_SHARE_PERCENT = 15
MAX_REFERRAL_PERCENT = 100 - DOCTOR_SHARE_PERCENT - ASSISTANT_SHARE_PERCENT  # 50


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


def build_share_percents(referral_percent: int) -> dict[str, int]:
    referral = clamp_referral_percent(referral_percent)
    return {
        "doctor": DOCTOR_SHARE_PERCENT,
        "assistant": ASSISTANT_SHARE_PERCENT,
        "referral": referral,
        "org": 100 - DOCTOR_SHARE_PERCENT - ASSISTANT_SHARE_PERCENT - referral,
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


def visit_share_snapshot(session: Session, source_stream_id: UUID | None = None) -> dict[str, int]:
    """Snapshot share % for this visit from the chosen source (or fully ours)."""
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
) -> dict[str, Any]:
    percents = {
        "doctor": doctor_percent,
        "assistant": assistant_percent,
        "referral": referral_percent,
        "org": org_percent,
    }
    paid = max(0, int(paid_egp))
    costs = max(0, int(case_cost_egp))
    basis = split_basis_egp(paid, costs)
    amounts = allocate_egp(basis, percents)
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
