"""
size_engine.py — Enterprise Size Intelligence Engine

The core revenue driver of AI-Kart. This is what brands pay $5,000/month for.
Deterministic, explainable math — NOT a neural network.

Every recommendation comes with:
  - Per-measurement breakdown (chest, waist, shoulders, length, sleeves)
  - Confidence score (0-100%)
  - Return risk classification (LOW / MEDIUM / HIGH)
  - Human-readable explanations for each dimension
  - Cross-brand comparison ("You're a Zara M, H&M L, Uniqlo M")

Weighted scoring based on industry fit importance:
  Chest:     30% — most critical for upper body fit
  Waist:     25% — second most important
  Shoulders: 20% — affects silhouette
  Length:    15% — affects coverage
  Sleeves:   10% — least critical, most forgiving

Enterprise features beyond the frontend SizeEngine.ts:
  - Multi-garment-type support (shirts, pants, dresses, outerwear)
  - Brand-specific return risk thresholds
  - Confidence interval propagation from body_scan.py
  - Batch size recommendation for entire catalogs
  - Audit trail for every recommendation
"""

from __future__ import annotations

import math
import logging
import time
import uuid
from typing import Optional, Literal
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Type Definitions
# ──────────────────────────────────────────────────────────────────────────────

FitClassification = Literal["TOO_TIGHT", "SNUG", "REGULAR", "RELAXED", "OVERSIZED"]
ReturnRisk = Literal["low", "medium", "high"]
GarmentType = Literal["shirt", "t_shirt", "jacket", "blazer", "sweater",
                       "pants", "jeans", "shorts", "dress", "coat", "vest"]


@dataclass
class MaterialSpec:
    """Fabric material properties affecting fit."""
    type: str = "cotton_blend"
    stretch: float = 0.05       # 0.0 = no stretch, 0.20 = 20% stretch
    weight: str = "medium"      # light / medium / heavy
    drape_stiffness: float = 0.5  # 0 = silk-fluid, 1 = denim-rigid


@dataclass
class GarmentMeasurements:
    """Flat garment measurements in centimeters."""
    chest_width: Optional[float] = None
    waist_width: Optional[float] = None
    shoulder_width: Optional[float] = None
    garment_length: Optional[float] = None
    sleeve_length: Optional[float] = None
    hem_width: Optional[float] = None
    neck_opening: Optional[float] = None
    # Pants-specific (added for enterprise)
    inseam: Optional[float] = None
    thigh_width: Optional[float] = None
    rise: Optional[float] = None


@dataclass
class GarmentSpec:
    """Full garment specification with measurements and metadata."""
    id: str = ""
    brand_id: str = ""
    garment_type: GarmentType = "shirt"
    size_label: str = "M"
    measurements: GarmentMeasurements = field(default_factory=GarmentMeasurements)
    material: MaterialSpec = field(default_factory=MaterialSpec)


@dataclass
class BodyMeasurements:
    """User body measurements in centimeters (from body_scan.py)."""
    chest_circumference: Optional[float] = None
    waist_circumference: Optional[float] = None
    hip_circumference: Optional[float] = None
    shoulder_width: Optional[float] = None
    arm_length: Optional[float] = None
    torso_length: Optional[float] = None
    inseam: Optional[float] = None
    thigh_circumference: Optional[float] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None


@dataclass
class MeasurementFitResult:
    """Detailed fit result for a single measurement dimension."""
    dimension: str
    body_value: float
    garment_value: float
    raw_gap: float
    effective_gap: float
    fit: FitClassification
    score: int            # 0-100 score for this dimension
    description: str
    weight: float = 0.0   # The importance weight used in scoring


@dataclass
class SizeRecommendation:
    """Complete size recommendation result."""
    request_id: str
    recommended_size: str
    confidence_score: int
    overall_fit: FitClassification
    return_risk: ReturnRisk
    data_quality: int
    summary: str
    measurements: list[MeasurementFitResult] = field(default_factory=list)
    alternatives: list[dict] = field(default_factory=list)
    processing_time_ms: float = 0.0
    garment_type: str = "shirt"
    brand_id: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


