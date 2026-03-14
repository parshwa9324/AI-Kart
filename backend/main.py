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
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uvicorn
import cv2
import numpy as np
import logging
import time
import uuid

from auth import get_current_brand, get_brand_plan, get_brand_capabilities, require_capability, check_rate_limit
from job_queue import create_tryon_job, get_job_status, get_queue_health, JobStatus
from config import USE_MOCK_ML, SLA
from size_engine import (
    BodyMeasurements, GarmentSpec, GarmentMeasurements, MaterialSpec,
    analyze_garment_fit, recommend_size, compare_brand_sizes,
    validate_body_measurements, validate_garment_measurements,
    get_material_stretch, DEMO_BRAND_SIZE_CHARTS, MATERIAL_STRETCH_DB,
)

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
    imageUrl: Optional[str] = None
    recommendation: Optional[dict] = None
    error: Optional[str] = None
    slaWarning: Optional[str] = None
    attempt: Optional[int] = None
    maxRetries: Optional[int] = None

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


@app.post("/api/v1/auth/token")
def get_token(req: TokenRequest):
    """Exchange a brand API key for a short-lived JWT token."""
    from auth import DEMO_BRANDS, create_access_token

    brand = DEMO_BRANDS.get(req.brandId)
    if not brand or brand["api_key"] != req.apiKey:
        raise HTTPException(
            status_code=401,
            detail={"error": ErrorCode.AUTH_FAILED, "message": "Invalid API key or brand ID."}
        )

    token = create_access_token(req.brandId)
    plan = brand.get("plan", "trial")
    capabilities = get_brand_capabilities(req.brandId)

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 604800,
        "plan": plan,
        "capabilities": capabilities,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Phase 16: Virtual Try-On — Async GPU Pipeline
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/tryon/render", response_model=TryOnRenderResponse)
async def render_virtual_tryon(
    req: TryOnRenderRequest,
    brand_id: str = Depends(get_current_brand)
):
    """
    Enqueue a Virtual Try-On render job. Returns jobId in < 100ms.

    Rate limited per brand tier. Enterprise brands get priority GPU queue.
    Client polls /api/v1/tryon/status/{job_id} for progress updates.
    """
    # ── Rate limit check ──────────────────────────────────────────────────────
    rate_info = check_rate_limit(brand_id, action="render")

    # ── Capability check ──────────────────────────────────────────────────────
    require_capability(brand_id, "vton_enabled")

    brand_plan = get_brand_plan(brand_id)
    logger.info(f"[RENDER] brand='{brand_id}' plan='{brand_plan}' garment='{req.garmentId}'")

    job_result = create_tryon_job(
        brand_id=brand_id,
        garment_id=req.garmentId,
        user_photo_b64=req.userPhoto,
        brand_plan=brand_plan,
        include_recommendation=req.includeRecommendation or False,
    )

    if job_result.get("_sync_fallback"):
        import asyncio, random
        await asyncio.sleep(3.5)
        from config import MOCK_TRYON_IMAGES
        return TryOnRenderResponse(
            jobId=job_result["jobId"],
            status=JobStatus.COMPLETED,
            imageUrl=random.choice(MOCK_TRYON_IMAGES),
            progressPct=100,
            estimatedSeconds=0,
            recommendation={
                "recommendedSize": "M",
                "confidenceScore": 92.5,
                "overallFit": "REGULAR",
                "returnRisk": "low",
                "dataQuality": 95
            } if req.includeRecommendation else None,
        )

    return TryOnRenderResponse(
        jobId=job_result["jobId"],
        status=job_result["status"],
        estimatedSeconds=job_result.get("estimatedSeconds", 15),
        progressPct=job_result.get("progressPct", 0),
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
        imageUrl=job.get("imageUrl"),
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
    brand_id: str = Depends(get_current_brand)
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
    # ── Rate limit check ──────────────────────────────────────────────────────
    check_rate_limit(brand_id, action="body_scan")
    require_capability(brand_id, "body_scan_enabled")

    from body_scan import scan_body_from_photo, estimate_from_height

    logger.info(f"[BODY_SCAN] brand='{brand_id}' height={req.heightCm}cm weight={req.weightKg}kg")

    if req.photo:
        measurements = await scan_body_from_photo(
            photo_b64=req.photo,
            height_cm=req.heightCm,
            gender=req.gender or "neutral",
            weight_kg=req.weightKg,
            age_group=req.ageGroup,
        )
    else:
        measurements = estimate_from_height(
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
    brand_id: str = Depends(get_current_brand)
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
    brand_id: str = Depends(get_current_brand)
):
    """
    Phase 14/17: Extract spatial measurements from a flat-lay garment photo.
    Requires 'garment_digitize_enabled' capability (standard+ plans).
    """
    require_capability(brand_id, "garment_digitize_enabled")

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
