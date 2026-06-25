from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import init_db
from app.api.v1.endpoints import auth, tickets, analytics, admin, notifications, reports, reports

app = FastAPI(
    title="TicketIQ Enterprise API",
    description="AI-Powered Enterprise Smart Ticketing Platform",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/v1")
app.include_router(tickets.router,   prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(admin.router,         prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(reports.router,       prefix="/api/v1")
app.include_router(reports.router,       prefix="/api/v1")


@app.on_event("startup")
async def startup():
    await init_db()
    await _auto_seed()
    print("✅ TicketIQ Enterprise API started")
    print("📖 Docs: http://localhost:8000/api/v1/docs")


async def _auto_seed():
    """
    Seed the database on first startup (or update existing users).
    Safe to run every time — skips existing records, updates names.
    """
    import bcrypt
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.models import Department, User, UserRole

    DEPTS = [
        {"name": "Human Resources",        "slug": "hr",         "color": "#8B5CF6", "description": "Employee relations, benefits, policies", "is_active": True},
        {"name": "Information Technology", "slug": "it",         "color": "#3B82F6", "description": "Hardware, software, network, access",    "is_active": True},
        {"name": "Finance",                "slug": "finance",    "color": "#10B981", "description": "Expenses, payroll, invoices, budget",    "is_active": True},
        {"name": "Operations",             "slug": "operations", "color": "#F59E0B", "description": "Facilities, logistics, procurement",     "is_active": True},
    ]

    USERS = [
        ("p.sibiya@ticketiq.com",    "Admin@1234",    "Pamela Sibiya",           "admin",                 "EMP-0001", "System Administrator",     None,        None),
        ("l.ledwaba@ticketiq.com","Agent@1234",    "Lehlogonolo Ledwaba",     "ai_intern",             "AGT-0001", "AI Intern",                None,        "ai_intern"),
        ("l.selowa@ticketiq.com", "Agent@1234",    "Lerato Selowa",           "it_support_technician", "AGT-0002", "IT Support Technician",    None,        "it_support_technician"),
        ("l.kekane@ticketiq.com","Agent@1234",    "Leslie Kekane",           "junior_operations",     "AGT-0003", "Junior Automation Support", None,       "junior_operations"),
        ("m.mudzhadzhi@ticketiq.com", "Employee@1234", "Murunwa Mudzhadzhi",      "employee",              "EMP-0010", "HR Coordinator",           "hr",        None),
        ("m.nemanashi@ticketiq.com",  "Employee@1234", "Mutshutshudzi Nemanashi", "employee",              "EMP-0011", "Software Engineer",        "it",        None),
        ("l.selowa.fin@ticketiq.com",    "Employee@1234", "Lerato Selowa",           "employee",              "EMP-0012", "Finance Analyst",          "finance",   None),
        ("m.mudzhadzhi.ops@ticketiq.com",   "Employee@1234", "Murunwa Mudzhadzhi",      "employee",              "EMP-0013", "Operations Coordinator",   "operations",None),
    ]

    def _hash(pw: str) -> str:
        return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

    import uuid
    async with AsyncSessionLocal() as db:
        # Departments
        dept_map = {}
        for d in DEPTS:
            ex = (await db.execute(select(Department).where(Department.slug == d["slug"]))).scalar_one_or_none()
            if not ex:
                ex = Department(id=str(uuid.uuid4()), **d)
                db.add(ex)
                await db.flush()
            dept_map[d["slug"]] = ex

        # Users — create or update name/title
        # Also handle cases where old accounts (different email) hold the same employee_id
        for email, pw, name, role, eid, title, dept_slug, ark in USERS:
            # First try by email
            ex = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

            if not ex and eid:
                # Check if an old account owns this employee_id — free it up
                old = (await db.execute(select(User).where(User.employee_id == eid))).scalar_one_or_none()
                if old:
                    old.employee_id = f"OLD-{old.employee_id}"
                    await db.flush()

            if ex:
                ex.full_name   = name
                ex.job_title   = title
                ex.employee_id = eid
                if ark:
                    ex.agent_role_key = ark
            else:
                dept_id = dept_map[dept_slug].id if dept_slug else None
                db.add(User(
                    id=str(uuid.uuid4()), email=email,
                    hashed_password=_hash(pw), full_name=name,
                    role=UserRole(role), employee_id=eid,
                    job_title=title, department_id=dept_id,
                    agent_role_key=ark, agent_departments=[],
                    is_active=True,
                ))

        await db.commit()
    print("🌱 Database seeded/updated")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "service": "TicketIQ Enterprise"}
