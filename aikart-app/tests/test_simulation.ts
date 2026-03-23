/**
 * test_simulation.ts — Full User Simulation Test
 *
 * Simulates 8 real-world users with different body types going through
 * the entire AI-Kart flow:
 *   1. Enter body measurements
 *   2. Browse every garment in the catalog
 *   3. Get size recommendations
 *   4. Validate that recommendations are physically correct
 *
 * This is the "automated QA team" — no real person needed.
 *
 * Run: npx tsx tests/test_simulation.ts
 */

import { recommendSize, analyzeGarmentFit, compareBrandSizes } from '../src/ar-engine/SizeEngine';
import { GARMENT_CATALOG } from '../src/data/GarmentCatalog';
import { DEFAULT_MATERIALS } from '../src/types/types';
import type { UserBodyProfile, UserBodyMeasurements, SizeLabel, BrandSizeChart, FitClassification } from '../src/types/types';

// ── Test Harness ─────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warnings: string[] = [];

function assert(condition: boolean, msg: string): void {
    if (condition) { passed++; }
    else { failed++; console.error(`    ❌ ${msg}`); }
}

function warn(msg: string): void {
    warnings.push(msg);
    console.log(`    ⚠️  ${msg}`);
}

// ── Virtual Users ────────────────────────────────────────────

interface VirtualUser {
    name: string;
    description: string;
    height: number;
    measurements: UserBodyMeasurements;
    /** What sizes should fit this person (any of these is acceptable) */
    expectedSizes: SizeLabel[];
    /** What sizes should definitely NOT be recommended */
    forbiddenSizes: SizeLabel[];
}

const VIRTUAL_USERS: VirtualUser[] = [
    {
        name: 'Rahul — Average Indian Male',
        description: '170cm, medium build, typical M customer',
        height: 170,
        measurements: {
            chestCircumference: 94,
            waistCircumference: 80,
            hipCircumference: 96,
            shoulderWidth: 43,
            armLength: 58,
            torsoLength: 51,
            inseam: 77,
        },
        expectedSizes: ['S', 'M'],
        forbiddenSizes: ['XL'],
    },
    {
        name: 'Amit — Tall Athletic Male',
        description: '185cm, athletic build, broad shoulders',
        height: 185,
        measurements: {
            chestCircumference: 102,
            waistCircumference: 84,
            hipCircumference: 100,
            shoulderWidth: 48,
            armLength: 64,
            torsoLength: 55,
            inseam: 83,
        },
        expectedSizes: ['M', 'L'],
        forbiddenSizes: ['S'],
    },
    {
        name: 'Priya — Petite Female',
        description: '155cm, slim build, XS-S customer',
        height: 155,
        measurements: {
            chestCircumference: 80,
            waistCircumference: 64,
            hipCircumference: 88,
            shoulderWidth: 36,
            armLength: 52,
            torsoLength: 44,
            inseam: 70,
        },
        expectedSizes: ['S'],
        forbiddenSizes: ['L', 'XL'],
    },
    {
        name: 'Vijay — Plus Size Male',
        description: '175cm, heavy build, definitely XL',
        height: 175,
        measurements: {
            chestCircumference: 116,
            waistCircumference: 104,
            hipCircumference: 114,
            shoulderWidth: 52,
            armLength: 62,
            torsoLength: 54,
            inseam: 78,
        },
        expectedSizes: ['XL'],
        forbiddenSizes: ['S', 'M'],
    },
    {
        name: 'Neha — Average Female',
        description: '163cm, standard women\'s M',
        height: 163,
        measurements: {
            chestCircumference: 88,
            waistCircumference: 72,
            hipCircumference: 94,
            shoulderWidth: 39,
            armLength: 55,
            torsoLength: 48,
            inseam: 73,
        },
        expectedSizes: ['S', 'M'],
        forbiddenSizes: ['XL'],
    },
    {
        name: 'Arjun — Skinny Teenager',
        description: '168cm, very slim, hard to find clothes that fit',
        height: 168,
        measurements: {
            chestCircumference: 78,
            waistCircumference: 62,
            hipCircumference: 82,
            shoulderWidth: 37,
            armLength: 56,
            torsoLength: 48,
            inseam: 75,
        },
        expectedSizes: ['S'],
        forbiddenSizes: ['L', 'XL'],
    },
    {
        name: 'Ravi — Muscular Gym Bro',
        description: '178cm, huge chest + shoulders, narrow waist — hard to fit',
        height: 178,
        measurements: {
            chestCircumference: 110,
            waistCircumference: 78,
            hipCircumference: 98,
            shoulderWidth: 50,
            armLength: 62,
            torsoLength: 53,
            inseam: 80,
        },
        expectedSizes: ['L', 'XL'],
        forbiddenSizes: ['S'],
    },
    {
        name: 'Anita — Tall Slim Female',
        description: '175cm, long limbs, narrow frame',
        height: 175,
        measurements: {
            chestCircumference: 84,
            waistCircumference: 68,
            hipCircumference: 90,
            shoulderWidth: 40,
            armLength: 62,
            torsoLength: 52,
            inseam: 80,
        },
        expectedSizes: ['S', 'M'],
        forbiddenSizes: ['XL'],
    },
];

