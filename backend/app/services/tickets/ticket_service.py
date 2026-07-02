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
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.models import Ticket, TicketStatus, TicketPriority, User, Department, TicketComment, AutomationRule
from app.services.ai.groq_service import classify_ticket, select_agent_for_ticket
from app.services.ai.response_service import generate_auto_response
from app.services.governance.governance_service import log_ai_action

SLA_HOURS = {"critical": 4, "high": 24, "medium": 72, "low": 168}

AGENT_ROLES = {"ai_intern", "it_support_technician", "junior_operations"}


class NotASupportRequestError(Exception):
    """Raised when classification determines this isn't a genuine work-related
    support request — caught by the endpoint and turned into a 400 before any
    routing, agent assignment, or DB write happens."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


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

    if classification.get("is_support_request", True) is False:
        raise NotASupportRequestError(
            classification.get("rejection_reason")
            or "This doesn't look like a work-related support request."
        )

    await log_ai_action(
        db, action="ticket_classification",
        input_summary=f"{title} — {description}",
        output_summary=f"dept={classification.get('department_slug')}, "
                        f"priority={classification.get('priority')}, "
                        f"category={classification.get('category')}",
        user_id=submitter_id,
        model_used=classification.get("classified_by", "groq"),
    )

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

    await log_ai_action(
        db, action="agent_routing",
        input_summary=f"Candidates: {[a['full_name'] for a in agent_dicts]}",
        output_summary=f"Selected: {next((a['full_name'] for a in agent_dicts if a['id'] == selected_agent_id), 'none')} "
                        f"— {selection.get('routing_rationale', '')}",
        user_id=submitter_id,
        model_used=selection.get("selected_by", "groq"),
        run_bias_check=True,  # ranking/selecting among people — exactly what governance should watch
    )

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

    # ── Approval Workflow: does any active rule require sign-off first? ─────
    rules_result = await db.execute(select(AutomationRule).where(AutomationRule.is_active == True))
    rules = rules_result.scalars().all()
    requires_approval = any(
        (r.condition_type == "priority" and r.condition_value == priority_str) or
        (r.condition_type == "department" and r.condition_value == dept_slug)
        for r in rules
    )

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
        requires_approval = requires_approval,
        approval_status   = "pending" if requires_approval else None,
    )

    db.add(ticket)
    await db.flush()

    if requires_approval:
        db.add(TicketComment(
            id=str(uuid.uuid4()), ticket_id=ticket.id, author_id=submitter_id,
            content="This ticket matches a rule requiring manager approval before support action begins.",
            is_internal=False, is_ai=True,
        ))
        await db.flush()
        return await _reload_ticket(db, ticket.id)

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

    return await _reload_ticket(db, ticket.id)


async def _reload_ticket(db: AsyncSession, ticket_id: str) -> Ticket:
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.department),
            selectinload(Ticket.submitter),
            selectinload(Ticket.assigned_agent),
        )
        .where(Ticket.id == ticket_id)
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
