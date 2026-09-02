"""Add shared login-attempt rate-limit support.

Revision ID: 20260902_0002
Revises: 20260902_0001
Create Date: 2026-09-02
"""

from alembic import op

revision = "20260902_0002"
down_revision = "20260902_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE auth_login_attempts (
          id uuid PRIMARY KEY, email_hash varchar(64) NOT NULL, ip_hash varchar(64) NOT NULL,
          succeeded boolean NOT NULL, occurred_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_auth_login_attempts_email_ip_time ON auth_login_attempts (email_hash, ip_hash, occurred_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE auth_login_attempts")
