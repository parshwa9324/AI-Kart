"""
backend/reset_and_seed_db.py

Production-grade database reset and seed script for AI-Kart Phase 4.

Uses psycopg2 (sync, AUTOCOMMIT) to:
  1. Drop all legacy tables
  2. Create the 4 canonical Phase 4 tables
  3. Stamp Alembic at head so future migrations are tracked correctly
  4. Seed with luxury brand catalog + garments

Run once after any schema change or on a fresh Neon DB:
    python reset_and_seed_db.py
"""

import os
import sys
import uuid
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("reset_db")

# ── Load env ──────────────────────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    log.error("DATABASE_URL not set in .env")
    sys.exit(1)

# ── Build psycopg2-compatible URL (strip asyncpg params) ──────────────────────
# psycopg2 doesn't accept channel_binding= but does accept sslmode=
import urllib.parse

parsed = urllib.parse.urlparse(DATABASE_URL)
qs = urllib.parse.parse_qs(parsed.query)
qs.pop("channel_binding", None)  # remove asyncpg-only param
new_query = urllib.parse.urlencode({k: v[0] for k, v in qs.items()})
SYNC_URL = urllib.parse.urlunparse(parsed._replace(query=new_query))

log.info(f"Connecting to Neon PostgreSQL …")

import psycopg2
import psycopg2.extras

conn = psycopg2.connect(SYNC_URL)
conn.autocommit = True
cur = conn.cursor()

# ── Step 1: Drop all known legacy tables ──────────────────────────────────────
log.info("Dropping all legacy tables …")

legacy_tables = [
    "analytics_events", "size_chart_entries", "size_charts",
    "tryon_jobs", "body_scans", "brand_users",
    "render_jobs", "body_profiles", "garments", "brands",
    "alembic_version",
]
for t in legacy_tables:
    cur.execute(f'DROP TABLE IF EXISTS "{t}" CASCADE')

log.info("  ✓ All legacy tables dropped")

# ── Step 2: Create the 4 canonical Phase 4 tables ────────────────────────────
log.info("Creating Phase 4 schema …")

cur.execute("""
CREATE TABLE brands (
    id          VARCHAR(36) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    api_key     VARCHAR(128) NOT NULL UNIQUE,
    plan_tier   VARCHAR(20) NOT NULL DEFAULT 'trial',
    webhook_url VARCHAR(1024)
)
""")

cur.execute("""
CREATE TABLE garments (
    id                   VARCHAR(36) PRIMARY KEY,
    brand_id             VARCHAR(36) NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name                 VARCHAR(300) NOT NULL,
    type                 VARCHAR(60) DEFAULT 'upper_body',
    sizes                JSONB,
    material_code        VARCHAR(50) DEFAULT 'cotton',
    stretch_coefficient  FLOAT DEFAULT 0.02
)
""")
cur.execute("CREATE INDEX ix_garments_brand_id ON garments (brand_id)")

cur.execute("""
CREATE TABLE body_profiles (
    id            VARCHAR(36) PRIMARY KEY,
    session_uuid  VARCHAR(256) NOT NULL,
    brand_id      VARCHAR(36) REFERENCES brands(id) ON DELETE SET NULL,
    measurements  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    consented_at  TIMESTAMPTZ
)
""")
cur.execute("CREATE INDEX ix_body_profiles_session_uuid ON body_profiles (session_uuid)")

cur.execute("""
CREATE TABLE render_jobs (
    id          VARCHAR(36) PRIMARY KEY,
    job_uuid    VARCHAR(36) NOT NULL,
    brand_id    VARCHAR(36) REFERENCES brands(id) ON DELETE SET NULL,
    status      VARCHAR(30) DEFAULT 'queued',
    result_url  VARCHAR(1024),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
""")
cur.execute("CREATE INDEX ix_render_jobs_job_uuid ON render_jobs (job_uuid)")

log.info("  ✓ Phase 4 schema created")

# ── Step 3: Stamp Alembic at head ─────────────────────────────────────────────
log.info("Stamping Alembic version …")
cur.execute("""
CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
)
""")
cur.execute("INSERT INTO alembic_version (version_num) VALUES ('001_initial_schema')")
log.info("  ✓ Alembic stamped at 001_initial_schema")

# ── Step 4: Seed luxury brand catalog ────────────────────────────────────────
log.info("Seeding brand catalog …")

