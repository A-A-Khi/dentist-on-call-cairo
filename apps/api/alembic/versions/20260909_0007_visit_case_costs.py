"""Deductible case costs before revenue share percentages.

Revision ID: 20260909_0007
Revises: 20260908_0006
Create Date: 2026-09-09
"""

from alembic import op

revision = "20260909_0007"
down_revision = "20260908_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE visits
          ADD COLUMN IF NOT EXISTS case_cost_minor bigint NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS case_cost_note varchar(160)
        """
    )
    op.execute(
        """
        ALTER TABLE visits
          ADD CONSTRAINT ck_visits_case_cost_minor_nonneg
          CHECK (case_cost_minor >= 0)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE visits DROP CONSTRAINT IF EXISTS ck_visits_case_cost_minor_nonneg")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS case_cost_note")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS case_cost_minor")
