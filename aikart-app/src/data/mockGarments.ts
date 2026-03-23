import type { GarmentSpec } from '../types/types';

/**
 * Mock B2B Garment Database
 * Simulates a PostgreSQL database of digitized garments uploaded via brand portals.
 */
export const MOCK_GARMENT_DATABASE: GarmentSpec[] = [
    {
        id: 'grm_casual_jacket_123',
        brandId: 'brand_luxury_x',
        name: 'Classic Harrington Jacket',
        category: 'jacket',
        sizeLabel: 'M',
        measurements: {
            chestWidth: 55.0,     // 110cm circumference ease
            waistWidth: 51.0,
            shoulderWidth: 46.0,
            garmentLength: 68.0,
            sleeveLength: 64.0,
        },
        material: {
            type: 'cotton_blend',
            stretch: 0.05,
            drapeStiffness: 0.8,
            weight: 'medium'
        },
        photoUrl: '/garments/canonical/jacket_black.png',
        createdAt: '2023-10-15T08:30:00Z'
    },
    {
        id: 'grm_casual_jacket_124',
        brandId: 'brand_luxury_x',
        name: 'Classic Harrington Jacket',
        category: 'jacket',
        sizeLabel: 'L',
        measurements: {
            chestWidth: 58.0,     // 116cm
            waistWidth: 54.0,
            shoulderWidth: 48.0,
            garmentLength: 70.0,
            sleeveLength: 65.5,
        },
        material: {
            type: 'cotton_blend',
            stretch: 0.05,
            drapeStiffness: 0.8,
            weight: 'medium'
        },
        photoUrl: '/garments/canonical/jacket_black.png',
        createdAt: '2023-10-15T08:30:00Z'
    },
    {
        id: 'grm_essential_tee_881',
        brandId: 'brand_basics_y',
        name: 'Premium Supima Tee',
        category: 'tshirt',
        sizeLabel: 'M',
        measurements: {
            chestWidth: 51.0,     // 102cm
            waistWidth: 49.0,
            shoulderWidth: 44.0,
            garmentLength: 71.0,
            sleeveLength: 21.0,
        },
        material: {
            type: 'synthetic_blend',
            stretch: 0.15,
            drapeStiffness: 0.2,
            weight: 'light'
        },
        photoUrl: '/garments/canonical/tshirt_white.png',
        createdAt: '2023-11-20T14:15:00Z'
    }
];