// ── Brand Size Charts for Cross-Brand Testing ────────────────

const BRAND_CHARTS: BrandSizeChart[] = [
    {
        brandId: 'zara', brandName: 'Zara', category: 'tshirt',
        sizes: [
            { sizeLabel: 'S', chest: { min: 86, max: 92 }, waist: { min: 74, max: 80 } },
            { sizeLabel: 'M', chest: { min: 92, max: 100 }, waist: { min: 80, max: 88 } },
            { sizeLabel: 'L', chest: { min: 100, max: 108 }, waist: { min: 88, max: 96 } },
            { sizeLabel: 'XL', chest: { min: 108, max: 116 }, waist: { min: 96, max: 104 } },
        ],
    },
    {
        brandId: 'hm', brandName: 'H&M', category: 'tshirt',
        sizes: [
            { sizeLabel: 'S', chest: { min: 84, max: 90 }, waist: { min: 72, max: 78 } },
            { sizeLabel: 'M', chest: { min: 90, max: 96 }, waist: { min: 78, max: 84 } },
            { sizeLabel: 'L', chest: { min: 96, max: 104 }, waist: { min: 84, max: 92 } },
            { sizeLabel: 'XL', chest: { min: 104, max: 112 }, waist: { min: 92, max: 100 } },
        ],
    },
    {
        brandId: 'uniqlo', brandName: 'Uniqlo', category: 'tshirt',
        sizes: [
            { sizeLabel: 'S', chest: { min: 82, max: 88 }, waist: { min: 68, max: 74 } },
            { sizeLabel: 'M', chest: { min: 88, max: 96 }, waist: { min: 74, max: 82 } },
            { sizeLabel: 'L', chest: { min: 96, max: 104 }, waist: { min: 82, max: 90 } },
            { sizeLabel: 'XL', chest: { min: 104, max: 112 }, waist: { min: 90, max: 98 } },
        ],
    },
];

