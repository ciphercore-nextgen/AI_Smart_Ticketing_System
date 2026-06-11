from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings
from app.models.models import Base

# ── Resolve DB path to absolute so SQLite always finds it ────────────────────
# Handles Windows + Python 3.14 where relative paths can fail at startup.
def _resolved_db_url(url: str) -> str:
    if url.startswith("sqlite+aiosqlite:///"):
        raw = url[len("sqlite+aiosqlite:///"):]
        if raw.startswith("./") or not Path(raw).is_absolute():
            # Anchor to the backend folder (two levels up from this file)
            backend_dir = Path(__file__).resolve().parent.parent.parent
            db_path = (backend_dir / raw.lstrip("./")).resolve()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite+aiosqlite:///{db_path}"
    return url

DATABASE_URL = _resolved_db_url(settings.DATABASE_URL)

# SQLite: no pool_size/max_overflow (not supported by StaticPool)
connect_args = {}
engine_kwargs = {
    "echo": settings.APP_ENV == "development",
    "pool_pre_ping": True,
}

if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy.pool import StaticPool
    connect_args = {"check_same_thread": False}
    engine_kwargs["connect_args"] = connect_args
    engine_kwargs["poolclass"] = StaticPool
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_async_engine(DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