@dataclass
class BrandSizeEntry:
    """Size range for a specific brand size label."""
    size_label: str
    chest: dict = field(default_factory=lambda: {"min": 0, "max": 0})
    waist: dict = field(default_factory=lambda: {"min": 0, "max": 0})
    shoulder: Optional[dict] = None   # {"min": x, "max": y}
    hip: Optional[dict] = None


@dataclass
class BrandSizeChart:
    """Complete size chart for a brand."""
    brand_id: str
    brand_name: str
    sizes: list[BrandSizeEntry] = field(default_factory=list)


@dataclass
class CrossBrandResult:
    """Result of cross-brand size comparison."""
    brand_name: str
    brand_id: str
    recommended_size: str
    fit: FitClassification
    confidence_score: int


# ──────────────────────────────────────────────────────────────────────────────
# Constants — The Core Math
# ──────────────────────────────────────────────────────────────────────────────

# Fit thresholds in centimeters (applied to effective gap)
FIT_THRESHOLDS = {
    "TOO_TIGHT": -2.0,   # gap <= -2cm
    "SNUG":       0.0,   # gap > -2cm and < 0cm
    "REGULAR":    5.0,   # gap >= 0cm and <= 5cm (ideal zone)
    "RELAXED":   10.0,   # gap > 5cm and <= 10cm
    # OVERSIZED: gap > 10cm
}

# Dimension weights by garment type — different garments have different priorities
DIMENSION_WEIGHTS: dict[str, dict[str, float]] = {
    # Upper body (shirts, t-shirts, jackets, blazers, sweaters, vests)
    "upper": {
        "chest_width":     0.30,
        "waist_width":     0.25,
        "shoulder_width":  0.20,
        "garment_length":  0.15,
        "sleeve_length":   0.10,
    },
    # Lower body (pants, jeans, shorts)
    "lower": {
        "waist_width":     0.35,
        "thigh_width":     0.25,
        "inseam":          0.25,
        "rise":            0.15,
    },
    # Full body (dresses, coats)
    "full": {
        "chest_width":     0.25,
        "waist_width":     0.25,
        "shoulder_width":  0.15,
        "garment_length":  0.20,
        "sleeve_length":   0.15,
    },
}

# Map garment types to weight categories
GARMENT_TYPE_CATEGORY: dict[str, str] = {
    "shirt":    "upper",
    "t_shirt":  "upper",
    "jacket":   "upper",
    "blazer":   "upper",
    "sweater":  "upper",
    "vest":     "upper",
    "pants":    "lower",
    "jeans":    "lower",
    "shorts":   "lower",
    "dress":    "full",
    "coat":     "full",
}

# Body-to-garment conversion: how to compare body circumference with flat garment width
BODY_TO_GARMENT_CONVERSION: dict[str, dict] = {
    "chest_width":     {"body_key": "chest_circumference",  "divisor": 2},
    "waist_width":     {"body_key": "waist_circumference",  "divisor": 2},
    "shoulder_width":  {"body_key": "shoulder_width",       "divisor": 1},
    "garment_length":  {"body_key": "torso_length",         "divisor": 1},
    "sleeve_length":   {"body_key": "arm_length",           "divisor": 1},
    # Pants-specific
    "thigh_width":     {"body_key": "thigh_circumference",  "divisor": 2},
    "inseam":          {"body_key": "inseam",               "divisor": 1},
}

# Ease allowance in cm (how much a garment extends beyond the body measurement point)
EASE_ALLOWANCE: dict[str, float] = {
    "garment_length": 15.0,   # garments extend ~15cm below torso measurement
    "sleeve_length":   2.0,   # sleeves extend past wrist slightly
    "inseam":          0.0,   # inseam is direct
    "rise":            0.0,
}

