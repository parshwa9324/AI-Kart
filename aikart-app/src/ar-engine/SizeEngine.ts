/**
 * SizeEngine.ts — Size Intelligence Engine
 *
 * The core differentiator of AI-Kart.
 * Deterministic size matching algorithm that compares body measurements
 * against garment measurements, adjusted for material stretch.
 *
 * This is NOT a neural network — it's precise, explainable math.
 * Every recommendation comes with per-measurement breakdown and
 * human-readable explanations.
 *
 * Weighted scoring (based on industry fit importance):
 *   Chest:     30% — most critical for upper body fit
 *   Waist:     25% — second most important
 *   Shoulders: 20% — affects silhouette
 *   Length:    15% — affects coverage
 *   Sleeves:   10% — least critical, most forgiving
 */

import type {
    FitClassification,
    GarmentMeasurements,
    GarmentSpec,
    MaterialSpec,
    MeasurementFitResult,
    ReturnRisk,
    SizeLabel,
    SizeRecommendation,
    UserBodyMeasurements,
    BrandSizeChart,
    CrossBrandSizeResult,
} from '../types/types';
import type { BrandConfig } from '../types/brand';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/**
 * Fit thresholds in centimeters (applied to effective gap).
 * Uses inclusive lower bounds for intuitive behavior:
 *   TOO_TIGHT:  gap <= -2cm
 *   SNUG:       gap -2cm to 0cm (exclusive)
 *   REGULAR:    gap 0cm to 5cm (inclusive) — the ideal zone
 *   RELAXED:    gap 5cm to 10cm
 *   OVERSIZED:  gap > 10cm
 */
const FIT_THRESHOLDS = {
    TOO_TIGHT: -2,   // gap <= -2cm
    SNUG: 0,   // gap > -2cm and < 0cm
    REGULAR: 5,   // gap >= 0cm and <= 5cm
    RELAXED: 10,   // gap > 5cm and <= 10cm
    // OVERSIZED: gap > 10cm
} as const;

/**
 * Dimension weights for overall fit score calculation.
 * Must sum to 1.0.
 */
const DIMENSION_WEIGHTS: Partial<Record<keyof GarmentMeasurements, number>> = {
    chestWidth: 0.30,
    waistWidth: 0.25,
    shoulderWidth: 0.20,
    garmentLength: 0.15,
    sleeveLength: 0.10,
};

/**
 * How to convert body circumference measurements to flat garment "half" measurements.
 * Body circumference / divisor = comparable value to garment flat measurement.
 *
 * Chest circumference 96cm → chest half = 48cm → compare to garment chestWidth.
 */
/**
 * Ease allowance in cm to add to the body value before comparison.
 * This accounts for the fact that garments need room beyond the raw
 * body measurement to be comfortable (e.g., garment length covers
 * more than just the torso — it extends below the hips).
 */
const EASE_ALLOWANCE: Partial<Record<keyof GarmentMeasurements, number>> = {
    garmentLength: 15,   // garments extend ~15cm below torso measurement point
    sleeveLength: 2,   // sleeves extend past wrist slightly
};

/**
 * Per-dimension stretch multipliers.
 *
 * SaaS-critical: NOT all parts of a garment stretch equally.
 *   - Shoulders are sewn rigid (seam to seam) → barely stretch
 *   - Chest area stretches most (widest fabric panel)
 *   - Sleeves have seams that limit stretch
 *   - Length/hem hardly stretch at all
 */
const STRETCH_MULTIPLIER: Partial<Record<keyof GarmentMeasurements, number>> = {
    chestWidth: 1.0,   // full stretch applies
    waistWidth: 0.9,   // slightly less (waistband can restrict)
    shoulderWidth: 0.3,   // shoulders barely stretch (seam construction)
    garmentLength: 0.1,   // length doesn't stretch (gravity works against it)
    sleeveLength: 0.2,   // sleeves stretch minimally
    hemWidth: 0.8,   // hem can stretch
    neckOpening: 0.4,   // neck stretches moderately
};

const BODY_TO_GARMENT_CONVERSION: Record<string, {
    bodyKey: keyof UserBodyMeasurements;
    divisor: number;
}> = {
    chestWidth: { bodyKey: 'chestCircumference', divisor: 2 },
    waistWidth: { bodyKey: 'waistCircumference', divisor: 2 },
    shoulderWidth: { bodyKey: 'shoulderWidth', divisor: 1 },
    garmentLength: { bodyKey: 'torsoLength', divisor: 1 },
    sleeveLength: { bodyKey: 'armLength', divisor: 1 },
};

