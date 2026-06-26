from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.db.session import get_db
from app.core.deps import require_roles
from app.models.models import User, AILog, RiskReport
from app.governance.governance_service import check_bias, generate_risk_report

router = APIRouter(prefix="/governance", tags=["governance"])

AdminOnly = require_roles("admin", "super_admin")


def utc_iso(dt):
    if dt is None:
        return None
    return dt.isoformat() + "Z"


class BiasCheckRequest(BaseModel):
    input_text: str
    output_text: str = ""


@router.post("/check-bias")
async def check_bias_endpoint(
    req: BiasCheckRequest,
    _:   User = Depends(AdminOnly),
):
    """On-demand bias evaluation tool — e.g. paste a hiring recommendation
    or any AI-generated text and get a risk score."""
    return await check_bias(req.input_text, req.output_text)


@router.get("/logs")
async def list_ai_logs(
    days:   int = Query(7, ge=1, le=90),
    risk:   str = Query("all"),
    limit:  int = Query(100, ge=1, le=500),
    _:      User = Depends(AdminOnly),
    db:     AsyncSession = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    query = select(AILog).where(AILog.created_at >= since)
    if risk != "all":
        query = query.where(AILog.risk_level == risk)
    query = query.order_by(AILog.created_at.desc()).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()
    return {
        "logs": [
            {
                "id": l.id, "action": l.action, "risk_level": l.risk_level,
                "risk_notes": l.risk_notes, "input_summary": l.input_summary,
                "output_summary": l.output_summary, "model_used": l.model_used,
                "ticket_id": l.ticket_id, "created_at": utc_iso(l.created_at),
            }
            for l in logs
        ],
        "total": len(logs),
    }


@router.post("/risk-report")
async def create_risk_report(
    period_days: int = Query(7, ge=1, le=90),
    current_user: User = Depends(AdminOnly),
    db:           AsyncSession = Depends(get_db),
):
    report = await generate_risk_report(db, created_by_id=current_user.id, period_days=period_days)
    await db.commit()
    return {
        "id": report.id, "feature_evaluated": report.feature_evaluated,
        "period_days": report.period_days, "risks_identified": report.risks_identified,
        "recommendations": report.recommendations, "compliance_status": report.compliance_status,
        "summary": report.summary, "created_at": utc_iso(report.created_at),
    }


@router.get("/risk-reports")
async def list_risk_reports(
    limit: int = Query(20, ge=1, le=100),
    _:     User = Depends(AdminOnly),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RiskReport).order_by(RiskReport.created_at.desc()).limit(limit))
    reports = result.scalars().all()
    return [
        {
            "id": r.id, "feature_evaluated": r.feature_evaluated, "period_days": r.period_days,
            "risks_identified": r.risks_identified, "recommendations": r.recommendations,
            "compliance_status": r.compliance_status, "summary": r.summary,
            "created_at": utc_iso(r.created_at),
        }
        for r in reports
    ]
