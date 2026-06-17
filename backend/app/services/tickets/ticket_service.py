"""
Ticket Service — Universal Agent Routing via AI Tokenization
=============================================================
All agents are available for ALL departments.
Flow:
  1. GROQ tokenizes the ticket → extracts skill_tokens + token_weights
  2. All active agents are fetched from the DB (no role filter)
  3. AI scores each agent's skill profile against ticket tokens
  4. The single best-matched agent is assigned
  5. Load balancing is applied as a tiebreaker
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.models import Ticket, TicketStatus, TicketPriority, User, Department, TicketComment
from app.services.ai.groq_service import classify_ticket, select_agent_for_ticket
from app.services.ai.response_service import generate_auto_response

SLA_HOURS = {"critical": 4, "high": 24, "medium": 72, "low": 168}

AGENT_ROLES = {"ai_intern", "it_support_technician", "junior_operations"}


async def generate_ticket_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(Ticket.id)))
    count = result.scalar() or 0
    return f"TIQ-{count + 1001:04d}"


async def create_ticket(
    db: AsyncSession,
    title: str,
    description: str,
    submitter_id: str,
) -> Ticket:
    """
    Full ticket creation:
      Stage 1 — AI tokenizes ticket → department, priority, skill_tokens
      Stage 2 — AI scores all agents → picks single best-fit agent by ID
    """

    # ── Stage 1: Tokenize & Classify ────────────────────────────────────────
    classification = await classify_ticket(title, description)

    dept_slug    = classification.get("department_slug", "it")
    priority_str = classification.get("priority", "medium")
    skill_tokens = classification.get("skill_tokens", [])
    token_weights = classification.get("token_weights", {t: 2 for t in skill_tokens})

    # ── Resolve Department ──────────────────────────────────────────────────
    dept_result = await db.execute(
        select(Department).where(Department.slug == dept_slug, Department.is_active == True)
    )
    department = dept_result.scalar_one_or_none()

    # ── Stage 2: Fetch ALL active agents + their current loads ──────────────
    agents_result = await db.execute(
        select(User).where(
            User.agent_role_key.in_(AGENT_ROLES),
            User.is_active == True,
        )
    )
    all_agents = agents_result.scalars().all()

    # Build agent dicts with current load counts
    agent_dicts = []
    for agent in all_agents:
        load_result = await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.assigned_agent_id == agent.id,
                Ticket.status.in_([TicketStatus.assigned, TicketStatus.in_progress]),
            )
        )
        agent_dicts.append({
            "id":             agent.id,
            "full_name":      agent.full_name,
            "agent_role_key": agent.agent_role_key,
            "current_load":   load_result.scalar() or 0,
        })

    # ── AI Agent Selection ──────────────────────────────────────────────────
    selection = await select_agent_for_ticket(
        skill_tokens, token_weights, agent_dicts,
        ticket_title=title, ticket_description=description,
    )
    selected_agent_id = selection.get("selected_agent_id")

    # Merge selection details into classification result
    classification["routed_to_agent_id"]  = selected_agent_id
    classification["routing_rationale"]   = selection.get("routing_rationale", "")
    classification["selection_confidence"]= selection.get("selection_confidence", 0)
    classification["token_match_score"]   = selection.get("token_match_score", 0)
    classification["selected_by"]         = selection.get("selected_by", "unknown")

    # Resolve agent name for display
    selected_agent = next((a for a in all_agents if a.id == selected_agent_id), None)
    if selected_agent:
        classification["routed_to_agent_name"] = selected_agent.full_name
        classification["routed_to_role"]       = selected_agent.agent_role_key

    # ── Build Ticket ────────────────────────────────────────────────────────
    try:
        priority = TicketPriority(priority_str)
    except ValueError:
        priority = TicketPriority.medium

    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=SLA_HOURS.get(priority_str, 72))

    ticket = Ticket(
        ticket_number     = await generate_ticket_number(db),
        title             = title,
        description       = description,
        status            = TicketStatus.assigned if selected_agent else TicketStatus.open,
        priority          = priority,
        submitted_by_id   = submitter_id,
        department_id     = department.id if department else None,
        assigned_agent_id = selected_agent_id,
        ai_classification = classification,
        sla_deadline      = sla_deadline,
        sla_breached      = False,
    )

    db.add(ticket)
    await db.flush()

    # ── Auto-Response: post first AI comment immediately ──────────────────────
    try:
        import uuid as _uuid
        auto_resp = await generate_auto_response(
            title      = title,
            description= description,
            category   = classification.get("category", "General Support"),
            department = department.name if department else "Support",
            priority   = priority_str,
            tone       = "formal",
            agent_role = classification.get("routed_to_role", "admin"),
            trigger    = "new_ticket",
        )
        db.add(TicketComment(
            id         = str(_uuid.uuid4()),
            ticket_id  = ticket.id,
            author_id  = submitter_id,
            content    = auto_resp["response"],
            is_internal= False,
            is_ai      = True,
        ))
        await db.flush()
    except Exception as e:
        print(f"[AutoResponse] First-response failed: {e}")

    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
        )
        .where(Ticket.id == ticket.id)
    )
    return result.scalar_one()


async def get_tickets_for_user(db: AsyncSession, user: User, params: dict = None) -> list:
    params = params or {}

    query = (
        select(Ticket)
        .options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
        )
    )

    role = user.role.value if hasattr(user.role, "value") else str(user.role)

    if role == "employee":
        # Employees only see their own submitted tickets
        query = query.where(Ticket.submitted_by_id == user.id)

    elif role in AGENT_ROLES:
        # Agents see only tickets assigned specifically to them
        query = query.where(Ticket.assigned_agent_id == user.id)

    # admin / super_admin → see all tickets (no filter)

    if params.get("status") and params["status"] != "all":
        query = query.where(Ticket.status == params["status"])
    if params.get("priority") and params["priority"] != "all":
        query = query.where(Ticket.priority == params["priority"])

    query = query.order_by(Ticket.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()
