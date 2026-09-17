from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class AuthenticatedUserResponse(BaseModel):
    id: str
    organization_id: str
    email: EmailStr
    display_name: str
    role: str
    access_token: str | None = None
    refresh_token: str | None = None
    csrf_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    new_password: str = Field(min_length=12, max_length=256)
