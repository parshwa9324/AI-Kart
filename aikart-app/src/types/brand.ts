export interface BrandConfig {
    id: string;
    name: string;
    slug: string; // Used for tenant URLs, e.g., sizes.aikart.com/brand
    logoUrl?: string;
    primaryColor?: string;

    // Return Risk Thresholds (Brands can configure when to show 'High Risk')
    returnRiskThresholds: {
        mediumRiskMinGap: number; // e.g., 2.5cm
        highRiskMinGap: number;   // e.g., 5.0cm
    };

    // Supported Dimensions for their size charts
    supportedDimensions: string[]; // e.g., ['chest', 'waist', 'hips', 'inseam']

    // Feature Flags for Brand Admin
    features: {
        enableVirtualTryOn: boolean;
        requireApprovalForUploads: boolean;
        showDataQualityScore: boolean;
    };

    createdAt: string;
    updatedAt: string;
}

export type GarmentCategory =
    | 'tshirt'
    | 'shirt'
    | 'sweater'
    | 'hoodie'
    | 'jacket'
    | 'pants'   // Added
    | 'jeans'   // Added
    | 'shorts'  // Added
    | 'dress'   // Added
    | 'skirt'   // Added
    | 'outerwear' // Added
    | 'longsleeve' // Unified from types.ts
    | 'blazer'    // Unified from types.ts
    | 'other';    // Fallback

export interface GarmentUploadRequest {
    id: string;
    brandId: string;
    name: string;
    sku: string;
    category: GarmentCategory;

    // Dimensional specs required
    dimensions: {
        chest?: number;
        waist?: number;
        hips?: number;
        shoulders?: number;
        length?: number;
        sleeves?: number;
        inseam?: number;
    };

    // Material composition for stretch approximation
    materialComposition: string; // e.g., "95% Cotton, 5% Elastane"
    stretchFactorEstimate?: number; // 1.0 (no stretch) to 1.3 (high stretch)

    // Associated digital assets
    images: {
        frontUrl: string;
        backUrl?: string;
    };

    status: 'draft' | 'pending_review' | 'approved' | 'rejected';

    submittedBy: string; // User ID of brand employee
    submittedAt: string;
}

export interface QualityAssuranceRecord {
    uploadRequestId: string;
    reviewerId: string;

    checks: {
        dimensionsPlausible: boolean;
        imageQualityAcceptable: boolean;
        materialStretchValid: boolean;
    };

    overallStatus: 'approved' | 'rejected' | 'needs_rework';
    notes?: string;
    reviewedAt: string;
}
