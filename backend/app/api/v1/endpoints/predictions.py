from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.deps import get_current_user, require_roles
from app.models.models import User
from app.services.predictions.prediction_service import generate_forecast

router = APIRouter(prefix="/predictions", tags=["predictions"])

AdminOnly = require_roles("admin", "super_admin")


@router.get("/forecast")
async def forecast(
    department: str = Query("all"),
    history_days: int = Query(30, ge=7, le=180),
    forecast_days: int = Query(7, ge=1, le=14),
    _:  User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    return await generate_forecast(db, department, history_days, forecast_days, persist=True)
