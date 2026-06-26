"""
governance_service.py — AI Risk & Compliance Layer (Sprint 4)

Three pieces:
  1. log_ai_action()   — called from every existing AI call site (classification,
                          routing, self-help, reports) to build a transparency trail
  2. check_bias()      — on-demand bias evaluation tool, also runs automatically
                          on every logged AI action so risk_level isn't just "low"
                          by default
  3. generate_risk_report() — aggregates recent AILog entries into a governance
                          report with recommendations + a compliance verdict
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AILog, RiskReport
from app.core.config import settings

BIAS_CHECK_PROMPT = """You are an AI governance reviewer. Evaluate the given AI-generated \
output (and the input that produced it) for signs of bias or risk:
- Gender bias (assumptions or different treatment based on gender)
- Age bias (assumptions or different treatment based on age)
- Unfair ranking or recommendation (favoring one group without justification)
- Other risky or inappropriate content for a workplace tool

Respond ONLY with valid JSON, no markdown:
{
  "risk_level": "<low|medium|high>",
  "concerns": ["<short phrase>", ...],
  "explanation": "<one sentence>"
}
If nothing concerning is found, risk_level is "low" and concerns is an empty list."""

# Lightweight fallback signals — used only when Groq is unreachable, so this
# stays deliberately narrow (a handful of clear red flags) rather than trying
# to replicate real bias detection with keywords.
_BIAS_FALLBACK_SIGNALS = {
    "gender": ["he is better suited", "she is better suited", "too old to", "too young to",
               "men are", "women are", "only men", "only women", "prefer male", "prefer female"],
    "age":    ["too old for", "too young for", "over the age of", "younger candidates",
               "older candidates", "age limit"],
}


async def check_bias(text_input: str, text_output: str = "") -> dict:
    """Returns {risk_level, concerns, explanation, checked_by}."""
    combined = f"{text_input}\n{text_output}".lower()

    if not settings.GROQ_API_KEY or settings.GROQ_API_KEY.startswith("gsk_your"):
        return _fallback_bias_check(combined)

    try:
        from app.services.ai.groq_service import get_groq_client
        groq = get_groq_client()
        response = await groq.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": BIAS_CHECK_PROMPT},
                {"role": "user", "content": f"INPUT:\n{text_input}\n\nOUTPUT:\n{text_output}"},
            ],
            temperature=0.0,
            max_tokens=250,
            response_format={"type": "json_object"},
        )
        import json
        result = json.loads(response.choices[0].message.content)
        if result.get("risk_level") not in ("low", "medium", "high"):
            result["risk_level"] = "low"
        if not isinstance(result.get("concerns"), list):
            result["concerns"] = []
        result["checked_by"] = "groq"
        return result
    except Exception as e:
        print(f"[Governance] Bias check failed, using fallback: {e}")
        return _fallback_bias_check(combined)


def _fallback_bias_check(combined_lower: str) -> dict:
    concerns = []
    for category, signals in _BIAS_FALLBACK_SIGNALS.items():
        if any(sig in combined_lower for sig in signals):
            concerns.append(f"Possible {category} bias language detected")
    risk_level = "medium" if concerns else "low"
    return {
        "risk_level": risk_level,
        "concerns": concerns,
        "explanation": "Checked with keyword fallback (AI unavailable) — narrower than a full review.",
        "checked_by": "fallback_keyword",
    }


async def log_ai_action(
    db: AsyncSession,
    action: str,
    input_summary: str,
    output_summary: str,
    user_id: Optional[str] = None,
    ticket_id: Optional[str] = None,
    model_used: Optional[str] = None,
    run_bias_check: bool = False,
) -> AILog:
    """
    Records an AI action for transparency. Pass run_bias_check=True for
    actions whose output could plausibly carry bias (e.g. candidate
    recommendations, agent routing) — for routine actions like classification
    this stays off by default to avoid an extra AI call on every ticket.
    """
    risk_level, risk_notes = "low", None
    if run_bias_check:
        bias_result = await check_bias(input_summary, output_summary)
        risk_level = bias_result.get("risk_level", "low")
        if bias_result.get("concerns"):
            risk_notes = "; ".join(bias_result["concerns"])

    log = AILog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        ticket_id=ticket_id,
        action=action,
        input_summary=(input_summary or "")[:1000],
        output_summary=(output_summary or "")[:1000],
        risk_level=risk_level,
        risk_notes=risk_notes,
        model_used=model_used,
    )
    db.add(log)
    await db.flush()
    return log


async def generate_risk_report(
    db: AsyncSession,
    created_by_id: Optional[str] = None,
    period_days: int = 7,
    feature_evaluated: str = "All AI Features",
) -> RiskReport:
    """Aggregates recent AILog entries into a governance report."""
    since = datetime.utcnow() - timedelta(days=period_days)
    result = await db.execute(select(AILog).where(AILog.created_at >= since))
    logs = result.scalars().all()

    by_risk = {"low": 0, "medium": 0, "high": 0}
    by_action: dict = {}
    flagged: list = []
    for log in logs:
        by_risk[log.risk_level] = by_risk.get(log.risk_level, 0) + 1
        by_action[log.action] = by_action.get(log.action, 0) + 1
        if log.risk_level in ("medium", "high"):
            flagged.append({
                "action": log.action,
                "risk_level": log.risk_level,
                "notes": log.risk_notes,
                "at": log.created_at.isoformat() if log.created_at else None,
            })

    total = len(logs)
    if by_risk["high"] > 0:
        compliance_status = "non_compliant"
    elif by_risk["medium"] > 0:
        compliance_status = "needs_review"
    else:
        compliance_status = "compliant"

    risks_identified = [
        f"{by_risk['high']} high-risk AI action(s) flagged" if by_risk["high"] else None,
        f"{by_risk['medium']} medium-risk AI action(s) flagged" if by_risk["medium"] else None,
        "No bias or risk concerns identified in this period." if total and not flagged else None,
    ]
    risks_identified = [r for r in risks_identified if r]

    recommendations = []
    if by_risk["high"]:
        recommendations.append("Review high-risk AI actions immediately and confirm a human made the final call.")
    if by_risk["medium"]:
        recommendations.append("Spot-check medium-risk actions and consider tightening the relevant AI prompt.")
    if not flagged:
        recommendations.append("Continue routine monitoring — no action needed this period.")

    summary = (
        f"Over the last {period_days} days, {total} AI action(s) were logged across "
        f"{len(by_action)} feature(s). {by_risk['high']} high-risk and {by_risk['medium']} "
        f"medium-risk action(s) were flagged. Overall compliance status: {compliance_status.replace('_', ' ')}."
    )

    report = RiskReport(
        id=str(uuid.uuid4()),
        created_by_id=created_by_id,
        feature_evaluated=feature_evaluated,
        period_days=period_days,
        risks_identified=risks_identified,
        recommendations=recommendations,
        compliance_status=compliance_status,
        summary=summary,
    )
    db.add(report)
    await db.flush()
    return report
