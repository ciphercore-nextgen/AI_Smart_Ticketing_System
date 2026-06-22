from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.db.session import get_db
from app.core.deps import get_current_user, is_admin, is_agent
from app.models.models import Ticket, TicketStatus, User, TicketComment, AuditLog
from app.services.tickets.ticket_service import create_ticket, get_tickets_for_user
from app.services.ai.groq_service import generate_ai_reply


def utc_iso(dt) -> "str | None":
    """
    Serialize a datetime to ISO 8601 with an explicit UTC "Z" marker.

    SQLite stores DateTime as naive (no tzinfo) even though utcnow() returns
    a UTC-aware value.  Without the Z suffix, JavaScript's Date() constructor
    treats the string as *local* time — so in UTC+2 (South Africa) every
    timestamp appears 2 hours in the past.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"


router = APIRouter(prefix="/tickets", tags=["tickets"])


def _ticket_to_dict(t: Ticket) -> dict:
    ai = t.ai_classification or {}
    return {
        "id":              t.id,
        "ticket_number":   t.ticket_number,
        "title":           t.title,
        "description":     t.description,
        "status":          t.status.value if hasattr(t.status, "value") else str(t.status),
        "priority":        t.priority.value if hasattr(t.priority, "value") else str(t.priority),
        "is_escalated":    t.is_escalated,
        "sla_deadline":    utc_iso(t.sla_deadline),
        "sla_breached":    t.sla_breached,
        "resolution_note": t.resolution_note,
        "self_help_shown":      getattr(t, "self_help_shown", False),
        "self_help_resolved":   getattr(t, "self_help_resolved", None),
        "self_help_steps_done": getattr(t, "self_help_steps_done", None),
        "self_help_outcome_at": utc_iso(getattr(t, "self_help_outcome_at", None)),
        "created_at":      utc_iso(t.created_at),
        "updated_at":      utc_iso(t.updated_at),
        "resolved_at":     utc_iso(t.resolved_at),
        "department": {
            "id":    t.department.id,
            "name":  t.department.name,
            "slug":  t.department.slug,
            "color": t.department.color,
        } if t.department else None,
        "submitter": {
            "id":        t.submitter.id,
            "full_name": t.submitter.full_name,
            "email":     t.submitter.email,
        } if t.submitter else None,
        "assigned_agent": {
            "id":             t.assigned_agent.id,
            "full_name":      t.assigned_agent.full_name,
            "job_title":      t.assigned_agent.job_title,
            "agent_role_key": t.assigned_agent.agent_role_key,
        } if t.assigned_agent else None,
        # Full AI routing intelligence exposed to the frontend
        "ai": {
            "department_slug":      ai.get("department_slug"),
            "category":             ai.get("category"),
            "sentiment":            ai.get("sentiment"),
            "confidence":           ai.get("selection_confidence"),
            "summary":              ai.get("summary"),
            "priority_reason":      ai.get("priority_reason"),
            # Tokenization data
            "skill_tokens":         ai.get("skill_tokens", []),
            "token_weights":        ai.get("token_weights", {}),
            "token_match_score":    ai.get("token_match_score"),
            # Routing decision
            "routed_to_role":       ai.get("routed_to_role"),
            "routed_to_agent_name": ai.get("routed_to_agent_name"),
            "routing_rationale":    ai.get("routing_rationale"),
            "selected_by":          ai.get("selected_by"),
            "classified_by":        ai.get("classified_by"),
        },
    }


class CreateTicketRequest(BaseModel):
    title: str
    description: str


class UpdateStatusRequest(BaseModel):
    status: str
    resolution_note: Optional[str] = None


class AssignRequest(BaseModel):
    agent_id: str


class EscalateRequest(BaseModel):
    reason: str


class CommentRequest(BaseModel):
    content: str
    is_internal: bool = False


@router.get("/")
async def list_tickets(
    status:       Optional[str] = Query(None),
    priority:     Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    params = {}
    if status:   params["status"]   = status
    if priority: params["priority"] = priority
    tickets = await get_tickets_for_user(db, current_user, params)
    return {"tickets": [_ticket_to_dict(t) for t in tickets], "total": len(tickets)}


@router.post("/")
async def create_new_ticket(
    req:          CreateTicketRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val not in ("employee", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only employees can submit tickets")

    ticket = await create_ticket(db, req.title, req.description, current_user.id)

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        ticket_id=ticket.id,
        user_id=current_user.id,
        action="ticket_created",
        details={
            "title":            req.title,
            "ai_dept":          (ticket.ai_classification or {}).get("department_slug"),
            "ai_agent":         (ticket.ai_classification or {}).get("routed_to_agent_name"),
            "token_match_score":(ticket.ai_classification or {}).get("token_match_score"),
        },
    ))

    return _ticket_to_dict(ticket)


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id:    str,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
            selectinload(Ticket.comments).selectinload(TicketComment.author),
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    data = _ticket_to_dict(ticket)
    data["comments"] = [
        {
            "id":          c.id,
            "content":     c.content,
            "is_internal": c.is_internal,
            "is_ai":       c.is_ai,
            "created_at":  utc_iso(c.created_at),
            "author": {
                "full_name": c.author.full_name,
                "role":      c.author.role.value if c.author else "unknown",
            } if c.author else None,
        }
        for c in sorted(ticket.comments, key=lambda x: x.created_at)
    ]
    return data


@router.patch("/{ticket_id}/status")
async def update_status(
    ticket_id:    str,
    req:          UpdateStatusRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket).options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
        ).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    try:
        ticket.status = TicketStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}")

    if req.resolution_note:
        ticket.resolution_note = req.resolution_note
    if req.status in ("resolved", "closed"):
        ticket.resolved_at = datetime.now(timezone.utc)

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        ticket_id=ticket.id,
        user_id=current_user.id,
        action="status_changed",
        details={"new_status": req.status},
    ))
    return _ticket_to_dict(ticket)


@router.patch("/{ticket_id}/assign")
async def assign_ticket(
    ticket_id:    str,
    req:          AssignRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    if not (is_agent(current_user) or is_admin(current_user)):
        raise HTTPException(status_code=403, detail="Only agents/admins can assign tickets")

    result = await db.execute(
        select(Ticket).options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
        ).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.assigned_agent_id = req.agent_id
    ticket.status = TicketStatus.assigned
    return _ticket_to_dict(ticket)


@router.post("/{ticket_id}/escalate")
async def escalate_ticket(
    ticket_id:    str,
    req:          EscalateRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket).options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
        ).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.is_escalated = True
    ticket.status = TicketStatus.escalated
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        ticket_id=ticket.id,
        user_id=current_user.id,
        action="ticket_escalated",
        details={"reason": req.reason},
    ))
    return _ticket_to_dict(ticket)


@router.post("/{ticket_id}/comments")
async def add_comment(
    ticket_id:    str,
    req:          CommentRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    comment = TicketComment(
        id=str(uuid.uuid4()),
        ticket_id=ticket_id,
        author_id=current_user.id,
        content=req.content,
        is_internal=req.is_internal,
    )
    db.add(comment)
    await db.flush()
    return {
        "id":          comment.id,
        "content":     comment.content,
        "is_internal": comment.is_internal,
        "created_at":  utc_iso(comment.created_at),
    }


@router.get("/{ticket_id}/ai-reply")
async def get_ai_reply(
    ticket_id:    str,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ticket).options(selectinload(Ticket.department)).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    from app.api.v1.endpoints.admin import _read_settings
    settings_cfg = _read_settings()
    if not settings_cfg.get("auto_reply", True):
        return {"reply": None, "enabled": False}

    dept_name  = ticket.department.name if ticket.department else "Support"
    category   = (ticket.ai_classification or {}).get("category", "General")
    agent_role = getattr(current_user, "agent_role_key", None) or "it_support_technician"
    reply = await generate_ai_reply(ticket.title, ticket.description, dept_name, category, agent_role)
    return {"reply": reply, "enabled": True}


# ─── Self-Help Outcome Endpoint ───────────────────────────────────────────────

@router.post("/{ticket_id}/self-help-outcome")
async def report_self_help_outcome(
    ticket_id:    str,
    payload:      dict,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """Employee reports whether self-help resolved their issue."""
    result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.assigned_agent))
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    resolved    = payload.get("resolved", False)       # bool
    steps_done  = payload.get("steps_done", [])        # list of step order ints

    from app.models.models import utcnow, TicketStatus, AuditLog
    ticket.self_help_shown      = True
    ticket.self_help_resolved   = resolved
    ticket.self_help_steps_done = steps_done
    ticket.self_help_outcome_at = utcnow()

    if resolved:
        # Auto-close: set to resolved, add a system comment, log it
        ticket.status      = TicketStatus.resolved
        ticket.resolved_at = utcnow()
        ticket.resolution_note = "Resolved by employee using AI self-help suggestions."

        # System comment visible to agent
        from app.models.models import TicketComment
        bot_comment = TicketComment(
            ticket_id   = ticket_id,
            author_id   = current_user.id,
            content     = (
                "Self-help resolved this ticket.\n\n"
                f"The employee confirmed the AI self-help steps fixed their issue "
                f"({len(steps_done)} of the suggested steps were completed).\n\n"
                "The ticket has been automatically resolved. "
                "Please verify with the employee that everything is working correctly "
                "as a final safety check."
            ),
            is_internal = True,
            is_ai       = True,
        )
        db.add(bot_comment)

        db.add(AuditLog(
            ticket_id = ticket_id,
            user_id   = current_user.id,
            action    = "self_help_resolved",
            details   = {"steps_done": steps_done, "auto_closed": True},
        ))
    else:
        from app.models.models import TicketComment, TicketStatus as TS
        from sqlalchemy import select as sa_select

        # Ensure ticket has an assigned agent — if not, look up from ai_classification
        if not ticket.assigned_agent_id:
            routed_id = (ticket.ai_classification or {}).get("routed_to_agent_id")
            if routed_id:
                ticket.assigned_agent_id = routed_id
                ticket.status = TS.assigned
                await db.flush()

        # Move to in_progress so it's clearly active for the agent
        if ticket.status in (TS.open, TS.pending, TS.assigned):
            ticket.status = TS.in_progress

        # Public comment authored by employee — this is what triggers
        # the agent notification query (employee comment on assigned ticket)
        bot_comment = TicketComment(
            ticket_id   = ticket_id,
            author_id   = current_user.id,
            content     = (
                f"I tried {len(steps_done)} self-help step(s) suggested by the AI "
                "but the issue is still not resolved. "
                "Please could you assist — I need help with this ticket."
            ),
            is_internal = False,
            is_ai       = False,
        )
        db.add(bot_comment)

        # Internal note — extra context visible only to agents/admins
        internal_note = TicketComment(
            ticket_id   = ticket_id,
            author_id   = current_user.id,
            content     = (
                "Self-help did not resolve this ticket.\n\n"
                f"The employee tried {len(steps_done)} self-help step(s) but the issue persists. "
                "They've already attempted the basics — please skip those and investigate further."
            ),
            is_internal = True,
            is_ai       = True,
        )
        db.add(internal_note)

        db.add(AuditLog(
            ticket_id = ticket_id,
            user_id   = current_user.id,
            action    = "self_help_not_resolved",
            details   = {"steps_done": steps_done, "assigned_agent_id": ticket.assigned_agent_id},
        ))

    await db.commit()
    return {
        "success":    True,
        "resolved":   resolved,
        "auto_closed": resolved,
    }


# ─── Automated Response Endpoints ─────────────────────────────────────────────

from app.services.ai.response_service import generate_auto_response, generate_all_tones

class AutoResponseRequest(BaseModel):
    tone:    str = "formal"   # formal | friendly | urgent
    trigger: str = "agent_reply"


@router.post("/{ticket_id}/auto-response")
async def auto_response(
    ticket_id:    str,
    req:          AutoResponseRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """Generate a single auto-response in the requested tone."""
    result = await db.execute(
        select(Ticket).options(selectinload(Ticket.department)).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    from app.api.v1.endpoints.admin import _read_settings
    settings_cfg = _read_settings()

    ai    = ticket.ai_classification or {}
    role  = current_user.agent_role_key if hasattr(current_user, "agent_role_key") else "admin"
    tone  = req.tone if req.tone in ("formal", "friendly", "urgent") else settings_cfg.get("tone_default", "formal")

    from app.services.ai.response_service import generate_auto_response as _gen
    resp = await _gen(
        title       = ticket.title,
        description = ticket.description,
        category    = ai.get("category", "General Support"),
        department  = ticket.department.name if ticket.department else "Support",
        priority    = ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
        tone        = tone,
        agent_role  = role or "admin",
        trigger     = req.trigger,
    )
    return resp


@router.get("/{ticket_id}/auto-response/all-tones")
async def auto_response_all_tones(
    ticket_id:    str,
    trigger:      str = "agent_reply",
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """Generate responses in all 3 tones at once — for the tone-picker UI."""
    result = await db.execute(
        select(Ticket).options(selectinload(Ticket.department)).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ai   = ticket.ai_classification or {}
    role = current_user.agent_role_key if hasattr(current_user, "agent_role_key") else "admin"

    resp = await generate_all_tones(
        title       = ticket.title,
        description = ticket.description,
        category    = ai.get("category", "General Support"),
        department  = ticket.department.name if ticket.department else "Support",
        priority    = ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
        agent_role  = role or "admin",
        trigger     = trigger,
    )
    return resp


@router.get("/{ticket_id}/self-help")
async def get_self_help(
    ticket_id:    str,
    regenerate:   bool = Query(False),
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """
    Return AI-generated self-help steps for the employee to try while waiting.

    The generated content is cached on the ticket (self_help_content) the
    first time it's produced, so reopening the ticket later shows the exact
    same steps instead of a freshly regenerated set — otherwise "step 3 was
    checked off" stops meaning anything once the wording/order changes.
    Persisted progress (which steps were checked, and the resolved/not
    outcome if one was already submitted) is returned alongside the content
    so the panel can restore exactly where the employee left off.

    Pass ?regenerate=true (the panel's "refresh" button) to force a new set
    of steps — this also clears any previously checked steps/outcome, since
    they no longer correspond to the new step list.
    """
    result = await db.execute(
        select(Ticket).options(selectinload(Ticket.department)).where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    from app.api.v1.endpoints.admin import _read_settings
    settings_cfg = _read_settings()
    if not settings_cfg.get("self_help", True):
        return {"enabled": False}

    if ticket.self_help_content and not regenerate:
        content = dict(ticket.self_help_content)
    else:
        ai       = ticket.ai_classification or {}
        dept     = ticket.department.name if ticket.department else "Support"
        category = ai.get("category", "General Support")
        priority = ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority)

        from app.services.ai.response_service import generate_self_help
        content = await generate_self_help(
            title       = ticket.title,
            description = ticket.description,
            category    = category,
            department  = dept,
            priority    = priority,
        )
        ticket.self_help_content = content
        ticket.self_help_shown   = True
        if regenerate:
            # Old progress doesn't correspond to the new step list anymore.
            ticket.self_help_steps_done = []
            ticket.self_help_resolved   = None
        await db.flush()

    content["enabled"]    = True
    content["steps_done"] = ticket.self_help_steps_done or []
    content["resolved"]   = ticket.self_help_resolved
    return content


class SelfHelpProgressRequest(BaseModel):
    steps_done: List[int]


@router.patch("/{ticket_id}/self-help-progress")
async def save_self_help_progress(
    ticket_id:    str,
    req:          SelfHelpProgressRequest,
    current_user: User = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """
    Persist which self-help steps are checked off as the employee ticks them,
    independent of submitting a final resolved/not-resolved outcome — so
    progress survives navigating away and back even before they've decided
    whether the steps actually fixed things.
    """
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.submitted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the ticket submitter can update self-help progress")

    ticket.self_help_steps_done = req.steps_done
    ticket.self_help_shown      = True
    await db.flush()
    return {"steps_done": ticket.self_help_steps_done}
