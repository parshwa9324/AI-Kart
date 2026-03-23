import { NextResponse } from 'next/server';
import { AIKartSaaSClient, AIKartSaaSError } from '@/services/SaaSClient';
import type { SizeRecommendationRequest } from '@/services/SaaSClient';
import { MOCK_GARMENT_DATABASE } from '@/data/mockGarments'; // We will create this

// Initialize the SaaS SDK Client (Simulating what a brand's server would do)
const saasClient = new AIKartSaaSClient('ak_test_12345');

export async function POST(request: Request) {
    try {
        const body = await request.json() as Partial<SizeRecommendationRequest>;

        // Basic Request Validation
        if (!body.brandId || !body.garmentId || !body.bodyMeasurements) {
            return NextResponse.json(
                { error: 'Missing required fields: brandId, garmentId, bodyMeasurements' },
                { status: 400 }
            );
        }

        // Lookup Garment from simulated DB
        const garment = MOCK_GARMENT_DATABASE.find(g => g.id === body.garmentId);
        if (!garment) {
            // In a real B2B setup, this means the brand passed an invalid SKU
            return NextResponse.json(
                { error: `Garment ${body.garmentId} not found in brand catalog.` },
                { status: 404 }
            );
        }

        // Process via SaaS SDK
        const response = await saasClient.getRecommendation(
            body as SizeRecommendationRequest,
            garment
        );

        return NextResponse.json(response);

    } catch (error) {
        console.error('API Error:', error);

        // Handle structured SaaS errors uniquely
        if (error instanceof AIKartSaaSError) {
            const status = error.code.startsWith('AK-4') ? 400 : 500;
            return NextResponse.json(
                {
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details
                    }
                },
                { status }
            );
        }

        // Fallback unhandled
        return NextResponse.json(
            { error: 'Internal Server Error', code: 'AK-5000' },
            { status: 500 }
        );
    }
}