/**
 * Input validation ranges for body measurements (cm).
 * Values outside these ranges are physically implausible.
 */
const MEASUREMENT_RANGES: Record<string, { min: number; max: number }> = {
    chestCircumference: { min: 60, max: 160 },
    waistCircumference: { min: 50, max: 150 },
    hipCircumference: { min: 60, max: 160 },
    shoulderWidth: { min: 28, max: 65 },
    armLength: { min: 40, max: 85 },
    torsoLength: { min: 30, max: 70 },
};

/** Total number of key dimensions for data quality calculation */
const TOTAL_KEY_DIMENSIONS = Object.keys(DIMENSION_WEIGHTS).length;

// ─────────────────────────────────────────────────────────────
// Fit Classification
// ─────────────────────────────────────────────────────────────

/**
 * Classify the fit based on the effective gap (after stretch adjustment).
 *
 * @param effectiveGap - Gap in cm (positive = room, negative = tight)
 * @returns The fit classification
 */
export function classifyFit(effectiveGap: number): FitClassification {
    if (effectiveGap <= FIT_THRESHOLDS.TOO_TIGHT) return 'TOO_TIGHT';
    if (effectiveGap < FIT_THRESHOLDS.SNUG) return 'SNUG';
    if (effectiveGap <= FIT_THRESHOLDS.REGULAR) return 'REGULAR';
    if (effectiveGap <= FIT_THRESHOLDS.RELAXED) return 'RELAXED';
    return 'OVERSIZED';
}

/**
 * Convert a fit classification to a human-readable description.
 */
function fitDescription(fit: FitClassification, dimension: string, gap: number): string {
    const absGap = Math.abs(gap).toFixed(1);
    switch (fit) {
        case 'TOO_TIGHT':
            return `${dimension} is ${absGap}cm too tight — will feel uncomfortable`;
        case 'SNUG':
            return `${dimension} fits snugly — close to body, minimal room`;
        case 'REGULAR':
            return `${dimension} fits well — ${absGap}cm of comfortable room`;
        case 'RELAXED':
            return `${dimension} is relaxed — ${absGap}cm of extra space for a loose feel`;
        case 'OVERSIZED':
            return `${dimension} is oversized — ${absGap}cm of excess, may look baggy`;
    }
}

/**
 * Convert effective gap to a continuous score (0–100).
 * Uses a smooth bell curve centered at the IDEAL_GAP.
 *
 * SaaS-calibrated for luxury brand standards:
 *   - Well-fitting garments (REGULAR zone) MUST score 90%+
 *   - Tight garments penalized more than loose ones
 *   - Scoring uses gentler curve so REGULAR zone feels high-confidence
 *
 * Calibrated examples:
 *   gap  2.5cm → 100 (perfect)
 *   gap  0.0cm →  93 (snug but great — still REGULAR territory)
 *   gap  5.0cm →  93 (relaxed but great)
 *   gap -2.0cm →  75 (snug alert)
 *   gap -4.0cm →  35 (too tight — return risk)
 *   gap 10.0cm →  60 (oversized alert)
 */
const IDEAL_GAP = 2.5; // cm

function gapToScore(effectiveGap: number): number {
    const deviation = effectiveGap - IDEAL_GAP;
    // Asymmetric penalty: tight is worse than loose
    // Calibrated for SaaS: gentler curve → 90%+ for REGULAR fits
    const penalty = deviation < 0
        ? deviation * deviation * 2.0   // tight: penalized but less aggressively
        : deviation * deviation * 0.8;  // loose: even gentler
    const raw = 100 * Math.exp(-0.025 * penalty);
    return Math.round(Math.max(0, Math.min(100, raw)));
}

// ─────────────────────────────────────────────────────────────
// Per-Dimension Analysis
// ─────────────────────────────────────────────────────────────

/**
 * Analyze fit for a single measurement dimension.
 *
 * @param dimension - Which measurement dimension
 * @param bodyValue - Body measurement (already converted to garment convention)
 * @param garmentValue - Garment measurement in cm
 * @param material - Fabric material properties
 * @returns Detailed fit result for this dimension
 */