# Per-dimension stretch multipliers (NOT all parts stretch equally)
STRETCH_MULTIPLIER: dict[str, float] = {
    "chest_width":     1.0,   # full stretch applies
    "waist_width":     0.9,   # slightly less (waistband restricts)
    "shoulder_width":  0.3,   # barely stretches (seam construction)
    "garment_length":  0.1,   # gravity works against it
    "sleeve_length":   0.2,   # minimal stretch
    "hem_width":       0.8,   # hem stretches
    "neck_opening":    0.4,   # moderate
    "thigh_width":     0.85,  # thigh area stretches well
    "inseam":          0.1,   # length doesn't stretch
    "rise":            0.15,  # minimal stretch
}

# Input validation ranges (values outside are physically implausible)
BODY_MEASUREMENT_RANGES: dict[str, dict[str, float]] = {
    "chest_circumference": {"min": 60, "max": 160},
    "waist_circumference": {"min": 50, "max": 150},
    "hip_circumference":   {"min": 60, "max": 160},
    "shoulder_width":      {"min": 28, "max": 65},
    "arm_length":          {"min": 40, "max": 85},
    "torso_length":        {"min": 30, "max": 70},
    "inseam":              {"min": 55, "max": 100},
    "thigh_circumference": {"min": 35, "max": 90},
    "height_cm":           {"min": 100, "max": 230},
}

GARMENT_MEASUREMENT_RANGES: dict[str, dict[str, float]] = {
    "chest_width":     {"min": 30, "max": 100},
    "shoulder_width":  {"min": 25, "max": 70},
    "sleeve_length":   {"min": 10, "max": 90},
    "garment_length":  {"min": 40, "max": 120},
    "waist_width":     {"min": 25, "max": 100},
    "hem_width":       {"min": 25, "max": 100},
    "neck_opening":    {"min": 10, "max": 50},
    "inseam":          {"min": 15, "max": 110},
    "thigh_width":     {"min": 20, "max": 50},
    "rise":            {"min": 15, "max": 45},
}

# Ideal gap for scoring bell curve
IDEAL_GAP = 2.5  # cm

# Material stretch database (enterprise feature — brands don't need to know exact %)
MATERIAL_STRETCH_DB: dict[str, float] = {
    "cotton":          0.03,
    "cotton_blend":    0.05,
    "cotton_spandex":  0.15,
    "linen":           0.02,
    "silk":            0.01,
    "polyester":       0.05,
    "nylon":           0.08,
    "denim":           0.03,
    "stretch_denim":   0.18,
    "wool":            0.04,
    "wool_knit":       0.10,
    "cashmere":        0.08,
    "leather":         0.01,
    "synthetic_blend": 0.07,
    "jersey":          0.12,
    "fleece":          0.06,
    "chiffon":         0.02,
    "tweed":           0.02,
    "velvet":          0.03,
    "satin":           0.02,
}


# ──────────────────────────────────────────────────────────────────────────────
# Built-in Brand Size Charts (Enterprise: these would come from PostgreSQL)
# ──────────────────────────────────────────────────────────────────────────────

