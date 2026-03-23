/**
 * types.ts — AI-Kart Core Type System
 *
 * Central type definitions for the entire platform.
 * Establishes data contracts between:
 *   - Frontend (Next.js)
 *   - Future Python backend (FastAPI)
 *   - Size intelligence engine
 *   - Brand admin dashboard
 *
 * Every garment, body measurement, and size recommendation
 * flows through these types.
 */

// ─────────────────────────────────────────────────────────────
// Material & Fabric
// ─────────────────────────────────────────────────────────────

/** Supported fabric material categories */
export type MaterialType =
    | 'cotton'
    | 'cotton_blend'
    | 'cotton_spandex'
    | 'linen'
    | 'silk'
    | 'polyester'
    | 'denim'
    | 'denim_stretch'
    | 'wool'
    | 'wool_knit'
    | 'nylon'
    | 'synthetic_blend'
    | 'other';

/** Fabric weight classification */
export type FabricWeight = 'ultralight' | 'light' | 'medium' | 'heavy';

/**
 * Material specification — defines how a fabric behaves.
 * Brand employees select these during garment upload.
 */
export interface MaterialSpec {
    /** Fabric category */
    type: MaterialType;

    /**
     * Stretch capability as a decimal (0.0 – 1.0).
     * e.g. 0.15 = 15% stretch.
     *
     * Reference values:
     *   Cotton:         0.02 – 0.05
     *   Cotton-Spandex: 0.10 – 0.20
     *   Linen:          0.01 – 0.03
     *   Silk:           0.00 – 0.02
     *   Polyester:      0.03 – 0.08
     *   Denim:          0.01 – 0.05
     *   Denim (stretch):0.15 – 0.20
     *   Wool knit:      0.05 – 0.15
     */
    stretch: number;

    /**
     * Drape stiffness on a 0–1 scale.
     * 0 = fluid silk, 1 = rigid denim.
     */
    drapeStiffness: number;

    /** Fabric weight classification */
    weight: FabricWeight;
}

/** Default material specs for common fabric types */
export const DEFAULT_MATERIALS: Record<MaterialType, MaterialSpec> = {
    cotton: { type: 'cotton', stretch: 0.03, drapeStiffness: 0.5, weight: 'medium' },
    cotton_blend: { type: 'cotton_blend', stretch: 0.06, drapeStiffness: 0.45, weight: 'medium' },
    cotton_spandex: { type: 'cotton_spandex', stretch: 0.15, drapeStiffness: 0.35, weight: 'medium' },
    linen: { type: 'linen', stretch: 0.02, drapeStiffness: 0.55, weight: 'light' },
    silk: { type: 'silk', stretch: 0.01, drapeStiffness: 0.10, weight: 'ultralight' },
    polyester: { type: 'polyester', stretch: 0.05, drapeStiffness: 0.40, weight: 'light' },
    denim: { type: 'denim', stretch: 0.03, drapeStiffness: 0.85, weight: 'heavy' },
    denim_stretch: { type: 'denim_stretch', stretch: 0.18, drapeStiffness: 0.65, weight: 'heavy' },
    wool: { type: 'wool', stretch: 0.04, drapeStiffness: 0.60, weight: 'heavy' },
    wool_knit: { type: 'wool_knit', stretch: 0.10, drapeStiffness: 0.35, weight: 'medium' },
    nylon: { type: 'nylon', stretch: 0.08, drapeStiffness: 0.30, weight: 'light' },
    synthetic_blend: { type: 'synthetic_blend', stretch: 0.07, drapeStiffness: 0.40, weight: 'light' },
    other: { type: 'other', stretch: 0.05, drapeStiffness: 0.50, weight: 'medium' },
};

// ─────────────────────────────────────────────────────────────
import type { GarmentCategory } from './brand';
// Garment Measurements & Specification
// ─────────────────────────────────────────────────────────────

/**
 * Real-world garment measurements in centimeters.
 * These are the dimensions of the garment itself, NOT the body.
 * Extracted from flat-lay photography or manual input by brand employees.
 */
export interface GarmentMeasurements {
    /** Half-chest width (seam to seam at chest level) */
    chestWidth: number;
    /** Shoulder seam to shoulder seam */
    shoulderWidth: number;
    /** Shoulder seam to cuff end */
    sleeveLength: number;
    /** Collar to hem */
    garmentLength: number;
    /** Half-waist width (at natural waist level) */
    waistWidth?: number;
    /** Bottom hem width */
    hemWidth?: number;
    /** Neck opening circumference */
    neckOpening?: number;
}

