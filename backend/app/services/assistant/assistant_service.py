"""
assistant_service.py — AI Assistant Feature

Answers natural-language operational questions ("why did tickets increase
this week?") by computing real metrics first, then having the AI explain
them — same "ground the AI in real numbers, never let it invent figures"
approach as the weekly report's executive summary.
"""
from app.core.config import settings
from app.services.reports.report_service import compute_report_metrics

ASSISTANT_PROMPT = """You are an operations assistant for a company helpdesk platform. \
Answer the user's question using ONLY the metrics provided below — never invent a number \
that isn't given to you. If the data doesn't answer their question, say so plainly. \
Keep answers to 2-4 sentences, conversational but professional."""


async def answer_question(db, question: str, department_slug: str = "all") -> dict:
    metrics = await compute_report_metrics(db, department_slug=department_slug, days=14)

    context = (
        f"Scope: {metrics['scope']}\n"
        f"Period: last {metrics['days']} days\n"
        f"Total tickets: {metrics['total_tickets']}\n"
        f"By status: {metrics['by_status']}\n"
        f"By priority: {metrics['by_priority']}\n"
        f"By department: {metrics['by_department']}\n"
        f"Resolution rate: {metrics['resolution_rate']}%\n"
        f"Avg resolution time: {metrics['avg_resolution_hours']} hours\n"
        f"Escalated: {metrics['escalated_count']}\n"
        f"SLA breaches: {metrics['sla_breached']} ({metrics['sla_breach_rate']}%)\n"
        f"Self-help shown/resolved: {metrics['self_help_shown_count']}/{metrics['self_help_resolved_count']}\n"
        f"By agent: {metrics['by_agent']}\n"
    )

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        return {"answer": _fallback_answer(question, metrics), "grounded_in": metrics}

    try:
        from app.services.ai.groq_service import get_groq_client
        groq = get_groq_client()
        response = await groq.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": ASSISTANT_PROMPT},
                {"role": "user", "content": f"DATA:\n{context}\n\nQUESTION: {question}"},
            ],
            temperature=0.3,
            max_tokens=250,
        )
        return {"answer": response.choices[0].message.content.strip(), "grounded_in": metrics}
    except Exception as e:
        print(f"[Assistant] Failed, using fallback: {e}")
        return {"answer": _fallback_answer(question, metrics), "grounded_in": metrics}


def _fallback_answer(question: str, m: dict) -> str:
    return (
        f"Here's what the data shows for {m['scope']} over the last {m['days']} days: "
        f"{m['total_tickets']} ticket(s) total, a {m['resolution_rate']}% resolution rate, "
        f"and {m['sla_breached']} SLA breach(es). "
        f"(AI explanation unavailable right now — showing raw metrics instead.)"
    )
