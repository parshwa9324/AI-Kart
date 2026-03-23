import type { GarmentSpec, SizeRecommendation, UserBodyMeasurements } from '../types/types';
import type { BrandConfig } from '../types/brand';
import { analyzeGarmentFit } from '../ar-engine/SizeEngine';

/**
 * Enterprise B2B SaaS SDK Error Taxonomy.
 * Luxury brands require highly granular error handling to gracefully degrade UI.
 */
export enum AIKartSaaSCode {
    // Input Validation Errors (400 level)
    ERR_BODY_DIM_MISSING = 'AK-4001',
    ERR_BODY_DIM_OUTLIER = 'AK-4002',
    ERR_GARMENT_DIM_INVALID = 'AK-4003',
    ERR_GARMENT_MISSING = 'AK-4004',

    // Logic & Engine Errors (400-500 level)
    ERR_NO_COMPATIBLE_SIZE = 'AK-4020',
    ERR_CONFIDENCE_TOO_LOW = 'AK-4021', // When even the best size fails brand's minimum threshold

    // Infrastructure Errors (500 level)
    ERR_TENANT_NOT_FOUND = 'AK-5001',
    ERR_RATE_LIMIT_EXCEEDED = 'AK-5029',
    ERR_ENGINE_TIMEOUT = 'AK-5008'
}

export class AIKartSaaSError extends Error {
    constructor(public code: AIKartSaaSCode, message: string, public details?: any) {
        super(message);
        this.name = 'AIKartSaaSError';
    }
}

/**
 * Mock API Request Payload Types 
 * Defining the contracts for the future Python Backend
 */
export interface SizeRecommendationRequest {
    brandId: string;
    garmentId: string;
    bodyMeasurements: UserBodyMeasurements;
    requireVisualTryOn?: boolean; // Flag to request VTON server task
}

export interface SizeRecommendationResponse {
    recommendation: SizeRecommendation;
    alternatives: SizeRecommendation[];
    vtonJobId?: string; // If VTON was requested
    metadata: {
        processedAt: string;
        engineVersion: string;
        brandConfigurationUsed: boolean;
    };
}

/**
 * AI-Kart Saas SDK Client
 * This simulates the infrastructure communication layer that brands will implement.
 */
export class AIKartSaaSClient {
    private apiKey: string;
    private tenantCache: Map<string, BrandConfig> = new Map();

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        if (!apiKey.startsWith('ak_live_') && !apiKey.startsWith('ak_test_')) {
            console.warn('AI-Kart SaaS: Using unverified API Key format.');
        }
    }

    /**
     * Fetch Brand Configuration
     * Resolves tenant-specific strictness (like custom return risk thresholds).
     */
    async getBrandConfig(brandId: string): Promise<BrandConfig> {
        if (this.tenantCache.has(brandId)) {
            return this.tenantCache.get(brandId)!;
        }

        // SIMULATING NETWORK CALL TO PYTHON BACKEND
        await new Promise(r => setTimeout(r, 150));

        // Hardcoded Mock Tenant Data (To be replaced with real API call)
        if (brandId === 'brand_luxury_x') {
            const config: BrandConfig = {
                id: 'brand_luxury_x',
                name: 'Maison Luxe',
                slug: 'maison-luxe',
                returnRiskThresholds: {
                    mediumRiskMinGap: 2.0, // Stricter than default
                    highRiskMinGap: 4.0,   // Stricter than default
                },
                supportedDimensions: ['chest', 'waist', 'shoulders', 'length', 'sleeves'],
                features: { enableVirtualTryOn: true, requireApprovalForUploads: true, showDataQualityScore: true },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            this.tenantCache.set(brandId, config);
            return config;
        }

        throw new AIKartSaaSError(AIKartSaaSCode.ERR_TENANT_NOT_FOUND, `Tenant ${brandId} not found.`);
    }

    /**
     * Core Recommendation Endpoint
     * Given user measurements and a garment, compute sizing according to Brand constraints.
     */
    async getRecommendation(
        request: SizeRecommendationRequest,
        garment: GarmentSpec // In a real API, the backend fetches this DB record via garmentId
    ): Promise<SizeRecommendationResponse> {

        // 1. Fetch Tenant Context
        const brandConfig = await this.getBrandConfig(request.brandId);

        // 2. Validate Inputs (Server-side defense)
        if (!request.bodyMeasurements.chestCircumference) {
            throw new AIKartSaaSError(
                AIKartSaaSCode.ERR_BODY_DIM_MISSING,
                'Chest circumference is required for tops.'
            );
        }

        // 3. Process via SizeEngine (This mimics the Python backend logic we will build)
        const result = analyzeGarmentFit(request.bodyMeasurements, garment, brandConfig);

        // 4. Brand Specific Logic enforcement
        if (result.confidenceScore < 60 && brandConfig.id === 'brand_luxury_x') {
            throw new AIKartSaaSError(
                AIKartSaaSCode.ERR_CONFIDENCE_TOO_LOW,
                'No suitable size could be found that meets brand standards.'
            );
        }

        return {
            recommendation: result,
            alternatives: [], // Simplified for mock
            metadata: {
                processedAt: new Date().toISOString(),
                engineVersion: '2.4.0-saas',
                brandConfigurationUsed: true
            }
        };
    }
}