/** Standard size labels */
export type SizeLabel = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL' | '4XL';

/**
 * Complete garment specification.
 * Every garment in the platform is represented by this structure.
 * Brand employees create these during garment upload.
 */
export interface GarmentSpec {
    /** Unique garment ID */
    id: string;
    /** Brand identifier */
    brandId: string;
    /** Human-readable name */
    name: string;
    /** Garment category (matches SaaS infrastructure defined catalog) */
    category: GarmentCategory;
    /** Size label (brand-specific) */
    sizeLabel: SizeLabel;
    /** Real-world measurements in cm */
    measurements: GarmentMeasurements;
    /** Fabric material properties */
    material: MaterialSpec;
    /** URL to flat-lay product photo (for VTON rendering) */
    photoUrl: string;
    /** Optional URL to 3D model (.glb) for kiosk real-time preview */
    model3dUrl?: string;
    /** Optional URL to thumbnail image */
    thumbnailUrl?: string;
    /** ISO 8601 timestamp of when this was digitized */
    createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Body Measurements & User Profile
// ─────────────────────────────────────────────────────────────

/**
 * User body measurements in centimeters.
 * Extracted from SAM 3D Body (or manual input).
 * All circumference values are full circumference, not half.
 */
export interface UserBodyMeasurements {
    /** Full chest circumference */
    chestCircumference: number;
    /** Full waist circumference */
    waistCircumference: number;
    /** Full hip circumference */
    hipCircumference: number;
    /** Shoulder-to-shoulder distance (across back) */
    shoulderWidth: number;
    /** Shoulder to wrist (along arm) */
    armLength: number;
    /** Neck base to natural waist */
    torsoLength: number;
    /** Crotch to floor (inner leg) */
    inseam?: number;
    /** Neck circumference */
    neckCircumference?: number;
}

/** How the body measurements were obtained */
export type ScanMethod = 'sam3d_body' | 'manual_input' | 'depth_sensor' | 'mediapipe_estimated';

/**
 * Complete user body profile.
 * Created once during calibration, stored for returning customers.
 */
export interface UserBodyProfile {
    /** Unique user ID */
    userId: string;
    /** User's self-reported height in cm */
    heightCm: number;
    /** Extracted body measurements */
    measurements: UserBodyMeasurements;
    /** How the measurements were obtained */
    scanMethod: ScanMethod;
    /** ISO 8601 timestamp of last measurement */
    measuredAt: string;
    /** Confidence score 0–1 of the measurement accuracy */
    confidence: number;
}

// ─────────────────────────────────────────────────────────────
// Size Recommendation & Fit Analysis
// ─────────────────────────────────────────────────────────────

/** How a garment fits along one measurement dimension */
export type FitClassification =
    | 'TOO_TIGHT'   // effective gap < -2cm
    | 'SNUG'        // effective gap -2cm to 0cm
    | 'REGULAR'     // effective gap 0cm to 4cm
    | 'RELAXED'     // effective gap 4cm to 8cm
    | 'OVERSIZED';  // effective gap > 8cm

/** Fit analysis result for a single measurement dimension */
export interface MeasurementFitResult {
    /** Which dimension this is */
    dimension: keyof GarmentMeasurements;
    /** Body measurement value (cm) — converted to match garment convention */
    bodyValue: number;
    /** Garment measurement value (cm) */
    garmentValue: number;
    /** Raw gap: garment - body (positive = room, negative = tight) */
    rawGap: number;
    /** Gap after accounting for material stretch */
    effectiveGap: number;
    /** Fit classification */
    fit: FitClassification;
    /** Human-readable description */
    description: string;
}

/** Return risk — the single metric luxury brands care about most */
export type ReturnRisk = 'low' | 'medium' | 'high';

/**
 * Complete size recommendation.
 * The core value proposition of AI-Kart.
 */
export interface SizeRecommendation {
    /** Which size we recommend */
    recommendedSize: SizeLabel;
    /**
     * Overall fit confidence score (0–100).
     * 100 = perfect fit on all dimensions.
     */
    confidenceScore: number;
    /** Per-dimension fit breakdown */
    measurements: MeasurementFitResult[];
    /** Overall fit classification (weighted average) */
    overallFit: FitClassification;
    /**
     * Return-risk prediction based on fit analysis.
     * - 'low':    all dimensions REGULAR — almost no return risk
     * - 'medium': one dimension SNUG or RELAXED — some risk
     * - 'high':   any dimension TOO_TIGHT or OVERSIZED — likely return
     */
    returnRisk: ReturnRisk;
    /**
     * Data quality score (0–100).
     * How complete the input data was for this recommendation.
     * 100 = all 5 key dimensions had both body + garment data.
     * Low values mean the recommendation is based on incomplete data.
     */
    dataQuality: number;
    /** Human-readable summary */
    summary: string;
    /** Optional: alternative sizes to consider */
    alternatives?: Array<{
        size: SizeLabel;
        confidenceScore: number;
        overallFit: FitClassification;
        returnRisk: ReturnRisk;
    }>;
}

// ─────────────────────────────────────────────────────────────
// Brand Size Charts
// ─────────────────────────────────────────────────────────────

/**
 * A single size entry in a brand's size chart.
 * Defines the body measurement RANGES that a size is designed for.
 * Note: these are body measurements, not garment measurements.
 */
export interface SizeChartEntry {
    sizeLabel: SizeLabel;
    /** Min–max body chest circumference (cm) */
    chest: { min: number; max: number };
    /** Min–max body waist circumference (cm) */
    waist: { min: number; max: number };
    /** Min–max body shoulder width (cm) */
    shoulder?: { min: number; max: number };
}

/**
 * Brand-specific size chart.
 * Used for cross-brand comparison ("You're a Zara M, H&M L").
 */
export interface BrandSizeChart {
    brandId: string;
    brandName: string;
    /** Garment category this chart applies to */
    category: GarmentSpec['category'];
    /** Size entries ordered from smallest to largest */
    sizes: SizeChartEntry[];
}

// ─────────────────────────────────────────────────────────────
// API Types — Request/Response contracts for FastAPI backend
// ─────────────────────────────────────────────────────────────

/** Body scan request */
export interface BodyScanRequest {
    /** Base64-encoded photo or photo URL */
    photo: string;
    /** User's height in cm */
    heightCm: number;
    /** If true, photo is a URL; otherwise it's base64 data */
    isUrl?: boolean;
}

/** Body scan response */
export interface BodyScanResponse {
    profile: UserBodyProfile;
    /** Optional: 3D mesh URL for visualization */
    meshUrl?: string;
}

/** Garment upload request */
export interface GarmentUploadRequest {
    /** Base64-encoded flat-lay photo */
    photo: string;
    /** Brand employee's metadata input */
    metadata: {
        brandId: string;
        name: string;
        category: GarmentSpec['category'];
        sizeLabel: SizeLabel;
        material: MaterialSpec;
    };
    /** If true, use AI to extract measurements from photo */
    autoMeasure?: boolean;
    /** Manual measurements override (if not using AI extraction) */
    manualMeasurements?: Partial<GarmentMeasurements>;
}

/** Virtual try-on render request */
export interface TryOnRenderRequest {
    /** User photo (base64 or URL) */
    userPhoto: string;
    /** Garment ID to try on */
    garmentId: string;
    /** If true, include size recommendation in response */
    includeRecommendation?: boolean;
}

/** Virtual try-on render response */
export interface TryOnRenderResponse {
    /** Async job ID (poll for completion) */
    jobId: string;
    /** Status of the render */
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'retrying' | 'dead';
    /** URL to the rendered try-on image (available when status = completed) */
    imageUrl?: string;
    /** Size recommendation (if requested) */
    recommendation?: SizeRecommendation;
    /** Estimated processing time in seconds */
    estimatedSeconds?: number;
    /** Error message if status = failed */
    error?: string;
    /** GPU worker progress percentage (0-100) — drives the progress bar */
    progressPct?: number;
    /** SLA violation warning if job is stuck in queue */
    slaWarning?: string;
    /** Current retry attempt number */
    attempt?: number;
    /** Maximum retry attempts before DLQ */
    maxRetries?: number;
}

/** Cross-brand size comparison result */
export interface CrossBrandSizeResult {
    brandName: string;
    brandId: string;
    recommendedSize: SizeLabel;
    fit: FitClassification;
    confidenceScore: number;
}
