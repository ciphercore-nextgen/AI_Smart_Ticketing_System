"""
report_service.py — Automated Weekly Business Report Generator

Built for the Week 4 "Presentation Sprint" deliverable:
  - Converts raw ticket data into an executive-level summary (AI-written,
    with a templated fallback if the AI call fails)
  - Computes the underlying metrics that back that summary, structured for
    a downloadable PDF, customisable per department or company-wide
"""
import io
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Ticket, TicketStatus, TicketPriority, Department, User
from app.core.config import settings

RESOLVED_STATUSES = (TicketStatus.resolved, TicketStatus.closed)


def utc_iso(dt) -> "str | None":
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"


async def compute_report_metrics(
    db: AsyncSession,
    department_slug: Optional[str] = None,
    days: int = 7,
) -> dict:
    """Aggregate everything the report needs for the given window/scope."""
    now   = datetime.utcnow()
    start = now - timedelta(days=days)

    base_filters = [Ticket.created_at >= start]
    dept_name = "All Departments"
    if department_slug and department_slug != "all":
        dept_result = await db.execute(select(Department).where(Department.slug == department_slug))
        dept = dept_result.scalar_one_or_none()
        if dept:
            base_filters.append(Ticket.department_id == dept.id)
            dept_name = dept.name

    tickets_result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.department), selectinload(Ticket.assigned_agent))
        .where(and_(*base_filters))
    )
    tickets = tickets_result.scalars().all()

    total = len(tickets)
    by_status:   dict = {}
    by_priority: dict = {}
    by_department: dict = {}
    by_agent: dict = {}

    resolved_count   = 0
    escalated_count  = 0
    sla_breached     = 0
    self_help_shown_count    = 0
    self_help_resolved_count = 0
    resolution_seconds: list = []

    for t in tickets:
        status_val   = t.status.value   if hasattr(t.status, "value")   else str(t.status)
        priority_val = t.priority.value if hasattr(t.priority, "value") else str(t.priority)
        by_status[status_val]     = by_status.get(status_val, 0) + 1
        by_priority[priority_val] = by_priority.get(priority_val, 0) + 1

        dname = t.department.name if t.department else "Unassigned"
        by_department[dname] = by_department.get(dname, 0) + 1

        if t.assigned_agent:
            aname = t.assigned_agent.full_name
            slot = by_agent.setdefault(aname, {"assigned": 0, "resolved": 0})
            slot["assigned"] += 1

        if status_val in ("resolved", "closed"):
            resolved_count += 1
            if t.assigned_agent:
                by_agent[t.assigned_agent.full_name]["resolved"] += 1
            if t.resolved_at and t.created_at:
                resolution_seconds.append((t.resolved_at - t.created_at).total_seconds())

        if t.is_escalated:
            escalated_count += 1

        breached = t.sla_breached
        if not breached and t.sla_deadline and status_val not in ("resolved", "closed"):
            breached = t.sla_deadline < now
        if breached:
            sla_breached += 1

        if t.self_help_shown:
            self_help_shown_count += 1
            if t.self_help_resolved is True:
                self_help_resolved_count += 1

    avg_resolution_hours = (
        round((sum(resolution_seconds) / len(resolution_seconds)) / 3600, 1)
        if resolution_seconds else None
    )

    return {
        "scope":            dept_name,
        "department_slug":  department_slug or "all",
        "period_start":     utc_iso(start),
        "period_end":       utc_iso(now),
        "days":             days,
        "total_tickets":    total,
        "by_status":        by_status,
        "by_priority":      by_priority,
        "by_department":    by_department,
        "by_agent":         by_agent,
        "resolved_count":   resolved_count,
        "resolution_rate":  round(resolved_count / total * 100, 1) if total else 0,
        "escalated_count":  escalated_count,
        "sla_breached":     sla_breached,
        "sla_breach_rate":  round(sla_breached / total * 100, 1) if total else 0,
        "avg_resolution_hours":      avg_resolution_hours,
        "self_help_shown_count":     self_help_shown_count,
        "self_help_resolved_count":  self_help_resolved_count,
        "self_help_success_rate":    (
            round(self_help_resolved_count / self_help_shown_count * 100, 1)
            if self_help_shown_count else 0
        ),
    }


EXEC_SUMMARY_PROMPT = """You are a business analyst writing a weekly executive summary for company \
leadership about the IT/HR/Finance/Operations helpdesk. Write 3-5 sentences, professional tone, \
no bullet points, no restating every number verbatim — focus on what matters: notable trends, \
risks (SLA breaches, escalations), and wins (self-help deflection, resolution rate). \
Do not invent any numbers not given to you."""