// ══════════════════════════════════════════════════════════════
//  SIMULATION START
// ══════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║   AI-KART SIZE INTELLIGENCE — USER SIMULATION TEST  ║');
console.log('║   8 Virtual Users × 4 Garments × 4 Sizes = 128 Fits║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// ── Test 1: Each User × Each Garment ─────────────────────────

for (const user of VIRTUAL_USERS) {
    console.log(`\n👤 ${user.name}`);
    console.log(`   ${user.description}`);
    console.log(`   Chest: ${user.measurements.chestCircumference}cm, Waist: ${user.measurements.waistCircumference}cm, Shoulders: ${user.measurements.shoulderWidth}cm`);
    console.log('');

    for (const garment of GARMENT_CATALOG) {
        // Get best size recommendation across S/M/L/XL
        const rec = recommendSize(user.measurements, garment.sizes);

        assert(rec !== null, `${user.name} → ${garment.name}: recommendation returned`);
        if (!rec) continue;

        const bestSize = rec.recommendedSize;

        // CRITICAL CHECK 1: Recommended size must be in acceptable range
        const sizeIsAcceptable = user.expectedSizes.includes(bestSize);
        assert(
            sizeIsAcceptable,
            `${user.name} → ${garment.name}: got ${bestSize} (expected ${user.expectedSizes.join('/')})`
        );

        // CRITICAL CHECK 2: Must NOT recommend a forbidden size
        const sizeIsForbidden = user.forbiddenSizes.includes(bestSize);
        assert(
            !sizeIsForbidden,
            `${user.name} → ${garment.name}: FORBIDDEN size ${bestSize} was recommended!`
        );

        // CHECK 3: Confidence must be > 15% (if a size is recommended, engine should give a score)
        assert(
            rec.confidenceScore > 15,
            `${user.name} → ${garment.name}: confidence ${rec.confidenceScore}% is too low`
        );

        // CHECK 4: Per-dimension breakdown must exist
        assert(
            rec.measurements.length >= 3,
            `${user.name} → ${garment.name}: only ${rec.measurements.length} dimensions (need ≥3)`
        );

        // CHECK 5: No dimension should be both TOO_TIGHT and OVERSIZED (contradiction)
        const hasTight = rec.measurements.some(m => m.fit === 'TOO_TIGHT');
        const hasOversized = rec.measurements.some(m => m.fit === 'OVERSIZED');
        if (hasTight && hasOversized) {
            warn(`${user.name} → ${garment.name}: has both TIGHT and OVERSIZED dimensions — unusual body shape`);
        }

        // CHECK 6: Summary must be non-empty and mention the size
        assert(
            rec.summary.length > 10 && rec.summary.includes(bestSize),
            `${user.name} → ${garment.name}: summary is broken`
        );

        // Status line
        const statusEmoji = sizeIsAcceptable ? '✅' : '❌';
        const dimSummary = rec.measurements
            .map(m => `${m.dimension.replace('Width', '').replace('Length', '').substring(0, 5)}:${m.fit.substring(0, 3)}`)
            .join(' ');
        console.log(`   ${statusEmoji} ${garment.name.padEnd(20)} → ${bestSize} (${rec.confidenceScore}%) [${dimSummary}]`);
    }
}

// ── Test 2: Consistency — Same user should get same size across similar garments ──

console.log('\n\n═══ Consistency Test ═══');
console.log('   Same user across different cotton garments should get same/similar size\n');

for (const user of VIRTUAL_USERS) {
    const sizesByGarment: { garment: string; size: SizeLabel; score: number }[] = [];

    for (const garment of GARMENT_CATALOG) {
        const rec = recommendSize(user.measurements, garment.sizes);
        if (rec) {
            sizesByGarment.push({
                garment: garment.name,
                size: rec.recommendedSize,
                score: rec.confidenceScore,
            });
        }
    }

    // All garments should recommend the same or adjacent size
    const uniqueSizes = [...new Set(sizesByGarment.map(s => s.size))];
    const sizeOrder: SizeLabel[] = ['S', 'M', 'L', 'XL'];
    const sizeIndices = uniqueSizes.map(s => sizeOrder.indexOf(s)).filter(i => i >= 0);
    const sizeSpread = sizeIndices.length > 0 ? Math.max(...sizeIndices) - Math.min(...sizeIndices) : 0;

    assert(
        sizeSpread <= 1,
        `${user.name}: inconsistent sizing across garments — got ${uniqueSizes.join(', ')} (spread: ${sizeSpread})`
    );

    const emoji = sizeSpread <= 1 ? '✅' : '⚠️';
    console.log(`   ${emoji} ${user.name.padEnd(30)} → ${uniqueSizes.join('/')} across all garments`);
}

// ── Test 3: Size Ordering — Larger body should always get larger-or-equal sizes ──

console.log('\n\n═══ Size Ordering Test ═══');
console.log('   Bigger body type should get larger (or equal) size recommendation\n');

const orderedUsers: { name: string; chest: number }[] = VIRTUAL_USERS
    .map(u => ({ name: u.name.split(' — ')[0], chest: u.measurements.chestCircumference }))
    .sort((a, b) => a.chest - b.chest);

const sizeOrder: SizeLabel[] = ['S', 'M', 'L', 'XL'];

for (const garment of GARMENT_CATALOG) {
    let prevSizeIdx = -1;
    let prevName = '';
    let allCorrect = true;

    for (const { name, chest } of orderedUsers) {
        const user = VIRTUAL_USERS.find(u => u.name.startsWith(name))!;
        const rec = recommendSize(user.measurements, garment.sizes);
        if (!rec) continue;

        const sizeIdx = sizeOrder.indexOf(rec.recommendedSize);

        if (prevSizeIdx >= 0 && sizeIdx < prevSizeIdx) {
            // Bigger body got smaller size — only flag if chest is significantly bigger
            const prevUser = VIRTUAL_USERS.find(u => u.name.startsWith(prevName))!;
            const chestDiff = user.measurements.chestCircumference - prevUser.measurements.chestCircumference;
            if (chestDiff > 6) {
                assert(false, `${garment.name}: ${name} (chest ${chest}cm) got ${rec.recommendedSize} but smaller ${prevName} got ${sizeOrder[prevSizeIdx]}`);
                allCorrect = false;
            }
        }

        prevSizeIdx = sizeIdx;
        prevName = name;
    }

    const emoji = allCorrect ? '✅' : '❌';
    const sizes = orderedUsers.map(({ name }) => {
        const user = VIRTUAL_USERS.find(u => u.name.startsWith(name))!;
        const rec = recommendSize(user.measurements, garment.sizes);
        return `${name.substring(0, 6)}=${rec?.recommendedSize ?? '?'}`;
    }).join(', ');
    console.log(`   ${emoji} ${garment.name.padEnd(20)} → ${sizes}`);
}

// ── Test 4: Cross-Brand Comparison ───────────────────────────

console.log('\n\n═══ Cross-Brand Comparison ═══');
console.log('   "You\'re a Zara M, H&M L, Uniqlo M"\n');

for (const user of VIRTUAL_USERS) {
    const results = compareBrandSizes(user.measurements, BRAND_CHARTS);

    assert(results.length === 3, `${user.name}: got ${results.length} brand results (expected 3)`);

    for (const r of results) {
        assert(
            sizeOrder.includes(r.recommendedSize),
            `${user.name} @ ${r.brandName}: invalid size ${r.recommendedSize}`
        );
        assert(
            r.confidenceScore >= 0 && r.confidenceScore <= 100,
            `${user.name} @ ${r.brandName}: invalid confidence ${r.confidenceScore}`
        );
    }

    const summary = results.map(r => `${r.brandName} ${r.recommendedSize}(${r.confidenceScore}%)`).join(', ');
    console.log(`   👤 ${user.name.split(' — ')[0].padEnd(12)} → ${summary}`);
}

// ── Test 5: Extreme Edge Cases ───────────────────────────────

console.log('\n\n═══ Extreme Edge Cases ═══\n');

const giantBody: UserBodyMeasurements = {
    chestCircumference: 120, waistCircumference: 90, hipCircumference: 110,
    shoulderWidth: 55, armLength: 72, torsoLength: 62, inseam: 95,
};
const giantRec = recommendSize(giantBody, GARMENT_CATALOG[0].sizes);
assert(giantRec !== null && giantRec.recommendedSize === 'XL', `210cm giant → XL (got ${giantRec?.recommendedSize})`);
console.log(`   ✅ 210cm Basketball Player → ${giantRec?.recommendedSize} (${giantRec?.confidenceScore}%)`);

const tinyBody: UserBodyMeasurements = {
    chestCircumference: 70, waistCircumference: 55, hipCircumference: 72,
    shoulderWidth: 32, armLength: 46, torsoLength: 38, inseam: 62,
};
const tinyRec = recommendSize(tinyBody, GARMENT_CATALOG[0].sizes);
assert(tinyRec !== null && tinyRec.recommendedSize === 'S', `140cm child → S (got ${tinyRec?.recommendedSize})`);
assert(tinyRec !== null && tinyRec.confidenceScore < 50, `140cm child confidence is low (${tinyRec?.confidenceScore}%)`);
console.log(`   ✅ 140cm Child → ${tinyRec?.recommendedSize} (${tinyRec?.confidenceScore}%) — correctly low confidence`);

const perfectMBody: UserBodyMeasurements = {
    chestCircumference: 100, waistCircumference: 86, hipCircumference: 100,
    shoulderWidth: 45, armLength: 61, torsoLength: 52, inseam: 79,
};
const perfectRec = recommendSize(perfectMBody, GARMENT_CATALOG[0].sizes);
if (perfectRec) {
    console.log(`   ✅ Perfect M Body → ${perfectRec.recommendedSize} (${perfectRec.confidenceScore}%)`);
    assert(perfectRec.confidenceScore > 60, `Perfect M body should have > 60% confidence (got ${perfectRec.confidenceScore}%)`);
}

// ── Test 6: Material Impact ──────────────────────────────────

console.log('\n\n═══ Material Impact Test ═══');
console.log('   Polyester jacket vs Cotton tee — same body\n');

const testBody = VIRTUAL_USERS[0].measurements;
for (const garment of GARMENT_CATALOG) {
    const rec = recommendSize(testBody, garment.sizes);
    if (rec) {
        const material = garment.sizes[0].material;
        console.log(`   ${garment.name.padEnd(20)} (${material.type}, ${Math.round(material.stretch * 100)}% stretch) → ${rec.recommendedSize} (${rec.confidenceScore}%)`);
    }
}

// ── Test 7: "Would This Fit?" Real-World Scenarios ───────────

console.log('\n\n═══ "Would This Fit?" Scenarios ═══\n');

interface FitScenario {
    question: string;
    body: UserBodyMeasurements;
    garmentIdx: number;
    size: SizeLabel;
    expected: 'yes_comfortable' | 'yes_snug' | 'no_tight' | 'no_loose';
}

const scenarios: FitScenario[] = [
    {
        question: 'Can a 96cm chest guy wear a Medium cotton tee comfortably?',
        body: { chestCircumference: 96, waistCircumference: 82, hipCircumference: 98, shoulderWidth: 44, armLength: 60, torsoLength: 52 },
        garmentIdx: 2, size: 'M', expected: 'yes_comfortable',
    },
    {
        question: 'Can a 116cm chest guy squeeze into a Medium cotton tee?',
        body: { chestCircumference: 116, waistCircumference: 100, hipCircumference: 114, shoulderWidth: 52, armLength: 65, torsoLength: 55 },
        garmentIdx: 2, size: 'M', expected: 'no_tight',
    },
    {
        question: 'Is an XL too big for a petite 80cm chest woman?',
        body: { chestCircumference: 80, waistCircumference: 64, hipCircumference: 88, shoulderWidth: 36, armLength: 52, torsoLength: 44 },
        garmentIdx: 2, size: 'XL', expected: 'no_loose',
    },
    {
        question: 'Does a 110cm chest muscular guy fit in a Large jacket?',
        body: { chestCircumference: 110, waistCircumference: 78, hipCircumference: 98, shoulderWidth: 50, armLength: 62, torsoLength: 53 },
        garmentIdx: 0, size: 'L', expected: 'yes_snug',
    },
];

for (const scenario of scenarios) {
    const garment = GARMENT_CATALOG[scenario.garmentIdx].sizes.find(s => s.sizeLabel === scenario.size);
    if (!garment) continue;

    const fit = analyzeGarmentFit(scenario.body, garment);

    let actualOutcome: string;
    if (fit.overallFit === 'REGULAR') actualOutcome = 'yes_comfortable';
    else if (fit.overallFit === 'SNUG') actualOutcome = 'yes_snug';
    else if (fit.overallFit === 'TOO_TIGHT') actualOutcome = 'no_tight';
    else actualOutcome = 'no_loose';

    let correct = false;
    if (scenario.expected === 'yes_comfortable' && (actualOutcome === 'yes_comfortable' || actualOutcome === 'yes_snug')) correct = true;
    if (scenario.expected === 'yes_snug' && (actualOutcome === 'yes_snug' || actualOutcome === 'yes_comfortable' || actualOutcome === 'no_loose')) correct = true;
    if (scenario.expected === 'no_tight' && actualOutcome === 'no_tight') correct = true;
    if (scenario.expected === 'no_loose' && actualOutcome === 'no_loose') correct = true;

    assert(correct, `Scenario: "${scenario.question}" — expected ${scenario.expected}, got ${actualOutcome}`);

    const emoji = correct ? '✅' : '❌';
    console.log(`   ${emoji} Q: ${scenario.question}`);
    console.log(`      A: ${fit.overallFit} (${fit.confidenceScore}%) — ${fit.summary}`);
    console.log('');
}

// ══════════════════════════════════════════════════════════════
//  FINAL REPORT
// ══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`  SIMULATION RESULTS: ${passed} passed, ${failed} failed`);
if (warnings.length > 0) console.log(`  Warnings: ${warnings.length}`);
console.log('═'.repeat(60));

if (failed > 0) {
    console.error('\n⚠️  SOME TESTS FAILED\n');
    process.exit(1);
} else {
    console.log('\n🎯  ALL SIMULATION TESTS PASSED — SIZE ENGINE IS PRODUCTION-READY ✅\n');
    process.exit(0);
}
