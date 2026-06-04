from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
import bcrypt as _bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.models import User, RefreshToken
import secrets
import uuid


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, role: str, extra: dict = None) -> str:
    payload = {
        "sub":  str(user_id),
        "role": role,
        "iat":  datetime.now(timezone.utc),
        "exp":  datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti":  str(uuid.uuid4()),
        **(extra or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


async def create_refresh_token(db: AsyncSession, user_id: str) -> str:
    token_str = secrets.token_urlsafe(64)
    expires   = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    rt = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=str(user_id),
        token=token_str,
        expires_at=expires,
    )
    db.add(rt)
    await db.flush()
    return token_str


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.department))
        .where(User.email == email, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.department))
        .where(User.id == str(user_id))
    )
    return result.scalar_one_or_none()


def get_redirect_url(role: str) -> str:
    return {
        "employee":              "/dashboard/employee",
        "ai_intern":             "/dashboard/agent",
        "it_support_technician": "/dashboard/agent",
        "junior_operations":     "/dashboard/agent",
        "admin":                 "/dashboard/admin",
        "super_admin":           "/dashboard/admin",
    }.get(role, "/dashboard/employee")
