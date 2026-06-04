#!/usr/bin/env python3
"""
TicketIQ Enterprise — Seed Script
===================================
All 3 agents are UNIVERSAL — available for any department.
AI tokenization decides which agent handles each ticket.

Run from /backend:
  python ../scripts/seed_data.py
"""
import asyncio, sys, os, uuid, random, math
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

_env = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
if os.path.exists(_env):
    from dotenv import load_dotenv
    load_dotenv(_env)

from app.db.session import AsyncSessionLocal, init_db
from app.models.models import User, UserRole, Department, Ticket, TicketStatus, TicketPriority
from app.services.auth.auth_service import hash_password
from app.core.config import AGENT_SKILL_PROFILES

utcnow = lambda: datetime.now(timezone.utc)

DEMO_DEPARTMENTS = [
    {"name": "Human Resources",        "slug": "hr",         "color": "#8B5CF6", "description": "Employee relations, benefits, policies, leave"},
    {"name": "Information Technology", "slug": "it",         "color": "#3B82F6", "description": "Hardware, software, network, system access"},
    {"name": "Finance",                "slug": "finance",    "color": "#10B981", "description": "Expenses, payroll, invoices, budget"},
    {"name": "Operations",             "slug": "operations", "color": "#F59E0B", "description": "Facilities, logistics, procurement, maintenance"},
]

DEMO_USERS = [
    # Admin
    {"email": "admin@ticketiq.com",    "pw": "Admin@1234",    "name": "Alex Morgan",    "role": "admin",                 "eid": "EMP-0001", "title": "System Administrator",       "dept": None,         "ark": None},
    # Agents — ALL universal (agent_role_key kept for skill profile lookup only)
    {"email": "ai.intern@ticketiq.com","pw": "Agent@1234",    "name": "Priya Sharma",   "role": "ai_intern",             "eid": "AGT-0001", "title": "AI Intern",                  "dept": None,         "ark": "ai_intern"},
    {"email": "it.agent@ticketiq.com", "pw": "Agent@1234",    "name": "James Okonkwo",  "role": "it_support_technician", "eid": "AGT-0002", "title": "IT Support Technician",      "dept": None,         "ark": "it_support_technician"},
    {"email": "ops.agent@ticketiq.com","pw": "Agent@1234",    "name": "Sofia Martinez", "role": "junior_operations",     "eid": "AGT-0003", "title": "Junior Operations Agent",    "dept": None,         "ark": "junior_operations"},
    # Employees — 1 per department
    {"email": "employee@ticketiq.com", "pw": "Employee@1234", "name": "Jordan Lee",     "role": "employee",              "eid": "EMP-0010", "title": "HR Coordinator",             "dept": "hr",         "ark": None},
    {"email": "sarah.k@ticketiq.com",  "pw": "Employee@1234", "name": "Sarah Kim",      "role": "employee",              "eid": "EMP-0011", "title": "Software Engineer",          "dept": "it",         "ark": None},
    {"email": "tom.w@ticketiq.com",    "pw": "Employee@1234", "name": "Tom Williams",   "role": "employee",              "eid": "EMP-0012", "title": "Finance Analyst",            "dept": "finance",    "ark": None},
    {"email": "nina.p@ticketiq.com",   "pw": "Employee@1234", "name": "Nina Patel",     "role": "employee",              "eid": "EMP-0013", "title": "Operations Coordinator",     "dept": "operations", "ark": None},
]

