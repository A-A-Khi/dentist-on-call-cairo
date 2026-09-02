from fastapi import APIRouter, status
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
def healthcheck() -> HealthResponse:
    """Non-sensitive liveness endpoint for orchestration."""
    return HealthResponse(status="ok", service="dentist-on-call-api")
