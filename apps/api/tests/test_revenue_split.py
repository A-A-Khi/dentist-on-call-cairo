"""Progressive doctor share brackets."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from app.services.revenue_split import (
    DOCTOR_SHARE_PERCENT,
    VisitShareInput,
    compute_share_amounts_by_visit,
    progressive_doctor_egp,
    split_basis_egp,
)


def test_split_basis_deducts_case_costs() -> None:
    assert split_basis_egp(10_000, 2_500) == 7_500
    assert split_basis_egp(1_000, 2_000) == 0


def test_progressive_first_band() -> None:
    assert progressive_doctor_egp(40_000, 0) == 14_000  # 35%


def test_progressive_spans_brackets() -> None:
    # prior 45k, basis 10k → 5k@35% + 5k@20% = 1_750 + 1_000
    assert progressive_doctor_egp(10_000, 45_000) == 2_750


def test_progressive_top_band() -> None:
    assert progressive_doctor_egp(10_000, 200_000) == 500  # 5%


def test_monthly_sequence_applies_tiers() -> None:
    doctor_id = uuid4()
    day = datetime(2026, 11, 12, 10, 0, tzinfo=UTC)
    visits = [
        VisitShareInput(
            id=uuid4(),
            doctor_id=doctor_id,
            occurred_at=day,
            paid_egp=50_000,
            case_cost_egp=0,
            assistant_percent=15,
            referral_percent=0,
        ),
        VisitShareInput(
            id=uuid4(),
            doctor_id=doctor_id,
            occurred_at=datetime(2026, 11, 13, 10, 0, tzinfo=UTC),
            paid_egp=50_000,
            case_cost_egp=0,
            assistant_percent=15,
            referral_percent=0,
        ),
        VisitShareInput(
            id=uuid4(),
            doctor_id=doctor_id,
            occurred_at=datetime(2026, 11, 14, 10, 0, tzinfo=UTC),
            paid_egp=20_000,
            case_cost_egp=0,
            assistant_percent=15,
            referral_percent=0,
        ),
    ]
    amounts = compute_share_amounts_by_visit(visits)
    assert amounts[visits[0].id]["doctor"] == 17_500  # 35% of 50k
    assert amounts[visits[1].id]["doctor"] == 10_000  # 20% of next 50k
    assert amounts[visits[2].id]["doctor"] == 2_000  # 10% of next 20k


def test_pre_policy_stays_fixed_35() -> None:
    doctor_id = uuid4()
    visit = VisitShareInput(
        id=uuid4(),
        doctor_id=doctor_id,
        occurred_at=datetime(2026, 11, 10, 10, 0, tzinfo=UTC),
        paid_egp=80_000,
        case_cost_egp=0,
        assistant_percent=15,
        referral_percent=0,
    )
    amounts = compute_share_amounts_by_visit([visit])
    assert amounts[visit.id]["doctor"] == 80_000 * DOCTOR_SHARE_PERCENT // 100


def test_case_cost_reduces_basis_before_tiers() -> None:
    doctor_id = uuid4()
    visit = VisitShareInput(
        id=uuid4(),
        doctor_id=doctor_id,
        occurred_at=datetime(2026, 11, 12, 10, 0, tzinfo=UTC),
        paid_egp=60_000,
        case_cost_egp=10_000,
        assistant_percent=15,
        referral_percent=0,
    )
    amounts = compute_share_amounts_by_visit([visit])
    # Net 50k @ 35%
    assert amounts[visit.id]["basis"] == 50_000
    assert amounts[visit.id]["doctor"] == 17_500
