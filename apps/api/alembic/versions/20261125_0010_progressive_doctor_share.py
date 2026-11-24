"""Progressive doctor share tiers from 2026-11-11.

Revision ID: 20261125_0010
Revises: 20261123_0009
Create Date: 2026-11-25

Doctor % on net case basis (paid − case costs), per doctor per Cairo month:
  0–50k → 35%, 50–100k → 20%, 100–200k → 10%, above 200k → 5%.
Backfills visit share snapshots for cases on/after 2026-11-11.
"""

from __future__ import annotations

from alembic import op
from sqlalchemy.orm import Session

revision = "20261125_0010"
down_revision = "20261123_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        from app.services.revenue_split import backfill_progressive_doctor_shares

        backfill_progressive_doctor_shares(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def downgrade() -> None:
    # Cannot restore prior per-visit progressive snapshots precisely.
    # Re-apply legacy flat 35% doctor / remainder org for post-policy visits.
    op.execute(
        """
        UPDATE visits
           SET doctor_share_percent = 35,
               org_share_percent = 100 - 35 - assistant_share_percent
                                   - referral_share_percent
         WHERE occurred_at >= TIMESTAMPTZ '2026-11-11 00:00:00+02'
        """
    )
