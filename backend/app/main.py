from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import init_db
from app.api.v1.endpoints import auth, tickets, analytics, admin

app = FastAPI(
    title="TicketIQ Enterprise API",
    description="AI-Powered Enterprise Smart Ticketing Platform",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/v1")
app.include_router(tickets.router,   prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(admin.router,     prefix="/api/v1")


@app.on_event("startup")
async def startup():
    await init_db()
    print("✅ TicketIQ Enterprise API started")
    print("📖 Docs: http://localhost:8000/api/v1/docs")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "service": "TicketIQ Enterprise"}
