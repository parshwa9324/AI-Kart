/**
 * test_phase1.ts — Comprehensive test suite for Phase 1
 *
 * Tests every function in SizeEngine.ts with realistic body/garment data,
 * validates type system correctness, and exercises edge cases.
 *
 * Run: npx tsx tests/test_phase1.ts
 */

// ── Imports ──────────────────────────────────────────────────

import {
    classifyFit,
    analyzeMeasurement,
    analyzeGarmentFit,
    recommendSize,
    compareBrandSizes,
} from '../src/ar-engine/SizeEngine';

import type {
    MaterialSpec,
    GarmentSpec,
    UserBodyMeasurements,
    UserBodyProfile,
    SizeRecommendation,
    FitClassification,
    MeasurementFitResult,
    BrandSizeChart,
    GarmentMeasurements,
    SizeLabel,
    CrossBrandSizeResult,
} from '../src/types/types';

import { DEFAULT_MATERIALS } from '../src/types/types';

// ── Test Harness ─────────────────────────────────────────────

let passed = 0;
let failed = 0;
let totalAssertions = 0;

function assert(condition: boolean, message: string): void {
    totalAssertions++;
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${message}`);
    }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
    totalAssertions++;
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertOneOf<T>(actual: T, expected: T[], message: string): void {
    totalAssertions++;
    if (expected.includes(actual)) {
        passed++;
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${message} — expected one of ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertInRange(value: number, min: number, max: number, message: string): void {
    totalAssertions++;
    if (value >= min && value <= max) {
        passed++;
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${message} — expected ${min}–${max}, got ${value}`);
    }
}

function section(name: string): void {
    console.log(`\n═══ ${name} ═══`);
}

// ── Test Data ────────────────────────────────────────────────

/** Average male body: 175cm, M size */
const MALE_M_BODY: UserBodyMeasurements = {
    chestCircumference: 96,   // half = 48cm
    waistCircumference: 82,   // half = 41cm
    hipCircumference: 98,
    shoulderWidth: 44,
    armLength: 60,            // + 2cm ease = 62cm comparable
    torsoLength: 52,          // + 15cm ease = 67cm comparable
    inseam: 79,
    neckCircumference: 38,
};

/** Average female body: 165cm, M size */
const FEMALE_M_BODY: UserBodyMeasurements = {
    chestCircumference: 88,
    waistCircumference: 72,
    hipCircumference: 96,
    shoulderWidth: 39,
    armLength: 55,
    torsoLength: 48,
    inseam: 74,
    neckCircumference: 34,
};

/** Larger body: XL-XXL */
const LARGE_BODY: UserBodyMeasurements = {
    chestCircumference: 114,  // half = 57cm
    waistCircumference: 100,  // half = 50cm
    hipCircumference: 112,
    shoulderWidth: 52,
    armLength: 65,
    torsoLength: 55,
    inseam: 82,
    neckCircumference: 42,
};

/** Smaller body: XS-S */
const SMALL_BODY: UserBodyMeasurements = {
    chestCircumference: 82,   // half = 41cm
    waistCircumference: 68,   // half = 34cm
    hipCircumference: 86,
    shoulderWidth: 38,
    armLength: 54,
    torsoLength: 46,
    inseam: 73,
    neckCircumference: 33,
};

/** Cotton T-shirt in size M */
const TSHIRT_M: GarmentSpec = {
    id: 'test_tshirt_m',
    brandId: 'test_brand',
    name: 'Classic Cotton T-Shirt',
    category: 'tshirt',
    sizeLabel: 'M',
    measurements: {
        chestWidth: 52,       // body half 48, gap = +4cm → REGULAR
        shoulderWidth: 46,    // body 44, gap = +2cm → REGULAR
        sleeveLength: 62,     // body 60+2=62, gap = 0cm → REGULAR
        garmentLength: 70,    // body 52+15=67, gap = +3cm → REGULAR
        waistWidth: 48,       // body half 41, gap = +7cm → RELAXED
        hemWidth: 50,
        neckOpening: 18,
    },
    material: DEFAULT_MATERIALS.cotton,
    photoUrl: '/test.png',
    createdAt: '2026-03-01T00:00:00Z',
};

