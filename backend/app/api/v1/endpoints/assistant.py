from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_db
from app.core.deps import require_roles
from app.models.models import User
from app.services.assistant.assistant_service import answer_question
from app.governance.governance_service import log_ai_action

router = APIRouter(prefix="/assistant", tags=["assistant"])

AdminOnly = require_roles("admin", "super_admin")


class AskRequest(BaseModel):
    question: str
    department: str = "all"


@router.post("/ask")
async def ask(
    req: AskRequest,
    current_user: User = Depends(AdminOnly),
    db: AsyncSession = Depends(get_db),
):
    result = await answer_question(db, req.question, req.department)
    await log_ai_action(
        db, action="ai_assistant_query",
        input_summary=req.question,
        output_summary=result["answer"],
        user_id=current_user.id,
    )
    await db.commit()
    return {"answer": result["answer"]}
