#!/usr/bin/env python3
"""
TicketIQ Seed Script
Run from the backend folder:
  cd backend
  python ../scripts/seed_data.py
"""
import asyncio, sys, os, uuid, math, random
from datetime import datetime, timedelta, timezone

# ── Setup paths ───────────────────────────────────────────────────────────────
HERE    = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, '..', 'backend'))
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)   # CRITICAL: db file created in backend folder

# Load .env for non-DB vars only (GROQ key, SECRET_KEY etc.)
# DATABASE_URL is always forced to a local path — never use the Docker path from .env
env_file = os.path.join(BACKEND, '.env')
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                k = k.strip()
                if k != 'DATABASE_URL':   # never inherit Docker DB path
                    os.environ.setdefault(k, v.strip())

# Always use a local SQLite file right inside the backend folder
LOCAL_DB = os.path.join(BACKEND, 'ticketiq.db')
DB_URL   = f'sqlite+aiosqlite:///{LOCAL_DB}'
os.environ['DATABASE_URL'] = DB_URL
os.environ.setdefault('SECRET_KEY', 'dev-secret-key-32-chars-minimum!!')
os.environ.setdefault('GROQ_API_KEY', '')

print(f"📁 Working dir : {os.getcwd()}")
print(f"🗄  Database    : {LOCAL_DB}\n")

import bcrypt as _bcrypt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import select, func, text

# Import models
from app.models.models import (
    Base, User, UserRole, Department, Ticket,
    TicketStatus, TicketPriority
)

# Build engine with the local path
engine = create_async_engine(
    DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)
Session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

utcnow = lambda: datetime.now(timezone.utc)
hpw    = lambda pw: _bcrypt.hashpw(pw.encode(), _bcrypt.gensalt()).decode()

# ── Data ──────────────────────────────────────────────────────────────────────
DEPTS = [
    {"name":"Human Resources",        "slug":"hr",        "color":"#8B5CF6","description":"Employee relations, benefits, policies","is_active":True},
    {"name":"Information Technology", "slug":"it",        "color":"#3B82F6","description":"Hardware, software, network, access",   "is_active":True},
    {"name":"Finance",                "slug":"finance",   "color":"#10B981","description":"Expenses, payroll, invoices, budget",   "is_active":True},
    {"name":"Operations",             "slug":"operations","color":"#F59E0B","description":"Facilities, logistics, procurement",    "is_active":True},
]

USERS = [
    ("p.sibiya@ticketiq.com",    "Admin@1234",    "Pamela Sibiya",           "admin",                 "EMP-0001","System Administrator",     None,        None),
    ("l.ledwaba@ticketiq.com","Agent@1234",    "Lehlogonolo Ledwaba",     "ai_intern",             "AGT-0001","AI Intern",                None,        "ai_intern"),
    ("l.selowa@ticketiq.com", "Agent@1234",    "Lerato Selowa",           "it_support_technician", "AGT-0002","IT Support Technician",    None,        "it_support_technician"),
    ("l.kekane@ticketiq.com","Agent@1234",    "Leslie Kekane",           "junior_operations",     "AGT-0003","Junior Automation Support", None,        "junior_operations"),
    ("m.mudzhadzhi@ticketiq.com", "Employee@1234", "Murunwa Mudzhadzhi",      "employee",              "EMP-0010","HR Coordinator",           "hr",        None),
    ("m.nemanashi@ticketiq.com",  "Employee@1234", "Mutshutshudzi Nemanashi", "employee",              "EMP-0011","Software Engineer",        "it",        None),
    ("l.selowa.fin@ticketiq.com",    "Employee@1234", "Lerato Selowa",           "employee",              "EMP-0012","Finance Analyst",          "finance",   None),
    ("m.mudzhadzhi.ops@ticketiq.com",   "Employee@1234", "Murunwa Mudzhadzhi",      "employee",              "EMP-0013","Operations Coordinator",   "operations",None),
]

