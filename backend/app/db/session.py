from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import text
from app.core.config import settings
from app.models.models import Base


def _resolve_db_url(url: str) -> str:
    """
    Resolve a sqlite+aiosqlite:/// URL to an absolute path anchored to the
    backend folder — but PRESERVE any subdirectories in the configured path
    (e.g. "app/data/ticketiq.db") instead of collapsing to just the bare
    filename. Collapsing to the basename was the bug that caused this
    project to silently fork into two separate databases: every path
    variant (relative, or the Docker-only /app/... form used outside of
    Docker) was landing on plain "<backend_dir>/ticketiq.db", discarding
    wherever the real data actually lived.

    Handles:
      - Relative paths:      sqlite+aiosqlite:///./app/data/ticketiq.db
      - Docker-style paths:  sqlite+aiosqlite:////app/data/ticketiq.db
                              (only special-cased like this when NOT
                              actually running inside that container)
      - True absolute paths: sqlite+aiosqlite:////home/user/x.db or
                              a Windows path like C:/Users/.../x.db
    """
    if not url.startswith("sqlite+aiosqlite:///"):
        return url  # PostgreSQL or other — leave as-is

    raw = url[len("sqlite+aiosqlite:///"):]
    backend_dir = Path(__file__).resolve().parent.parent.parent

    # Docker-only absolute path baked into .env — if we're actually running
    # inside that container (WORKDIR /app), use it verbatim. Otherwise strip
    # the Docker-specific "/app/" prefix and treat the rest as a path
    # relative to the backend folder, so the subdirectory structure (e.g.
    # "data/ticketiq.db") is preserved either way instead of being dropped.
    if raw.startswith("/app/"):
        if backend_dir.as_posix() == "/app":
            p = Path(raw)
            p.parent.mkdir(parents=True, exist_ok=True)
            return url
        raw = raw[len("/app/"):]

    p = Path(raw)
    if p.is_absolute():
        # A genuine absolute path (Windows C:/..., or a real host path).
        p.parent.mkdir(parents=True, exist_ok=True)
        return url

    # Relative path — anchor to the backend folder, preserving subdirectories.
    db_path = (backend_dir / raw.lstrip("./")).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite+aiosqlite:///{db_path}"


DATABASE_URL = _resolve_db_url(settings.DATABASE_URL)

engine = create_async_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=settings.APP_ENV == "development",
)

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
        await _migrate_columns(conn)


async def _migrate_columns(conn):
    """Add new columns to existing tables without dropping data."""
    new_columns = [
        ("tickets", "self_help_shown",      "BOOLEAN DEFAULT 0"),
        ("tickets", "self_help_resolved",    "BOOLEAN"),
        ("tickets", "self_help_steps_done",  "JSON"),
        ("tickets", "self_help_outcome_at",  "DATETIME"),
        # Caches the AI-generated steps/summary so re-opening a ticket shows
        # the SAME steps (and lets "step 3 was checked" stay meaningful)
        # instead of silently regenerating a different set every load.
        ("tickets", "self_help_content",     "JSON"),
    ]
    for table, column, col_def in new_columns:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
        except Exception:
            pass  # Column already exists — safe to ignore