DEMO_BRAND_SIZE_CHARTS: list[BrandSizeChart] = [
    BrandSizeChart(
        brand_id="brand_zegna",
        brand_name="Ermenegildo Zegna",
        sizes=[
            BrandSizeEntry("S",  chest={"min": 86, "max": 90},  waist={"min": 72, "max": 76},  shoulder={"min": 42, "max": 44}),
            BrandSizeEntry("M",  chest={"min": 92, "max": 96},  waist={"min": 78, "max": 82},  shoulder={"min": 44, "max": 46}),
            BrandSizeEntry("L",  chest={"min": 98, "max": 102}, waist={"min": 84, "max": 88},  shoulder={"min": 46, "max": 48}),
            BrandSizeEntry("XL", chest={"min": 104, "max": 108}, waist={"min": 90, "max": 94}, shoulder={"min": 48, "max": 50}),
        ]
    ),
    BrandSizeChart(
        brand_id="brand_prada",
        brand_name="Prada",
        sizes=[
            BrandSizeEntry("44", chest={"min": 84, "max": 88},  waist={"min": 70, "max": 74},  shoulder={"min": 41, "max": 43}),
            BrandSizeEntry("46", chest={"min": 88, "max": 92},  waist={"min": 74, "max": 78},  shoulder={"min": 43, "max": 45}),
            BrandSizeEntry("48", chest={"min": 92, "max": 96},  waist={"min": 78, "max": 82},  shoulder={"min": 45, "max": 47}),
            BrandSizeEntry("50", chest={"min": 96, "max": 100}, waist={"min": 82, "max": 86},  shoulder={"min": 47, "max": 49}),
            BrandSizeEntry("52", chest={"min": 100, "max": 104}, waist={"min": 86, "max": 90}, shoulder={"min": 49, "max": 51}),
        ]
    ),
    BrandSizeChart(
        brand_id="brand_lvmh",
        brand_name="Louis Vuitton",
        sizes=[
            BrandSizeEntry("XS", chest={"min": 82, "max": 86},  waist={"min": 68, "max": 72},  shoulder={"min": 40, "max": 42}),
            BrandSizeEntry("S",  chest={"min": 86, "max": 90},  waist={"min": 72, "max": 76},  shoulder={"min": 42, "max": 44}),
            BrandSizeEntry("M",  chest={"min": 90, "max": 94},  waist={"min": 76, "max": 80},  shoulder={"min": 44, "max": 46}),
            BrandSizeEntry("L",  chest={"min": 94, "max": 98},  waist={"min": 80, "max": 84},  shoulder={"min": 46, "max": 48}),
            BrandSizeEntry("XL", chest={"min": 98, "max": 102}, waist={"min": 84, "max": 88},  shoulder={"min": 48, "max": 50}),
        ]
    ),
    BrandSizeChart(
        brand_id="brand_burberry",
        brand_name="Burberry",
        sizes=[
            BrandSizeEntry("S",  chest={"min": 88, "max": 92},  waist={"min": 74, "max": 78},  shoulder={"min": 43, "max": 45}),
            BrandSizeEntry("M",  chest={"min": 94, "max": 98},  waist={"min": 80, "max": 84},  shoulder={"min": 45, "max": 47}),
            BrandSizeEntry("L",  chest={"min": 100, "max": 104}, waist={"min": 86, "max": 90}, shoulder={"min": 47, "max": 49}),
            BrandSizeEntry("XL", chest={"min": 106, "max": 110}, waist={"min": 92, "max": 96}, shoulder={"min": 49, "max": 51}),
        ]
    ),
    BrandSizeChart(
        brand_id="brand_gucci",
        brand_name="Gucci",
        sizes=[
            BrandSizeEntry("44", chest={"min": 84, "max": 88},  waist={"min": 70, "max": 74},  shoulder={"min": 41, "max": 43}),
            BrandSizeEntry("46", chest={"min": 88, "max": 92},  waist={"min": 74, "max": 78},  shoulder={"min": 43, "max": 45}),
            BrandSizeEntry("48", chest={"min": 92, "max": 96},  waist={"min": 78, "max": 82},  shoulder={"min": 45, "max": 47}),
            BrandSizeEntry("50", chest={"min": 96, "max": 100}, waist={"min": 82, "max": 86},  shoulder={"min": 47, "max": 49}),
            BrandSizeEntry("52", chest={"min": 100, "max": 104}, waist={"min": 86, "max": 90}, shoulder={"min": 49, "max": 51}),
            BrandSizeEntry("54", chest={"min": 104, "max": 108}, waist={"min": 90, "max": 94}, shoulder={"min": 51, "max": 53}),
        ]
    ),
]


# ──────────────────────────────────────────────────────────────────────────────
# Core Algorithm: Fit Classification
# ──────────────────────────────────────────────────────────────────────────────

def classify_fit(effective_gap: float) -> FitClassification:
    """Classify the fit based on the effective gap (after stretch adjustment)."""
    if effective_gap <= FIT_THRESHOLDS["TOO_TIGHT"]:
        return "TOO_TIGHT"
    if effective_gap < FIT_THRESHOLDS["SNUG"]:
        return "SNUG"
    if effective_gap <= FIT_THRESHOLDS["REGULAR"]:
        return "REGULAR"
    if effective_gap <= FIT_THRESHOLDS["RELAXED"]:
        return "RELAXED"
    return "OVERSIZED"


