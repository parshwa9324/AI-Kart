"""
backend/config.py — Centralized Enterprise Configuration

Every configuration value is loaded from environment variables in production.
Local dev defaults are provided so the backend starts with zero config.

Architecture:
    - SLA contracts define hard limits for brand commitments
    - Rate limits scale by plan tier (trial → standard → enterprise)
    - Retry config uses exponential backoff with jitter
    - GPU timeout is separate from HTTP timeout (GPU can run for 2 min)
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────────────────────────────────────────
# Redis Configuration (Job Queue + Rate Limiting + Session Store)
# ──────────────────────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ──────────────────────────────────────────────────────────────────────────────
# JWT Auth Configuration (Multi-Tenant Brand Authentication)
# ──────────────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "aikart-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# ──────────────────────────────────────────────────────────────────────────────
# CDN / Storage Configuration
# ──────────────────────────────────────────────────────────────────────────────
CLOUDFLARE_R2_ENDPOINT = os.getenv("CLOUDFLARE_R2_ENDPOINT", "")
CLOUDFLARE_R2_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_ACCESS_KEY", "")
CLOUDFLARE_R2_SECRET_KEY = os.getenv("CLOUDFLARE_R2_SECRET_KEY", "")
CLOUDFLARE_R2_BUCKET = os.getenv("CLOUDFLARE_R2_BUCKET", "aikart-renders")

# ──────────────────────────────────────────────────────────────────────────────
# External ML APIs
# ──────────────────────────────────────────────────────────────────────────────
FAL_AI_KEY = os.getenv("FAL_AI_KEY", "")
REPLICATE_API_KEY = os.getenv("REPLICATE_API_KEY", "")

# ──────────────────────────────────────────────────────────────────────────────
# Database
# ──────────────────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://aikart:aikart@localhost:5432/aikart_dev"
)

# ──────────────────────────────────────────────────────────────────────────────
# Job Queue Configuration
# ──────────────────────────────────────────────────────────────────────────────
JOB_TTL_SECONDS = 60 * 60 * 2          # 2 hours — retain job results in Redis
GPU_JOB_TIMEOUT_SECONDS = 120           # Hard kill if GPU job exceeds this

# ── Retry Configuration ──────────────────────────────────────────────────────
MAX_JOB_RETRIES = 3                     # Number of retries before moving to DLQ
RETRY_BACKOFF_BASE = 2.0                # Exponential base: 2^attempt seconds
RETRY_BACKOFF_MAX = 60.0                # Cap backoff at 60 seconds
RETRY_JITTER_SECONDS = 1.5             # Random jitter to prevent thundering herd

# ── Priority Queues ──────────────────────────────────────────────────────────
QUEUE_PRIORITY = {
    "enterprise": "aikart_tryon_high",   # Enterprise brands get priority GPU
    "standard":   "aikart_tryon",        # Standard queue
    "trial":      "aikart_tryon_low",    # Trial brands get lowest priority
}

# ── Dead Letter Queue ─────────────────────────────────────────────────────────
DLQ_QUEUE_NAME = "aikart_dlq"           # Jobs that fail after max retries
DLQ_TTL_SECONDS = 60 * 60 * 24 * 7     # Retain DLQ items for 7 days

# ──────────────────────────────────────────────────────────────────────────────
# SLA Configuration (Contractual Obligations)
# ──────────────────────────────────────────────────────────────────────────────
SLA = {
    "max_queue_wait_seconds":     30,    # Job must leave queue within 30s
    "max_inference_seconds":      90,    # GPU inference must complete in 90s
    "target_p99_latency_seconds": 45,    # 99th percentile end-to-end latency
    "target_uptime_pct":          99.9,  # 99.9% monthly uptime
    "max_body_scan_seconds":      10,    # Body scan response in < 10s
}

# ──────────────────────────────────────────────────────────────────────────────
# Rate Limiting (Per Plan Tier — Sliding Window)
# ──────────────────────────────────────────────────────────────────────────────
RATE_LIMITS = {
    "enterprise": {
        "requests_per_minute": 300,
        "renders_per_hour":    500,
        "body_scans_per_hour": 1000,
    },
    "standard": {
        "requests_per_minute": 120,
        "renders_per_hour":    200,
        "body_scans_per_hour": 500,
    },
    "trial": {
        "requests_per_minute": 30,
        "renders_per_hour":    20,
        "body_scans_per_hour": 50,
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# Brand Feature Capabilities (Per Plan Tier)
# ──────────────────────────────────────────────────────────────────────────────
BRAND_CAPABILITIES = {
    "enterprise": {
        "vton_enabled": True,
        "body_scan_enabled": True,
        "garment_digitize_enabled": True,
        "cross_brand_compare": True,
        "priority_queue": True,
        "max_concurrent_renders": 10,
        "webhook_notifications": True,
    },
    "standard": {
        "vton_enabled": True,
        "body_scan_enabled": True,
        "garment_digitize_enabled": True,
        "cross_brand_compare": False,
        "priority_queue": False,
        "max_concurrent_renders": 3,
        "webhook_notifications": False,
    },
    "trial": {
        "vton_enabled": True,
        "body_scan_enabled": True,
        "garment_digitize_enabled": False,
        "cross_brand_compare": False,
        "priority_queue": False,
        "max_concurrent_renders": 1,
        "webhook_notifications": False,
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# Local Dev Flags
# ──────────────────────────────────────────────────────────────────────────────

# Detect local GPU — used by local_vton_engine.py
def _has_local_gpu() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False

USE_LOCAL_GPU = os.getenv("USE_LOCAL_GPU", "auto").lower()
if USE_LOCAL_GPU == "auto":
    USE_LOCAL_GPU = _has_local_gpu()
else:
    USE_LOCAL_GPU = USE_LOCAL_GPU == "true"

# Mock mode: only when no GPU AND no cloud API keys configured
# Auth enforcement — MUST be True in production
# When True: unauthenticated requests get 401 instead of brand_default fallback
ENFORCE_AUTH = os.getenv("ENFORCE_AUTH", "false").lower() == "true"

USE_MOCK_ML = not USE_LOCAL_GPU and not bool(FAL_AI_KEY or REPLICATE_API_KEY)
ENFORCE_RATE_LIMITS = os.getenv("ENFORCE_RATE_LIMITS", "false").lower() == "true"

# GPU concurrency limit — prevents VRAM OOM crashes
# Set to 1 for single-GPU machines (RTX 3060/4050 etc.)
GPU_MAX_CONCURRENT_RENDERS = int(os.getenv("GPU_MAX_CONCURRENT_RENDERS", "1"))

# Local result storage — try-on images saved here instead of returning raw base64
RESULT_CACHE_DIR = os.getenv("RESULT_CACHE_DIR", "./result_cache")
RESULT_BASE_URL  = os.getenv("RESULT_BASE_URL",  "http://localhost:8001/renders")

# Virtual try-on — SDXL 1.0 inpainting (standard diffusers hub layout).
VTON_MODEL_ID = os.getenv(
    "VTON_MODEL_ID",
    "diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
)
# Skip blocking warm-up on startup (faster CI / when GPU unavailable)
VTON_SKIP_STARTUP_WARMUP = os.getenv("VTON_SKIP_STARTUP_WARMUP", "false").lower() == "true"

# SDXL inpaint diffusion steps — lower = faster demo; raise for production quality (e.g. 20–25).
INFERENCE_STEPS = int(os.getenv("INFERENCE_STEPS", "15"))

MOCK_TRYON_IMAGES = [
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80",
    "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800&q=80",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80",
    "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=800&q=80",
]
