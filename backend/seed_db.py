"""
backend/seed_db.py — Seed demographic and size chart data

Run with:
    python seed_db.py

This inserts:
  1. A demo brand "Luminary Demo" with a trial plan
  2. Standard US size charts for upper_body, lower_body categories
     covering XS → 3XL with anthropometric measurement ranges
"""

import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from config import DATABASE_URL
from models import Brand, SizeChart, SizeChartEntry

ASYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace(
    "postgres://", "postgresql+asyncpg://"
)

# ──────────────────────────────────────────────────────────────────────────────
# Size data — ISO-anchored anthropometric ranges (cm)
# Source: ISO 8559-1:2022 body measurement standard
# ──────────────────────────────────────────────────────────────────────────────
UPPER_BODY_SIZES = [
    # label  chest_min chest_max waist_min waist_max shoulder_min shoulder_max sort
    ("XS",   76,       84,       60,       68,       35,          38,          0),
    ("S",    84,       92,       68,       76,       38,          41,          1),
    ("M",    92,       100,      76,       84,       41,          44,          2),
    ("L",    100,      108,      84,       92,       44,          47,          3),
    ("XL",   108,      116,      92,       100,      47,          50,          4),
    ("XXL",  116,      124,      100,      108,      50,          53,          5),
    ("3XL",  124,      132,      108,      116,      53,          56,          6),
]

LOWER_BODY_SIZES = [
    # label  waist_min waist_max hip_min hip_max inseam_min inseam_max sort
    ("XS",   60,       68,       84,     92,     None,      None,      0),
    ("S",    68,       76,       92,     100,    None,      None,      1),
    ("M",    76,       84,       100,    108,    None,      None,      2),
    ("L",    84,       92,       108,    116,    None,      None,      3),
    ("XL",   92,       100,      116,    124,    None,      None,      4),
    ("XXL",  100,      108,      124,    132,    None,      None,      5),
    ("3XL",  108,      116,      132,    140,    None,      None,      6),
]


async def seed():
    engine = create_async_engine(ASYNC_DB_URL, echo=True)
    SessionMaker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionMaker() as session:
        # ── 1. Demo brand ──────────────────────────────────────────────────────
        import hashlib, secrets
        demo_api_key = "aikart_demo_key_local_dev"
        key_hash = hashlib.sha256(demo_api_key.encode()).hexdigest()

        brand = Brand(
            id=str(uuid.uuid4()),
            name="Luminary Demo Brand",
            slug="luminary-demo",
            plan_tier="enterprise",
            api_key_hash=key_hash,
            is_active=True,
        )
        session.add(brand)
        await session.flush()   # get brand.id
        print(f"[SEED] Created brand: {brand.id} ({brand.slug})")

        # ── 2. Upper body size chart ───────────────────────────────────────────
        upper_chart = SizeChart(
            id=str(uuid.uuid4()),
            brand_id=brand.id,
            garment_category="upper_body",
            region="US",
        )
        session.add(upper_chart)
        await session.flush()

        for label, cmin, cmax, wmin, wmax, smin, smax, sort in UPPER_BODY_SIZES:
            entry = SizeChartEntry(
                chart_id=upper_chart.id,
                size_label=label,
                chest_min=cmin, chest_max=cmax,
                waist_min=wmin, waist_max=wmax,
                shoulder_min=smin, shoulder_max=smax,
                sort_order=sort,
            )
            session.add(entry)
        print(f"[SEED] Created upper_body chart with {len(UPPER_BODY_SIZES)} entries")

        # ── 3. Lower body size chart ───────────────────────────────────────────
        lower_chart = SizeChart(
            id=str(uuid.uuid4()),
            brand_id=brand.id,
            garment_category="lower_body",
            region="US",
        )
        session.add(lower_chart)
        await session.flush()

        for label, wmin, wmax, hmin, hmax, _, __, sort in LOWER_BODY_SIZES:
            entry = SizeChartEntry(
                chart_id=lower_chart.id,
                size_label=label,
                waist_min=wmin, waist_max=wmax,
                hip_min=hmin,   hip_max=hmax,
                sort_order=sort,
            )
            session.add(entry)
        print(f"[SEED] Created lower_body chart with {len(LOWER_BODY_SIZES)} entries")

        await session.commit()
        print("[SEED] Done. Database seeded successfully.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
