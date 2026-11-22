"""Add visit external_source/external_ref for call-center sync idempotency.

Revision ID: 20261123_0009
Revises: 20260918_0008
Create Date: 2026-11-23
"""

from alembic import op

revision = "20261123_0009"
down_revision = "20260918_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE visits
          ADD COLUMN IF NOT EXISTS external_source varchar(64),
          ADD COLUMN IF NOT EXISTS external_ref varchar(128)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_visits_organization_external
          ON visits (organization_id, external_source, external_ref)
          WHERE external_ref IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_visits_organization_external")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS external_ref")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS external_source")