TICKETS_DATA = [
    # (title, desc, submitter_email, dept_slug, agent_email, status, priority)
    ("Annual Leave Request — 3 Days",        "I'd like 3 days leave March 20-22. I have 8 remaining days.",               "m.mudzhadzhi@ticketiq.com","hr",        "l.ledwaba@ticketiq.com", "assigned",    "low"),
    ("February Payslip Missing from Portal", "My Feb payslip is missing in the HR portal. All others are visible.",        "m.mudzhadzhi@ticketiq.com","hr",        "l.ledwaba@ticketiq.com", "in_progress", "high"),
    ("Maternity Leave Policy Clarification", "Need clarity on maternity leave duration, pay, and return-to-work.",         "m.mudzhadzhi@ticketiq.com","hr",        "l.ledwaba@ticketiq.com", "open",        "medium"),
    ("VPN Not Connecting After Windows Update","VPN Error 442 since yesterday's update. Cannot work remotely at all.",     "m.nemanashi@ticketiq.com", "it",        "l.selowa@ticketiq.com",  "in_progress", "critical"),
    ("Laptop Running Extremely Slow",         "Dell XPS 13 very slow this week. Apps take 30+ seconds. Storage at 95%.",   "m.nemanashi@ticketiq.com", "it",        "l.selowa@ticketiq.com",  "assigned",    "medium"),
    ("New Hire Software Setup — Sipho Dlamini",  "New hire starts Monday. Needs Office 365, Slack, Figma, GitHub access.",    "m.nemanashi@ticketiq.com", "it",        "l.selowa@ticketiq.com",  "open",        "high"),
    ("Expense Claim Rejected Without Reason", "My £240 client dinner claim (EXP-2024-0892) rejected. Receipts attached.",  "l.selowa.fin@ticketiq.com",   "finance",   "l.selowa@ticketiq.com",  "escalated",   "high"),
    ("Q1 Budget Report Not Generated",        "Automated Q1 budget report missing. Dashboard error. Board meeting Monday.","l.selowa.fin@ticketiq.com",   "finance",   "l.selowa@ticketiq.com",  "in_progress", "critical"),
    ("Purchase Order Approval Needed",        "PO-2024-0445 for monitors and docking stations £3,200. Budget: IT-CAPEX.",  "l.selowa.fin@ticketiq.com",   "finance",   "l.selowa@ticketiq.com",  "open",        "medium"),
    ("Office Chair Broken — Urgent",          "Hydraulic mechanism broken. Sinks to lowest position. Need replacement.",   "m.mudzhadzhi.ops@ticketiq.com",  "operations","l.kekane@ticketiq.com", "assigned",    "medium"),
    ("Meeting Room 3A Projector Faulty",      "HDMI port loose on 3A projector. Client presentation Friday — urgent.",     "m.mudzhadzhi.ops@ticketiq.com",  "operations","l.kekane@ticketiq.com", "in_progress", "high"),
    ("Building Access Card Not Working",      "Access card stopped working at server room. Needs re-programming.",         "m.mudzhadzhi.ops@ticketiq.com",  "operations","l.kekane@ticketiq.com", "resolved",    "high"),
]