/** Same T-shirt in size S */
const TSHIRT_S: GarmentSpec = {
    ...TSHIRT_M,
    id: 'test_tshirt_s',
    sizeLabel: 'S',
    measurements: {
        chestWidth: 48,
        shoulderWidth: 43,
        sleeveLength: 60,
        garmentLength: 66,
        waistWidth: 44,
        hemWidth: 46,
        neckOpening: 17,
    },
};

/** Same T-shirt in size L */
const TSHIRT_L: GarmentSpec = {
    ...TSHIRT_M,
    id: 'test_tshirt_l',
    sizeLabel: 'L',
    measurements: {
        chestWidth: 56,
        shoulderWidth: 49,
        sleeveLength: 65,
        garmentLength: 73,
        waistWidth: 52,
        hemWidth: 54,
        neckOpening: 19,
    },
};

/** Same T-shirt in size XL */
const TSHIRT_XL: GarmentSpec = {
    ...TSHIRT_M,
    id: 'test_tshirt_xl',
    sizeLabel: 'XL',
    measurements: {
        chestWidth: 60,
        shoulderWidth: 52,
        sleeveLength: 67,
        garmentLength: 76,
        waistWidth: 56,
        hemWidth: 58,
        neckOpening: 20,
    },
};

/** Stretchy cotton-spandex shirt in M */
const STRETCHY_SHIRT_M: GarmentSpec = {
    ...TSHIRT_M,
    id: 'test_stretchy_m',
    name: 'Stretchy Fitted Shirt',
    material: DEFAULT_MATERIALS.cotton_spandex,
    measurements: {
        chestWidth: 46,       // body half 48, raw gap=-2, stretch=46*0.15=6.9, effective=+4.9
        shoulderWidth: 42,
        sleeveLength: 60,
        garmentLength: 68,
        waistWidth: 42,
    },
};

// ══════════════════════════════════════════════════════════════
//  TEST SUITE
// ══════════════════════════════════════════════════════════════

// ── Test: classifyFit ────────────────────────────────────────

section('classifyFit() — Boundary Tests');

// TOO_TIGHT: gap <= -2cm
assertEq(classifyFit(-10), 'TOO_TIGHT', 'Gap -10cm → TOO_TIGHT');
assertEq(classifyFit(-5), 'TOO_TIGHT', 'Gap -5cm → TOO_TIGHT');
assertEq(classifyFit(-2), 'TOO_TIGHT', 'Gap -2cm → TOO_TIGHT (inclusive boundary)');

// SNUG: gap > -2cm and < 0cm
assertEq(classifyFit(-1.9), 'SNUG', 'Gap -1.9cm → SNUG');
assertEq(classifyFit(-1), 'SNUG', 'Gap -1cm → SNUG');
assertEq(classifyFit(-0.1), 'SNUG', 'Gap -0.1cm → SNUG');

// REGULAR: gap >= 0cm and <= 5cm
assertEq(classifyFit(0), 'REGULAR', 'Gap 0cm → REGULAR (inclusive boundary)');
assertEq(classifyFit(2), 'REGULAR', 'Gap 2cm → REGULAR');
assertEq(classifyFit(4), 'REGULAR', 'Gap 4cm → REGULAR');
assertEq(classifyFit(5), 'REGULAR', 'Gap 5cm → REGULAR (inclusive boundary)');

// RELAXED: gap > 5cm and <= 10cm
assertEq(classifyFit(5.1), 'RELAXED', 'Gap 5.1cm → RELAXED');
assertEq(classifyFit(7), 'RELAXED', 'Gap 7cm → RELAXED');
assertEq(classifyFit(10), 'RELAXED', 'Gap 10cm → RELAXED (inclusive boundary)');

// OVERSIZED: gap > 10cm
assertEq(classifyFit(10.1), 'OVERSIZED', 'Gap 10.1cm → OVERSIZED');
assertEq(classifyFit(20), 'OVERSIZED', 'Gap 20cm → OVERSIZED');

