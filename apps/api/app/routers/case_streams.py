from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.dependencies import CurrentUser, DatabaseSession, require_csrf, require_roles
from app.models.enums import UserRole
from app.models.operations import CaseStream

router = APIRouter(prefix="/case-streams", tags=["case-streams"])


class CaseStreamCreateRequest(BaseModel):
    name_en: str = Field(..., min_length=2, max_length=160)
    name_ar: str | None = Field(None, max_length=160)


class CaseStreamUpdateRequest(BaseModel):
    name_en: str | None = Field(None, min_length=2, max_length=160)
    name_ar: str | None = Field(None, max_length=160)
    is_active: bool | None = None


def _stream_payload(stream: CaseStream) -> dict[str, Any]:
    return {
        "id": str(stream.id),
        "nameEn": stream.name_en,
        "nameAr": stream.name_ar,
        "isActive": stream.is_active,
    }


@router.get("")
def list_case_streams(
    current_user: CurrentUser,
    session: DatabaseSession,
    include_inactive: bool = Query(False),
) -> list[dict[str, Any]]:
    query = select(CaseStream).where(CaseStream.organization_id == current_user.organization_id)
    if not include_inactive:
        query = query.where(CaseStream.is_active.is_(True))
    query = query.order_by(CaseStream.name_en.asc())
    return [_stream_payload(s) for s in session.scalars(query).all()]


@router.post(
    "",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
    status_code=status.HTTP_201_CREATED,
)
def create_case_stream(
    payload: CaseStreamCreateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    name_en = payload.name_en.strip()
    existing = session.scalar(
        select(CaseStream).where(
            CaseStream.organization_id == current_user.organization_id,
            CaseStream.name_en == name_en,
        )
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.name_ar = payload.name_ar.strip() if payload.name_ar else existing.name_ar
            session.commit()
            return _stream_payload(existing)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Case stream already exists.")

    stream = CaseStream(
        id=uuid4(),
        organization_id=current_user.organization_id,
        name_en=name_en,
        name_ar=payload.name_ar.strip() if payload.name_ar else None,
        is_active=True,
    )
    session.add(stream)
    session.commit()
    return _stream_payload(stream)


@router.patch(
    "/{stream_id}",
    dependencies=[Depends(require_csrf), Depends(require_roles(UserRole.ADMIN))],
)
def update_case_stream(
    stream_id: UUID,
    payload: CaseStreamUpdateRequest,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, Any]:
    stream = session.get(CaseStream, stream_id)
    if stream is None or stream.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case stream not found.")

    if payload.name_en is not None:
        stream.name_en = payload.name_en.strip()
    if payload.name_ar is not None:
        stream.name_ar = payload.name_ar.strip() or None
    if payload.is_active is not None:
        stream.is_active = payload.is_active

    session.commit()
    return _stream_payload(stream)