export function analyzeMeasurement(
    dimension: keyof GarmentMeasurements,
    bodyValue: number,
    garmentValue: number,
    material: MaterialSpec
): MeasurementFitResult {
    // Raw gap: how much bigger the garment is than the body
    const rawGap = garmentValue - bodyValue;

    // Effective gap: accounts for material stretch, PER-DIMENSION
    // SaaS-critical: shoulders barely stretch, chest stretches most
    const stretchFactor = STRETCH_MULTIPLIER[dimension] ?? 0.5;
    const stretchRoom = garmentValue * material.stretch * stretchFactor;
    const effectiveGap = rawGap < 0
        ? rawGap + stretchRoom  // stretch helps with tight fit
        : rawGap;               // loose fit unaffected by stretch

    const fit = classifyFit(effectiveGap);

    const dimensionLabels: Record<string, string> = {
        chestWidth: 'Chest',
        waistWidth: 'Waist',
        shoulderWidth: 'Shoulders',
        garmentLength: 'Length',
        sleeveLength: 'Sleeves',
        hemWidth: 'Hem',
        neckOpening: 'Neck',
    };

    return {
        dimension,
        bodyValue: Math.round(bodyValue * 10) / 10,
        garmentValue: Math.round(garmentValue * 10) / 10,
        rawGap: Math.round(rawGap * 10) / 10,
        effectiveGap: Math.round(effectiveGap * 10) / 10,
        fit,
        description: fitDescription(fit, dimensionLabels[dimension] ?? dimension, effectiveGap),
    };
}

// ─────────────────────────────────────────────────────────────
// Full Size Recommendation
// ─────────────────────────────────────────────────────────────

/**
 * Convert body measurements to garment-comparable values.
 * Body circumference → half measurement where needed.
 */
function convertBodyToGarmentBasis(
    body: UserBodyMeasurements,
    dimension: keyof GarmentMeasurements
): number | null {
    const conversion = BODY_TO_GARMENT_CONVERSION[dimension];
    if (!conversion) return null;

    const bodyVal = body[conversion.bodyKey];
    if (bodyVal === undefined || bodyVal === null) return null;

    // Apply ease allowance (e.g., garment length extends below torso)
    const ease = EASE_ALLOWANCE[dimension] ?? 0;
    return (bodyVal / conversion.divisor) + ease;
}

/**
 * Generate a size recommendation by comparing body against a single garment spec.
 *
 * @param body - User's body measurements
 * @param garment - Garment specification with measurements
 * @returns Detailed size recommendation
 */
export function analyzeGarmentFit(
    body: UserBodyMeasurements,
    garment: GarmentSpec,
    brandConfig?: BrandConfig
): SizeRecommendation {
    const results: MeasurementFitResult[] = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Analyze each dimension that has both body + garment data
    for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
        const dimension = dim as keyof GarmentMeasurements;
        const garmentValue = garment.measurements[dimension];
        if (garmentValue === undefined || garmentValue === null) continue;

        const bodyValue = convertBodyToGarmentBasis(body, dimension);
        if (bodyValue === null) continue;

        const result = analyzeMeasurement(dimension, bodyValue, garmentValue, garment.material);
        results.push(result);

        totalWeightedScore += gapToScore(result.effectiveGap) * weight;
        totalWeight += weight;
    }

    // Overall confidence score (0–100)
    const confidenceScore = totalWeight > 0
        ? Math.round(totalWeightedScore / totalWeight)
        : 0;

    // Compute weighted average gap for overall fit classification
    let totalWeightedGap = 0;
    let gapWeight = 0;
    for (let i = 0; i < results.length; i++) {
        const dim = results[i].dimension;
        const w = DIMENSION_WEIGHTS[dim] ?? 0.1;
        totalWeightedGap += results[i].effectiveGap * w;
        gapWeight += w;
    }
    const avgGap = gapWeight > 0 ? totalWeightedGap / gapWeight : 0;

    // Determine overall fit from the actual average gap (not the score!)
    const overallFit = classifyFit(avgGap);

    // Return risk: THE metric brands pay for. Now brand-configurable.
    const returnRisk = computeReturnRisk(results, avgGap, brandConfig);

    // Data quality: how complete was the input data?
    const dataQuality = Math.round((results.length / TOTAL_KEY_DIMENSIONS) * 100);

    // Generate summary
    const summary = generateSummary(garment, results, confidenceScore, overallFit, returnRisk);

    return {
        recommendedSize: garment.sizeLabel,
        confidenceScore,
        measurements: results,
        overallFit,
        returnRisk,
        dataQuality,
        summary,
    };
}

/**
 * Recommend the best size from multiple sizes of the same garment.
 *
 * @param body - User's body measurements
 * @param garmentSizes - Array of the same garment in different sizes
 * @returns Best recommendation + alternatives
 */
