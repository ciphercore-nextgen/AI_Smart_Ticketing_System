from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.deps import get_current_user, require_roles
from app.models.models import User
from app.services.reports.report_service import (
    compute_report_metrics,
    generate_executive_summary,
    build_pdf,
)

router = APIRouter(prefix="/reports", tags=["reports"])

AdminOnly = require_roles("admin", "super_admin")


@router.get("/weekly-summary")
async def weekly_summary(
    department: str = Query("all"),
    days: int = Query(7),
    _: User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    """Generate weekly summary report with metrics"""
    metrics = await compute_report_metrics(db, department, days)
    summary = await generate_executive_summary(metrics)
    
    return {
        "metrics": metrics,
        "executive_summary": summary,
    }


@router.get("/download-pdf")
async def download_pdf(
    department: str = Query("all"),
    days: int = Query(7),
    _: User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    """Download report as PDF"""
    metrics = await compute_report_metrics(db, department, days)
    summary = await generate_executive_summary(metrics)
    pdf_bytes = build_pdf(metrics, summary)
    
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=report.pdf"},
    )
