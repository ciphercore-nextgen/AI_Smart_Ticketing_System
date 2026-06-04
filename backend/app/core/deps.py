from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.services.auth.auth_service import decode_token, get_user_by_id
from app.models.models import User
from jose import JWTError

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_roles(*roles: str):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        role_val = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
        if role_val not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {roles}",
            )
        return current_user
    return checker


def is_agent(user: User) -> bool:
    agent_roles = {"ai_intern", "it_support_technician", "junior_operations"}
    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    return role_val in agent_roles


def is_admin(user: User) -> bool:
    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    return role_val in ("admin", "super_admin")
