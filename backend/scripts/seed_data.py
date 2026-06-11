"""
TicketIQ Enterprise — Database Seed Script
Run from the backend folder:
    python scripts/seed_data.py
"""
import asyncio
import sys
import os

# Make sure app imports resolve when run from the backend folder
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from sqlalchemy import select
from app.db.session import AsyncSessionLocal, init_db
from app.models.models import Department, User, UserRole
from app.core.config import DEPARTMENTS, AGENT_SKILL_PROFILES


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ── Seed data ─────────────────────────────────────────────────────────────────

SEED_DEPARTMENTS = DEPARTMENTS  # pulled from config.py

SEED_AGENTS = [
    {
        "full_name":    "AI Intern Agent",
        "email":        "ai.intern@ticketiq.com",
        "password":     "Agent@1234",
        "role":         UserRole.ai_intern,
        "agent_role_key": "ai_intern",
        "job_title":    "AI Intern",
        "employee_id":  "AGT-001",
    },
    {
        "full_name":    "IT Support Agent",
        "email":        "it.agent@ticketiq.com",
        "password":     "Agent@1234",
        "role":         UserRole.it_support,
        "agent_role_key": "it_support_technician",
        "job_title":    "IT Support Technician",
        "employee_id":  "AGT-002",
    },
    {
        "full_name":    "Junior Automation Agent",
        "email":        "ops.agent@ticketiq.com",
        "password":     "Agent@1234",
        "role":         UserRole.junior_ops,
        "agent_role_key": "junior_operations",
        "job_title":    "Junior Automation Support",
        "employee_id":  "AGT-003",
    },
]

SEED_EMPLOYEES = [
    {
        "full_name":  "HR Employee",
        "email":      "employee@ticketiq.com",
        "password":   "Employee@1234",
        "role":       UserRole.employee,
        "job_title":  "HR Coordinator",
        "employee_id": "EMP-001",
        "dept_slug":  "hr",
    },
    {
        "full_name":  "Sarah Kim",
        "email":      "sarah.k@ticketiq.com",
        "password":   "Employee@1234",
        "role":       UserRole.employee,
        "job_title":  "Systems Analyst",
        "employee_id": "EMP-002",
        "dept_slug":  "it",
    },
    {
        "full_name":  "Tom Walsh",
        "email":      "tom.w@ticketiq.com",
        "password":   "Employee@1234",
        "role":       UserRole.employee,
        "job_title":  "Finance Officer",
        "employee_id": "EMP-003",
        "dept_slug":  "finance",
    },
    {
        "full_name":  "Nina Patel",
        "email":      "nina.p@ticketiq.com",
        "password":   "Employee@1234",
        "role":       UserRole.employee,
        "job_title":  "Operations Coordinator",
        "employee_id": "EMP-004",
        "dept_slug":  "operations",
    },
]

SEED_ADMINS = [
    {
        "full_name":  "TicketIQ Admin",
        "email":      "admin@ticketiq.com",
        "password":   "Admin@1234",
        "role":       UserRole.admin,
        "job_title":  "System Administrator",
        "employee_id": "ADM-001",
    },
    {
        "full_name":  "Super Admin",
        "email":      "superadmin@ticketiq.com",
        "password":   "Admin@1234",
        "role":       UserRole.super_admin,
        "job_title":  "Super Administrator",
        "employee_id": "ADM-002",
    },
]


# ── Main ──────────────────────────────────────────────────────────────────────

async def seed():
    print("🌱  Initialising database tables...")
    await init_db()

    async with AsyncSessionLocal() as db:

        # ── 1. Departments ────────────────────────────────────────────────────
        print("📁  Seeding departments...")
        dept_map: dict[str, Department] = {}
        for d in SEED_DEPARTMENTS:
            existing = await db.scalar(select(Department).where(Department.slug == d["slug"]))
            if not existing:
                dept = Department(
                    name=d["name"],
                    slug=d["slug"],
                    color=d["color"],
                    description=d["description"],
                )
                db.add(dept)
                await db.flush()
                dept_map[d["slug"]] = dept
                print(f"   ✅ Created department: {d['name']}")
            else:
                dept_map[d["slug"]] = existing
                print(f"   ⏭️  Department exists: {d['name']}")

        # ── 2. Agents ─────────────────────────────────────────────────────────
        print("🤖  Seeding agents...")
        for a in SEED_AGENTS:
            existing = await db.scalar(select(User).where(User.email == a["email"]))
            if not existing:
                user = User(
                    full_name=a["full_name"],
                    email=a["email"],
                    hashed_password=_hash(a["password"]),
                    role=a["role"],
                    agent_role_key=a["agent_role_key"],
                    job_title=a["job_title"],
                    employee_id=a["employee_id"],
                    is_active=True,
                )
                db.add(user)
                print(f"   ✅ Created agent: {a['full_name']} ({a['email']})")
            else:
                print(f"   ⏭️  Agent exists: {a['email']}")

        # ── 3. Employees ──────────────────────────────────────────────────────
        print("👥  Seeding employees...")
        for e in SEED_EMPLOYEES:
            existing = await db.scalar(select(User).where(User.email == e["email"]))
            if not existing:
                dept = dept_map.get(e["dept_slug"])
                user = User(
                    full_name=e["full_name"],
                    email=e["email"],
                    hashed_password=_hash(e["password"]),
                    role=e["role"],
                    job_title=e["job_title"],
                    employee_id=e["employee_id"],
                    department_id=dept.id if dept else None,
                    is_active=True,
                )
                db.add(user)
                print(f"   ✅ Created employee: {e['full_name']} ({e['email']})")
            else:
                print(f"   ⏭️  Employee exists: {e['email']}")

        # ── 4. Admins ─────────────────────────────────────────────────────────
        print("🛡️   Seeding admins...")
        for a in SEED_ADMINS:
            existing = await db.scalar(select(User).where(User.email == a["email"]))
            if not existing:
                user = User(
                    full_name=a["full_name"],
                    email=a["email"],
                    hashed_password=_hash(a["password"]),
                    role=a["role"],
                    job_title=a["job_title"],
                    employee_id=a["employee_id"],
                    is_active=True,
                )
                db.add(user)
                print(f"   ✅ Created admin: {a['full_name']} ({a['email']})")
            else:
                print(f"   ⏭️  Admin exists: {a['email']}")

        await db.commit()

    print()
    print("🎉  Seed complete! You can now log in with:")
    print()
    print("   ADMIN")
    print("   admin@ticketiq.com          Admin@1234")
    print()
    print("   AGENTS")
    print("   ai.intern@ticketiq.com      Agent@1234")
    print("   it.agent@ticketiq.com       Agent@1234")
    print("   ops.agent@ticketiq.com      Agent@1234")
    print()
    print("   EMPLOYEES")
    print("   employee@ticketiq.com       Employee@1234  (HR)")
    print("   sarah.k@ticketiq.com        Employee@1234  (IT)")
    print("   tom.w@ticketiq.com          Employee@1234  (Finance)")
    print("   nina.p@ticketiq.com         Employee@1234  (Operations)")


if __name__ == "__main__":
    asyncio.run(seed())
