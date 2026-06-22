"""
notifications.py — per-user message notifications

Logic:
  Employee  → sees comments posted by agents/AI on their own submitted tickets
              (i.e. someone replied to them)
  Agent     → sees comments posted by employees on tickets assigned to them
              (i.e. the submitter replied or added info)
  Admin     → sees all unread comments across every ticket

A comment is considered "unread" / "new" if it was created after the
`since` query-param timestamp (ISO 8601 with Z).  The frontend sends
the timestamp of the last notification it already displayed.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional

from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.models import Ticket, TicketComment, User

router = APIRouter(prefix="/notifications", tags=["notifications"])

AGENT_ROLES = {"ai_intern", "it_support_technician", "junior_operations"}
ADMIN_ROLES = {"admin", "super_admin"}


def utc_iso(dt) -> "str | None":
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"


@router.get("")
async def get_notifications(
    since: Optional[str] = Query(
        None,
        description="ISO 8601 UTC timestamp (e.g. 2025-06-09T10:00:00Z). "
                    "Only return comments created after this moment.",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role

    # Parse `since` if provided
    since_dt: Optional[datetime] = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            # normalise to naive UTC for comparison with SQLite naive datetimes
            since_dt = since_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            since_dt = None

    # ── Build the base query depending on role ────────────────────────────────

    if role in ADMIN_ROLES:
        # Admins see every non-AI comment
        q = (
            select(TicketComment)
            .options(
                selectinload(TicketComment.author),
                selectinload(TicketComment.ticket).selectinload(Ticket.submitter),
                selectinload(TicketComment.ticket).selectinload(Ticket.assigned_agent),
                selectinload(TicketComment.ticket).selectinload(Ticket.department),
            )
            .join(Ticket, Ticket.id == TicketComment.ticket_id)
            .where(TicketComment.is_ai == False)
            .where(TicketComment.is_internal == False)
        )

    elif role in AGENT_ROLES:
        # Agents see employee replies on tickets assigned to them directly
        # OR routed to them via AI classification (ai_classification->routed_to_agent_id)
        from sqlalchemy import or_, cast, String
        q = (
            select(TicketComment)
            .options(
                selectinload(TicketComment.author),
                selectinload(TicketComment.ticket).selectinload(Ticket.submitter),
                selectinload(TicketComment.ticket).selectinload(Ticket.department),
            )
            .join(Ticket, Ticket.id == TicketComment.ticket_id)
            .where(
                or_(
                    Ticket.assigned_agent_id == current_user.id,
                    # Also catch tickets routed via AI but assigned_agent_id not yet set
                    cast(Ticket.ai_classification, String).contains(current_user.id),
                )
            )
            .where(TicketComment.author_id != current_user.id)
            .where(TicketComment.is_ai == False)
            .where(TicketComment.is_internal == False)
        )

    else:
        # Employees see agent + AI replies on their own tickets
        q = (
            select(TicketComment)
            .options(
                selectinload(TicketComment.author),
                selectinload(TicketComment.ticket).selectinload(Ticket.department),
                selectinload(TicketComment.ticket).selectinload(Ticket.assigned_agent),
            )
            .join(Ticket, Ticket.id == TicketComment.ticket_id)
            .where(Ticket.submitted_by_id == current_user.id)
            # only comments written by someone else (agent, AI, admin)
            .where(TicketComment.author_id != current_user.id)
        )

    if since_dt is not None:
        q = q.where(TicketComment.created_at > since_dt)

    q = q.order_by(TicketComment.created_at.desc()).limit(50)

    result = await db.execute(q)
    comments = result.scalars().all()

    notifications = []
    for c in comments:
        t = c.ticket
        author_name = "AI Assistant" if c.is_ai else (c.author.full_name if c.author else "Unknown")
        author_role = (
            "ai" if c.is_ai
            else (c.author.role.value if c.author and hasattr(c.author.role, "value") else "unknown")
        )

        notifications.append({
            "id":           c.id,
            "type":         "message",
            "ticket_id":    t.id,
            "ticket_number": t.ticket_number,
            "ticket_title": t.title,
            "department":   t.department.name if t.department else None,
            "author_name":  author_name,
            "author_role":  author_role,
            "is_ai":        c.is_ai,
            "is_internal":  c.is_internal,
            "preview":      c.content[:120] + ("…" if len(c.content) > 120 else ""),
            "created_at":   utc_iso(c.created_at),
        })

    return {"notifications": notifications, "count": len(notifications)}