# tickets: submitter email → dept → tokens → which agent wins by token score
SAMPLE_TICKETS = [
    # HR → ai_intern wins (hr tokens)
    {
        "title": "Annual Leave Request — 3 Days",
        "desc":  "I'd like to request 3 days annual leave March 20–22. I have 8 remaining days. Please advise if there are conflicts.",
        "sub": "employee@ticketiq.com", "dept": "hr", "status": "assigned", "priority": "low",
        "tokens": ["annual_leave", "leave", "vacation"], "weights": {"annual_leave": 3, "leave": 3, "vacation": 2},
        "agent_role": "ai_intern",
    },
    {
        "title": "February Payslip Missing from Portal",
        "desc":  "My February payslip is not visible. All previous months are accessible. Please investigate.",
        "sub": "employee@ticketiq.com", "dept": "hr", "status": "in_progress", "priority": "high",
        "tokens": ["payslip", "pay", "salary"], "weights": {"payslip": 3, "pay": 2, "salary": 2},
        "agent_role": "ai_intern",
    },
    {
        "title": "Maternity Leave Policy Clarification",
        "desc":  "I'm expecting in June. Need clarity on maternity leave duration, pay structure, and return-to-work process.",
        "sub": "employee@ticketiq.com", "dept": "hr", "status": "open", "priority": "medium",
        "tokens": ["maternity", "leave", "hr_policy", "benefits"], "weights": {"maternity": 3, "leave": 2, "hr_policy": 2, "benefits": 1},
        "agent_role": "ai_intern",
    },
    # IT → it_support_technician wins (it tokens)
    {
        "title": "VPN Not Connecting After Windows Update",
        "desc":  "Cisco VPN shows Error 442 since yesterday's Windows update. Reinstall didn't help. Can't work remotely.",
        "sub": "sarah.k@ticketiq.com", "dept": "it", "status": "in_progress", "priority": "critical",
        "tokens": ["vpn", "connectivity", "software", "error", "update"], "weights": {"vpn": 3, "connectivity": 3, "software": 2, "error": 2, "update": 1},
        "agent_role": "it_support_technician",
    },
    {
        "title": "Laptop Running Extremely Slow",
        "desc":  "My Dell XPS 13 has been very slow this week. Apps take 30+ seconds. Storage at 95%.",
        "sub": "sarah.k@ticketiq.com", "dept": "it", "status": "assigned", "priority": "medium",
        "tokens": ["laptop", "hardware", "software", "system"], "weights": {"laptop": 3, "hardware": 2, "software": 2, "system": 1},
        "agent_role": "it_support_technician",
    },
    {
        "title": "New Hire Software Setup — David Chen",
        "desc":  "New hire David Chen starts Monday. Needs Office 365, Slack, Figma, GitHub access. Laptop is on my desk.",
        "sub": "sarah.k@ticketiq.com", "dept": "it", "status": "open", "priority": "high",
        "tokens": ["new_hire", "software", "installation", "access", "account"], "weights": {"new_hire": 3, "software": 2, "installation": 2, "access": 2, "account": 1},
        "agent_role": "it_support_technician",
    },
    # Finance → it_support_technician wins (finance tokens)
    {
        "title": "Expense Claim Rejected Without Explanation",
        "desc":  "My £240 client dinner expense claim (EXP-2024-0892) was rejected. All receipts were attached. Please review.",
        "sub": "tom.w@ticketiq.com", "dept": "finance", "status": "escalated", "priority": "high",
        "tokens": ["expense_claim", "expense", "reimbursement", "receipt"], "weights": {"expense_claim": 3, "expense": 3, "reimbursement": 2, "receipt": 1},
        "agent_role": "it_support_technician",
    },
    {
        "title": "Q1 Budget Report Not Generated",
        "desc":  "The automated Q1 budget report was not generated. Finance dashboard shows an error. Needed for Monday board meeting.",
        "sub": "tom.w@ticketiq.com", "dept": "finance", "status": "in_progress", "priority": "critical",
        "tokens": ["budget", "financial_report", "financial_system", "error"], "weights": {"budget": 3, "financial_report": 3, "financial_system": 2, "error": 2},
        "agent_role": "it_support_technician",
    },
    {
        "title": "Purchase Order Approval — Office Equipment",
        "desc":  "Requesting approval for PO-2024-0445 covering monitors and docking stations totalling £3,200. Budget code: IT-CAPEX-2024.",
        "sub": "tom.w@ticketiq.com", "dept": "finance", "status": "open", "priority": "medium",
        "tokens": ["purchase_order", "approval_workflow", "budget", "procurement_system"], "weights": {"purchase_order": 3, "approval_workflow": 2, "budget": 2, "procurement_system": 1},
        "agent_role": "it_support_technician",
    },
    # Operations → junior_operations wins (ops tokens)
    {
        "title": "Office Chair Broken — Urgent Replacement",
        "desc":  "The hydraulic mechanism on my chair is broken. It sinks to the lowest position. Please arrange urgent replacement.",
        "sub": "nina.p@ticketiq.com", "dept": "operations", "status": "assigned", "priority": "medium",
        "tokens": ["chair", "furniture", "maintenance", "repair", "office"], "weights": {"chair": 3, "furniture": 2, "maintenance": 2, "repair": 2, "office": 1},
        "agent_role": "junior_operations",
    },
    {
        "title": "Meeting Room 3A Projector Faulty",
        "desc":  "HDMI port on 3A projector is loose and disconnects during presentations. Client presentation on Friday — urgent fix.",
        "sub": "nina.p@ticketiq.com", "dept": "operations", "status": "in_progress", "priority": "high",
        "tokens": ["meeting_room", "facilities", "repair", "maintenance"], "weights": {"meeting_room": 3, "facilities": 2, "repair": 2, "maintenance": 2},
        "agent_role": "junior_operations",
    },
    {
        "title": "Building Access Card Stopped Working",
        "desc":  "My access card stopped working at the server room door. Security confirmed it needs re-programming. Employee ID: EMP-0013.",
        "sub": "nina.p@ticketiq.com", "dept": "operations", "status": "resolved", "priority": "high",
        "tokens": ["access_card", "security_badge", "building", "facilities"], "weights": {"access_card": 3, "security_badge": 2, "building": 2, "facilities": 1},
        "agent_role": "junior_operations",
    },
]


