/**
 * GarmentCatalog.ts — Sample Garment Catalog
 *
 * Fully typed GarmentSpec objects with real-world measurements
 * for every garment in the existing asset library.
 *
 * Each garment is available in S/M/L/XL so the SizeEngine
 * can recommend the best size.
 *
 * Measurements are in centimeters, based on standard
 * industry sizing for men's upper-body garments.
 */

import type { GarmentSpec, SizeLabel } from '../types/types';
import { DEFAULT_MATERIALS } from '../types/types';

// ─────────────────────────────────────────────────────────────
// Measurement Templates (per size)
// ─────────────────────────────────────────────────────────────

/**
 * Standard upper-body measurement table (cm).
 * Based on industry averages for men's garments.
 * chestWidth = half-chest flat measurement.
 */
const SIZE_TABLE: Record<SizeLabel, {
    chest: number;
    shoulder: number;
    sleeve: number;
    length: number;
    waist: number;
    hem: number;
    neck: number;
}> = {
    XXS: { chest: 42, shoulder: 39, sleeve: 56, length: 62, waist: 38, hem: 40, neck: 16 },
    XS: { chest: 45, shoulder: 41, sleeve: 58, length: 64, waist: 41, hem: 43, neck: 16.5 },
    S: { chest: 48, shoulder: 43, sleeve: 60, length: 67, waist: 44, hem: 46, neck: 17 },
    M: { chest: 52, shoulder: 46, sleeve: 63, length: 70, waist: 48, hem: 50, neck: 18 },
    L: { chest: 56, shoulder: 49, sleeve: 65, length: 73, waist: 52, hem: 54, neck: 19 },
    XL: { chest: 60, shoulder: 52, sleeve: 67, length: 76, waist: 56, hem: 58, neck: 20 },
    XXL: { chest: 64, shoulder: 55, sleeve: 69, length: 78, waist: 60, hem: 62, neck: 21 },
    '3XL': { chest: 68, shoulder: 58, sleeve: 71, length: 80, waist: 64, hem: 66, neck: 22 },
    '4XL': { chest: 72, shoulder: 61, sleeve: 73, length: 82, waist: 68, hem: 70, neck: 23 },
};

/** Helper: create GarmentSpec for a garment in a specific size */
function makeSpec(
    baseId: string,
    name: string,
    category: GarmentSpec['category'],
    sizeLabel: SizeLabel,
    photoUrl: string,
    materialKey: keyof typeof DEFAULT_MATERIALS,
    model3dUrl?: string,
    thumbnailUrl?: string,
): GarmentSpec {
    const s = SIZE_TABLE[sizeLabel];
    return {
        id: `${baseId}_${sizeLabel.toLowerCase()}`,
        brandId: 'aikart_demo',
        name: `${name} — ${sizeLabel}`,
        category,
        sizeLabel,
        measurements: {
            chestWidth: s.chest,
            shoulderWidth: s.shoulder,
            sleeveLength: s.sleeve,
            garmentLength: s.length,
            waistWidth: s.waist,
            hemWidth: s.hem,
            neckOpening: s.neck,
        },
        material: DEFAULT_MATERIALS[materialKey],
        photoUrl,
        model3dUrl,
        thumbnailUrl,
        createdAt: '2026-03-01T00:00:00Z',
    };
}

// ─────────────────────────────────────────────────────────────
// Available Sizes
// ─────────────────────────────────────────────────────────────

const AVAILABLE_SIZES: SizeLabel[] = ['S', 'M', 'L', 'XL'];

// ─────────────────────────────────────────────────────────────
// Catalog Entries
// ─────────────────────────────────────────────────────────────

/** Catalog entry: a garment with all its available sizes */
export interface CatalogEntry {
    /** Display name */
    name: string;
    /** Category */
    category: GarmentSpec['category'];
    /** URL to the primary display asset (image or 3D model) */
    displayUrl: string;
    /** Optional 3D model URL */
    model3dUrl?: string;
    /** Material type key */
    materialKey: keyof typeof DEFAULT_MATERIALS;
    /** All available sizes as full GarmentSpec objects */
    sizes: GarmentSpec[];
    /** Default GarmentSpec (usually M) */
    defaultSpec: GarmentSpec;
}

/** Create a full catalog entry with all sizes */
function makeCatalogEntry(
    id: string,
    name: string,
    category: GarmentSpec['category'],
    photoUrl: string,
    materialKey: keyof typeof DEFAULT_MATERIALS,
    model3dUrl?: string,
): CatalogEntry {
    const sizes = AVAILABLE_SIZES.map(size =>
        makeSpec(id, name, category, size, photoUrl, materialKey, model3dUrl)
    );
    return {
        name,
        category,
        displayUrl: model3dUrl ?? photoUrl,
        model3dUrl,
        materialKey,
        sizes,
        defaultSpec: sizes.find(s => s.sizeLabel === 'M') ?? sizes[0],
    };
}

// ─────────────────────────────────────────────────────────────
// The Catalog
// ─────────────────────────────────────────────────────────────

export const GARMENT_CATALOG: CatalogEntry[] = [
    makeCatalogEntry(
        'lowpoly_jacket',
        'Casual Jacket',
        'jacket',
        '/garments/3d-assets/free_lowpoly_jacket.glb',
        'polyester',
        '/garments/3d-assets/free_lowpoly_jacket.glb',
    ),
    makeCatalogEntry(
        'tshirt_3d',
        'Classic T-Shirt',
        'tshirt',
        '/garments/3d-assets/short_sleeve_t-_shirt.glb',
        'cotton',
        '/garments/3d-assets/short_sleeve_t-_shirt.glb',
    ),
    makeCatalogEntry(
        'tshirt_white',
        'White Cotton Tee',
        'tshirt',
        '/garments/canonical/tshirt_white.png',
        'cotton',
    ),
    makeCatalogEntry(
        'longsleeve_black',
        'Black Long Sleeve',
        'longsleeve',
        '/garments/canonical/tshirt_black_long.png',
        'cotton_blend',
    ),
];

/**
 * Find a GarmentSpec for a specific garment and size.
 *
 * @param catalogIndex - Index in GARMENT_CATALOG
 * @param size - Size label (S/M/L/XL)
 * @returns The matching GarmentSpec, or the default if size not found
 */
export function getGarmentSpec(catalogIndex: number, size: SizeLabel): GarmentSpec {
    const entry = GARMENT_CATALOG[catalogIndex];
    if (!entry) return GARMENT_CATALOG[0].defaultSpec;
    return entry.sizes.find(s => s.sizeLabel === size) ?? entry.defaultSpec;
}