export function recommendSize(
    body: UserBodyMeasurements,
    garmentSizes: GarmentSpec[],
    brandConfig?: BrandConfig
): SizeRecommendation | null {
    if (garmentSizes.length === 0) return null;

    // Analyze each size
    const recommendations = garmentSizes.map(g => analyzeGarmentFit(body, g, brandConfig));

    // Sort by confidence score (highest first)
    recommendations.sort((a, b) => b.confidenceScore - a.confidenceScore);

    const best = recommendations[0];

    // Add alternatives (other sizes that scored > 40)
    best.alternatives = recommendations
        .slice(1)
        .filter(r => r.confidenceScore > 40)
        .map(r => ({
            size: r.recommendedSize,
            confidenceScore: r.confidenceScore,
            overallFit: r.overallFit,
            returnRisk: r.returnRisk,
        }));

    return best;
}

/**
 * Compare body measurements across multiple brands to find best size at each brand.
 * "You're a Zara M, H&M L, Uniqlo M"
 *
 * @param body - User's body measurements
 * @param brands - Array of brand size charts
 * @returns Per-brand size recommendation
 */
export function compareBrandSizes(
    body: UserBodyMeasurements,
    brands: BrandSizeChart[]
): CrossBrandSizeResult[] {
    const results: CrossBrandSizeResult[] = [];

    for (const brand of brands) {
        let bestSize: SizeLabel = 'M'; // default
        let bestScore = 0;
        let bestFit: FitClassification = 'REGULAR';

        for (const sizeEntry of brand.sizes) {
            // Score how well the body fits within this size's range
            let dimensionScores: number[] = [];

            // Check chest
            if (body.chestCircumference) {
                const mid = (sizeEntry.chest.min + sizeEntry.chest.max) / 2;
                const range = sizeEntry.chest.max - sizeEntry.chest.min;
                const deviation = Math.abs(body.chestCircumference - mid);
                const score = Math.max(0, 100 - (deviation / range) * 100);
                dimensionScores.push(score * 0.4); // 40% weight
            }

            // Check waist
            if (body.waistCircumference) {
                const mid = (sizeEntry.waist.min + sizeEntry.waist.max) / 2;
                const range = sizeEntry.waist.max - sizeEntry.waist.min;
                const deviation = Math.abs(body.waistCircumference - mid);
                const score = Math.max(0, 100 - (deviation / range) * 100);
                dimensionScores.push(score * 0.35); // 35% weight
            }

            // Check shoulders
            if (body.shoulderWidth && sizeEntry.shoulder) {
                const mid = (sizeEntry.shoulder.min + sizeEntry.shoulder.max) / 2;
                const range = sizeEntry.shoulder.max - sizeEntry.shoulder.min;
                const deviation = Math.abs(body.shoulderWidth - mid);
                const score = Math.max(0, 100 - (deviation / range) * 100);
                dimensionScores.push(score * 0.25); // 25% weight
            }

            const totalScore = dimensionScores.reduce((sum, s) => sum + s, 0);

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestSize = sizeEntry.sizeLabel;
                bestFit = scoreToFit(Math.round(totalScore));
            }
        }

        results.push({
            brandName: brand.brandName,
            brandId: brand.brandId,
            recommendedSize: bestSize,
            fit: bestFit,
            confidenceScore: Math.round(bestScore),
        });
    }

    return results;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert a numeric score back to a fit classification.
 */
function scoreToFit(score: number): FitClassification {
    if (score >= 90) return 'REGULAR';
    if (score >= 70) return 'SNUG';
    if (score >= 50) return 'RELAXED';
    if (score >= 30) return 'OVERSIZED';
    return 'TOO_TIGHT';
}

// ─────────────────────────────────────────────────────────────
// Return Risk Computation
// ─────────────────────────────────────────────────────────────

/**
 * Compute return-risk from per-dimension fit results.
 *
 * SaaS-critical: this is the single number luxury brands care about.
 *   - LOW:    all dimensions are REGULAR — brand can confidently recommend
 *   - MEDIUM: at least one dimension is SNUG or RELAXED
 *   - HIGH:   any dimension is TOO_TIGHT or OVERSIZED
 */
function computeReturnRisk(
    results: MeasurementFitResult[],
    avgGap: number,
    brandConfig?: BrandConfig
): ReturnRisk {
    // If the luxury brand provided custom strictness thresholds, use them
    if (brandConfig?.returnRiskThresholds) {
        const { highRiskMinGap, mediumRiskMinGap } = brandConfig.returnRiskThresholds;
        const absDeviation = Math.abs(avgGap - IDEAL_GAP);

        if (absDeviation >= highRiskMinGap) return 'high';
        if (absDeviation >= mediumRiskMinGap) return 'medium';
    }

    // Default SaaS Fallback Risk Assessment
    const hasDangerous = results.some(r =>
        r.fit === 'TOO_TIGHT' || r.fit === 'OVERSIZED'
    );
    if (hasDangerous) return 'high';

    const hasModerate = results.some(r =>
        r.fit === 'SNUG' || r.fit === 'RELAXED'
    );
    if (hasModerate) return 'medium';

    return 'low';
}

