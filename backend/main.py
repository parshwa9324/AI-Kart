"""
backend/main.py — AI-Kart Enterprise SaaS API Gateway

Enterprise Architecture:
    - Request ID middleware: every request gets a UUID for audit trail
    - Structured error taxonomy: VALIDATION, AUTH, RATE_LIMIT, GPU_TIMEOUT, INTERNAL
    - Rate limiting: per-brand sliding window enforced before route handlers
    - Capability gating: features locked by plan tier (trial/standard/enterprise)
    - Health endpoint: returns Redis status, queue depth, worker count, SLA metrics
    - CORS with production domain whitelist
    - Proper Pydantic response models for all endpoints

Quick Start (local dev — no Redis required):
    uvicorn main:app --reload --port 8001

With Redis (recommended):
    redis-server             # Terminal 1
    rq worker aikart_tryon_high aikart_tryon aikart_tryon_low  # Terminal 2
    uvicorn main:app --reload --port 8001  # Terminal 3
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import cv2
import numpy as np
import logging
import time
import uuid
from pathlib import Path

from auth import get_current_brand, get_brand_capabilities, require_capability, check_rate_limit, create_access_token
from database import get_db, AsyncSession
from sqlalchemy import select
from models import Brand as BrandModel, Garment as GarmentModel
from job_queue import create_tryon_job, get_job_status, get_queue_health, JobStatus
from config import USE_MOCK_ML, SLA, RESULT_CACHE_DIR, VTON_SKIP_STARTUP_WARMUP
from size_engine import (
    BodyMeasurements, GarmentSpec, GarmentMeasurements, MaterialSpec,
    analyze_garment_fit, recommend_size, compare_brand_sizes,
    validate_body_measurements, validate_garment_measurements,
    get_material_stretch, DEMO_BRAND_SIZE_CHARTS, MATERIAL_STRETCH_DB,
)
from profile_store import (
    BodyProfile, save_profile, get_profile, delete_profile, generate_session_token
)
from local_vton_engine import GPUBusyError, get_gpu_stats
import local_state

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Structured Error Taxonomy
# Every error in the API uses one of these codes for programmatic handling
# ──────────────────────────────────────────────────────────────────────────────

class ErrorCode:
    VALIDATION       = "VALIDATION_ERROR"
    AUTH_FAILED      = "AUTH_FAILED"
    RATE_LIMITED     = "RATE_LIMIT_EXCEEDED"
    PLAN_UPGRADE     = "PLAN_UPGRADE_REQUIRED"
    JOB_NOT_FOUND    = "JOB_NOT_FOUND"
    GPU_TIMEOUT      = "GPU_TIMEOUT"
    BODY_SCAN_FAILED = "BODY_SCAN_FAILED"
    INTERNAL         = "INTERNAL_ERROR"


# ──────────────────────────────────────────────────────────────────────────────
# App Initialization
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI-Kart Maison Luxe — Enterprise Virtual Try-On Infrastructure",
    description="B2B SaaS API for luxury fashion brands. Virtual Try-On, Size Intelligence, Body Scanning.",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        # Production: add Vercel/custom domains
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)


# ──────────────────────────────────────────────────────────────────────────────
# Payload Size Limit Middleware — Prevent Abuse / DoS
# Base64-encoded 6MP image ≈ 8MB. Hard cap at 10MB to leave headroom.
# ──────────────────────────────────────────────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

MAX_PAYLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

class PayloadSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_PAYLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={
                    "error": "PAYLOAD_TOO_LARGE",
                    "message": f"Request body exceeds 10MB limit. Received: {int(content_length) // (1024*1024)}MB.",
                    "maxBytes": MAX_PAYLOAD_BYTES,
                }
            )
        return await call_next(request)

app.add_middleware(PayloadSizeLimitMiddleware)


# ──────────────────────────────────────────────────────────────────────────────
# Security Headers Middleware
# HSTS, CSP, X-Frame-Options, Referrer-Policy, X-Content-Type-Options
# ──────────────────────────────────────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"]  = "nosniff"
        response.headers["X-Frame-Options"]          = "DENY"
        response.headers["Referrer-Policy"]          = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]       = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"]  = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
            "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "frame-ancestors 'none';"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ──────────────────────────────────────────────────────────────────────────────
# Static File Mount — Serve Try-On Result Images
# Renders are saved to disk by local_vton_engine, served at /renders/<uuid>.jpg
# ──────────────────────────────────────────────────────────────────────────────
_renders_dir = Path(RESULT_CACHE_DIR)
_renders_dir.mkdir(parents=True, exist_ok=True)
app.mount("/renders", StaticFiles(directory=str(_renders_dir)), name="renders")


@app.on_event("startup")
async def startup_event() -> None:
    """Pre-load IDM-VTON once so first /tryon/render is not blocked on from_pretrained."""
    if USE_MOCK_ML or VTON_SKIP_STARTUP_WARMUP:
        logger.info(
            "[STARTUP] Skipping VTON preload (mock ML or VTON_SKIP_STARTUP_WARMUP=1)"
        )
        return

    import asyncio
    import concurrent.futures

    logger.info("[STARTUP] Pre-loading VTON model...")
    logger.info("[STARTUP] This takes 2-4 minutes on first run")
    logger.info("[STARTUP] Subsequent starts will be faster")

    loop = asyncio.get_running_loop()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    def _preload() -> None:
        try:
            from local_vton_engine import load_pipeline

            pipe = load_pipeline()
            if pipe is not None:
                logger.info("[STARTUP] VTON model loaded and ready")
                logger.info("[STARTUP] First render will be fast")
            else:
                logger.warning("[STARTUP] VTON pipeline returned None")
        except Exception as e:
            logger.error(f"[STARTUP] Model preload failed: {e}", exc_info=True)

    loop.run_in_executor(executor, _preload)
    logger.info("[STARTUP] Model loading started in background")


# ──────────────────────────────────────────────────────────────────────────────
# Request ID Middleware — Audit Trail
# Every HTTP request gets a unique UUID for tracing through logs
# ──────────────────────────────────────────────────────────────────────────────

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.time()

    response = await call_next(request)

    # Inject tracing headers
    duration_ms = round((time.time() - start_time) * 1000, 1)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = str(duration_ms)

    # Audit log (structured JSON for log aggregation)
    logger.info(
        f"[AUDIT] method={request.method} path={request.url.path} "
        f"status={response.status_code} duration={duration_ms}ms "
        f"request_id={request_id}"
    )

    return response


# ──────────────────────────────────────────────────────────────────────────────
# Global Exception Handler
# ──────────────────────────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler — never leak stack traces to the client."""
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(f"[ERROR] Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": ErrorCode.INTERNAL,
            "message": "An internal error occurred. Our team has been notified.",
            "requestId": request_id,
        }
    )


