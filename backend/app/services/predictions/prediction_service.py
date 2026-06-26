"""
prediction_service.py — Predictive Insights Module (Sprint 3)

Forecasts next-week ticket volume from historical data. Deliberately uses a
simple weighted moving-average + linear trend model rather than a heavier
scikit-learn regression — with the ticket volumes this app actually has
(tens per month, not thousands), a fancier model would be fitting noise, not
signal. This is the honest, defensible choice for the data volume involved,
and produces the same kind of output (a day-by-day forecast) the business
actually needs.
"""
from datetime import datetime, timedelta
from typing import Optional
import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Ticket, Department, Prediction
from app.core.config import settings

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def _daily_counts(db: AsyncSession, department_slug: Optional[str], history_days: int) -> dict:
    """Returns {date: count} for the last `history_days` days."""
    since = datetime.utcnow() - timedelta(days=history_days)
    filters = [Ticket.created_at >= since]
    if department_slug and department_slug != "all":
        dept_result = await db.execute(select(Department).where(Department.slug == department_slug))
        dept = dept_result.scalar_one_or_none()
        if dept:
            filters.append(Ticket.department_id == dept.id)

    result = await db.execute(select(Ticket.created_at).where(*filters))
    counts: dict = {}
    for (created_at,) in result.all():
        day = created_at.date()
        counts[day] = counts.get(day, 0) + 1
    return counts


def _forecast_next_days(daily_counts: dict, history_days: int, forecast_days: int) -> list:
    """
    Weighted moving average per weekday (so "Mondays tend to be busier" is
    captured) blended with an overall linear trend across the history window.
    Simple, explainable, and appropriate for a low-volume dataset.
    """
    today = datetime.utcnow().date()
    ordered_days = [today - timedelta(days=i) for i in range(history_days)]
    ordered_days.reverse()
    values = [daily_counts.get(d, 0) for d in ordered_days]

    overall_avg = sum(values) / len(values) if values else 0

    # Per-weekday average (captures "Mondays are busier than Sundays" patterns)
    weekday_totals: dict = {i: [] for i in range(7)}
    for d, v in zip(ordered_days, values):
        weekday_totals[d.weekday()].append(v)
    weekday_avg = {
        wd: (sum(vals) / len(vals) if vals else overall_avg)
        for wd, vals in weekday_totals.items()
    }

    # Linear trend: compare the first half of the window to the second half
    half = max(1, len(values) // 2)
    first_half_avg = sum(values[:half]) / half if half else overall_avg
    second_half_avg = sum(values[half:]) / (len(values) - half) if len(values) - half else overall_avg
    trend_per_period = second_half_avg - first_half_avg  # change across the whole window
    trend_per_day = trend_per_period / max(half, 1)

    forecast = []
    for i in range(1, forecast_days + 1):
        future_date = today + timedelta(days=i)
        base = weekday_avg.get(future_date.weekday(), overall_avg)
        predicted = max(0, round(base + trend_per_day * i))
        forecast.append({
            "date": future_date.isoformat(),
            "day_name": DAY_NAMES[future_date.weekday()],
            "predicted_count": int(predicted),
        })
    return forecast


async def generate_forecast(
    db: AsyncSession,
    department_slug: Optional[str] = "all",
    history_days: int = 30,
    forecast_days: int = 7,
    persist: bool = True,
) -> dict:
    daily_counts = await _daily_counts(db, department_slug, history_days)
    forecast = _forecast_next_days(daily_counts, history_days, forecast_days)

    history = []
    today = datetime.utcnow().date()
    for i in range(history_days, 0, -1):
        d = today - timedelta(days=i)
        history.append({"date": d.isoformat(), "day_name": DAY_NAMES[d.weekday()], "count": daily_counts.get(d, 0)})

    total_forecast = sum(f["predicted_count"] for f in forecast)
    peak = max(forecast, key=lambda f: f["predicted_count"]) if forecast else None
    recent_total = sum(h["count"] for h in history[-forecast_days:]) if len(history) >= forecast_days else sum(h["count"] for h in history)

    if recent_total == 0:
        explanation = (
            "Not enough historical ticket volume yet to identify a strong pattern — "
            "this forecast will get more accurate as more tickets are logged."
        )
    else:
        change = total_forecast - recent_total
        direction = "an increase" if change > 0 else "a decrease" if change < 0 else "no significant change"
        explanation = (
            f"Based on the last {history_days} days, next week is forecast at {total_forecast} "
            f"ticket(s) total — {direction} compared to the {recent_total} logged in the most recent "
            f"comparable period. {peak['day_name']} is expected to be the busiest day "
            f"with {peak['predicted_count']} ticket(s)." if peak else explanation
        )

    if persist:
        for f in forecast:
            db.add(Prediction(
                id=str(uuid.uuid4()),
                forecast_date=datetime.fromisoformat(f["date"]),
                department_slug=None if department_slug == "all" else department_slug,
                predicted_count=f["predicted_count"],
                method="weekday_weighted_trend",
            ))
        await db.flush()

    return {
        "scope": department_slug or "all",
        "history": history,
        "forecast": forecast,
        "total_forecast": total_forecast,
        "peak_day": peak,
        "explanation": explanation,
    }
