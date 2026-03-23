"""
backend/database.py — Async SQLAlchemy Engine & Session Factory

Provides:
  - Async engine backed by asyncpg (PostgreSQL)
  - AsyncSession factory with context manager helper
  - Base declarative class used by all models
  - get_db() FastAPI dependency
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import DATABASE_URL

# ── Convert sync postgres:// → async postgresql+asyncpg:// ────────────────────
_ASYNC_DB_URL = DATABASE_URL.replace(
    "postgresql://", "postgresql+asyncpg://"
).replace(
    "postgres://", "postgresql+asyncpg://"
)

engine = create_async_engine(
    _ASYNC_DB_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,      # validate connections before use
    echo=False,              # set True for SQL debug logging
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all AI-Kart ORM models."""
    pass


async def get_db():
    """FastAPI dependency — yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
