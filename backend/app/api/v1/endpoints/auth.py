from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone

from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.models import User, RefreshToken
from app.services.auth.auth_service import (
    authenticate_user, create_access_token, create_refresh_token,
    hash_password, get_redirect_url
)
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _user_to_dict(user: User) -> dict:
    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    return {
        "id":                   str(user.id),
        "email":                user.email,
        "full_name":            user.full_name,
        "role":                 role_val,
        "employee_id":          user.employee_id,
        "department_id":        str(user.department_id) if user.department_id else None,
        "department_name":      user.department.name if user.department else None,
        "agent_departments":    user.agent_departments or [],
        "agent_role_key":       user.agent_role_key,
        "job_title":            user.job_title,
        "office_location":      user.office_location,
        "avatar_url":           user.avatar_url,
        "permissions":          user.permissions or [],
        "can_approve":          getattr(user, "can_approve", False),
    }


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    access_token = create_access_token(str(user.id), role_val)
    refresh_token = await create_refresh_token(db, str(user.id))

    user.last_login = datetime.now(timezone.utc)

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "user":          _user_to_dict(user),
        "redirect_url":  get_redirect_url(role_val),
    }


@router.post("/refresh")
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token == req.refresh_token,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    from sqlalchemy.orm import selectinload
    user_result = await db.execute(
        select(User).options(selectinload(User.department)).where(User.id == rt.user_id)
    )
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    new_access = create_access_token(str(user.id), role_val)

    return {"access_token": new_access, "token_type": "bearer"}


@router.post("/logout")
async def logout(req: LogoutRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == req.refresh_token)
    )
    rt = result.scalar_one_or_none()
    if rt:
        rt.revoked = True
    return {"message": "Logged out"}


@router.get("/me")
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User).options(selectinload(User.department)).where(User.id == current_user.id)
    )
    user = result.scalar_one()
    return _user_to_dict(user)
