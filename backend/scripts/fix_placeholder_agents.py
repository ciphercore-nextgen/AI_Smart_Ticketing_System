"""
fix_placeholder_agents.py — one-time cleanup migration
========================================================
When this project was first seeded, three generic placeholder agents were
created (AI Intern Agent / IT Support Agent / Junior Automation Agent) so
ticket routing had *someone* to assign to before real agents existed.

Real, named agents have since been added with the same skill scopes, which
means the AI router has been splitting tickets between a real human and an
inert placeholder nobody logs into — so some tickets silently vanish from
view as far as the real agent is concerned.

This script, safe to run once (and safe to re-run — it's idempotent):
  1. Finds the 3 known placeholder accounts by their seed email addresses.
  2. For each, finds the real agent with the same agent_role_key.
  3. Reassigns every ticket currently pointed at the placeholder to that
     real agent (with an internal note left on each ticket for an audit
     trail), and logs an AuditLog entry per reassignment.
  4. Deactivates the placeholder accounts so future AI routing can never
     pick them again.

Run from the backend folder:
    python scripts/fix_placeholder_agents.py
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, init_db
from app.models.models import User, Ticket, TicketComment, AuditLog

PLACEHOLDER_EMAILS = [
    "ai.intern@ticketiq.com",
    "it.agent@ticketiq.com",
    "ops.agent@ticketiq.com",
]


async def main():
    await init_db()  # safe no-op if tables already exist; also runs column migrations

    async with AsyncSessionLocal() as db:
        placeholders = (
            await db.execute(select(User).where(User.email.in_(PLACEHOLDER_EMAILS)))
        ).scalars().all()

        if not placeholders:
            print("No placeholder accounts found by email — nothing to do.")
            return

        total_reassigned = 0

        for placeholder in placeholders:
            if not placeholder.is_active and placeholder.id is not None:
                # Already processed in a previous run — but still double check
                # for any tickets that might have re-accumulated, then skip
                # the "already inactive" ones with zero tickets quickly.
                pass

            # Find the real agent with the same role, excluding any other
            # known placeholder emails (in case of weird edge-case overlap).
            real_agent = (
                await db.execute(
                    select(User).where(
                        User.agent_role_key == placeholder.agent_role_key,
                        User.id != placeholder.id,
                        ~User.email.in_(PLACEHOLDER_EMAILS),
                        User.is_active == True,
                    )
                )
            ).scalars().first()

            if not real_agent:
                print(f"⚠️  No real active agent found for role '{placeholder.agent_role_key}' "
                      f"— leaving '{placeholder.full_name}' ({placeholder.email}) active. Skipping.")
                continue

            tickets = (
                await db.execute(select(Ticket).where(Ticket.assigned_agent_id == placeholder.id))
            ).scalars().all()

            for t in tickets:
                t.assigned_agent_id = real_agent.id
                db.add(TicketComment(
                    id=str(uuid.uuid4()), ticket_id=t.id, author_id=real_agent.id,
                    content=f"(Reassigned from the retired placeholder account "
                            f"'{placeholder.full_name}' to {real_agent.full_name}.)",
                    is_internal=True, is_ai=True,
                ))
                db.add(AuditLog(
                    id=str(uuid.uuid4()), ticket_id=t.id, user_id=real_agent.id,
                    action="placeholder_agent_reassignment",
                    details={"from_agent_id": placeholder.id, "to_agent_id": real_agent.id},
                ))

            placeholder.is_active = False

            print(f"✅ {placeholder.full_name} ({placeholder.email}) → deactivated, "
                  f"{len(tickets)} ticket(s) reassigned to {real_agent.full_name}.")
            total_reassigned += len(tickets)

        await db.commit()
        print(f"\nDone. {total_reassigned} ticket(s) reassigned across "
              f"{len(placeholders)} placeholder account(s).")


if __name__ == "__main__":
    asyncio.run(main())