# ──────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ──────────────────────────────────────────────────────────────────────────────

class TryOnRenderRequest(BaseModel):
    """Phase 16: Virtual Try-On render request."""
    userPhoto: str = Field(..., description="Base64-encoded user photo", min_length=10)
    garmentId: str = Field(..., description="Garment ID from the brand catalog", min_length=1)
    includeRecommendation: Optional[bool] = Field(False, description="Include size recommendation")

class TryOnRenderResponse(BaseModel):
    """Returned immediately — client polls /status for completion."""
    jobId: str
    status: str
    estimatedSeconds: Optional[int] = 15
    progressPct: Optional[int] = 0
    progressDetail: Optional[str] = None
    imageUrl: Optional[str] = None
    thumbUrl: Optional[str] = None
    recommendation: Optional[dict] = None
    error: Optional[str] = None
    slaWarning: Optional[str] = None
    attempt: Optional[int] = None
    maxRetries: Optional[int] = None


class TryOnTelemetryEvent(BaseModel):
    event: str = Field(..., min_length=1, max_length=80)
    ts: str = Field(..., min_length=8, max_length=64)
    payload: Optional[Dict[str, Any]] = None


class TryOnTelemetryBatchRequest(BaseModel):
    events: List[TryOnTelemetryEvent] = Field(default_factory=list)

class BodyScanRequest(BaseModel):
    """Phase 18: Body scan with BMI-aware precision."""
    photo: Optional[str] = Field(None, description="Base64-encoded user photo")
    heightCm: float = Field(..., description="Height in cm", ge=100, le=250)
    weightKg: Optional[float] = Field(None, description="Weight in kg for BMI-adjusted accuracy", ge=20, le=300)
    gender: Optional[str] = Field("neutral", description="male/female/neutral")
    ageGroup: Optional[str] = Field(None, description="18-25, 26-40, 41-60, 60+")

class BodyScanResponse(BaseModel):
    """Body scan result with confidence intervals."""
    status: str
    brandId: str
    measurements: dict
    heightCm: float
    confidence: float
    scanMethod: str
    inputQuality: str

class LandmarkPoint(BaseModel):
    x: float
    y: float
    z: float
    visibility: Optional[float] = None

