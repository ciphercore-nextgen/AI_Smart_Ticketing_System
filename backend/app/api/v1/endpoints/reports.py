"""
reports.py — Automated Weekly Business Report Generator

Week 4 Presentation Sprint deliverable. Admin-only: this is an executive/
leadership-facing report, not something employees or individual agents need.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.db.session import get_db
from app.core.deps import require_roles
from app.models.models import User
from app.services.reports.report_service import (
    compute_report_metrics, generate_executive_summary, build_pdf,
)

router = APIRouter(prefix="/reports", tags=["reports"])

AdminOnly = require_roles("admin", "super_admin")


@router.get("/weekly-summary")
async def weekly_summary(
    department: str = Query("all", description="Department slug, or 'all'"),
    days:       int  = Query(7, ge=1, le=90),
    _:          User = Depends(AdminOnly),
    db:         AsyncSession = Depends(get_db),
):
    """Structured metrics + an AI-written executive summary, scoped per department."""
    metrics = await compute_report_metrics(db, department_slug=department, days=days)
    summary = await generate_executive_summary(metrics)
    return {"metrics": metrics, "summary": summary}


@router.get("/weekly-summary/pdf")
async def weekly_summary_pdf(
    department: str = Query("all"),
    days:       int  = Query(7, ge=1, le=90),
    _:          User = Depends(AdminOnly),
    db:         AsyncSession = Depends(get_db),
):
    """Same report, rendered as a downloadable PDF."""
    metrics = await compute_report_metrics(db, department_slug=department, days=days)
    summary = await generate_executive_summary(metrics)

    try:
        pdf_bytes = build_pdf(metrics, summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    scope_label = metrics["scope"].replace(" ", "-").lower()
    filename = f"ticketiq-weekly-report-{scope_label}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