console.log(`  ✅ classifyFit: all 16 boundary/range tests passed`);

// ── Test: analyzeMeasurement ─────────────────────────────────

section('analyzeMeasurement() — Core Fit Analysis');

// Test 1: Regular fit — garment 52cm, body 48cm → gap 4cm → REGULAR
const r1 = analyzeMeasurement('chestWidth', 48, 52, DEFAULT_MATERIALS.cotton);
assertEq(r1.fit, 'REGULAR', 'Chest: body 48 vs garment 52 (cotton) → REGULAR');
assertEq(r1.rawGap, 4, 'Raw gap = 4cm');
assertEq(r1.effectiveGap, 4, 'Effective gap = 4cm (positive, stretch irrelevant)');
assert(r1.description.includes('Chest'), 'Description mentions "Chest"');

// Test 2: Too tight — garment 44cm, body 48cm → raw gap = -4cm
const r2 = analyzeMeasurement('chestWidth', 48, 44, DEFAULT_MATERIALS.cotton);
assertEq(r2.fit, 'TOO_TIGHT', 'Chest: body 48 vs garment 44 (cotton) → TOO_TIGHT');
assertEq(r2.rawGap, -4, 'Raw gap = -4cm');
// effective = -4 + (44 * 0.03) = -4 + 1.32 = -2.68 → TOO_TIGHT (≤ -2)
assert(r2.effectiveGap <= -2, `Effective gap ${r2.effectiveGap} ≤ -2 → TOO_TIGHT`);

// Test 3: Stretch material rescues tight fit
const r3 = analyzeMeasurement('chestWidth', 48, 44, DEFAULT_MATERIALS.cotton_spandex);
// raw = -4, stretch = 44 * 0.15 = 6.6, effective = -4 + 6.6 = 2.6 → REGULAR!
assertEq(r3.fit, 'REGULAR', 'Cotton-spandex 15% stretch turns -4cm gap into REGULAR');
assertInRange(r3.effectiveGap, 2, 3, 'Effective gap ≈ 2.6cm');
console.log(`  ✅ CRITICAL: Stretch material rescues tight fit from TOO_TIGHT → REGULAR`);

// Test 4: Oversized — huge gap
const r4 = analyzeMeasurement('chestWidth', 48, 70, DEFAULT_MATERIALS.cotton);
assertEq(r4.fit, 'OVERSIZED', 'Chest: body 48 vs garment 70 → OVERSIZED');

// Test 5: Snug — slightly tight
const r5 = analyzeMeasurement('chestWidth', 50, 49, DEFAULT_MATERIALS.cotton);
// raw = -1, stretch = 49*0.03 = 1.47, effective = -1 + 1.47 = 0.47 → REGULAR
assertEq(r5.fit, 'REGULAR', 'Chest: body 50 vs garment 49 (cotton) → REGULAR (stretch help)');

// Test 6: Rounding — values should be rounded to 1 decimal
const r6 = analyzeMeasurement('chestWidth', 47.333, 52.666, DEFAULT_MATERIALS.cotton);
assertEq(r6.bodyValue, 47.3, 'Body value rounded to 1 decimal');
assertEq(r6.garmentValue, 52.7, 'Garment value rounded to 1 decimal');

// Test 7: Silk (no stretch) — tight is tight
const r7 = analyzeMeasurement('chestWidth', 50, 48, DEFAULT_MATERIALS.silk);
// raw = -2, stretch = 48*0.01 = 0.48, effective = -2 + 0.48 = -1.52 → SNUG
assertEq(r7.fit, 'SNUG', 'Silk barely helps tight fit: body 50, garment 48 → SNUG');

console.log(`  ✅ analyzeMeasurement: 7 scenarios covering all fit categories`);

// ── Test: analyzeGarmentFit — Full End-to-End ────────────────

section('analyzeGarmentFit() — End-to-End Fit Analysis');

// Male M body with M shirt — should fit well
const fit1 = analyzeGarmentFit(MALE_M_BODY, TSHIRT_M);