async def generate_executive_summary(metrics: dict) -> str:
    """AI-written summary with a templated fallback if the call fails."""
    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        return _fallback_summary(metrics)

    try:
        from app.services.ai.groq_service import get_groq_client
        groq = get_groq_client()
        response = await groq.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": EXEC_SUMMARY_PROMPT},
                {"role": "user", "content": (
                    f"Scope: {metrics['scope']}\n"
                    f"Period: last {metrics['days']} days\n"
                    f"Total tickets: {metrics['total_tickets']}\n"
                    f"By status: {metrics['by_status']}\n"
                    f"By priority: {metrics['by_priority']}\n"
                    f"Resolution rate: {metrics['resolution_rate']}%\n"
                    f"Avg resolution time: {metrics['avg_resolution_hours']} hours\n"
                    f"Escalated tickets: {metrics['escalated_count']}\n"
                    f"SLA breaches: {metrics['sla_breached']} ({metrics['sla_breach_rate']}%)\n"
                    f"Self-help shown to: {metrics['self_help_shown_count']} employees, "
                    f"resolved without an agent: {metrics['self_help_resolved_count']} "
                    f"({metrics['self_help_success_rate']}% success rate)\n"
                )},
            ],
            temperature=0.3,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[Reports] Executive summary generation failed: {e}")
        return _fallback_summary(metrics)


def _fallback_summary(m: dict) -> str:
    parts = [
        f"Over the last {m['days']} days, {m['scope']} logged {m['total_tickets']} tickets, "
        f"with a resolution rate of {m['resolution_rate']}%."
    ]
    if m["avg_resolution_hours"] is not None:
        parts.append(f"Average resolution time was {m['avg_resolution_hours']} hours.")
    if m["sla_breached"]:
        parts.append(f"{m['sla_breached']} ticket(s) breached SLA ({m['sla_breach_rate']}%), which warrants attention.")
    if m["escalated_count"]:
        parts.append(f"{m['escalated_count']} ticket(s) were escalated.")
    if m["self_help_shown_count"]:
        parts.append(
            f"AI self-help was shown to {m['self_help_shown_count']} employee(s), resolving "
            f"{m['self_help_resolved_count']} of those without agent involvement "
            f"({m['self_help_success_rate']}%)."
        )
    return " ".join(parts)


def build_pdf(metrics: dict, summary: str) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleX", parent=styles["Title"], fontSize=20, spaceAfter=2)
    sub_style   = ParagraphStyle("SubX", parent=styles["Normal"], fontSize=10, textColor=colors.grey, spaceAfter=18)
    h2_style    = ParagraphStyle("H2X", parent=styles["Heading2"], fontSize=13, spaceBefore=14, spaceAfter=6)
    body_style  = ParagraphStyle("BodyX", parent=styles["Normal"], fontSize=10.5, leading=15)

    story = [
        Paragraph("Weekly Business Report", title_style),
        Paragraph(
            f"{metrics['scope']} &nbsp;•&nbsp; Last {metrics['days']} days &nbsp;•&nbsp; "
            f"Generated {datetime.utcnow().strftime('%d %b %Y')}",
            sub_style,
        ),
        Paragraph("Executive Summary", h2_style),
        Paragraph(summary, body_style),
        Paragraph("Key Metrics", h2_style),
    ]

    def metric_table(rows):
        t = Table(rows, colWidths=[3.2 * inch, 2.2 * inch])
        t.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#e5e7eb")),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#374151")),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ]))
        return t

    story.append(metric_table([
        ["Total tickets", str(metrics["total_tickets"])],
        ["Resolution rate", f"{metrics['resolution_rate']}%"],
        ["Avg resolution time", f"{metrics['avg_resolution_hours']} hrs" if metrics["avg_resolution_hours"] is not None else "—"],
        ["Escalated tickets", str(metrics["escalated_count"])],
        ["SLA breaches", f"{metrics['sla_breached']} ({metrics['sla_breach_rate']}%)"],
        ["Self-help shown", str(metrics["self_help_shown_count"])],
        ["Self-help resolved (no agent)", f"{metrics['self_help_resolved_count']} ({metrics['self_help_success_rate']}%)"],
    ]))

    if metrics["by_status"]:
        story.append(Paragraph("By Status", h2_style))
        story.append(metric_table([["Status", "Count"]] + [
            [k.replace("_", " ").title(), str(v)] for k, v in sorted(metrics["by_status"].items())
        ]))

    if metrics["by_priority"]:
        story.append(Paragraph("By Priority", h2_style))
        story.append(metric_table([["Priority", "Count"]] + [
            [k.title(), str(v)] for k, v in sorted(metrics["by_priority"].items())
        ]))

    if metrics["department_slug"] == "all" and metrics["by_department"]:
        story.append(Paragraph("By Department", h2_style))
        story.append(metric_table([["Department", "Count"]] + [
            [k, str(v)] for k, v in sorted(metrics["by_department"].items(), key=lambda kv: -kv[1])
        ]))

    if metrics["by_agent"]:
        story.append(Paragraph("By Agent", h2_style))
        rows = [["Agent", "Assigned / Resolved"]]
        for name, s in sorted(metrics["by_agent"].items(), key=lambda kv: -kv[1]["assigned"]):
            rows.append([name, f"{s['assigned']} / {s['resolved']}"])
        story.append(metric_table(rows))

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "Generated automatically by TicketIQ. AI-written sections are based only on the "
        "metrics shown above — figures are computed directly from ticket data, not estimated.",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=colors.grey),
    ))

    doc.build(story)
    return buf.getvalue()
