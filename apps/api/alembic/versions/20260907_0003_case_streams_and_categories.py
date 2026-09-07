"""Add case streams and patient source stream FK.

Revision ID: 20260907_0003
Revises: 20260902_0002
Create Date: 2026-09-07
"""

from alembic import op

revision = "20260907_0003"
down_revision = "20260902_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE case_streams (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          name_en varchar(160) NOT NULL,
          name_ar varchar(160),
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_case_streams_organization_name_en UNIQUE (organization_id, name_en)
        )
        """
    )
    op.execute(
        """
        ALTER TABLE patients
          ADD COLUMN source_stream_id uuid REFERENCES case_streams(id) ON DELETE SET NULL
        """
    )
    op.execute(
        "CREATE INDEX ix_patients_organization_source_stream ON patients (organization_id, source_stream_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_patients_organization_source_stream")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS source_stream_id")
    op.execute("DROP TABLE IF EXISTS case_streams")
