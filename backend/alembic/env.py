"""
alembic/env.py — Async-compatible Alembic environment for AI-Kart

Uses asyncio.run() + run_sync() to support asyncpg connections while
still giving Alembic its synchronous migration surface.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import pool
from alembic import context

# ── Pull in all models so autogenerate can detect them ────────────────────────
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import Base   # noqa: F401  — registers the DeclarativeBase
import models               # noqa: F401  — registers all table classes

from config import DATABASE_URL

# ── Alembic Config object ─────────────────────────────────────────────────────
alembic_config = context.config

if alembic_config.config_file_name is not None:
    fileConfig(alembic_config.config_file_name)

target_metadata = Base.metadata

# ── Build async DB URL ────────────────────────────────────────────────────────
ASYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace(
    "postgres://", "postgresql+asyncpg://"
).split("?")[0] # Strip unsupported asyncpg query params


def run_migrations_offline() -> None:
    """Emit SQL to stdout — useful for dry-runs and CI diffing."""
    context.configure(
        url=ASYNC_DB_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine — required for asyncpg."""
    connectable = create_async_engine(ASYNC_DB_URL, poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
