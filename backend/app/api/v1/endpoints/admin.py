from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

from app.db.session import get_db
from app.core.deps import get_current_user, require_roles
from app.models.models import User, Department, UserRole, AutomationRule
from app.services.auth.auth_service import hash_password


from datetime import timezone

def utc_iso(dt) -> "str | None":
    """Return ISO 8601 with Z suffix so JS parses it as UTC, not local time."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"


router = APIRouter(prefix="/admin", tags=["admin"])

AdminOnly = require_roles("admin", "super_admin")


def _user_dict(u: User) -> dict:
    return {
        "id":                str(u.id),
        "email":             u.email,
        "full_name":         u.full_name,
        "role":              u.role.value if hasattr(u.role, "value") else str(u.role),
        "employee_id":       u.employee_id,
        "department_id":     u.department_id,
        "department_name":   u.department.name if u.department else None,
        "agent_departments": u.agent_departments or [],
        "agent_role_key":    u.agent_role_key,
        "job_title":         u.job_title,
        "is_active":         u.is_active,
        "can_approve":       getattr(u, "can_approve", False),
        "created_at":        utc_iso(u.created_at),
    }


@router.get("/users")
async def list_users(
    _:  User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).options(selectinload(User.department)).order_by(User.created_at)
    )
    return [_user_dict(u) for u in result.scalars().all()]


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str
    department_id: Optional[str] = None
    agent_departments: Optional[list] = None
    agent_role_key: Optional[str] = None
    job_title: Optional[str] = None
    employee_id: Optional[str] = None


@router.post("/users")
async def create_user(
    req: CreateUserRequest,
    _:   User = Depends(AdminOnly),
    db:  AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        email             = req.email,
        full_name         = req.full_name,
        hashed_password   = hash_password(req.password),
        role              = UserRole(req.role),
        department_id     = req.department_id,
        agent_departments = req.agent_departments or [],
        agent_role_key    = req.agent_role_key,
        job_title         = req.job_title,
        employee_id       = req.employee_id,
    )
    db.add(user)
    await db.flush()
    return _user_dict(user)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    req:     dict,
    _:       User = Depends(AdminOnly),
    db:      AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).options(selectinload(User.department)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field in ("full_name", "job_title", "agent_role_key", "agent_departments", "is_active", "can_approve"):
        if field in req:
            setattr(user, field, req[field])

    return _user_dict(user)


@router.get("/departments")
async def list_departments(
    _:  User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Department).order_by(Department.name))
    return [
        {
            "id":                str(d.id),
            "name":              d.name,
            "slug":              d.slug,
            "color":             d.color,
            "description":       d.description,
            "routed_agent_role": d.routed_agent_role,
            "is_active":         d.is_active,
        }
        for d in result.scalars().all()
    ]


@router.get("/system-stats")
async def system_stats(
    _:  User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    from app.models.models import Ticket
    total_users   = await db.execute(select(func.count(User.id)))
    total_tickets = await db.execute(select(func.count(Ticket.id)))
    return {
        "total_users":   total_users.scalar() or 0,
        "total_tickets": total_tickets.scalar() or 0,
    }


# ─── System Settings (persisted to a small JSON file) ─────────────────────────
import json
from pathlib import Path

SETTINGS_FILE = Path(__file__).resolve().parents[4] / "data" / "settings.json"

DEFAULT_SETTINGS = {
    "groq_model":   "openai/gpt-oss-20b",
    "auto_reply":   True,
    "self_help":    True,
    "tone_default": "formal",
    "sla_hours":    {"critical": 4, "high": 24, "medium": 72, "low": 168},
}


def _read_settings() -> dict:
    try:
        if SETTINGS_FILE.exists():
            data = json.loads(SETTINGS_FILE.read_text())
            return {**DEFAULT_SETTINGS, **data}
    except Exception as e:
        print(f"[Settings] read failed: {e}")
    return dict(DEFAULT_SETTINGS)


def _write_settings(data: dict) -> dict:
    merged = {**_read_settings(), **data}
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        SETTINGS_FILE.write_text(json.dumps(merged, indent=2))
    except Exception as e:
        print(f"[Settings] write failed: {e}")
    return merged


@router.get("/settings")
async def get_settings(_: User = Depends(AdminOnly)):
    return _read_settings()


@router.put("/settings")
async def update_settings(payload: dict, _: User = Depends(AdminOnly)):
    return _write_settings(payload)


# ─── Automation Rules (Approval Workflow) ─────────────────────────────────────

class AutomationRuleRequest(BaseModel):
    name: str
    condition_type: str    # "priority" | "department"
    condition_value: str
    is_active: bool = True


@router.get("/automation-rules")
async def list_automation_rules(_: User = Depends(AdminOnly), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AutomationRule).order_by(AutomationRule.created_at.desc()))
    return [
        {
            "id": r.id, "name": r.name, "condition_type": r.condition_type,
            "condition_value": r.condition_value, "action": r.action,
            "is_active": r.is_active,
        }
        for r in result.scalars().all()
    ]


@router.post("/automation-rules")
async def create_automation_rule(
    req: AutomationRuleRequest,
    _:   User = Depends(AdminOnly),
    db:  AsyncSession = Depends(get_db),
):
    rule = AutomationRule(
        id=str(uuid.uuid4()), name=req.name, condition_type=req.condition_type,
        condition_value=req.condition_value, is_active=req.is_active,
    )
    db.add(rule)
    await db.flush()
    return {"id": rule.id}


@router.patch("/automation-rules/{rule_id}")
async def update_automation_rule(
    rule_id: str,
    req: AutomationRuleRequest,
    _:   User = Depends(AdminOnly),
    db:  AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutomationRule).where(AutomationRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.name = req.name
    rule.condition_type = req.condition_type
    rule.condition_value = req.condition_value
    rule.is_active = req.is_active
    await db.flush()
    return {"id": rule.id}


@router.delete("/automation-rules/{rule_id}")
async def delete_automation_rule(
    rule_id: str,
    _:  User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutomationRule).where(AutomationRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule:
        await db.delete(rule)
        await db.flush()
    return {"deleted": True}
