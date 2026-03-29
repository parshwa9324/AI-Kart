/**
 * APIClient.ts — Typed API Client for AI-Kart Backend
 *
 * Clean abstraction layer between the Next.js frontend and the
 * future Python/FastAPI backend.
 *
 * Currently returns mock data for local development.
 * When the backend is ready, flip `USE_MOCK` to false and set
 * the `BASE_URL` to your FastAPI server.
 *
 * All request/response types are imported from types.ts to ensure
 * type safety across the entire stack.
 */

import type {
    BodyScanRequest,
    BodyScanResponse,
    GarmentUploadRequest,
    GarmentSpec,
    TryOnRenderRequest,
    TryOnRenderResponse,
    SizeRecommendation,
    UserBodyProfile,
    UserBodyMeasurements,
    CrossBrandSizeResult,
    BrandSizeChart,
} from '../types/types';
import { recommendSize, compareBrandSizes, analyzeGarmentFit } from './SizeEngine';

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

/** Set to false when the Python backend is deployed */
const USE_MOCK = false;

/** FastAPI backend URL — update when deployed */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

/** Request timeout in milliseconds */
const TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────

class APIError extends Error {
    constructor(
        public status: number,
        message: string,
        public details?: unknown
    ) {
        super(message);
        this.name = 'APIError';
    }
}

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        // Determine headers: if body is FormData, let the browser set the Content-Type with boundary
        const isFormData = options.body instanceof FormData;
        const headers: HeadersInit = { ...options.headers };
        if (!isFormData) {
            (headers as any)['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            signal: controller.signal,
            headers,
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw new APIError(
                response.status,
                `API request failed: ${response.statusText}`,
                errorBody
            );
        }

        return await response.json() as T;
    } catch (err) {
        if (err instanceof APIError) throw err;
        if (err instanceof DOMException && err.name === 'AbortError') {
            throw new APIError(408, 'Request timed out');
        }
        throw new APIError(0, `Network error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
        clearTimeout(timeout);
    }
}

/** Async delay helper */
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Progress update callback for real-time UI streaming */
export type ProgressCallback = (update: {
    progressPct: number;
    status: string;
    detail?: string;
    elapsedMs: number;
    attempt?: number;
    slaWarning?: string;
}) => void;

/**
 * Phase 16: Poll the job status endpoint with real-time progress streaming.
 * The GPU worker updates Redis with progress_pct at each inference milestone.
 * This function reads that value and calls onProgress so the UI progress bar is live.
 */
async function pollUntilComplete(
    jobId: string,
    opts: {
        maxWaitMs: number;
        intervalMs: number;
        onProgress?: ProgressCallback;
    }
): Promise<import('../types/types').TryOnRenderResponse> {
    const start = Date.now();

    while (Date.now() - start < opts.maxWaitMs) {
        await delay(opts.intervalMs);

        const result = await request<import('../types/types').TryOnRenderResponse>(
            `/api/v1/tryon/status/${jobId}`
        );

        // Stream progress to the UI callback
        if (opts.onProgress) {
            opts.onProgress({
                progressPct: result.progressPct ?? 0,
                status: result.status,
                detail: (result as any).progressDetail,
                elapsedMs: Date.now() - start,
                attempt: result.attempt,
                slaWarning: result.slaWarning,
            });
        }

        if (result.status === 'completed' && result.imageUrl) {
            return result;
        }

        if (result.status === 'failed') {
            throw new APIError(
                500,
                `GPU render failed after ${result.attempt ?? 1} attempt(s): ${result.error || 'Unknown error'}`
            );
        }

        // 'queued', 'processing', or 'retrying' — keep polling
    }

    throw new APIError(
        408,
        `Try-on render timed out after ${opts.maxWaitMs / 1000}s. GPU worker may be overloaded.`
    );
}

// ─────────────────────────────────────────────────────────────
// API Client
// ─────────────────────────────────────────────────────────────

export const AIKartAPI = {
    /**
     * Fire-and-forget try-on telemetry batch.
     * Never throws to the caller; returns false on any transport issue.
     */
    async sendTryOnTelemetry(events: Array<{
        event: string;
        ts: string;
        payload: Record<string, unknown>;
    }>): Promise<boolean> {
        if (events.length === 0) return true;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4_000);
            try {
                const response = await fetch(`${BASE_URL}/api/v1/telemetry/tryon`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ events: events.slice(0, 200) }),
                    keepalive: true,
                    signal: controller.signal,
                });
                // If endpoint is unavailable in a given environment, drop silently.
                if (response.status === 404 || response.status === 401 || response.status === 403) {
                    return true;
                }
                return response.ok;
            } finally {
                clearTimeout(timeout);
            }
        } catch {
            return false;
        }
    },

    /**
     * Scan user's body to extract measurements.
     * Sends photo to SAM 3D Body on the backend.
     *
     * @param req - Photo (base64 or URL) + user height
     * @returns Body profile with measurements in cm
     */
    async scanBody(req: BodyScanRequest): Promise<BodyScanResponse> {
        if (USE_MOCK) return mockScanBody(req);

        const formData = new FormData();
        const photo: any = req.photo; // Allow Blob / File types internally
        
        if (photo instanceof Blob) {
            formData.append('frontImage', photo, 'front.png');
        } else if (typeof photo === 'string' && photo.startsWith('blob:')) {
            const res = await fetch(photo);
            const blob = await res.blob();
            formData.append('frontImage', blob, 'front.png');
            URL.revokeObjectURL(photo); // Prevent memory crash
        } else if (typeof photo === 'string' && photo.startsWith('data:image')) {
            const res = await fetch(photo);
            const blob = await res.blob();
            formData.append('frontImage', blob, 'front.png');
        } else {
            formData.append('frontImage', photo);
        }
        
        formData.append('anchorHeightMm', '53.98');
        formData.append('anchorWidthMm', '85.60');

        return request<BodyScanResponse>('/api/v1/spatial/extract', {
            method: 'POST',
            body: formData,
        });
    },

    /**
     * Upload a garment for digitization.
     * Backend segments the flat-lay photo, detects keypoints,
     * and extracts centimeter measurements.
     *
     * @param req - Photo + metadata (brand, size, material)
     * @returns Complete garment specification
     */
    async uploadGarment(req: GarmentUploadRequest): Promise<GarmentSpec> {
        if (USE_MOCK) return mockUploadGarment(req);

        const formData = new FormData();
        const photo: any = req.photo;
        
        if (photo instanceof Blob) {
            formData.append('garmentImage', photo, 'garment.png');
        } else if (typeof photo === 'string' && photo.startsWith('blob:')) {
            const res = await fetch(photo);
            const blob = await res.blob();
            formData.append('garmentImage', blob, 'garment.png');
            URL.revokeObjectURL(photo); // Prevent memory crash
        } else if (typeof photo === 'string' && photo.startsWith('data:image')) {
            const res = await fetch(photo);
            const blob = await res.blob();
            formData.append('garmentImage', blob, 'garment.png');
        } else {
            formData.append('garmentImage', photo);
        }
        
        // Send metadata if needed by FastAPI
        formData.append('metadata', JSON.stringify(req.metadata));

        return request<GarmentSpec>('/api/v1/garment/digitize', {
            method: 'POST',
            body: formData,
        });
    },

    /**
     * Request a photorealistic virtual try-on render.
     *
     * Phase 16 Architecture:
     * 1. POST to /api/v1/tryon/render → returns jobId immediately (< 100ms)
     * 2. If status is already 'completed' (sync fallback mode), use imageUrl directly
     * 3. If status is 'queued'/'processing', poll /api/v1/tryon/status/{jobId} every 2s
     * 4. Resolve when status is 'completed' or throw on 'failed'/timeout
     *
     * @param req - User photo + garment ID
     * @returns Completed try-on response with imageUrl
     */
    async renderTryOn(
        req: TryOnRenderRequest,
        onProgress?: ProgressCallback
    ): Promise<TryOnRenderResponse> {
        if (USE_MOCK) return mockRenderTryOn(req);

        // Step 1: Submit render job — returns immediately with jobId (<100ms)
        const submission = await request<TryOnRenderResponse>('/api/v1/tryon/render', {
            method: 'POST',
            body: JSON.stringify(req),
        });

        // Step 2: If already completed (sync fallback mode), return directly
        if (submission.status === 'completed' && submission.imageUrl) {
            onProgress?.({ progressPct: 100, status: 'completed', elapsedMs: 0 });
            return submission;
        }

        // Step 3: Poll for completion with live progress streaming
        return pollUntilComplete(submission.jobId!, {
            maxWaitMs: 90_000,   // 90s hard timeout
            intervalMs: 1_500,   // Poll every 1.5s for snappy progress bar
            onProgress,
        });
    },

    /**
     * Get size recommendation for a body + garment combination.
     * Phase 22: Calls backend /api/v1/size/recommend with fallback to client-side.
     *
     * @param body - User's body measurements
     * @param garment - Garment specification
     * @returns Size recommendation with confidence score
     */
    async getRecommendation(
        body: UserBodyProfile,
        garment: GarmentSpec
    ): Promise<SizeRecommendation> {
        try {
            const resp = await request<{ recommendation: SizeRecommendation }>('/api/v1/size/recommend', {
                method: 'POST',
                body: JSON.stringify({
                    body: {
                        chestCircumference: body.measurements.chestCircumference,
                        waistCircumference: body.measurements.waistCircumference,
                        hipCircumference: body.measurements.hipCircumference,
                        shoulderWidth: body.measurements.shoulderWidth,
                        armLength: body.measurements.armLength,
                        torsoLength: body.measurements.torsoLength,
                        heightCm: body.heightCm,
                    },
                    garment: {
                        id: garment.id,
                        sizeLabel: garment.sizeLabel,
                        garmentType: ((garment as unknown) as { garmentType?: string }).garmentType || 'shirt',
                        measurements: garment.measurements,
                        material: garment.material,
                    },
                }),
            });
            return resp.recommendation;
        } catch {
            // Fallback to client-side SizeEngine for resilience
            return analyzeGarmentFit(body.measurements, garment);
        }
    },

    /**
     * Compare sizes across multiple brands.
     * Phase 22: Calls backend /api/v1/size/compare-brands
     * "You're a Zegna M, Prada 48, LV L"
     */
    async compareBrands(
        body: UserBodyMeasurements,
        brands: BrandSizeChart[]
    ): Promise<CrossBrandSizeResult[]> {
        try {
            const resp = await request<{ results: CrossBrandSizeResult[]; summary: string }>('/api/v1/size/compare-brands', {
                method: 'POST',
                body: JSON.stringify({
                    body: {
                        chestCircumference: body.chestCircumference,
                        waistCircumference: body.waistCircumference,
                        shoulderWidth: body.shoulderWidth,
                    },
                    brand_ids: [],
                }),
            });
            return resp.results;
        } catch {
            // Fallback to client-side
            return compareBrandSizes(body, brands);
        }
    },

    /**
     * Fetch the material stretch database from the backend.
     * Phase 22: Brand employees use this when uploading garments.
     */
    async getMaterials(): Promise<Record<string, { stretch_pct: number; stretch_factor: number }>> {
        try {
            const resp = await request<{ materials: Record<string, { stretch_pct: number; stretch_factor: number }> }>('/api/v1/size/materials');
            return resp.materials;
        } catch {
            // Hardcoded fallback for offline mode
            return {
                cotton: { stretch_pct: 3, stretch_factor: 0.03 },
                cotton_blend: { stretch_pct: 5, stretch_factor: 0.05 },
                cotton_spandex: { stretch_pct: 15, stretch_factor: 0.15 },
                silk: { stretch_pct: 1, stretch_factor: 0.01 },
                linen: { stretch_pct: 2, stretch_factor: 0.02 },
                polyester: { stretch_pct: 5, stretch_factor: 0.05 },
                wool: { stretch_pct: 4, stretch_factor: 0.04 },
                cashmere: { stretch_pct: 8, stretch_factor: 0.08 },
                leather: { stretch_pct: 1, stretch_factor: 0.01 },
                denim: { stretch_pct: 3, stretch_factor: 0.03 },
                stretch_denim: { stretch_pct: 18, stretch_factor: 0.18 },
                jersey: { stretch_pct: 12, stretch_factor: 0.12 },
            };
        }
    },

    /**
     * Poll the status of a try-on render job.
     * Exposed publicly for external polling if needed.
     *
     * @param jobId - Job ID from renderTryOn response
     * @returns Current job status
     */
    async pollRenderStatus(jobId: string): Promise<TryOnRenderResponse> {
        if (USE_MOCK) return mockPollStatus(jobId);
        return request<TryOnRenderResponse>(`/api/v1/tryon/status/${jobId}`);
    },

    /**
     * Scan user's body to extract measurements using the new /body/scan endpoint.
     * Phase 18: Sends photo + height to SAM 3D Body or anthropometric fallback.
     */
    async scanBodyMeasurements(heightCm: number, photo?: string, gender?: string) {
        return request<{ status: string; measurements: Record<string, number>; }>('/api/v1/body/scan', {
            method: 'POST',
            body: JSON.stringify({ heightCm, photo, gender }),
        });
    },

    // ── Physical Twin — Profile Persistence ──────────────────────
    // Connects frontend localStorage session_token to backend SQLite.
    // Enables "Welcome back — Physical Twin restored" on repeat visits.

    /**
     * Save the user's Physical Twin body profile to persistent storage.
     * Called after body scan calibration completes successfully.
     */
    async saveProfile(profile: {
        session_token: string;
        height_cm?: number;
        weight_kg?: number;
        gender?: string;
        chest_cm?: number;
        waist_cm?: number;
        hip_cm?: number;
        shoulder_cm?: number;
        inseam_cm?: number;
        sleeve_cm?: number;
        neck_cm?: number;
        scan_method?: string;
        confidence_score?: number;
        consent_given_at?: string;
    }): Promise<{ status: string; session_token: string; updated_at: string }> {
        return request('/api/v1/profile/save', {
            method: 'POST',
            body: JSON.stringify(profile),
        });
    },

    /**
     * Load a previously saved Physical Twin profile.
     * Called on app boot with the session token from localStorage.
     * Returns 404 if no profile exists for this token.
     */
    async loadProfile(sessionToken: string): Promise<{
        status: string;
        profile: Record<string, unknown>;
    } | null> {
        try {
            return await request(`/api/v1/profile/${sessionToken}`);
        } catch (err) {
            if (err instanceof APIError && err.status === 404) return null;
            throw err;
        }
    },

    /**
     * GDPR Right to Erasure — permanently delete all body scan data.
     * Called when the user clicks "Delete My Data" in privacy settings.
     */
    async deleteProfile(sessionToken: string): Promise<{ status: string; message: string }> {
        return request(`/api/v1/profile/${sessionToken}`, {
            method: 'DELETE',
        });
    },

    /**
     * Get real-time GPU health stats for the admin dashboard.
     * Returns VRAM usage, active renders, pipeline status.
     */
    async getGPUHealth(): Promise<Record<string, unknown>> {
        return request('/api/v1/gpu/health');
    },

    /**
     * Record GDPR Biometric Data Consent Timestamp
     */
    async recordConsent(session_uuid: string, consented: boolean): Promise<{ status: string }> {
        return request('/api/v1/consent', {
            method: 'POST',
            body: JSON.stringify({ session_uuid, consented }),
        });
    },
};

// ─────────────────────────────────────────────────────────────
// Mock Implementations (for local dev without backend)
// ─────────────────────────────────────────────────────────────

async function mockScanBody(req: BodyScanRequest): Promise<BodyScanResponse> {
    // Simulate network delay
    await delay(1500);

    // Generate realistic mock measurements based on height
    const h = req.heightCm;
    const profile: UserBodyProfile = {
        userId: `user_${Date.now()}`,
        heightCm: h,
        measurements: {
            chestCircumference: Math.round(h * 0.54),   // ~54% of height
            waistCircumference: Math.round(h * 0.44),   // ~44% of height
            hipCircumference: Math.round(h * 0.56),     // ~56% of height
            shoulderWidth: Math.round(h * 0.25),        // ~25% of height
            armLength: Math.round(h * 0.34),            // ~34% of height
            torsoLength: Math.round(h * 0.30),          // ~30% of height
            inseam: Math.round(h * 0.45),              // ~45% of height
            neckCircumference: Math.round(h * 0.22),    // ~22% of height
        },
        scanMethod: 'sam3d_body',
        measuredAt: new Date().toISOString(),
        confidence: 0.87,
    };

    return { profile };
}

async function mockUploadGarment(req: GarmentUploadRequest): Promise<GarmentSpec> {
    await delay(2000);

    // Generate realistic mock garment measurements based on size
    const sizeMeasurements: Record<string, { chest: number; shoulder: number; sleeve: number; length: number }> = {
        XS: { chest: 44, shoulder: 40, sleeve: 57, length: 63 },
        S: { chest: 48, shoulder: 43, sleeve: 60, length: 66 },
        M: { chest: 52, shoulder: 46, sleeve: 63, length: 70 },
        L: { chest: 56, shoulder: 49, sleeve: 65, length: 73 },
        XL: { chest: 60, shoulder: 52, sleeve: 67, length: 76 },
        XXL: { chest: 64, shoulder: 55, sleeve: 69, length: 78 },
    };

    const size = sizeMeasurements[req.metadata.sizeLabel] ?? sizeMeasurements['M'];

    return {
        id: `garment_${Date.now()}`,
        brandId: req.metadata.brandId,
        name: req.metadata.name,
        category: req.metadata.category,
        sizeLabel: req.metadata.sizeLabel,
        measurements: {
            chestWidth: size.chest,
            shoulderWidth: size.shoulder,
            sleeveLength: size.sleeve,
            garmentLength: size.length,
            waistWidth: size.chest - 4,
            hemWidth: size.chest - 2,
            neckOpening: 18,
        },
        material: req.metadata.material,
        photoUrl: '',
        createdAt: new Date().toISOString(),
    };
}

async function mockRenderTryOn(req: TryOnRenderRequest): Promise<TryOnRenderResponse> {
    await delay(3500); // Simulate GPU delay in mock mode
    return {
        jobId: `job_${Date.now()}`,
        status: 'completed',
        estimatedSeconds: 0,
        imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
    };
}

async function mockPollStatus(jobId: string): Promise<TryOnRenderResponse> {
    await delay(300);
    // In mock mode, always return completed
    return {
        jobId,
        status: 'completed',
        imageUrl: '/garments/canonical/tshirt_white.png', // placeholder
    };
}

