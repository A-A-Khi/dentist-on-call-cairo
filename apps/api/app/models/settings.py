from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.mixins import OrganizationScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class SystemSetting(UUIDPrimaryKeyMixin, OrganizationScopedMixin, TimestampMixin, Base):
    """Allowlisted configuration record; never stores authentication or vendor secrets."""

    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("organization_id", "key", name="uq_settings_organization_key"),)

    key: Mapped[str] = mapped_column(String(160), nullable=False)
    value_json: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="ORGANIZATION")
    updated_by_user_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
