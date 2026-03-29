"""
backend/models.py — AI-Kart Platform ORM Models

Tables:
  brands           — Multi-tenant brand accounts
  garments         — Garment catalog with digitized measurements
  body_profiles    — Body measurement snapshots per user session
  render_jobs      — Virtual try-on job queue
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    String,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

def _now() -> datetime:
    return datetime.now(timezone.utc)

# ──────────────────────────────────────────────────────────────────────────────
# Brands
# ──────────────────────────────────────────────────────────────────────────────
class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    api_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    plan_tier: Mapped[str] = mapped_column(String(20), default="trial") # trial | standard | enterprise
    webhook_url: Mapped[Optional[str]] = mapped_column(String(1024))

    garments: Mapped[list["Garment"]] = relationship(back_populates="brand", cascade="all, delete-orphan")
    body_profiles: Mapped[list["BodyProfile"]] = relationship(back_populates="brand", cascade="all, delete-orphan")
    render_jobs: Mapped[list["RenderJob"]] = relationship(back_populates="brand")

# ──────────────────────────────────────────────────────────────────────────────
# Garments
# ──────────────────────────────────────────────────────────────────────────────
class Garment(Base):
    __tablename__ = "garments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    type: Mapped[str] = mapped_column(String(60), default="upper_body")
    
    # Store sizes & measurements as JSON for dynamic lookup
    sizes: Mapped[Optional[dict]] = mapped_column(JSON)
    
    material_code: Mapped[str] = mapped_column(String(50), default="cotton")
    stretch_coefficient: Mapped[float] = mapped_column(Float, default=0.02)

    brand: Mapped["Brand"] = relationship(back_populates="garments")

# ──────────────────────────────────────────────────────────────────────────────
# Body Profiles
# ──────────────────────────────────────────────────────────────────────────────
class BodyProfile(Base):
    __tablename__ = "body_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_uuid: Mapped[str] = mapped_column(String(256), index=True)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    
    # All body measurements in cm
    measurements: Mapped[Optional[dict]] = mapped_column(JSON)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    consented_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    brand: Mapped[Optional["Brand"]] = relationship(back_populates="body_profiles")

# ──────────────────────────────────────────────────────────────────────────────
# Render Jobs
# ──────────────────────────────────────────────────────────────────────────────
class RenderJob(Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_uuid: Mapped[str] = mapped_column(String(36), index=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    
    status: Mapped[str] = mapped_column(String(30), default="queued") # queued | processing | done | failed
    result_url: Mapped[Optional[str]] = mapped_column(String(1024))
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    brand: Mapped[Optional["Brand"]] = relationship(back_populates="render_jobs")

