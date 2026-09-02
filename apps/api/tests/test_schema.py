from sqlalchemy.orm import configure_mappers

import app.models  # noqa: F401
from app.database.base import Base


def test_every_business_table_is_organization_scoped() -> None:
    exempt_tables = {"organizations", "auth_login_attempts"}

    unscoped = [
        table.name
        for table in Base.metadata.tables.values()
        if table.name not in exempt_tables and "organization_id" not in table.c
    ]

    assert unscoped == []


def test_model_relationships_configure() -> None:
    configure_mappers()