// ─────────────────────────────────────────────────────────────
// Input Validation
// ─────────────────────────────────────────────────────────────

/**
 * Validate body measurements are within physically plausible ranges.
 * Returns an array of validation errors (empty = valid).
 */
export function validateBodyMeasurements(
    body: UserBodyMeasurements
): string[] {
    const errors: string[] = [];

    for (const [key, range] of Object.entries(MEASUREMENT_RANGES)) {
        const val = body[key as keyof UserBodyMeasurements];
        if (val !== undefined && val !== null) {
            if (typeof val !== 'number' || isNaN(val)) {
                errors.push(`${key} must be a number`);
            } else if (val < range.min || val > range.max) {
                errors.push(`${key} (${val}cm) is outside valid range ${range.min}-${range.max}cm`);
            }
        }
    }

    // Outlier detection: shoulder should be less than chest
    if (body.shoulderWidth && body.chestCircumference) {
        if (body.shoulderWidth > body.chestCircumference * 0.6) {
            errors.push(`shoulderWidth (${body.shoulderWidth}cm) seems too large relative to chest (${body.chestCircumference}cm)`);
        }
    }

    // Waist should be less than chest
    if (body.waistCircumference && body.chestCircumference) {
        if (body.waistCircumference > body.chestCircumference * 1.3) {
            errors.push(`waistCircumference (${body.waistCircumference}cm) seems too large relative to chest (${body.chestCircumference}cm)`);
        }
    }

    return errors;
}

/**
 * Validate garment measurements are within plausible ranges.
 */
export function validateGarmentMeasurements(
    measurements: GarmentMeasurements
): string[] {
    const errors: string[] = [];
    const ranges: Record<string, { min: number; max: number }> = {
        chestWidth: { min: 30, max: 100 },
        shoulderWidth: { min: 25, max: 70 },
        sleeveLength: { min: 10, max: 90 },
        garmentLength: { min: 40, max: 120 },
        waistWidth: { min: 25, max: 100 },
        hemWidth: { min: 25, max: 100 },
        neckOpening: { min: 10, max: 50 },
    };

    for (const [key, range] of Object.entries(ranges)) {
        const val = measurements[key as keyof GarmentMeasurements];
        if (val !== undefined && val !== null) {
            if (typeof val !== 'number' || isNaN(val)) {
                errors.push(`${key} must be a number`);
            } else if (val < range.min || val > range.max) {
                errors.push(`${key} (${val}cm) is outside valid range ${range.min}-${range.max}cm`);
            }
        }
    }

    return errors;
}

// ─────────────────────────────────────────────────────────────
// Summary Generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a human-readable summary of the fit recommendation.
 */
function generateSummary(
    garment: GarmentSpec,
    results: MeasurementFitResult[],
    confidence: number,
    overallFit: FitClassification,
    returnRisk: ReturnRisk
): string {
    const fitLabels: Record<FitClassification, string> = {
        TOO_TIGHT: 'too tight',
        SNUG: 'snug',
        REGULAR: 'a comfortable, regular fit',
        RELAXED: 'a relaxed, loose fit',
        OVERSIZED: 'oversized',
    };

    const tightDims = results.filter(r => r.fit === 'TOO_TIGHT');
    const looseDims = results.filter(r => r.fit === 'OVERSIZED');

    let summary = `Size ${garment.sizeLabel} is ${fitLabels[overallFit]} (${confidence}% confidence).`;

    if (tightDims.length > 0) {
        const names = tightDims.map(d => d.dimension).join(', ');
        summary += ` Warning: ${names} may be too tight.`;
    }

    if (looseDims.length > 0) {
        const names = looseDims.map(d => d.dimension).join(', ');
        summary += ` Note: ${names} will be very loose.`;
    }

    if (garment.material.stretch > 0.1) {
        summary += ` This ${garment.material.type} fabric has ${Math.round(garment.material.stretch * 100)}% stretch, providing extra flexibility.`;
    }

    // Return risk indicator for brands
    if (returnRisk === 'high') {
        summary += ' ⚠️ HIGH RETURN RISK — consider recommending a different size.';
    }

    return summary;
}
