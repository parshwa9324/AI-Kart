"""AI-Kart Phase 4 — Simplified 4-table production schema.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-03-26

Tables:
  brands        — Multi-tenant B2B brand accounts
  garments      — Brand garment catalog with digitized measurements
  body_profiles — Anonymous body scan snapshots per session
  render_jobs   — Virtual try-on async job queue

Replaces the original 8-table schema with the canonical Phase 4 schema.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Drop legacy tables if they exist (idempotent) ─────────────────────────
    # This migration is the canonical baseline. Running it on a fresh DB is
    # the happy path; on a DB with the old schema we drop & recreate cleanly.
    op.execute("DROP TABLE IF EXISTS analytics_events CASCADE")
    op.execute("DROP TABLE IF EXISTS size_chart_entries CASCADE")
    op.execute("DROP TABLE IF EXISTS size_charts CASCADE")
    op.execute("DROP TABLE IF EXISTS tryon_jobs CASCADE")
    op.execute("DROP TABLE IF EXISTS body_scans CASCADE")
    op.execute("DROP TABLE IF EXISTS garments CASCADE")
    op.execute("DROP TABLE IF EXISTS brand_users CASCADE")
    op.execute("DROP TABLE IF EXISTS render_jobs CASCADE")
    op.execute("DROP TABLE IF EXISTS body_profiles CASCADE")
    op.execute("DROP TABLE IF EXISTS brands CASCADE")

    # ── brands ────────────────────────────────────────────────────────────────
    op.create_table(
        "brands",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("api_key", sa.String(128), nullable=False, unique=True),
        sa.Column("plan_tier", sa.String(20), server_default="trial", nullable=False),
    )

    # ── garments ──────────────────────────────────────────────────────────────
    op.create_table(
        "garments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "brand_id",
            sa.String(36),
            sa.ForeignKey("brands.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("type", sa.String(60), server_default="upper_body"),
        sa.Column("sizes", sa.JSON()),
        sa.Column("material_code", sa.String(50), server_default="cotton"),
        sa.Column("stretch_coefficient", sa.Float(), server_default="0.02"),
    )
    op.create_index("ix_garments_brand_id", "garments", ["brand_id"])

    # ── body_profiles ─────────────────────────────────────────────────────────
    op.create_table(
        "body_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_uuid", sa.String(256), nullable=False),
        sa.Column(
            "brand_id",
            sa.String(36),
            sa.ForeignKey("brands.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("measurements", sa.JSON()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_body_profiles_session_uuid", "body_profiles", ["session_uuid"])

    # ── render_jobs ───────────────────────────────────────────────────────────
    op.create_table(
        "render_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("job_uuid", sa.String(36), nullable=False),
        sa.Column(
            "brand_id",
            sa.String(36),
            sa.ForeignKey("brands.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(30), server_default="queued"),
        sa.Column("result_url", sa.String(1024)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_render_jobs_job_uuid", "render_jobs", ["job_uuid"])


def downgrade() -> None:
    op.drop_table("render_jobs")
    op.drop_table("body_profiles")
    op.drop_table("garments")
    op.drop_table("brands")
