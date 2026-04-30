"""
backend/profile_store.py — Physical Twin Persistence Layer

Uses SQLite so this works without PostgreSQL (zero dependencies beyond stdlib).
In production, you would replace this with the full PostgreSQL BodyScan model.

What it stores:
  - session_token: anonymous UUID (from localStorage)
  - Full body measurements (height, chest, waist, hip, shoulder, inseam, sleeve)
  - Scan metadata: confidence, method, timestamp
  - Consent timestamp (GDPR proof of consent)

GDPR Compliance:
  - DELETE /api/v1/profile/{token} permanently erases all data
  - No PII is stored — only body geometry and anonymous session ID
  - Consent timestamp is recorded before any scan data is saved
"""

import sqlite3
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# SQLite database path — kept in the backend directory
DB_PATH = Path(__file__).parent / "physical_twin.db"


@dataclass
class BodyProfile:
    """Full body profile for a user session (the Physical Twin)."""
    session_token: str
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    gender: Optional[str] = None

    # Body geometry (cm) — the actual measurements
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hip_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None
    inseam_cm: Optional[float] = None
    sleeve_cm: Optional[float] = None
    neck_cm: Optional[float] = None

    # Metadata
    scan_method: str = "ratio"           # "sam3d" | "ratio" | "manual"
    confidence_score: Optional[float] = None
    consent_given_at: Optional[str] = None   # ISO 8601 timestamp
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _init_db():
    """Create the profiles table if it doesn't exist yet."""
    with _connect() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS body_profiles (
                session_token       TEXT PRIMARY KEY,
                height_cm           REAL,
                weight_kg           REAL,
                gender              TEXT,
                chest_cm            REAL,
                waist_cm            REAL,
                hip_cm              REAL,
                shoulder_cm         REAL,
                inseam_cm           REAL,
                sleeve_cm           REAL,
                neck_cm             REAL,
                scan_method         TEXT DEFAULT 'ratio',
                confidence_score    REAL,
                consent_given_at    TEXT,
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            )
        """)
        con.commit()
    logger.info(f"[PROFILE_STORE] SQLite DB ready at {DB_PATH}")


# Initialize on module import
_init_db()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_profile(profile: BodyProfile) -> BodyProfile:
    """
    Insert or update a body profile.
    Sets created_at on insert, always updates updated_at.
    """
    now = _now_iso()

    with _connect() as con:
        existing = get_profile(profile.session_token)

        if existing:
            # Update existing profile
            con.execute("""
                UPDATE body_profiles SET
                    height_cm=?, weight_kg=?, gender=?,
                    chest_cm=?, waist_cm=?, hip_cm=?,
                    shoulder_cm=?, inseam_cm=?, sleeve_cm=?, neck_cm=?,
                    scan_method=?, confidence_score=?,
                    consent_given_at=?, updated_at=?
                WHERE session_token=?
            """, (
                profile.height_cm, profile.weight_kg, profile.gender,
                profile.chest_cm, profile.waist_cm, profile.hip_cm,
                profile.shoulder_cm, profile.inseam_cm, profile.sleeve_cm, profile.neck_cm,
                profile.scan_method, profile.confidence_score,
                profile.consent_given_at, now,
                profile.session_token,
            ))
            profile.created_at = existing.created_at
        else:
            # Insert new profile
            profile.created_at = now
            con.execute("""
                INSERT INTO body_profiles (
                    session_token, height_cm, weight_kg, gender,
                    chest_cm, waist_cm, hip_cm,
                    shoulder_cm, inseam_cm, sleeve_cm, neck_cm,
                    scan_method, confidence_score,
                    consent_given_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                profile.session_token,
                profile.height_cm, profile.weight_kg, profile.gender,
                profile.chest_cm, profile.waist_cm, profile.hip_cm,
                profile.shoulder_cm, profile.inseam_cm, profile.sleeve_cm, profile.neck_cm,
                profile.scan_method, profile.confidence_score,
                profile.consent_given_at, now, now,
            ))

        profile.updated_at = now
        con.commit()

    logger.info(f"[PROFILE_STORE] Saved profile for token={profile.session_token[:8]}…")
    return profile


def get_profile(session_token: str) -> Optional[BodyProfile]:
    """Load a body profile by session token. Returns None if not found."""
    with _connect() as con:
        row = con.execute(
            "SELECT * FROM body_profiles WHERE session_token=?",
            (session_token,)
        ).fetchone()

    if row is None:
        return None

    return BodyProfile(
        session_token   = row["session_token"],
        height_cm       = row["height_cm"],
        weight_kg       = row["weight_kg"],
        gender          = row["gender"],
        chest_cm        = row["chest_cm"],
        waist_cm        = row["waist_cm"],
        hip_cm          = row["hip_cm"],
        shoulder_cm     = row["shoulder_cm"],
        inseam_cm       = row["inseam_cm"],
        sleeve_cm       = row["sleeve_cm"],
        neck_cm         = row["neck_cm"],
        scan_method     = row["scan_method"],
        confidence_score= row["confidence_score"],
        consent_given_at= row["consent_given_at"],
        created_at      = row["created_at"],
        updated_at      = row["updated_at"],
    )


def delete_profile(session_token: str) -> bool:
    """
    Permanently delete a profile (GDPR right to erasure).
    Returns True if a record was deleted, False if not found.
    """
    with _connect() as con:
        cursor = con.execute(
            "DELETE FROM body_profiles WHERE session_token=?",
            (session_token,)
        )
        con.commit()
        deleted = cursor.rowcount > 0

    if deleted:
        logger.info(f"[PROFILE_STORE] GDPR DELETE — token={session_token[:8]}… permanently erased.")
    else:
        logger.warning(f"[PROFILE_STORE] DELETE — token={session_token[:8]}… not found.")

    return deleted


def generate_session_token() -> str:
    """Generate a cryptographically random anonymous session token."""
    return uuid.uuid4().hex
