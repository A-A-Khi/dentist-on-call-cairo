"""Add visit total/paid amounts for partial payments.

Revision ID: 20260907_0004
Revises: 20260907_0003
Create Date: 2026-09-07
"""

from alembic import op

revision = "20260907_0004"
down_revision = "20260907_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE visits
          ADD COLUMN total_cost_minor bigint NOT NULL DEFAULT 0,
          ADD COLUMN paid_amount_minor bigint NOT NULL DEFAULT 0
        """
    )
    # Legacy visits: treat procedure sum as fully collected (prior behavior).
    op.execute(
        """
        UPDATE visits v
        SET
          total_cost_minor = COALESCE((
            SELECT SUM(COALESCE(vp.cost_minor, 0))
            FROM visit_procedures vp
            WHERE vp.visit_id = v.id
          ), 0),
          paid_amount_minor = COALESCE((
            SELECT SUM(COALESCE(vp.cost_minor, 0))
            FROM visit_procedures vp
            WHERE vp.visit_id = v.id
          ), 0)
        """
    )
    op.execute(
        """
        ALTER TABLE visits
          ADD CONSTRAINT ck_visits_paid_within_total
          CHECK (paid_amount_minor >= 0 AND paid_amount_minor <= total_cost_minor)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE visits DROP CONSTRAINT IF EXISTS ck_visits_paid_within_total")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS paid_amount_minor")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS total_cost_minor")