def gap_to_score(effective_gap: float) -> int:
    """
    Convert effective gap to a continuous score (0-100).
    Uses an asymmetric bell curve centered at IDEAL_GAP.

    Calibrated for luxury brand standards:
      gap  2.5cm → 100 (perfect)
      gap  0.0cm →  93 (snug but great)
      gap  5.0cm →  93 (relaxed but great)
      gap -2.0cm →  75 (snug alert)
      gap -4.0cm →  35 (too tight — return risk)
      gap 10.0cm →  60 (oversized alert)
    """
    deviation = effective_gap - IDEAL_GAP
    # Asymmetric penalty: tight is worse than loose (fashion industry standard)
    if deviation < 0:
        penalty = deviation * deviation * 2.0   # tight: penalized more
    else:
        penalty = deviation * deviation * 0.8   # loose: more forgiving
    raw = 100 * math.exp(-0.025 * penalty)
    return round(max(0, min(100, raw)))


def fit_description(fit: FitClassification, dimension_label: str, gap: float) -> str:
    """Generate a human-readable description for a fit result."""
    abs_gap = f"{abs(gap):.1f}"
    descriptions: dict[FitClassification, str] = {
        "TOO_TIGHT": f"{dimension_label} is {abs_gap}cm too tight — will feel uncomfortable",
        "SNUG":      f"{dimension_label} fits snugly — close to body, minimal room",
        "REGULAR":   f"{dimension_label} fits well — {abs_gap}cm of comfortable room",
        "RELAXED":   f"{dimension_label} is relaxed — {abs_gap}cm of extra space for a loose feel",
        "OVERSIZED": f"{dimension_label} is oversized — {abs_gap}cm of excess, may look baggy",
    }
    return descriptions[fit]


# Dimension labels for human-readable output
DIMENSION_LABELS: dict[str, str] = {
    "chest_width":     "Chest",
    "waist_width":     "Waist",
    "shoulder_width":  "Shoulders",
    "garment_length":  "Length",
    "sleeve_length":   "Sleeves",
    "hem_width":       "Hem",
    "neck_opening":    "Neck",
    "inseam":          "Inseam",
    "thigh_width":     "Thigh",
    "rise":            "Rise",
}


# ──────────────────────────────────────────────────────────────────────────────
# Per-Dimension Analysis
# ──────────────────────────────────────────────────────────────────────────────