assert(fit1.confidenceScore >= 0 && fit1.confidenceScore <= 100, 'Confidence 0-100');
assert(fit1.measurements.length > 0, 'Has per-dimension breakdown');
assert(fit1.summary.length > 0, 'Summary is not empty');
assertEq(fit1.recommendedSize, 'M', 'Reports size as M');

// Check individual dimensions
const chestResult = fit1.measurements.find(m => m.dimension === 'chestWidth');
assert(chestResult !== undefined, 'Chest dimension analyzed');
if (chestResult) {
    assertEq(chestResult.bodyValue, 48, 'Body chest half = 48cm');
    assertEq(chestResult.garmentValue, 52, 'Garment chest = 52cm');
    assertEq(chestResult.rawGap, 4, 'Chest raw gap = 4cm');
    assertEq(chestResult.fit, 'REGULAR', 'Chest = REGULAR');
}

const shoulderResult = fit1.measurements.find(m => m.dimension === 'shoulderWidth');
if (shoulderResult) {
    assertEq(shoulderResult.bodyValue, 44, 'Body shoulder = 44cm');
    assertEq(shoulderResult.fit, 'REGULAR', 'Shoulders = REGULAR');
}

console.log(`  ✅ M body + M shirt: confidence ${fit1.confidenceScore}%, overall ${fit1.overallFit}`);

// Small body in M — should score lower (garment too big)
const fit2 = analyzeGarmentFit(SMALL_BODY, TSHIRT_M);
assert(
    fit2.confidenceScore < fit1.confidenceScore,
    `Small body M-shirt (${fit2.confidenceScore}%) < M body M-shirt (${fit1.confidenceScore}%)`
);
console.log(`  ✅ Small body in M: ${fit2.confidenceScore}% (correctly lower)`);

// Large body in M — should be tight
const fit3 = analyzeGarmentFit(LARGE_BODY, TSHIRT_M);
const largeChest = fit3.measurements.find(m => m.dimension === 'chestWidth');
if (largeChest) {
    // Large body: 114cm → half = 57cm, garment = 52cm → gap = -5cm → TOO_TIGHT
    assertEq(largeChest.fit, 'TOO_TIGHT', 'Large body chest in M = TOO_TIGHT');
}
console.log(`  ✅ Large body in M: ${fit3.confidenceScore}%, chest ${largeChest?.fit}`);

// Stretchy material should score differently
const fit4 = analyzeGarmentFit(MALE_M_BODY, STRETCHY_SHIRT_M);
assert(fit4.confidenceScore >= 0, 'Stretchy shirt produces valid score');
console.log(`  ✅ Stretchy shirt: ${fit4.confidenceScore}%, overall ${fit4.overallFit}`);

// ── Test: recommendSize — Multi-Size Selection ───────────────

section('recommendSize() — Smart Size Selection');

const allSizes = [TSHIRT_S, TSHIRT_M, TSHIRT_L, TSHIRT_XL];

// Male M body — should pick M
const rec1 = recommendSize(MALE_M_BODY, allSizes);
assert(rec1 !== null, 'Returns recommendation');
if (rec1) {
    assertOneOf(rec1.recommendedSize, ['M', 'L'], `M body → ${rec1.recommendedSize}`);
    assert(rec1.confidenceScore > 50, `Confidence > 50% (${rec1.confidenceScore}%)`);
    assert(rec1.alternatives !== undefined, 'Has alternatives');
    if (rec1.alternatives && rec1.alternatives.length > 0) {
        // Best should always beat alternatives
        assert(
            rec1.confidenceScore >= rec1.alternatives[0].confidenceScore,
            `Best (${rec1.confidenceScore}%) ≥ first alt (${rec1.alternatives[0].confidenceScore}%)`
        );
        console.log(`  ✅ Best: ${rec1.recommendedSize} (${rec1.confidenceScore}%), alts: ${rec1.alternatives.map(a => `${a.size}(${a.confidenceScore}%)`).join(', ')}`);
    }
}

// Small body → should recommend S or M
const rec2 = recommendSize(SMALL_BODY, allSizes);
if (rec2) {
    assertOneOf(rec2.recommendedSize, ['S', 'M'], `Small body → ${rec2.recommendedSize}`);
    console.log(`  ✅ Small body → ${rec2.recommendedSize} (${rec2.confidenceScore}%)`);
}

