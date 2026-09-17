"""Raise fixed doctor share from 30% to 35%; max referral 50%.

Revision ID: 20260918_0008
Revises: 20260909_0007
Create Date: 2026-09-18

Rewrites existing visit share snapshots so doctor is 35% and org is the
remainder (assistant + referral unchanged). Reports/financials recompute EGP
from these percents.
"""

from alembic import op

revision = "20260918_0008"
down_revision = "20260909_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE case_streams
          DROP CONSTRAINT IF EXISTS ck_case_streams_referral_percent
        """
    )
    op.execute(
        """
        UPDATE case_streams
           SET referral_percent = 50
         WHERE referral_percent > 50
        """
    )
    op.execute(
        """
        ALTER TABLE case_streams
          ADD CONSTRAINT ck_case_streams_referral_percent
          CHECK (referral_percent >= 0 AND referral_percent <= 50)
        """
    )
    op.execute(
        """
        ALTER TABLE visits
          ALTER COLUMN doctor_share_percent SET DEFAULT 35,
          ALTER COLUMN org_share_percent SET DEFAULT 50
        """
    )
    # Backfill: doctor 35%, keep assistant + referral, org = remainder.
    op.execute(
        """
        UPDATE visits
           SET doctor_share_percent = 35,
               org_share_percent = 100 - 35 - assistant_share_percent
                                   - referral_share_percent
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE visits
           SET doctor_share_percent = 30,
               org_share_percent = 100 - 30 - assistant_share_percent
                                   - referral_share_percent
        """
    )
    op.execute(
        """
        ALTER TABLE visits
          ALTER COLUMN doctor_share_percent SET DEFAULT 30,
          ALTER COLUMN org_share_percent SET DEFAULT 55
        """
    )
    op.execute(
        """
        ALTER TABLE case_streams
          DROP CONSTRAINT IF EXISTS ck_case_streams_referral_percent
        """
    )
    op.execute(
        """
        ALTER TABLE case_streams
          ADD CONSTRAINT ck_case_streams_referral_percent
          CHECK (referral_percent >= 0 AND referral_percent <= 55)
        """
    )
