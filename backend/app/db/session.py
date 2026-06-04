from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings
from app.models.models import Base

# SQLite: no pool_size/max_overflow (not supported by StaticPool)
connect_args = {}
engine_kwargs = {
    "echo": settings.APP_ENV == "development",
    "pool_pre_ping": True,
}

if settings.DATABASE_URL.startswith("sqlite"):
    from sqlalchemy.pool import StaticPool
    connect_args = {"check_same_thread": False}
    engine_kwargs["connect_args"] = connect_args
    engine_kwargs["poolclass"] = StaticPool
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

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