def _token_score(ticket_tokens, ticket_weights, agent_role_key):
    """Same scoring logic as groq_service._score_agents_by_tokens"""
    profile = AGENT_SKILL_PROFILES.get(agent_role_key, {})
    agent_tokens = set(profile.get("skill_tokens", []))
    score = 0.0
    for t in ticket_tokens:
        if t in agent_tokens:
            w = ticket_weights.get(t, 1)
            score += w * (1 + math.log(w + 1))
    return round(score, 2)


async def seed():
    print("\n🌱 Seeding TicketIQ database...\n")
    await init_db()

    from sqlalchemy import select, func

    async with AsyncSessionLocal() as db:

        # ── Departments ──────────────────────────────────────────────────────
        dept_map = {}
        for d in DEMO_DEPARTMENTS:
            ex = (await db.execute(select(Department).where(Department.slug == d["slug"]))).scalar_one_or_none()
            if ex:
                dept_map[d["slug"]] = ex
                print(f"  ⏭  Dept exists: {d['name']}")
            else:
                obj = Department(id=str(uuid.uuid4()), **d)
                db.add(obj); await db.flush()
                dept_map[d["slug"]] = obj
                print(f"  ✅ Created dept: {d['name']}")

        # ── Users ────────────────────────────────────────────────────────────
        user_map = {}
        for u in DEMO_USERS:
            ex = (await db.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
            if ex:
                user_map[u["email"]] = ex
                print(f"  ⏭  User exists: {u['email']}")
            else:
                dept_id = dept_map[u["dept"]].id if u.get("dept") else None
                obj = User(
                    id=str(uuid.uuid4()),
                    email=u["email"],
                    full_name=u["name"],
                    hashed_password=hash_password(u["pw"]),
                    role=UserRole(u["role"]),
                    employee_id=u["eid"],
                    job_title=u["title"],
                    department_id=dept_id,
                    agent_role_key=u["ark"],
                    agent_departments=[],
                    is_active=True,
                )
                db.add(obj); await db.flush()
                user_map[u["email"]] = obj
                print(f"  ✅ Created: {u['name']} ({u['role']})")

        # ── Tickets ──────────────────────────────────────────────────────────
        ticket_count = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
        if ticket_count > 0:
            print(f"\n  ⏭  {ticket_count} tickets already seeded — skipping.\n")
        else:
            # Map agent role → user for assignment
            role_to_user = {
                "ai_intern":             user_map.get("ai.intern@ticketiq.com"),
                "it_support_technician": user_map.get("it.agent@ticketiq.com"),
                "junior_operations":     user_map.get("ops.agent@ticketiq.com"),
            }
            # Build agent_dicts for score display
            agent_dicts = [
                {"role": r, "name": u.full_name, "id": u.id}
                for r, u in role_to_user.items() if u
            ]

            sla_map = {"critical": 4, "high": 24, "medium": 72, "low": 168}

            for i, t in enumerate(SAMPLE_TICKETS):
                submitter  = user_map.get(t["sub"])
                dept       = dept_map.get(t["dept"])
                agent_role = t["agent_role"]
                agent      = role_to_user.get(agent_role)

                # Compute token scores for all agents (for display/audit)
                scores = {
                    r: _token_score(t["tokens"], t["weights"], r)
                    for r in ["ai_intern", "it_support_technician", "junior_operations"]
                }
                winner_score = scores[agent_role]
                profile = AGENT_SKILL_PROFILES.get(agent_role, {})

                ai_data = {
                    "department_slug":       t["dept"],
                    "department_name":       dept.name if dept else t["dept"],
                    "priority":              t["priority"],
                    "category":              t["title"].split("—")[0].strip(),
                    "sentiment":             "neutral",
                    "summary":               t["title"],
                    "priority_reason":       f"Seeded at {t['priority']} priority",
                    # Tokenization
                    "skill_tokens":          t["tokens"],
                    "token_weights":         t["weights"],
                    "token_match_score":     winner_score,
                    "all_agent_scores":      scores,
                    # Routing decision
                    "routed_to_role":        agent_role,
                    "routed_to_agent_name":  agent.full_name if agent else agent_role,
                    "routing_rationale":     (
                        f"Highest token match score ({winner_score:.1f}) — "
                        f"{profile.get('display_name', agent_role)} matched tokens: "
                        f"{', '.join(t['tokens'][:4])}"
                    ),
                    "selection_confidence":  min(winner_score / 30.0, 0.97),
                    "selected_by":           "seed_token_scoring",
                    "classified_by":         "seed_data",
                }

                ticket = Ticket(
                    id=str(uuid.uuid4()),
                    ticket_number=f"TIQ-{1001 + i:04d}",
                    title=t["title"],
                    description=t["desc"],
                    status=TicketStatus(t["status"]),
                    priority=TicketPriority(t["priority"]),
                    submitted_by_id=submitter.id if submitter else None,
                    department_id=dept.id if dept else None,
                    assigned_agent_id=agent.id if agent else None,
                    ai_classification=ai_data,
                    sla_deadline=utcnow() + timedelta(hours=sla_map[t["priority"]]),
                    sla_breached=False,
                    created_at=utcnow() - timedelta(hours=random.randint(1, 72)),
                )
                db.add(ticket)
                print(f"  ✅ TIQ-{1001+i:04d} → {profile.get('display_name', agent_role)} (score: {winner_score:.1f}) | {t['title'][:45]}")

        await db.commit()

    print("\n🎉 Done!\n")
    print("─" * 60)
    print("ACCOUNTS")
    print("─" * 60)
    print("Admin:  admin@ticketiq.com          | Admin@1234")
    print()
    print("Employees (submit tickets — AI routes to best agent):")
    print("  employee@ticketiq.com  | Employee@1234  | HR dept")
    print("  sarah.k@ticketiq.com   | Employee@1234  | IT dept")
    print("  tom.w@ticketiq.com     | Employee@1234  | Finance dept")
    print("  nina.p@ticketiq.com    | Employee@1234  | Operations dept")
    print()
    print("Agents (all universal — AI picks best for each ticket):")
    print("  ai.intern@ticketiq.com  | Agent@1234  | Skill: HR & People Ops")
    print("  it.agent@ticketiq.com   | Agent@1234  | Skill: IT & Finance Systems")
    print("  ops.agent@ticketiq.com  | Agent@1234  | Skill: Facilities & Logistics")
    print("─" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
