"""
backend/models.py — AI-Kart Platform ORM Models

Tables:
  brands           — Multi-tenant brand accounts (plan tier, API key, stripe customer)
  brand_users      — Users/admins within a brand account
  garments         — Garment catalog with digitized measurements
  tryon_jobs       — Virtual try-on job queue (status, result URL, retries)
  body_scans       — Body measurement snapshots per user session
  size_charts      — Brand-specific size chart definitions (XS-3XL)
  size_chart_entries — Row per size label with measurement ranges
  analytics_events — Raw event log for the brand analytics dashboard
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ──────────────────────────────────────────────────────────────────────────────
# Brands (multi-tenant root entity)
# ──────────────────────────────────────────────────────────────────────────────
class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(20), default="trial")          # trial | standard | enterprise
    api_key_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(64))
    webhook_url: Mapped[Optional[str]] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    # Relationships
    users: Mapped[list["BrandUser"]] = relationship(back_populates="brand", cascade="all, delete-orphan")
    garments: Mapped[list["Garment"]] = relationship(back_populates="brand", cascade="all, delete-orphan")
    tryon_jobs: Mapped[list["TryonJob"]] = relationship(back_populates="brand")
    size_charts: Mapped[list["SizeChart"]] = relationship(back_populates="brand", cascade="all, delete-orphan")


# ──────────────────────────────────────────────────────────────────────────────
# Brand Users
# ──────────────────────────────────────────────────────────────────────────────
class BrandUser(Base):
    __tablename__ = "brand_users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(256), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="admin")               # admin | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    brand: Mapped["Brand"] = relationship(back_populates="users")

    __table_args__ = (UniqueConstraint("brand_id", "email", name="uq_brand_user_email"),)


# ──────────────────────────────────────────────────────────────────────────────
# Garments
# ──────────────────────────────────────────────────────────────────────────────
class Garment(Base):
    __tablename__ = "garments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="upper_body")      # upper_body | lower_body | dress | outerwear
    sku: Mapped[Optional[str]] = mapped_column(String(120))
    image_url: Mapped[Optional[str]] = mapped_column(String(1024))
    mask_url: Mapped[Optional[str]] = mapped_column(String(1024))                # alpha-masked garment for VTON
    # Digitized measurements (cm) — stored as flat JSON for flexibility
    measurements: Mapped[Optional[dict]] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    brand: Mapped["Brand"] = relationship(back_populates="garments")
    tryon_jobs: Mapped[list["TryonJob"]] = relationship(back_populates="garment")


# ──────────────────────────────────────────────────────────────────────────────
# Try-on Jobs
# ──────────────────────────────────────────────────────────────────────────────
class TryonJob(Base):
    __tablename__ = "tryon_jobs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    garment_id: Mapped[Optional[str]] = mapped_column(ForeignKey("garments.id", ondelete="SET NULL"), nullable=True)
    body_scan_id: Mapped[Optional[str]] = mapped_column(ForeignKey("body_scans.id", ondelete="SET NULL"), nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="queued")            # queued | processing | done | failed | dead_letter
    queue_name: Mapped[str] = mapped_column(String(60), default="aikart_tryon")
    priority: Mapped[int] = mapped_column(Integer, default=5)                    # 1=highest, 10=lowest

    person_image_key: Mapped[Optional[str]] = mapped_column(String(512))         # R2 object key for uploaded photo
    result_image_url: Mapped[Optional[str]] = mapped_column(String(1024))        # CDN URL of try-on result
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    attempt: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)

    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Latency tracking (ms)
    queue_wait_ms: Mapped[Optional[int]] = mapped_column(Integer)
    inference_ms: Mapped[Optional[int]] = mapped_column(Integer)

    brand: Mapped[Optional["Brand"]] = relationship(back_populates="tryon_jobs")
    garment: Mapped[Optional["Garment"]] = relationship(back_populates="tryon_jobs")
    body_scan: Mapped[Optional["BodyScan"]] = relationship(back_populates="tryon_jobs")


# ──────────────────────────────────────────────────────────────────────────────
# Body Scans
# ──────────────────────────────────────────────────────────────────────────────
class BodyScan(Base):
    __tablename__ = "body_scans"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    session_token: Mapped[str] = mapped_column(String(256), index=True)          # anonymous user session

    height_cm: Mapped[Optional[float]] = mapped_column(Float)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    gender: Mapped[Optional[str]] = mapped_column(String(20))
    age_group: Mapped[Optional[str]] = mapped_column(String(20))

    # Measured body dimensions (all in cm)
    chest_cm: Mapped[Optional[float]] = mapped_column(Float)
    waist_cm: Mapped[Optional[float]] = mapped_column(Float)
    hip_cm: Mapped[Optional[float]] = mapped_column(Float)
    shoulder_cm: Mapped[Optional[float]] = mapped_column(Float)
    inseam_cm: Mapped[Optional[float]] = mapped_column(Float)
    sleeve_cm: Mapped[Optional[float]] = mapped_column(Float)
    neck_cm: Mapped[Optional[float]] = mapped_column(Float)

    scan_method: Mapped[str] = mapped_column(String(30), default="sam3d")       # sam3d | ratio
    confidence_score: Mapped[Optional[float]] = mapped_column(Float)             # 0.0–1.0
    input_quality: Mapped[Optional[str]] = mapped_column(String(20))             # good | partial | poor

    raw_landmarks: Mapped[Optional[dict]] = mapped_column(JSON)                  # full SAM3D output
    scan_duration_ms: Mapped[Optional[int]] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    tryon_jobs: Mapped[list["TryonJob"]] = relationship(back_populates="body_scan")


# ──────────────────────────────────────────────────────────────────────────────
# Size Charts
# ──────────────────────────────────────────────────────────────────────────────
class SizeChart(Base):
    __tablename__ = "size_charts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    garment_category: Mapped[str] = mapped_column(String(60), default="upper_body")
    region: Mapped[str] = mapped_column(String(20), default="US")                # US | EU | UK | ASIA
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    brand: Mapped["Brand"] = relationship(back_populates="size_charts")
    entries: Mapped[list["SizeChartEntry"]] = relationship(back_populates="chart", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("brand_id", "garment_category", "region", name="uq_size_chart"),
    )


class SizeChartEntry(Base):
    __tablename__ = "size_chart_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chart_id: Mapped[str] = mapped_column(ForeignKey("size_charts.id", ondelete="CASCADE"), nullable=False)
    size_label: Mapped[str] = mapped_column(String(10), nullable=False)          # XS | S | M | L | XL | XXL | 3XL

    # Measurement ranges (cm) that map a person to this size
    chest_min: Mapped[Optional[float]] = mapped_column(Float)
    chest_max: Mapped[Optional[float]] = mapped_column(Float)
    waist_min: Mapped[Optional[float]] = mapped_column(Float)
    waist_max: Mapped[Optional[float]] = mapped_column(Float)
    hip_min: Mapped[Optional[float]] = mapped_column(Float)
    hip_max: Mapped[Optional[float]] = mapped_column(Float)
    shoulder_min: Mapped[Optional[float]] = mapped_column(Float)
    shoulder_max: Mapped[Optional[float]] = mapped_column(Float)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    chart: Mapped["SizeChart"] = relationship(back_populates="entries")

    __table_args__ = (
        UniqueConstraint("chart_id", "size_label", name="uq_size_chart_entry"),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Analytics Events (time-series event log)
# ──────────────────────────────────────────────────────────────────────────────
class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand_id: Mapped[str] = mapped_column(String(36), index=True)
    event_type: Mapped[str] = mapped_column(String(60), index=True)              # tryon_started | scan_complete | size_recommended | conversion
    session_token: Mapped[Optional[str]] = mapped_column(String(256), index=True)
    garment_id: Mapped[Optional[str]] = mapped_column(String(36))
    size_recommended: Mapped[Optional[str]] = mapped_column(String(10))
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    extra: Mapped[Optional[dict]] = mapped_column(JSON)                          # arbitrary extra payload
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True
    )