async def seed():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tables ready\n")

    async with Session() as db:
        # Departments
        print("── Departments ──────────────────────")
        dept_map = {}
        for d in DEPTS:
            ex = (await db.execute(select(Department).where(Department.slug == d["slug"]))).scalar_one_or_none()
            if ex:
                dept_map[d["slug"]] = ex
                print(f"  ⏭  {d['name']}")
            else:
                obj = Department(id=str(uuid.uuid4()), **d)
                db.add(obj)
                await db.flush()
                dept_map[d["slug"]] = obj
                print(f"  ✅ {d['name']}")

        # Users — always update name and job_title so renames take effect
        print("\n── Users ────────────────────────────")
        user_map = {}
        for email, pw, name, role, eid, title, dept_slug, ark in USERS:
            ex = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if ex:
                ex.full_name  = name
                ex.job_title  = title
                ex.employee_id = eid
                if ark: ex.agent_role_key = ark
                user_map[email] = ex
                print(f"  🔄 {name} ({role}) — updated")
            else:
                dept_id = dept_map[dept_slug].id if dept_slug else None
                obj = User(
                    id=str(uuid.uuid4()), email=email,
                    hashed_password=hpw(pw), full_name=name,
                    role=UserRole(role), employee_id=eid,
                    job_title=title, department_id=dept_id,
                    agent_role_key=ark, agent_departments=[],
                    is_active=True,
                )
                db.add(obj)
                await db.flush()
                user_map[email] = obj
                print(f"  ✅ {name} ({role}) — created")

        # Tickets
        print("\n── Tickets ──────────────────────────")
        count = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
        if count >= len(TICKETS_DATA):
            print(f"  ⏭  {count} tickets already exist")
        else:
            sla = {"critical":4,"high":24,"medium":72,"low":168}
            for i, (title, desc, sub_email, dept_slug, agent_email, status, priority) in enumerate(TICKETS_DATA):
                num = f"TIQ-{1001+i:04d}"
                ex  = (await db.execute(select(Ticket).where(Ticket.ticket_number == num))).scalar_one_or_none()
                if ex:
                    print(f"  ⏭  {num}")
                    continue
                sub   = user_map.get(sub_email)
                agent = user_map.get(agent_email)
                dept  = dept_map.get(dept_slug)
                t = Ticket(
                    id=str(uuid.uuid4()), ticket_number=num,
                    title=title, description=desc,
                    status=TicketStatus(status), priority=TicketPriority(priority),
                    submitted_by_id=sub.id if sub else None,
                    department_id=dept.id if dept else None,
                    assigned_agent_id=agent.id if agent else None,
                    ai_classification={
                        "department_slug":dept_slug,"priority":priority,
                        "category":title.split("—")[0].strip(),
                        "sentiment":"neutral","summary":title,
                        "routed_to_role":agent.agent_role_key if agent else "",
                        "routed_to_agent_name":agent.full_name if agent else "",
                        "classified_by":"seed_data","selected_by":"seed_token_scoring",
                        "skill_tokens":[],"token_weights":{},"token_match_score":8.0,
                        "selection_confidence":0.85,"routing_rationale":"Seeded ticket",
                    },
                    sla_deadline=utcnow()+timedelta(hours=sla[priority]),
                    sla_breached=False,
                    created_at=utcnow()-timedelta(hours=random.randint(1,72)),
                )
                db.add(t)
                print(f"  ✅ {num} — {title[:45]}")

        await db.commit()

    print("\n🎉 Done!\n")
    print("─"*45)
    print("Admin:   p.sibiya@ticketiq.com    | Admin@1234  (Pamela Sibiya)")
    print("─"*55)
    print("Employees  (password: Employee@1234)")
    print("  m.mudzhadzhi@ticketiq.com   Murunwa Mudzhadzhi      HR")
    print("  m.nemanashi@ticketiq.com    Mutshutshudzi Nemanashi  IT")
    print("  l.selowa.fin@ticketiq.com      Lerato Selowa           Finance")
    print("  m.mudzhadzhi.ops@ticketiq.com     Murunwa Mudzhadzhi      Operations")
    print("─"*55)
    print("Agents  (password: Agent@1234)")
    print("  l.ledwaba@ticketiq.com  Lehlogonolo Ledwaba     AI Intern")
    print("  l.selowa@ticketiq.com   Lerato Selowa           IT Support")
    print("  l.kekane@ticketiq.com  Leslie Kekane           Jr Automation Support")
    print("─"*55)


if __name__ == "__main__":
    asyncio.run(seed())
