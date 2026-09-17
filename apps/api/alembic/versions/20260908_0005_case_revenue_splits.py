"""Case revenue splits: referral % on streams + visit snapshots.

Revision ID: 20260908_0005
Revises: 20260907_0004
Create Date: 2026-09-08
"""

from alembic import op

revision = "20260908_0005"
down_revision = "20260907_0004"
branch_labels = None
depends_on = None

# Fixed shares: doctor 30%, assistant 15%; referral X% (admin); remainder = Dentist on Call.


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE case_streams
          ADD COLUMN referral_percent integer NOT NULL DEFAULT 0
        """
    )
    op.execute(
        """
        ALTER TABLE case_streams
          ADD CONSTRAINT ck_case_streams_referral_percent
          CHECK (referral_percent >= 0 AND referral_percent <= 55)
        """
    )
    op.execute(
        """
        ALTER TABLE visits
          ADD COLUMN doctor_share_percent integer NOT NULL DEFAULT 30,
          ADD COLUMN assistant_share_percent integer NOT NULL DEFAULT 15,
          ADD COLUMN referral_share_percent integer NOT NULL DEFAULT 0,
          ADD COLUMN org_share_percent integer NOT NULL DEFAULT 55
        """
    )
    op.execute(
        """
        ALTER TABLE visits
          ADD CONSTRAINT ck_visits_revenue_share_sum
          CHECK (
            doctor_share_percent >= 0
            AND assistant_share_percent >= 0
            AND referral_share_percent >= 0
            AND org_share_percent >= 0
            AND doctor_share_percent + assistant_share_percent
                + referral_share_percent + org_share_percent = 100
          )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE visits DROP CONSTRAINT IF EXISTS ck_visits_revenue_share_sum")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS org_share_percent")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS referral_share_percent")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS assistant_share_percent")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS doctor_share_percent")
    op.execute("ALTER TABLE case_streams DROP CONSTRAINT IF EXISTS ck_case_streams_referral_percent")
    op.execute("ALTER TABLE case_streams DROP COLUMN IF EXISTS referral_percent")
