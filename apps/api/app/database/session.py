import urllib.parse
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()


def get_engine_url(raw_url: str) -> str:
    """Normalize database connection URLs for PostgreSQL / Supabase with psycopg3.

    Handles:
    - Automatic URL-encoding of special characters in passwords (@, #, etc.)
    - Directs Supabase connections through the IPv4 connection pooler
    - Translates 'postgres://' -> 'postgresql+psycopg://'
    """
    if not raw_url or raw_url.startswith("sqlite"):
        return raw_url

    clean_url = raw_url
    if clean_url.startswith("postgres://"):
        clean_url = clean_url.replace("postgres://", "postgresql://", 1)

    if clean_url.startswith("postgresql://") or clean_url.startswith("postgresql+psycopg://"):
        prefix = "postgresql+psycopg://" if clean_url.startswith("postgresql+psycopg://") else "postgresql://"
        remainder = clean_url[len(prefix):]
        user_pass, _, host_part = remainder.rpartition("@")
        user, _, pwd = user_pass.partition(":")

        # If host points to db.<ref>.supabase.co:5432, route through IPv4 pooler
        if "db." in host_part and ".supabase.co" in host_part:
            ref = host_part.split("db.")[1].split(".supabase.co")[0]
            host_part = "aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require"
            if not user.startswith("postgres."):
                user = f"postgres.{ref}"

        encoded_pwd = urllib.parse.quote(urllib.parse.unquote(pwd), safe="")
        url = f"postgresql+psycopg://{user}:{encoded_pwd}@{host_part}"
        # Require TLS for non-local Postgres unless the URL already sets sslmode.
        if "sslmode=" not in url.lower() and "localhost" not in url and "127.0.0.1" not in url:
            url = f"{url}&sslmode=require" if "?" in url else f"{url}?sslmode=require"
        return url

    return clean_url


db_url = get_engine_url(settings.database_url)

if db_url.startswith("sqlite"):
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )
else:
    # Supabase PostgreSQL / PgBouncer pooler connection
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"prepare_threshold": None},
    )

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_session_factory() -> sessionmaker[Session]:
    return SessionLocal


def get_db_session() -> Generator[Session, None, None]:
    """Provide one transaction-aware session per request."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