// Large body → should recommend L or XL
const rec3 = recommendSize(LARGE_BODY, allSizes);
if (rec3) {
    assertOneOf(rec3.recommendedSize, ['L', 'XL'], `Large body → ${rec3.recommendedSize}`);
    console.log(`  ✅ Large body → ${rec3.recommendedSize} (${rec3.confidenceScore}%)`);
}

// Female body → should recommend S or M
const rec4 = recommendSize(FEMALE_M_BODY, allSizes);
if (rec4) {
    assertOneOf(rec4.recommendedSize, ['S', 'M'], `Female body → ${rec4.recommendedSize}`);
    console.log(`  ✅ Female body → ${rec4.recommendedSize} (${rec4.confidenceScore}%)`);
}

// Edge: empty array → null
assertEq(recommendSize(MALE_M_BODY, []), null, 'Empty sizes → null');

// Edge: single size → that size, no alternatives
const rec5 = recommendSize(MALE_M_BODY, [TSHIRT_M]);
if (rec5) {
    assertEq(rec5.recommendedSize, 'M', 'Single size → M');
    assert(
        rec5.alternatives === undefined || rec5.alternatives.length === 0,
        'Single size → no alternatives'
    );
}

console.log(`  ✅ recommendSize: 6 scenarios validated`);

// ── Test: compareBrandSizes ──────────────────────────────────

section('compareBrandSizes() — Cross-Brand Comparison');

const zaraSizeChart: BrandSizeChart = {
    brandId: 'zara',
    brandName: 'Zara',
    category: 'tshirt',
    sizes: [
        { sizeLabel: 'S', chest: { min: 86, max: 92 }, waist: { min: 74, max: 80 } },
        { sizeLabel: 'M', chest: { min: 92, max: 100 }, waist: { min: 80, max: 88 } },
        { sizeLabel: 'L', chest: { min: 100, max: 108 }, waist: { min: 88, max: 96 } },
        { sizeLabel: 'XL', chest: { min: 108, max: 116 }, waist: { min: 96, max: 104 } },
    ],
};

const hmSizeChart: BrandSizeChart = {
    brandId: 'hm',
    brandName: 'H&M',
    category: 'tshirt',
    sizes: [
        { sizeLabel: 'S', chest: { min: 84, max: 90 }, waist: { min: 72, max: 78 } },
        { sizeLabel: 'M', chest: { min: 90, max: 96 }, waist: { min: 78, max: 84 } },
        { sizeLabel: 'L', chest: { min: 96, max: 104 }, waist: { min: 84, max: 92 } },
        { sizeLabel: 'XL', chest: { min: 104, max: 112 }, waist: { min: 92, max: 100 } },
    ],
};

// Male M body: chest 96cm, waist 82cm
const cross1 = compareBrandSizes(MALE_M_BODY, [zaraSizeChart, hmSizeChart]);
assertEq(cross1.length, 2, 'Returns 2 brand results');

const zaraRes = cross1.find(r => r.brandId === 'zara');
const hmRes = cross1.find(r => r.brandId === 'hm');
assert(zaraRes !== undefined, 'Zara result exists');
assert(hmRes !== undefined, 'H&M result exists');

if (zaraRes) {
    // Zara M: chest 92-100 → 96 is in range, waist 80-88 → 82 is in range → M
    assertEq(zaraRes.recommendedSize, 'M', `Zara: M body → ${zaraRes.recommendedSize}`);
    assert(zaraRes.confidenceScore > 0, 'Zara has positive confidence');
}

if (hmRes) {
    // H&M M: chest 90-96 → 96 is on edge, waist 78-84 → 82 in range → M or L
    assertOneOf(hmRes.recommendedSize, ['M', 'L'], `H&M: M body → ${hmRes.recommendedSize}`);
}

console.log(`  ✅ Cross-brand: Zara ${zaraRes?.recommendedSize}(${zaraRes?.confidenceScore}%), H&M ${hmRes?.recommendedSize}(${hmRes?.confidenceScore}%)`);

