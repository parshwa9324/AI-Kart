"""AI-Kart initial database schema migration.

Revision ID: 001
Revises:
Create Date: 2026-03-14

This is the initial schema — creating all tables from scratch.
Run with:  alembic upgrade head
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── brands ────────────────────────────────────────────────────────────────
    op.create_table(
        "brands",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("plan_tier", sa.String(20), server_default="trial"),
        sa.Column("api_key_hash", sa.String(128), nullable=False),
        sa.Column("stripe_customer_id", sa.String(64)),
        sa.Column("webhook_url", sa.String(512)),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_brands_slug"),
        sa.UniqueConstraint("api_key_hash", name="uq_brands_api_key_hash"),
    )

    # ── brand_users ───────────────────────────────────────────────────────────
    op.create_table(
        "brand_users",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("brand_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(256), nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("role", sa.String(30), server_default="admin"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("brand_id", "email", name="uq_brand_user_email"),
    )

    # ── garments ──────────────────────────────────────────────────────────────
    op.create_table(
        "garments",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("brand_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("category", sa.String(60), server_default="upper_body"),
        sa.Column("sku", sa.String(120)),
        sa.Column("image_url", sa.String(1024)),
        sa.Column("mask_url", sa.String(1024)),
        sa.Column("measurements", postgresql.JSON()),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── body_scans ────────────────────────────────────────────────────────────
    op.create_table(
        "body_scans",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("brand_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("brands.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_token", sa.String(256), nullable=False, index=True),
        sa.Column("height_cm", sa.Float()),
        sa.Column("weight_kg", sa.Float()),
        sa.Column("gender", sa.String(20)),
        sa.Column("age_group", sa.String(20)),
        sa.Column("chest_cm", sa.Float()),
        sa.Column("waist_cm", sa.Float()),
        sa.Column("hip_cm", sa.Float()),
        sa.Column("shoulder_cm", sa.Float()),
        sa.Column("inseam_cm", sa.Float()),
        sa.Column("sleeve_cm", sa.Float()),
        sa.Column("neck_cm", sa.Float()),
        sa.Column("scan_method", sa.String(30), server_default="sam3d"),
        sa.Column("confidence_score", sa.Float()),
        sa.Column("input_quality", sa.String(20)),
        sa.Column("raw_landmarks", postgresql.JSON()),
        sa.Column("scan_duration_ms", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── tryon_jobs ────────────────────────────────────────────────────────────
    op.create_table(
        "tryon_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("brand_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("brands.id", ondelete="SET NULL"), nullable=True),
        sa.Column("garment_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("garments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("body_scan_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("body_scans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(30), server_default="queued"),
        sa.Column("queue_name", sa.String(60), server_default="aikart_tryon"),
        sa.Column("priority", sa.Integer(), server_default="5"),
        sa.Column("person_image_key", sa.String(512)),
        sa.Column("result_image_url", sa.String(1024)),
        sa.Column("error_message", sa.Text()),
        sa.Column("attempt", sa.Integer(), server_default="0"),
        sa.Column("max_retries", sa.Integer(), server_default="3"),
        sa.Column("progress_pct", sa.Integer(), server_default="0"),
        sa.Column("queued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("queue_wait_ms", sa.Integer()),
        sa.Column("inference_ms", sa.Integer()),
    )

    # ── size_charts ───────────────────────────────────────────────────────────
    op.create_table(
        "size_charts",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("brand_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("garment_category", sa.String(60), server_default="upper_body"),
        sa.Column("region", sa.String(20), server_default="US"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("brand_id", "garment_category", "region", name="uq_size_chart"),
    )

    # ── size_chart_entries ────────────────────────────────────────────────────
    op.create_table(
        "size_chart_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("chart_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("size_charts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("size_label", sa.String(10), nullable=False),
        sa.Column("chest_min", sa.Float()),
        sa.Column("chest_max", sa.Float()),
        sa.Column("waist_min", sa.Float()),
        sa.Column("waist_max", sa.Float()),
        sa.Column("hip_min", sa.Float()),
        sa.Column("hip_max", sa.Float()),
        sa.Column("shoulder_min", sa.Float()),
        sa.Column("shoulder_max", sa.Float()),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("chart_id", "size_label", name="uq_size_chart_entry"),
    )

    # ── analytics_events ──────────────────────────────────────────────────────
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("brand_id", sa.String(36), nullable=False, index=True),
        sa.Column("event_type", sa.String(60), nullable=False, index=True),
        sa.Column("session_token", sa.String(256), index=True),
        sa.Column("garment_id", sa.String(36)),
        sa.Column("size_recommended", sa.String(10)),
        sa.Column("confidence", sa.Float()),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("extra", postgresql.JSON()),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )

    # ── Indexes ───────────────────────────────────────────────────────────────
    op.create_index("ix_tryon_jobs_brand_status", "tryon_jobs", ["brand_id", "status"])
    op.create_index("ix_tryon_jobs_queued_at", "tryon_jobs", ["queued_at"])
    op.create_index("ix_garments_brand_category", "garments", ["brand_id", "category"])
    op.create_index("ix_body_scans_created_at", "body_scans", ["created_at"])


def downgrade() -> None:
    op.drop_table("analytics_events")
    op.drop_table("size_chart_entries")
    op.drop_table("size_charts")
    op.drop_table("tryon_jobs")
    op.drop_table("body_scans")
    op.drop_table("garments")
    op.drop_table("brand_users")
    op.drop_table("brands")
