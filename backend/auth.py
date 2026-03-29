"""
backend/auth.py — Multi-Tenant Brand Authentication + Rate Limiting

Enterprise Architecture:
    1. JWT tokens carry brand_id — every request is tenant-scoped
    2. API keys are a simpler alternative for B2B server-to-server integrations
    3. Rate limits are enforced per-brand using Redis sliding window counters
    4. Brand capabilities gate feature access by plan tier

In production: Brands, API keys, and rate limits are stored in PostgreSQL.
For local dev: Hardcoded demo brands with configurable rate limit enforcement.
"""

from fastapi import Security, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
from config import (
    JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES,
    RATE_LIMITS, BRAND_CAPABILITIES, ENFORCE_RATE_LIMITS, REDIS_URL, ENFORCE_AUTH,
)
from typing import Optional
import time
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


# ──────────────────────────────────────────────────────────────────────────────
# Demo Brands (Local Dev Only)
# Production: Loaded from PostgreSQL with full metadata
# ──────────────────────────────────────────────────────────────────────────────
# DEMO_BRANDS dictionary was removed for Phase 4 PostgreSQL Migration.
# Brands are now stored and fetched from the database dynamically.


# ──────────────────────────────────────────────────────────────────────────────
# Token Generation
# ──────────────────────────────────────────────────────────────────────────────

def create_access_token(brand_id: str, plan_tier: str = "trial") -> str:
    """Create a JWT token for a given brand_id with plan tier embedded."""
    payload = {
        "sub": brand_id,
        "plan": plan_tier,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


# ──────────────────────────────────────────────────────────────────────────────
# Token Verification & Brand Context Injection
# ──────────────────────────────────────────────────────────────────────────────

def get_current_brand(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> str:
    """
    FastAPI dependency — extracts brand_id from JWT.
    """
    if credentials is None:
        if ENFORCE_AUTH:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "AUTH_FAILED", "message": "Authorization header is required."}
            )
        return "brand_default"

    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        brand_id: str = payload.get("sub")
        if not brand_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token scope")
        return brand_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

# ──────────────────────────────────────────────────────────────────────────────
# Brand Capability Check
# ──────────────────────────────────────────────────────────────────────────────

def get_brand_capabilities(plan: str) -> dict:
    """Get the full capability set for a brand based on their plan."""
    return BRAND_CAPABILITIES.get(plan, BRAND_CAPABILITIES["trial"])


def require_capability(plan: str, capability: str):
    """
    Check if a brand has access to a specific feature based on their plan tier.
    Raises 403 if the brand's plan doesn't include the capability.
    """
    caps = get_brand_capabilities(plan)
    if not caps.get(capability, False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "PLAN_UPGRADE_REQUIRED",
                "message": f"Feature '{capability}' requires a higher plan. Current plan: {plan}.",
                "current_plan": plan,
                "required_capability": capability,
                "upgrade_url": "https://aikart.dev/pricing",
            }
        )


# ──────────────────────────────────────────────────────────────────────────────
# Rate Limiting (Redis Sliding Window)
# ──────────────────────────────────────────────────────────────────────────────

def _get_rate_limit_redis():
    """Get a Redis connection for rate limiting. Returns None if unavailable."""
    try:
        import redis
        r = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        r.ping()
        return r
    except Exception:
        return None


def check_rate_limit(brand_id: str, plan: str = "enterprise", action: str = "request") -> dict:
    """
    Check if a brand has exceeded their rate limit for a given action.

    Uses a Redis sliding window counter (per-minute for requests, per-hour for renders).
    Returns a dict with rate limit metadata for headers.
    """
    limits = RATE_LIMITS.get(plan, RATE_LIMITS["trial"])

    # Determine which limit to check
    if action == "render":
        max_count = limits["renders_per_hour"]
        window_seconds = 3600
        key_suffix = "renders"
    elif action == "body_scan":
        max_count = limits["body_scans_per_hour"]
        window_seconds = 3600
        key_suffix = "scans"
    else:
        max_count = limits["requests_per_minute"]
        window_seconds = 60
        key_suffix = "requests"

    now = time.time()
    window_key = f"aikart:ratelimit:{brand_id}:{key_suffix}"

    result = {
        "limit": max_count,
        "remaining": max_count,
        "reset_at": int(now + window_seconds),
        "exceeded": False,
    }

    r = _get_rate_limit_redis()
    if r is None:
        # No Redis — can't enforce rate limits, return permissive defaults
        return result

    try:
        # Sliding window: count entries in the sorted set within the time window
        window_start = now - window_seconds
        pipe = r.pipeline()
        pipe.zremrangebyscore(window_key, 0, window_start)   # Clean old entries
        pipe.zadd(window_key, {str(now): now})               # Add current request
        pipe.zcard(window_key)                                # Count entries in window
        pipe.expire(window_key, window_seconds + 10)          # TTL safety
        _, _, current_count, _ = pipe.execute()

        result["remaining"] = max(0, max_count - current_count)
        result["exceeded"] = current_count > max_count

        if result["exceeded"] and ENFORCE_RATE_LIMITS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded for {action}. Max {max_count} per window.",
                    "limit": max_count,
                    "retry_after_seconds": int(window_seconds - (now - window_start)),
                    "plan": plan,
                    "upgrade_url": "https://aikart.dev/pricing",
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Rate limit check failed ({e}). Allowing request.")

    return result
