from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRETS = frozenset(
    {
        "development_secret_key_at_least_32_characters_long",
        "development_reset_secret_at_least_32_characters_long",
        "super_secret_jwt_signing_key_at_least_32_chars_long",
        "super_secret_password_reset_key_at_least_32_chars",
    }
)


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
    # When true, development startup may create demo users (requires SEED_* passwords).
    seed_demo_data: bool = False

    # Database Configuration (Supabase PostgreSQL or fallback SQLite)
    database_url: str = Field(default="sqlite:///./dentist_on_call.db")

    # Supabase Credentials (optional / populated via .env)
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_jwt_secret: str | None = None

    # Application Auth Secrets — override via env; production rejects insecure defaults
    jwt_secret: str = Field(default="development_secret_key_at_least_32_characters_long", min_length=32)
    password_reset_secret: str = Field(
        default="development_reset_secret_at_least_32_characters_long",
        min_length=32,
    )
    access_token_minutes: int = Field(default=15, ge=1, le=120)
    refresh_token_days: int = Field(default=14, ge=1, le=90)
    access_cookie_name: str = "doc_access"
    refresh_cookie_name: str = "doc_refresh"
    csrf_cookie_name: str = "doc_csrf"
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    login_rate_limit_attempts: int = Field(default=10, ge=1, le=100)
    login_rate_limit_minutes: int = Field(default=15, ge=1, le=60)
    password_reset_rate_limit_attempts: int = Field(default=5, ge=1, le=50)
    password_reset_rate_limit_minutes: int = Field(default=15, ge=1, le=60)
    default_timezone: str = "Africa/Cairo"

    # Optional passwords used only when SEED_DEMO_DATA=true
    seed_admin_password: str | None = None
    seed_doctor_password: str | None = None

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() == "production"

    @model_validator(mode="after")
    def harden_production_settings(self) -> "Settings":
        if not self.is_production:
            return self

        weak_jwt = self.jwt_secret in _INSECURE_DEFAULT_SECRETS or "development_" in self.jwt_secret
        weak_reset = (
            self.password_reset_secret in _INSECURE_DEFAULT_SECRETS
            or "development_" in self.password_reset_secret
        )
        if weak_jwt or weak_reset:
            raise ValueError(
                "Production requires strong JWT_SECRET and PASSWORD_RESET_SECRET "
                "(generate with: openssl rand -hex 32)."
            )
        if not self.cookie_secure:
            object.__setattr__(self, "cookie_secure", True)
        if self.seed_demo_data:
            raise ValueError("SEED_DEMO_DATA must be false in production.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