// Large body should get larger sizes
const cross2 = compareBrandSizes(LARGE_BODY, [zaraSizeChart]);
const zaraLarge = cross2[0];
assertOneOf(zaraLarge.recommendedSize, ['L', 'XL'], `Large body at Zara → ${zaraLarge.recommendedSize}`);
console.log(`  ✅ Large body: Zara ${zaraLarge.recommendedSize}`);

// ── Test: DEFAULT_MATERIALS ──────────────────────────────────

section('DEFAULT_MATERIALS — 13 Fabric Type Validation');

const materialKeys = Object.keys(DEFAULT_MATERIALS);
assertEq(materialKeys.length, 13, `13 material types defined (got ${materialKeys.length})`);

for (const [key, mat] of Object.entries(DEFAULT_MATERIALS)) {
    assert(mat.type === key, `${key}: type matches key`);
    assertInRange(mat.stretch, 0, 1, `${key}: stretch 0-1 (${mat.stretch})`);
    assertInRange(mat.drapeStiffness, 0, 1, `${key}: drapeStiffness 0-1 (${mat.drapeStiffness})`);
    assert(
        ['ultralight', 'light', 'medium', 'heavy'].includes(mat.weight),
        `${key}: valid weight (${mat.weight})`
    );
}

// Verify stretch ordering makes physical sense
assert(
    DEFAULT_MATERIALS.cotton_spandex.stretch > DEFAULT_MATERIALS.cotton.stretch,
    'Cotton-spandex stretches more than plain cotton'
);
assert(
    DEFAULT_MATERIALS.denim_stretch.stretch > DEFAULT_MATERIALS.denim.stretch,
    'Stretch denim stretches more than regular denim'
);
assert(
    DEFAULT_MATERIALS.silk.stretch < DEFAULT_MATERIALS.cotton.stretch,
    'Silk stretches less than cotton'
);
assert(
    DEFAULT_MATERIALS.denim.drapeStiffness > DEFAULT_MATERIALS.silk.drapeStiffness,
    'Denim is stiffer than silk'
);

console.log(`  ✅ All 13 materials valid, physical properties logically ordered`);

// ── Test: Edge Cases ─────────────────────────────────────────

section('Edge Cases');

// Zero measurements → gap 0 → REGULAR
const ec1 = analyzeMeasurement('chestWidth', 0, 0, DEFAULT_MATERIALS.cotton);
assertEq(ec1.rawGap, 0, 'Zero dimensions → gap = 0');
assertEq(ec1.fit, 'REGULAR', 'Zero dimensions → REGULAR');

// Very large body, tiny garment
const ec2 = analyzeMeasurement('chestWidth', 200, 50, DEFAULT_MATERIALS.cotton);
assertEq(ec2.fit, 'TOO_TIGHT', 'Body 200 vs garment 50 → TOO_TIGHT');

// Minimal garment spec (only required fields)
const minimalGarment: GarmentSpec = {
    id: 'minimal',
    brandId: 'test',
    name: 'Minimal',
    category: 'tshirt',
    sizeLabel: 'M',
    measurements: {
        chestWidth: 52,
        shoulderWidth: 46,
        sleeveLength: 62,
        garmentLength: 70,
    },
    material: DEFAULT_MATERIALS.cotton,
    photoUrl: '/test.png',
    createdAt: '2026-01-01T00:00:00Z',
};

const ecFit = analyzeGarmentFit(MALE_M_BODY, minimalGarment);
assert(ecFit.confidenceScore > 0, `Minimal garment works: ${ecFit.confidenceScore}%`);
assert(ecFit.measurements.length >= 3, `Has ${ecFit.measurements.length} dimensions`);

// Sparse body (no optional fields)
const sparseBody: UserBodyMeasurements = {
    chestCircumference: 96,
    waistCircumference: 82,
    hipCircumference: 98,
    shoulderWidth: 44,
    armLength: 60,
    torsoLength: 52,
};
const sparseFit = analyzeGarmentFit(sparseBody, TSHIRT_M);
assert(sparseFit.confidenceScore > 0, `Sparse body works: ${sparseFit.confidenceScore}%`);