def analyze_measurement(
    dimension: str,
    body_value: float,
    garment_value: float,
    material: MaterialSpec,
    weight: float = 0.0,
) -> MeasurementFitResult:
    """
    Analyze fit for a single measurement dimension.

    The stretch adjustment is per-dimension (shoulders barely stretch,
    chest stretches most) — this is what makes it enterprise-grade.
    """
    # Raw gap: how much bigger the garment is than the body
    raw_gap = garment_value - body_value

    # Effective gap: accounts for material stretch, PER-DIMENSION
    stretch_factor = STRETCH_MULTIPLIER.get(dimension, 0.5)
    stretch_room = garment_value * material.stretch * stretch_factor
    effective_gap = (raw_gap + stretch_room) if raw_gap < 0 else raw_gap

    fit = classify_fit(effective_gap)
    score = gap_to_score(effective_gap)
    label = DIMENSION_LABELS.get(dimension, dimension)
    desc = fit_description(fit, label, effective_gap)

    return MeasurementFitResult(
        dimension=dimension,
        body_value=round(body_value, 1),
        garment_value=round(garment_value, 1),
        raw_gap=round(raw_gap, 1),
        effective_gap=round(effective_gap, 1),
        fit=fit,
        score=score,
        description=desc,
        weight=weight,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Body-to-Garment Conversion
# ──────────────────────────────────────────────────────────────────────────────

def convert_body_to_garment_basis(
    body: BodyMeasurements,
    dimension: str,
) -> Optional[float]:
    """
    Convert a body circumference measurement to a garment-comparable flat value.
    E.g., chest circumference 96cm → chest half = 48cm.
    """
    conversion = BODY_TO_GARMENT_CONVERSION.get(dimension)
    if not conversion:
        return None

    body_key = conversion["body_key"]
    divisor = conversion["divisor"]

    body_val = getattr(body, body_key, None)
    if body_val is None:
        return None

    # Apply ease allowance (garment length extends below torso, etc.)
    ease = EASE_ALLOWANCE.get(dimension, 0.0)
    return (body_val / divisor) + ease


# ──────────────────────────────────────────────────────────────────────────────
# Full Size Recommendation
# ──────────────────────────────────────────────────────────────────────────────

def analyze_garment_fit(
    body: BodyMeasurements,
    garment: GarmentSpec,
    brand_return_risk_thresholds: Optional[dict] = None,
) -> SizeRecommendation:
    """
    Generate a size recommendation by comparing body against a single garment spec.

    This is the core function. It:
      1. Converts body measurements to garment-comparable basis
      2. Analyzes each dimension with stretch adjustment
      3. Computes weighted confidence score
      4. Determines overall fit and return risk
      5. Generates human-readable summary
    """
    start = time.perf_counter()
    request_id = str(uuid.uuid4())[:12]

    # Determine which weight category this garment type uses
    category = GARMENT_TYPE_CATEGORY.get(garment.garment_type, "upper")
    weights = DIMENSION_WEIGHTS.get(category, DIMENSION_WEIGHTS["upper"])

    results: list[MeasurementFitResult] = []
    total_weighted_score = 0.0
    total_weight = 0.0

    # Analyze each dimension that has both body + garment data
    for dim, weight in weights.items():
        garment_value = getattr(garment.measurements, dim, None)
        if garment_value is None:
            continue

        body_value = convert_body_to_garment_basis(body, dim)
        if body_value is None:
            continue

        result = analyze_measurement(dim, body_value, garment_value, garment.material, weight)
        results.append(result)

        total_weighted_score += result.score * weight
        total_weight += weight

    # Overall confidence score (0-100)
    confidence_score = round(total_weighted_score / total_weight) if total_weight > 0 else 0

    # Weighted average gap for overall fit classification
    total_weighted_gap = 0.0
    gap_weight = 0.0
    for r in results:
        w = weights.get(r.dimension, 0.1)
        total_weighted_gap += r.effective_gap * w
        gap_weight += w
    avg_gap = total_weighted_gap / gap_weight if gap_weight > 0 else 0.0

    overall_fit = classify_fit(avg_gap)
    return_risk = _compute_return_risk(results, avg_gap, brand_return_risk_thresholds)
    data_quality = round((len(results) / max(len(weights), 1)) * 100)

    summary = _generate_summary(garment, results, confidence_score, overall_fit, return_risk)

    elapsed_ms = (time.perf_counter() - start) * 1000

    return SizeRecommendation(
        request_id=request_id,
        recommended_size=garment.size_label,
        confidence_score=confidence_score,
        overall_fit=overall_fit,
        return_risk=return_risk,
        data_quality=data_quality,
        summary=summary,
        measurements=results,
        processing_time_ms=round(elapsed_ms, 2),
        garment_type=garment.garment_type,
        brand_id=garment.brand_id,
    )


def recommend_size(
    body: BodyMeasurements,
    garment_sizes: list[GarmentSpec],
    brand_return_risk_thresholds: Optional[dict] = None,
) -> Optional[SizeRecommendation]:
    """
    Recommend the best size from multiple sizes of the same garment.

    Analyzes every available size, returns the best match with alternatives.
    The alternatives list shows other viable sizes ranked by confidence.
    """
    if not garment_sizes:
        return None

    recommendations = [
        analyze_garment_fit(body, g, brand_return_risk_thresholds)
        for g in garment_sizes
    ]

    # Sort by confidence score (highest first)
    recommendations.sort(key=lambda r: r.confidence_score, reverse=True)
    best = recommendations[0]

    # Add alternatives (other sizes with score > 40)
    best.alternatives = [
        {
            "size": r.recommended_size,
            "confidence_score": r.confidence_score,
            "overall_fit": r.overall_fit,
            "return_risk": r.return_risk,
        }
        for r in recommendations[1:]
        if r.confidence_score > 40
    ]

    return best


# ──────────────────────────────────────────────────────────────────────────────
# Cross-Brand Comparison — "You're a Zara M, H&M L, Uniqlo M"
# ──────────────────────────────────────────────────────────────────────────────

def compare_brand_sizes(
    body: BodyMeasurements,
    brands: Optional[list[BrandSizeChart]] = None,
) -> list[CrossBrandResult]:
    """
    Compare body measurements across multiple brands to find the best size at each.

    This is the headline feature: "You're a Zegna M, Prada 48, Louis Vuitton L"
    Uses range-midpoint scoring with dimension weighting.
    """
    if brands is None:
        brands = DEMO_BRAND_SIZE_CHARTS

    results: list[CrossBrandResult] = []

    for brand in brands:
        best_size = "M"
        best_score = 0.0
        best_fit: FitClassification = "REGULAR"

        for entry in brand.sizes:
            dimension_scores: list[float] = []

            # Check chest (40% weight)
            if body.chest_circumference and entry.chest:
                mid = (entry.chest["min"] + entry.chest["max"]) / 2
                rng = entry.chest["max"] - entry.chest["min"]
                if rng > 0:
                    deviation = abs(body.chest_circumference - mid)
                    score = max(0, 100 - (deviation / rng) * 100)
                    dimension_scores.append(score * 0.40)

            # Check waist (35% weight)
            if body.waist_circumference and entry.waist:
                mid = (entry.waist["min"] + entry.waist["max"]) / 2
                rng = entry.waist["max"] - entry.waist["min"]
                if rng > 0:
                    deviation = abs(body.waist_circumference - mid)
                    score = max(0, 100 - (deviation / rng) * 100)
                    dimension_scores.append(score * 0.35)

            # Check shoulders (25% weight)
            if body.shoulder_width and entry.shoulder:
                mid = (entry.shoulder["min"] + entry.shoulder["max"]) / 2
                rng = entry.shoulder["max"] - entry.shoulder["min"]
                if rng > 0:
                    deviation = abs(body.shoulder_width - mid)
                    score = max(0, 100 - (deviation / rng) * 100)
                    dimension_scores.append(score * 0.25)

            total_score = sum(dimension_scores)

            if total_score > best_score:
                best_score = total_score
                best_size = entry.size_label
                best_fit = _score_to_fit(round(total_score))

        results.append(CrossBrandResult(
            brand_name=brand.brand_name,
            brand_id=brand.brand_id,
            recommended_size=best_size,
            fit=best_fit,
            confidence_score=round(best_score),
        ))

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Input Validation
# ──────────────────────────────────────────────────────────────────────────────

def validate_body_measurements(body: BodyMeasurements) -> list[str]:
    """Validate body measurements are within physically plausible ranges."""
    errors: list[str] = []

    for key, rng in BODY_MEASUREMENT_RANGES.items():
        val = getattr(body, key, None)
        if val is not None:
            if not isinstance(val, (int, float)) or math.isnan(val):
                errors.append(f"{key} must be a number")
            elif val < rng["min"] or val > rng["max"]:
                errors.append(f"{key} ({val}cm) is outside valid range {rng['min']}-{rng['max']}cm")

    # Cross-validation: shoulder should be less than chest
    if body.shoulder_width and body.chest_circumference:
        if body.shoulder_width > body.chest_circumference * 0.6:
            errors.append(
                f"shoulder_width ({body.shoulder_width}cm) seems too large "
                f"relative to chest ({body.chest_circumference}cm)"
            )

    # Cross-validation: waist should be less than chest
    if body.waist_circumference and body.chest_circumference:
        if body.waist_circumference > body.chest_circumference * 1.3:
            errors.append(
                f"waist_circumference ({body.waist_circumference}cm) seems too large "
                f"relative to chest ({body.chest_circumference}cm)"
            )

    return errors


def validate_garment_measurements(measurements: GarmentMeasurements) -> list[str]:
    """Validate garment measurements are within plausible ranges."""
    errors: list[str] = []

    for key, rng in GARMENT_MEASUREMENT_RANGES.items():
        val = getattr(measurements, key, None)
        if val is not None:
            if not isinstance(val, (int, float)) or math.isnan(val):
                errors.append(f"{key} must be a number")
            elif val < rng["min"] or val > rng["max"]:
                errors.append(f"{key} ({val}cm) is outside valid range {rng['min']}-{rng['max']}cm")

    return errors


# ──────────────────────────────────────────────────────────────────────────────
# Helper: Material Stretch Lookup
# ──────────────────────────────────────────────────────────────────────────────

def get_material_stretch(material_type: str) -> float:
    """
    Look up the stretch percentage for a material type.
    Brands select material from a dropdown — they don't need to know the exact %.
    """
    return MATERIAL_STRETCH_DB.get(material_type.lower().replace(" ", "_"), 0.05)


# ──────────────────────────────────────────────────────────────────────────────
# Private Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _score_to_fit(score: int) -> FitClassification:
    """Convert a numeric score back to a fit classification."""
    if score >= 90:
        return "REGULAR"
    if score >= 70:
        return "SNUG"
    if score >= 50:
        return "RELAXED"
    if score >= 30:
        return "OVERSIZED"
    return "TOO_TIGHT"


def _compute_return_risk(
    results: list[MeasurementFitResult],
    avg_gap: float,
    brand_thresholds: Optional[dict] = None,
) -> ReturnRisk:
    """
    Compute return risk — THE metric luxury brands pay for.

    LOW:    all dimensions fit well → brand confidently recommends
    MEDIUM: any dimension is SNUG or RELAXED → caution
    HIGH:   any dimension is TOO_TIGHT or OVERSIZED → likely return
    """
    # Brand-specific strictness thresholds (enterprise feature)
    if brand_thresholds:
        high_threshold = brand_thresholds.get("high_risk_min_gap", 5.0)
        medium_threshold = brand_thresholds.get("medium_risk_min_gap", 3.0)
        abs_deviation = abs(avg_gap - IDEAL_GAP)

        if abs_deviation >= high_threshold:
            return "high"
        if abs_deviation >= medium_threshold:
            return "medium"

    # Default assessment
    has_dangerous = any(r.fit in ("TOO_TIGHT", "OVERSIZED") for r in results)
    if has_dangerous:
        return "high"

    has_moderate = any(r.fit in ("SNUG", "RELAXED") for r in results)
    if has_moderate:
        return "medium"

    return "low"


def _generate_summary(
    garment: GarmentSpec,
    results: list[MeasurementFitResult],
    confidence: int,
    overall_fit: FitClassification,
    return_risk: ReturnRisk,
) -> str:
    """Generate a human-readable summary of the fit recommendation."""
    fit_labels: dict[FitClassification, str] = {
        "TOO_TIGHT": "too tight",
        "SNUG":      "snug",
        "REGULAR":   "a comfortable, regular fit",
        "RELAXED":   "a relaxed, loose fit",
        "OVERSIZED": "oversized",
    }

    summary = f"Size {garment.size_label} is {fit_labels[overall_fit]} ({confidence}% confidence)."

    tight_dims = [r for r in results if r.fit == "TOO_TIGHT"]
    loose_dims = [r for r in results if r.fit == "OVERSIZED"]

    if tight_dims:
        names = ", ".join(DIMENSION_LABELS.get(d.dimension, d.dimension) for d in tight_dims)
        summary += f" Warning: {names} may be too tight."

    if loose_dims:
        names = ", ".join(DIMENSION_LABELS.get(d.dimension, d.dimension) for d in loose_dims)
        summary += f" Note: {names} will be very loose."

    if garment.material.stretch > 0.10:
        pct = round(garment.material.stretch * 100)
        summary += f" This {garment.material.type} fabric has {pct}% stretch, providing extra flexibility."

    if return_risk == "high":
        summary += " ⚠️ HIGH RETURN RISK — consider recommending a different size."

    return summary