brands = [
    {
        "id": str(uuid.uuid4()),
        "name": "Maison Luxe",
        "api_key": "mlx_prod_" + uuid.uuid4().hex[:20],
        "plan_tier": "enterprise",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Ermenegildo Zegna",
        "api_key": "zeg_prod_" + uuid.uuid4().hex[:20],
        "plan_tier": "enterprise",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Prada",
        "api_key": "prd_prod_" + uuid.uuid4().hex[:20],
        "plan_tier": "enterprise",
    },
]

for b in brands:
    cur.execute(
        "INSERT INTO brands (id, name, api_key, plan_tier) VALUES (%s, %s, %s, %s)",
        (b["id"], b["name"], b["api_key"], b["plan_tier"]),
    )

log.info(f"  ✓ {len(brands)} brands inserted")

# ── Step 5: Seed garment catalog ──────────────────────────────────────────────
log.info("Seeding garment catalog …")

import json

garments = []
for b in brands:
    if b["name"] == "Maison Luxe":
        # French cut (slim), cashmere/wool blend, stretch: 0.06, tight tolerance (-1cm)
        garments += [
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Le Smoking Tuxedo", "type": "upper_body",
                "sizes": json.dumps({"S": {"chest": 92}, "M": {"chest": 96}, "L": {"chest": 100}}),
                "material_code": "cashmere/wool blend", "stretch_coefficient": 0.06,
            },
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Breton Stripe Shirt", "type": "upper_body",
                "sizes": json.dumps({"S": {"chest": 90}, "M": {"chest": 94}, "L": {"chest": 98}}),
                "material_code": "cashmere/wool blend", "stretch_coefficient": 0.06,
            },
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Tapered Wool Trouser", "type": "lower_body",
                "sizes": json.dumps({"30": {"waist": 78}, "32": {"waist": 82}, "34": {"waist": 86}}),
                "material_code": "cashmere/wool blend", "stretch_coefficient": 0.06,
            },
        ]
    elif b["name"] == "Ermenegildo Zegna":
        # Italian cut (slim-regular), merino wool / linen, stretch: 0.05, standard tolerance (0cm)
        garments += [
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Trofeo Wool Suit", "type": "upper_body",
                "sizes": json.dumps({"S": {"chest": 94}, "M": {"chest": 98}, "L": {"chest": 102}}),
                "material_code": "merino wool / linen", "stretch_coefficient": 0.05,
            },
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Linen Dress Shirt", "type": "upper_body",
                "sizes": json.dumps({"S": {"chest": 96}, "M": {"chest": 100}, "L": {"chest": 104}}),
                "material_code": "merino wool / linen", "stretch_coefficient": 0.05,
            },
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "City Fit Chino", "type": "lower_body",
                "sizes": json.dumps({"30": {"waist": 80}, "32": {"waist": 84}, "34": {"waist": 88}}),
                "material_code": "merino wool / linen", "stretch_coefficient": 0.05,
            },
        ]
    else:
        # Prada - Italian cut (relaxed), technical fabric / cotton, stretch: 0.02, relaxed tolerance (+1.5cm)
        garments += [
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Re-Nylon Blouson", "type": "upper_body",
                "sizes": json.dumps({"46": {"chest": 100}, "48": {"chest": 104}, "50": {"chest": 108}}),
                "material_code": "technical fabric / cotton", "stretch_coefficient": 0.02,
            },
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Poplin Button Shirt", "type": "upper_body",
                "sizes": json.dumps({"46": {"chest": 102}, "48": {"chest": 106}, "50": {"chest": 110}}),
                "material_code": "technical fabric / cotton", "stretch_coefficient": 0.02,
            },
            {
                "id": str(uuid.uuid4()), "brand_id": b["id"],
                "name": "Wide Leg Trouser", "type": "lower_body",
                "sizes": json.dumps({"30": {"waist": 84}, "32": {"waist": 88}, "34": {"waist": 92}}),
                "material_code": "technical fabric / cotton", "stretch_coefficient": 0.02,
            },
        ]

for g in garments:
    cur.execute(
        """INSERT INTO garments (id, brand_id, name, type, sizes, material_code, stretch_coefficient)
           VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)""",
        (g["id"], g["brand_id"], g["name"], g["type"], g["sizes"], g["material_code"], g["stretch_coefficient"]),
    )

log.info(f"  ✓ {len(garments)} garments inserted ({len(garments)//len(brands)} per brand)")

cur.close()
conn.close()

log.info("")
log.info("═" * 60)
log.info("  ✅  Database reset + seed complete!")
log.info("═" * 60)
log.info("")
log.info("Brands seeded:")
for b in brands:
    log.info(f"  • {b['name']} ({b['plan_tier']}) — api_key: {b['api_key']}")
log.info("")
log.info("⚠️  Save these API keys — they are stored hashed and cannot be recovered.")
