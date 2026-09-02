from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all persistence models."""


# Enable SQLite compatibility in local development and testing
@compiles(CITEXT, "sqlite")
def compile_citext(type_, compiler, **kw):  # type: ignore[no-untyped-def]
    return "TEXT"


@compiles(JSONB, "sqlite")
def compile_jsonb(type_, compiler, **kw):  # type: ignore[no-untyped-def]
    return "JSON"


@compiles(PG_UUID, "sqlite")
def compile_pg_uuid(type_, compiler, **kw):  # type: ignore[no-untyped-def]
    return "CHAR(36)"
