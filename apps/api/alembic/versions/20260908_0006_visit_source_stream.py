"""Snapshot case stream on visits for historical source reports.

Revision ID: 20260908_0006
Revises: 20260908_0005
Create Date: 2026-09-08
"""

from alembic import op

revision = "20260908_0006"
down_revision = "20260908_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE visits
          ADD COLUMN IF NOT EXISTS source_stream_id uuid
          REFERENCES case_streams(id) ON DELETE SET NULL
        """
    )
    op.execute(
        """
        UPDATE visits v
           SET source_stream_id = p.source_stream_id
          FROM patients p
         WHERE v.patient_id = p.id
           AND v.source_stream_id IS NULL
           AND p.source_stream_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_visits_organization_source_stream_id
          ON visits (organization_id, source_stream_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_visits_organization_source_stream_id")
    op.execute("ALTER TABLE visits DROP COLUMN IF EXISTS source_stream_id")