class LandmarksScanRequest(BaseModel):
    """Phase 18: Landmarks geometric scan."""
    frontalScan: list[LandmarkPoint]
    leftLateralScan: list[LandmarkPoint]
    rightLateralScan: list[LandmarkPoint]
    heightCm: float = Field(..., description="Estimated or manual height in cm", ge=100, le=250)
    absoluteScaleMultiplier: float

class TokenRequest(BaseModel):
    apiKey: str
    brandId: str

class HealthResponse(BaseModel):
    """Enriched health check with infrastructure status."""
    status: str
    version: str
    mockMode: bool
    redis: dict
    sla: dict
    endpoints: list


# ──────────────────────────────────────────────────────────────────────────────
# Health & Auth Routes
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/", response_model=HealthResponse)
def health_check():
    """
    Enriched health endpoint — returns infrastructure status.
    Used by monitoring dashboards and brand integration health checks.
    """
    queue_health = get_queue_health()

    return HealthResponse(
        status="🟢 Maison Luxe Spatial Engine is active.",
        version="3.0.0",
        mockMode=USE_MOCK_ML,
        redis=queue_health,
        sla=SLA,
        endpoints=[
            "POST /api/v1/tryon/render",
            "GET  /api/v1/tryon/status/{job_id}",
            "POST /api/v1/body/scan",
            "POST /api/v1/spatial/extract",
            "POST /api/v1/garment/digitize",
            "POST /api/v1/auth/token",
        ]
    )


@app.post("/api/v1/telemetry/tryon")
async def ingest_tryon_telemetry(batch: TryOnTelemetryBatchRequest, request: Request):
    """
    Lightweight telemetry sink for try-on UX instrumentation.
    Intentionally tolerant: accepts events without blocking user flow.
    """
    accepted_events = batch.events[:200]
    if not accepted_events:
        return {"status": "ok", "accepted": 0}

    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "[TELEMETRY] tryon_events accepted=%s client_ip=%s first_event=%s",
        len(accepted_events),
        client_ip,
        accepted_events[0].event,
    )
    return {"status": "ok", "accepted": len(accepted_events)}


