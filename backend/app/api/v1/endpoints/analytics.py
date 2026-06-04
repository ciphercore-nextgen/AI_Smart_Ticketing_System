from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.models import Ticket, TicketStatus, TicketPriority, User, Department
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = await db.execute(select(func.count(Ticket.id)))
    open_count = await db.execute(select(func.count(Ticket.id)).where(Ticket.status == TicketStatus.open))
    in_progress = await db.execute(select(func.count(Ticket.id)).where(Ticket.status == TicketStatus.in_progress))
    resolved = await db.execute(select(func.count(Ticket.id)).where(Ticket.status == TicketStatus.resolved))
    escalated = await db.execute(select(func.count(Ticket.id)).where(Ticket.is_escalated == True))
    critical = await db.execute(select(func.count(Ticket.id)).where(Ticket.priority == TicketPriority.critical))

    return {
        "total":       total.scalar() or 0,
        "open":        open_count.scalar() or 0,
        "in_progress": in_progress.scalar() or 0,
        "resolved":    resolved.scalar() or 0,
        "escalated":   escalated.scalar() or 0,
        "critical":    critical.scalar() or 0,
    }


@router.get("/by-department")
async def by_department(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Department.name, Department.color, func.count(Ticket.id).label("count"))
        .join(Ticket, Ticket.department_id == Department.id, isouter=True)
        .group_by(Department.id)
        .order_by(func.count(Ticket.id).desc())
    )
    return [{"name": r.name, "color": r.color, "count": r.count} for r in result]


@router.get("/by-priority")
async def by_priority(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket.priority, func.count(Ticket.id).label("count"))
        .group_by(Ticket.priority)
    )
    return [{"priority": r.priority.value if hasattr(r.priority, 'value') else r.priority, "count": r.count} for r in result]


@router.get("/by-status")
async def by_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket.status, func.count(Ticket.id).label("count"))
        .group_by(Ticket.status)
    )
    return [{"status": r.status.value if hasattr(r.status, 'value') else r.status, "count": r.count} for r in result]
