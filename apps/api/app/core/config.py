from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed configuration supporting Supabase PostgreSQL and local environments."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        extra="ignore",
    )

    app_name: str = "Dentist on Call"
    app_env: str = "development"
    api_port: int = Field(default=8000, ge=1, le=65535)
    web_origin: str = "http://localhost:3000"
    # Comma-separated extra origins (e.g. Vercel preview/production URLs)
    extra_web_origins: str = ""
    cookie_secure: bool = False

    # Database Configuration (Supabase PostgreSQL or fallback SQLite)
    database_url: str = Field(default="sqlite:///./dentist_on_call.db")

    # Supabase Credentials (optional / populated via .env)
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_jwt_secret: str | None = None

    # Application Auth Secrets (falls back to dev keys if unset)
    jwt_secret: str = Field(default="development_secret_key_at_least_32_characters_long", min_length=32)
    password_reset_secret: str = Field(default="development_reset_secret_at_least_32_characters_long", min_length=32)
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=14, ge=1, le=90)
    access_cookie_name: str = "doc_access"
    refresh_cookie_name: str = "doc_refresh"
    csrf_cookie_name: str = "doc_csrf"
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    login_rate_limit_attempts: int = Field(default=10, ge=1, le=100)
    login_rate_limit_minutes: int = Field(default=15, ge=1, le=60)
    default_timezone: str = "Africa/Cairo"


@lru_cache
def get_settings() -> Settings:
    return Settings()