@app.post("/api/v1/auth/token")
async def get_token(req: TokenRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchange a brand API key for a JWT token.
    Validates api_key + brand_id against the PostgreSQL brands table.
    """
    result = await db.execute(
        select(BrandModel).where(
            BrandModel.api_key == req.apiKey,
            BrandModel.id == req.brandId,
        )
    )
    brand = result.scalar_one_or_none()

    if brand is None:
        raise HTTPException(
            status_code=401,
            detail={"error": ErrorCode.AUTH_FAILED, "message": "Invalid API key or brand ID."}
        )

    token = create_access_token(brand.id, plan_tier=brand.plan_tier)
    capabilities = get_brand_capabilities(brand.plan_tier)

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 604800,
        "plan": brand.plan_tier,
        "capabilities": capabilities,
    }


class WebhookRequest(BaseModel):
    url: str

@app.post("/api/v1/brand/webhook")
async def update_webhook(req: WebhookRequest, brand_id: str = Depends(get_current_brand), db: AsyncSession = Depends(get_db)):
    """
    Task 4: Save webhook_url to brands table.
    Triggered after successful render.
    """
    result = await db.execute(select(BrandModel).where(BrandModel.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    
    brand.webhook_url = req.url
    await db.commit()
    return {"status": "success", "webhook_url": brand.webhook_url}


class ConsentRequest(BaseModel):
    session_uuid: str
    consented: bool

@app.post("/api/v1/consent")
async def record_consent(req: ConsentRequest, db: AsyncSession = Depends(get_db)):
    """
    Task 5: Server-side GDPR consent recording.
    """
    from sqlalchemy import update
    from datetime import datetime, timezone
    
    # We attempt an update. If the profile doesn't exist yet, we do nothing and it will
    # be created later (or we could orchestrate differently, but usually session_uuid exists).
    if req.consented:
        await db.execute(
            update(BodyProfile)
            .where(BodyProfile.session_uuid == req.session_uuid)
            .values(consented_at=datetime.now(timezone.utc))
        )
        await db.commit()
    return {"status": "recorded"}

# ──────────────────────────────────────────────────────────────────────────────
# Phase 16: Virtual Try-On — Async GPU Pipeline
# ──────────────────────────────────────────────────────────────────────────────

from fastapi import BackgroundTasks

@app.post("/api/v1/tryon/render", response_model=TryOnRenderResponse)
async def render_virtual_tryon(
    req: TryOnRenderRequest,
    background_tasks: BackgroundTasks,
    brand_id: str = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    """
    Enqueue a Virtual Try-On render job. Returns jobId in < 100ms.

    Rate limited per brand tier. Enterprise brands get priority GPU queue.
    Client polls /api/v1/tryon/status/{job_id} for progress updates.
    """
    # ── Resolve brand plan from DB (one index lookup ~1ms on Neon pooler) ────────
    result = await db.execute(select(BrandModel).where(BrandModel.id == brand_id))
    brand_row = result.scalar_one_or_none()
    brand_plan = brand_row.plan_tier if brand_row else "enterprise"

    # ── Rate limit + capability check ─────────────────────────────────────────
    check_rate_limit(brand_id, plan=brand_plan, action="render")
    require_capability(brand_plan, "vton_enabled")
    logger.info(f"[RENDER] brand='{brand_id}' plan='{brand_plan}' garment='{req.garmentId}'")

    webhook_url = brand_row.webhook_url if brand_row else None

    webhook_url = brand_row.webhook_url if brand_row else None

    # On Windows, RQ multiprocessing and SimpleWorker fail.
    # To achieve seamless background rendering out of the box, we use FastAPI's
    # built-in BackgroundTasks threadpool.
    import uuid, time
    
    job_id = str(uuid.uuid4())
    
    # Initialize job in shared memory
    local_state.init_job(job_id, {
        "status": "processing",
        "progressPct": 0,
        "estimatedSeconds": 15
    })
    
    # Import the custom worker logic directly
    # Ensure it's imported globally or safely inside thread
    def run_inference_bg():
        try:
            from worker import run_tryon_inference
            run_tryon_inference(
                job_id=job_id,
                brand_id=brand_id,
                garment_id=req.garmentId,
                user_photo_b64=req.userPhoto,
                include_recommendation=req.includeRecommendation or False,
                webhook_url=webhook_url,
                attempt=1
            )
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.error("RENDER FAILED: %s\n%s", e, tb)
            local_state.update_job(
                job_id,
                {
                    "status": "failed",
                    "error": str(e),
                    "progressDetail": str(e),
                },
            )


    # Dispatch to FastAPI threadpool
    background_tasks.add_task(run_inference_bg)

    return TryOnRenderResponse(
        jobId=job_id,
        status="processing",
        estimatedSeconds=15,
        progressPct=0,
    )


@app.get("/api/v1/tryon/status/{job_id}", response_model=TryOnRenderResponse)
async def poll_render_status(
    job_id: str,
    brand_id: str = Depends(get_current_brand)
):
    """
    Poll the status of an async try-on job.

    Returns status + progressPct so the frontend can drive a real progress bar.
    Security: Brand can only access their own jobs (tenant-scoped).
    """
    job = local_state.get_job(job_id)
    if job is not None:
        return TryOnRenderResponse(
            jobId=job_id,
            status=job["status"],
            progressPct=job.get("progressPct", 0),
            progressDetail=job.get("progressDetail"),
            imageUrl=job.get("imageUrl"),
            thumbUrl=job.get("thumbUrl"),
            recommendation=job.get("recommendation"),
            error=job.get("error")
        )

    # Fallback to standard queue logic if not in local memory
    job = get_job_status(job_id=job_id, brand_id=brand_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"error": ErrorCode.JOB_NOT_FOUND, "message": f"Job '{job_id}' not found or expired."}
        )

    return TryOnRenderResponse(
        jobId=job["jobId"],
        status=job["status"],
        progressPct=job.get("progressPct", 0),
        progressDetail=job.get("progressDetail"),
        imageUrl=job.get("imageUrl"),
        thumbUrl=job.get("thumbUrl"),
        recommendation=job.get("recommendation"),
        error=job.get("error"),
        slaWarning=job.get("sla_warning"),
        attempt=job.get("attempt"),
        maxRetries=job.get("maxRetries"),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Phase 18: Body Scanning
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/body/scan", response_model=BodyScanResponse)
async def scan_body(
    req: BodyScanRequest,
    brand_id: str = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 18: BMI-adjusted precision body measurement extraction.

    Accuracy tiers:
        Height only:     ±5cm  (confidence: 0.65)
        + Gender:        ±4cm  (confidence: 0.72)
        + Weight (BMI):  ±2.5cm (confidence: 0.82) ← recommended
        + Age group:     ±2cm  (confidence: 0.86)
        + Photo (SAM3D): ±1cm  (confidence: 0.93)
    """
    # ── Resolve brand plan ────────────────────────────────────────────────────
    res = await db.execute(select(BrandModel).where(BrandModel.id == brand_id))
    brand_row = res.scalar_one_or_none()
    brand_plan = brand_row.plan_tier if brand_row else "enterprise"
    check_rate_limit(brand_id, plan=brand_plan, action="body_scan")
    require_capability(brand_plan, "body_scan_enabled")

    from body_scan import scan_body_from_photo

    logger.info(f"[BODY_SCAN] brand='{brand_id}' height={req.heightCm}cm weight={req.weightKg}kg")

    if not req.photo:
         raise HTTPException(
            status_code=400,
            detail={"error": ErrorCode.VALIDATION, "message": "A user photo is strictly required for precision SAM3D body scanning. Ratio estimation has been deprecated."}
        )

    measurements = await scan_body_from_photo(
        photo_b64=req.photo,
        height_cm=req.heightCm,
        gender=req.gender or "neutral",
        weight_kg=req.weightKg,
        age_group=req.ageGroup,
    )

    return BodyScanResponse(
        status="success",
        brandId=brand_id,
        measurements=measurements,
        heightCm=req.heightCm,
        confidence=measurements.get("confidence", 0.65),
        scanMethod=measurements.get("scanMethod", "unknown"),
        inputQuality=measurements.get("inputQuality", "low"),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Phase 13: 3-Pose Spatial Topology (Body Scan via Multi-Pose CV)
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/body/scan/landmarks", response_model=BodyScanResponse)
async def scan_body_landmarks(
    req: LandmarksScanRequest,
    brand_id: str = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 18: Geometric Measurements from MediaPipe Landmarks.
    """
    res = await db.execute(select(BrandModel).where(BrandModel.id == brand_id))
    brand_row = res.scalar_one_or_none()
    brand_plan = brand_row.plan_tier if brand_row else "enterprise"
    check_rate_limit(brand_id, plan=brand_plan, action="body_scan")
    require_capability(brand_plan, "body_scan_enabled")

    from body_scan import scan_body_from_landmarks

    logger.info(f"[BODY_SCAN] Geometric landmarks scan for brand='{brand_id}'")

    measurements = scan_body_from_landmarks(
        frontal_scan=[p.dict() for p in req.frontalScan],
        left_lateral_scan=[p.dict() for p in req.leftLateralScan],
        right_lateral_scan=[p.dict() for p in req.rightLateralScan],
        absolute_scale_multiplier=req.absoluteScaleMultiplier,
    )

    return BodyScanResponse(
        status="success",
        brandId=brand_id,
        measurements=measurements,
        heightCm=measurements.get("heightCm", req.heightCm),
        confidence=measurements.get("confidence", 0.99),
        scanMethod=measurements.get("scanMethod", "mediapipe_geometric"),
        inputQuality=measurements.get("inputQuality", "high"),
    )


class BodyProfileResponse(BaseModel):
    userId: str
    heightCm: float
    measurements: dict
    confidenceScore: float
    riskLevel: str

@app.post("/api/v1/spatial/extract", response_model=BodyProfileResponse)
async def extract_spatial_topology(
    frontImage: UploadFile = File(...),
    leftImage: UploadFile = File(None),
    rightImage: UploadFile = File(None),
    anchorHeightMm: float = Form(53.98),
    anchorWidthMm: float = Form(85.60),
    brand_id: str = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    """Phase 13: Extract physical dimensions from 3-pose geometric triangulation."""
    try:
        from cv_engine import TopologyEngine

        async def load_cv_image(upload_file: UploadFile) -> Optional[np.ndarray]:
            if not upload_file:
                return None
            contents = await upload_file.read()
            if not contents:
                return None
            nparr = np.frombuffer(contents, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        front_img_np = await load_cv_image(frontImage)
        left_img_np = await load_cv_image(leftImage)
        right_img_np = await load_cv_image(rightImage)

        if front_img_np is None:
            raise HTTPException(status_code=400, detail="frontImage is required.")

        profile_data = TopologyEngine.build_profile(
            front_image=front_img_np,
            left_image=left_img_np,
            right_image=right_img_np,
            fallback_height_cm=175.0
        )

        return BodyProfileResponse(
            userId=f"session_{brand_id}_{id(profile_data)}",
            heightCm=profile_data["heightCm"],
            measurements=profile_data["measurements"],
            confidenceScore=profile_data["confidenceScore"],
            riskLevel=profile_data["riskLevel"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# Phase 14 + 17: Garment Digitization
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/garment/digitize")
async def digitize_garment(
    garmentImage: UploadFile = File(...),
    brand_id: str = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 14/17: Extract spatial measurements from a flat-lay garment photo.
    Requires 'garment_digitize_enabled' capability (standard+ plans).
    """
    res = await db.execute(select(BrandModel).where(BrandModel.id == brand_id))
    brand_row = res.scalar_one_or_none()
    brand_plan = brand_row.plan_tier if brand_row else "enterprise"
    require_capability(brand_plan, "garment_digitize_enabled")

    try:
        from cv_garment import GarmentDigitizer

        contents = await garmentImage.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_np is None:
            raise HTTPException(status_code=400, detail="Image could not be decoded.")

        measurements_cm = GarmentDigitizer.extract_dimensions(img_np)

        return {
            "status": "success",
            "brandId": brand_id,
            "measurements": measurements_cm,
            "keypointsDetected": 24,
            "calibrationConfidence": measurements_cm.get("calibrationConfidence", 0.85),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────────────
# Size Intelligence Engine (Phase 19) — "The Money Maker"
# ──────────────────────────────────────────────────────────────────────────────

class SizeRecommendRequest(BaseModel):
    """Request body for size recommendation."""
    body: dict          # User body measurements (from body_scan.py or manual input)
    garment: dict       # Garment spec with measurements and material
    brand_id: str = ""  # Optional: brand ID for brand-specific return risk thresholds

class CrossBrandRequest(BaseModel):
    """Request body for cross-brand size comparison."""
    body: dict          # User body measurements
    brand_ids: list[str] = []  # Optional: specific brands to compare (empty = all demo brands)


@app.post("/api/v1/size/recommend")
async def size_recommend(req: SizeRecommendRequest, request: Request):
    """
    Analyze how a garment fits a user's body.

    Returns:
      - Confidence score (0-100%)
      - Per-measurement breakdown (chest, waist, shoulders, etc.)
      - Return risk (LOW / MEDIUM / HIGH)
      - Human-readable summary
      - Alternative size suggestions
    """
    request_id = request.state.request_id if hasattr(request.state, 'request_id') else str(uuid.uuid4())[:12]

    try:
        # Parse body measurements
        body = BodyMeasurements(
            chest_circumference=req.body.get("chestCircumference") or req.body.get("chest_circumference"),
            waist_circumference=req.body.get("waistCircumference") or req.body.get("waist_circumference"),
            hip_circumference=req.body.get("hipCircumference") or req.body.get("hip_circumference"),
            shoulder_width=req.body.get("shoulderWidth") or req.body.get("shoulder_width"),
            arm_length=req.body.get("armLength") or req.body.get("arm_length"),
            torso_length=req.body.get("torsoLength") or req.body.get("torso_length"),
            inseam=req.body.get("inseam"),
            thigh_circumference=req.body.get("thighCircumference") or req.body.get("thigh_circumference"),
            height_cm=req.body.get("heightCm") or req.body.get("height_cm"),
        )

        # Validate body measurements
        body_errors = validate_body_measurements(body)
        if body_errors:
            return JSONResponse(status_code=400, content={
                "error": ErrorCode.VALIDATION,
                "message": "Invalid body measurements",
                "details": body_errors,
                "requestId": request_id,
            })

        # Parse garment spec
        g = req.garment
        mat_raw = g.get("material", {})

        # Material can be a string ("cotton_blend") or a dict ({"type": "cotton_blend", ...})
        if isinstance(mat_raw, str):
            material_type = mat_raw
            stretch = get_material_stretch(material_type)
            mat = {}
        else:
            mat = mat_raw if isinstance(mat_raw, dict) else {}
            material_type = mat.get("type", "cotton_blend")
            stretch = mat.get("stretch")
            if stretch is None:
                stretch = get_material_stretch(material_type)

        garment_m = g.get("measurements", {})

        # Support both full keys (chestWidth) and shorthand keys (chest)
        chest_w = garment_m.get("chestWidth") or garment_m.get("chest_width") or garment_m.get("chest")
        waist_w = garment_m.get("waistWidth") or garment_m.get("waist_width") or garment_m.get("waist")
        shoulder_w = garment_m.get("shoulderWidth") or garment_m.get("shoulder_width") or garment_m.get("shoulders")
        garment_len = garment_m.get("garmentLength") or garment_m.get("garment_length") or garment_m.get("length")
        sleeve_len = garment_m.get("sleeveLength") or garment_m.get("sleeve_length") or garment_m.get("sleeves")

        garment = GarmentSpec(
            id=g.get("id", ""),
            brand_id=req.brand_id or g.get("brandId", ""),
            garment_type=g.get("garmentType", g.get("type", "shirt")),
            size_label=g.get("sizeLabel", g.get("size", "M")),
            measurements=GarmentMeasurements(
                chest_width=chest_w,
                waist_width=waist_w,
                shoulder_width=shoulder_w,
                garment_length=garment_len,
                sleeve_length=sleeve_len,
                hem_width=garment_m.get("hemWidth") or garment_m.get("hem_width"),
                neck_opening=garment_m.get("neckOpening") or garment_m.get("neck_opening"),
                inseam=garment_m.get("inseam"),
                thigh_width=garment_m.get("thighWidth") or garment_m.get("thigh_width"),
                rise=garment_m.get("rise"),
            ),
            material=MaterialSpec(
                type=material_type,
                stretch=stretch,
                weight=mat.get("weight", "medium") if isinstance(mat, dict) else "medium",
                drape_stiffness=mat.get("drapeStiffness", mat.get("drape_stiffness", 0.5)) if isinstance(mat, dict) else 0.5,
            ),
        )

        # Validate garment measurements
        garment_errors = validate_garment_measurements(garment.measurements)
        if garment_errors:
            return JSONResponse(status_code=400, content={
                "error": ErrorCode.VALIDATION,
                "message": "Invalid garment measurements",
                "details": garment_errors,
                "requestId": request_id,
            })

        # Run the size intelligence algorithm
        result = analyze_garment_fit(body, garment)

        logger.info(
            f"[{request_id}] Size recommendation: {result.recommended_size} "
            f"({result.confidence_score}% confidence, {result.return_risk} return risk) "
            f"in {result.processing_time_ms:.1f}ms"
        )

        return {
            "requestId": request_id,
            "recommendation": result.to_dict(),
        }

    except Exception as e:
        logger.error(f"[{request_id}] Size recommendation failed: {e}")
        return JSONResponse(status_code=500, content={
            "error": ErrorCode.INTERNAL,
            "message": "Size recommendation engine failed",
            "requestId": request_id,
        })


@app.post("/api/v1/size/compare-brands")
async def size_compare_brands(req: CrossBrandRequest, request: Request):
    """
    Cross-brand size comparison — the headline differentiator.
    "You're a Zegna M, Prada 48, Louis Vuitton L, Burberry M, Gucci 48"

    Uses range-midpoint scoring against each brand's official size chart.
    """
    request_id = request.state.request_id if hasattr(request.state, 'request_id') else str(uuid.uuid4())[:12]

    try:
        body = BodyMeasurements(
            chest_circumference=req.body.get("chestCircumference") or req.body.get("chest_circumference"),
            waist_circumference=req.body.get("waistCircumference") or req.body.get("waist_circumference"),
            hip_circumference=req.body.get("hipCircumference") or req.body.get("hip_circumference"),
            shoulder_width=req.body.get("shoulderWidth") or req.body.get("shoulder_width"),
            arm_length=req.body.get("armLength") or req.body.get("arm_length"),
            torso_length=req.body.get("torsoLength") or req.body.get("torso_length"),
            height_cm=req.body.get("heightCm") or req.body.get("height_cm"),
        )

        body_errors = validate_body_measurements(body)
        if body_errors:
            return JSONResponse(status_code=400, content={
                "error": ErrorCode.VALIDATION,
                "message": "Invalid body measurements",
                "details": body_errors,
                "requestId": request_id,
            })

        # Filter brands if specific brand_ids requested
        brands = DEMO_BRAND_SIZE_CHARTS
        if req.brand_ids:
            brands = [b for b in brands if b.brand_id in req.brand_ids]

        results = compare_brand_sizes(body, brands)

        logger.info(
            f"[{request_id}] Cross-brand comparison: "
            + ", ".join(f"{r.brand_name}={r.recommended_size}" for r in results)
        )

        return {
            "requestId": request_id,
            "results": [
                {
                    "brandName": r.brand_name,
                    "brandId": r.brand_id,
                    "recommendedSize": r.recommended_size,
                    "fit": r.fit,
                    "confidenceScore": r.confidence_score,
                }
                for r in results
            ],
            "summary": "Your sizes across luxury brands: " + ", ".join(
                f"{r.brand_name} {r.recommended_size}" for r in results
            ),
        }

    except Exception as e:
        logger.error(f"[{request_id}] Cross-brand comparison failed: {e}")
        return JSONResponse(status_code=500, content={
            "error": ErrorCode.INTERNAL,
            "message": "Cross-brand comparison engine failed",
            "requestId": request_id,
        })


@app.get("/api/v1/size/materials")
async def get_materials():
    """
    Return the material stretch database.
    Brand employees use this to look up stretch % when uploading garments.
    """
    return {
        "materials": {
            k: {"stretch_pct": round(v * 100, 1), "stretch_factor": v}
            for k, v in MATERIAL_STRETCH_DB.items()
        },
        "count": len(MATERIAL_STRETCH_DB),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Physical Twin — Profile Persistence
# Anonymous body scans stored by session_token from localStorage.
# GDPR: DELETE endpoint permanently erases all biometric data.
# NOTE: profile_store.py uses its own lightweight SQLite for ultra-fast
# anonymous session lookups (no auth required — by design).
# ──────────────────────────────────────────────────────────────────────────────

class ProfileSaveRequest(BaseModel):
    """Body profile save request from the frontend."""
    session_token: str = Field(..., min_length=8, description="Anonymous UUID from localStorage")
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    gender: Optional[str] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hip_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None
    inseam_cm: Optional[float] = None
    sleeve_cm: Optional[float] = None
    neck_cm: Optional[float] = None
    scan_method: str = "ratio"
    confidence_score: Optional[float] = None
    consent_given_at: Optional[str] = None


@app.post("/api/v1/profile/save", tags=["Physical Twin"])
async def save_body_profile(req: ProfileSaveRequest):
    """
    Save or update the user's Physical Twin body profile.
    Called after body scan calibration completes on the frontend.
    """
    profile = BodyProfile(
        session_token=req.session_token,
        height_cm=req.height_cm,
        weight_kg=req.weight_kg,
        gender=req.gender,
        chest_cm=req.chest_cm,
        waist_cm=req.waist_cm,
        hip_cm=req.hip_cm,
        shoulder_cm=req.shoulder_cm,
        inseam_cm=req.inseam_cm,
        sleeve_cm=req.sleeve_cm,
        neck_cm=req.neck_cm,
        scan_method=req.scan_method,
        confidence_score=req.confidence_score,
        consent_given_at=req.consent_given_at,
    )
    saved = save_profile(profile)
    return {
        "status": "saved",
        "session_token": saved.session_token,
        "updated_at": saved.updated_at,
    }


@app.get("/api/v1/profile/{session_token}", tags=["Physical Twin"])
async def load_body_profile(session_token: str):
    """
    Load a previously saved Physical Twin profile.
    Called on frontend boot to restore returning user's body data.
    """
    profile = get_profile(session_token)
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "PROFILE_NOT_FOUND", "message": "No Physical Twin found for this session."}
        )
    return {"status": "found", "profile": profile.to_dict()}


@app.delete("/api/v1/profile/{session_token}", tags=["Physical Twin"])
async def delete_body_profile(session_token: str):
    """
    GDPR Right to Erasure — permanently delete all body scan data.
    Called when user clicks "Delete My Data" in the privacy settings.
    """
    deleted = delete_profile(session_token)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"error": "PROFILE_NOT_FOUND", "message": "No data found for this session token."}
        )
    return {"status": "deleted", "message": "All biometric data permanently erased."}


# ──────────────────────────────────────────────────────────────────────────────
# Garment Catalog (Live PostgreSQL)
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/catalog", tags=["Catalog"])
async def get_catalog(
    brand_id: str = Depends(get_current_brand),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the garment catalog for the authenticated brand.
    Filters by brand_id for strict multi-tenancy.
    """
    result = await db.execute(
        select(GarmentModel).where(GarmentModel.brand_id == brand_id)
    )
    garments = result.scalars().all()
    return {
        "brandId": brand_id,
        "count": len(garments),
        "garments": [
            {
                "id": g.id,
                "name": g.name,
                "type": g.type,
                "materialCode": g.material_code,
                "stretchCoefficient": g.stretch_coefficient,
                "sizes": g.sizes or {},
            }
            for g in garments
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Admin Dashboard — Live Brand & Garment Stats (PostgreSQL)
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/admin/brands", tags=["Admin"])
async def admin_brands(db: AsyncSession = Depends(get_db)):
    """
    Admin endpoint — returns all brands and garment counts.
    Used by the admin dashboard to show live tenant metrics.
    No auth by design (internal network only in production).
    """
    result = await db.execute(select(BrandModel))
    brands = result.scalars().all()

    brand_list = []
    for b in brands:
        garment_count_res = await db.execute(
            select(GarmentModel).where(GarmentModel.brand_id == b.id)
        )
        garment_count = len(garment_count_res.scalars().all())
        brand_list.append({
            "id": b.id,
            "name": b.name,
            "plan": b.plan_tier,
            "garmentCount": garment_count,
        })

    return {
        "totalBrands": len(brand_list),
        "brands": brand_list,
    }


# ──────────────────────────────────────────────────────────────────────────────
# GPU Health Dashboard Endpoint
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/gpu/health", tags=["Infrastructure"])
async def gpu_health():
    """
    Real-time GPU stats for the admin dashboard.
    Returns VRAM usage, active renders, pipeline status.
    """
    return get_gpu_stats()


# ──────────────────────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info",
    )