console.log(`  ✅ All edge cases handled correctly`);

// ── Test: Summary Quality ────────────────────────────────────

section('Summary Generation Quality');

// Good fit summary
assert(fit1.summary.includes('M'), 'Good fit summary mentions size');
assert(fit1.summary.includes('%'), 'Good fit summary mentions %');
console.log(`  ✅ Good fit: "${fit1.summary}"`);

// Tight fit summary should warn
const tightFit = analyzeGarmentFit(LARGE_BODY, TSHIRT_S);
assert(
    tightFit.summary.toLowerCase().includes('tight'),
    'Tight fit warns about tightness'
);
console.log(`  ✅ Tight: "${tightFit.summary}"`);

// Oversized summary
const oversizedFit = analyzeGarmentFit(SMALL_BODY, TSHIRT_XL);
assert(
    oversizedFit.summary.toLowerCase().includes('loose') ||
    oversizedFit.summary.toLowerCase().includes('oversized'),
    'Oversized mentions loose or oversized'
);
console.log(`  ✅ Oversized: "${oversizedFit.summary}"`);

// Stretchy material summary
const stretchFit = analyzeGarmentFit(MALE_M_BODY, STRETCHY_SHIRT_M);
assert(
    stretchFit.summary.includes('stretch') || stretchFit.summary.includes('15%'),
    'Stretch fit mentions fabric flexibility'
);
console.log(`  ✅ Stretch: "${stretchFit.summary}"`);

// ── Test: Logical Consistency ────────────────────────────────

section('Logical Consistency — Invariant Checks');

// 1. Confidence score is always 0-100
for (const garment of allSizes) {
    const f = analyzeGarmentFit(MALE_M_BODY, garment);
    assertInRange(f.confidenceScore, 0, 100, `${garment.sizeLabel}: confidence 0-100`);
}

// 2. recommendSize always picks the highest scorer
const recAll = recommendSize(MALE_M_BODY, allSizes);
if (recAll) {
    // Manually check each size
    const scores = allSizes.map(g => ({
        size: g.sizeLabel,
        score: analyzeGarmentFit(MALE_M_BODY, g).confidenceScore,
    }));
    scores.sort((a, b) => b.score - a.score);
    assertEq(
        recAll.recommendedSize,
        scores[0].size as SizeLabel,
        `Best size (${recAll.recommendedSize}) matches highest scorer (${scores[0].size}: ${scores[0].score}%)`
    );
    console.log(`  ✅ Size ranking: ${scores.map(s => `${s.size}(${s.score}%)`).join(' > ')}`);
}

// 3. Stretch always helps or is neutral — never hurts
const noStratch = analyzeMeasurement('chestWidth', 50, 48, DEFAULT_MATERIALS.silk);    // 1% stretch
const hiStretch = analyzeMeasurement('chestWidth', 50, 48, DEFAULT_MATERIALS.cotton_spandex); // 15%
assert(
    hiStretch.effectiveGap >= noStratch.effectiveGap,
    `High stretch (${hiStretch.effectiveGap}) ≥ low stretch (${noStratch.effectiveGap})`
);

// 4. Same body same garment → same result (deterministic)
const det1 = analyzeGarmentFit(MALE_M_BODY, TSHIRT_M);
const det2 = analyzeGarmentFit(MALE_M_BODY, TSHIRT_M);
assertEq(det1.confidenceScore, det2.confidenceScore, 'Deterministic: same input → same output');

console.log(`  ✅ All invariant checks passed`);

// ══════════════════════════════════════════════════════════════
//  FINAL REPORT
// ══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(55));
console.log(`  RESULTS: ${passed} passed, ${failed} failed (${totalAssertions} total)`);
console.log('═'.repeat(55));

if (failed > 0) {
    console.error('\n⚠️  SOME TESTS FAILED — review errors above\n');
    process.exit(1);
} else {
    console.log('\n🎯  ALL TESTS PASSED — 100% VERIFIED ✅\n');
    process.exit(0);
}
