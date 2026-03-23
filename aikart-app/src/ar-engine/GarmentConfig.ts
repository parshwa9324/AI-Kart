/**
 * GarmentConfig.ts
 *
 * Anchor point definitions for garment types.
 * Coordinates are normalized 0-1 relative to garment image bounds.
 */

export interface GarmentAnchors {
  /** Left shoulder attachment point */
  leftShoulder: { x: number; y: number };
  /** Right shoulder attachment point */
  rightShoulder: { x: number; y: number };
  /** Left sleeve tip / outer arm seam */
  leftSleeve: { x: number; y: number };
  /** Right sleeve tip / outer arm seam */
  rightSleeve: { x: number; y: number };
  /** Bottom-left hem corner */
  hemLeft: { x: number; y: number };
  /** Bottom-right hem corner */
  hemRight: { x: number; y: number };
  /** Center of neckline */
  neckCenter: { x: number; y: number };
}

export type GarmentType = 'tshirt' | 'shirt' | 'longsleeve' | 'hoodie' | 'oversized' | 'custom';

export interface GarmentProfile {
  type: GarmentType;
  anchors: GarmentAnchors;
  /** Width multiplier relative to shoulder distance */
  widthScale: number;
  /** Height ratio relative to torso length */
  heightScale: number;
}

/**
 * Default anchor presets for common garment types.
 * x/y are normalized [0,1] relative to garment image.
 */
const PRESETS: Record<Exclude<GarmentType, 'custom'>, GarmentProfile> = {
  tshirt: {
    type: 'tshirt',
    anchors: {
      neckCenter:    { x: 0.50, y: 0.08 },
      leftShoulder:  { x: 0.18, y: 0.12 },
      rightShoulder: { x: 0.82, y: 0.12 },
      leftSleeve:    { x: 0.02, y: 0.30 },
      rightSleeve:   { x: 0.98, y: 0.30 },
      hemLeft:       { x: 0.15, y: 0.95 },
      hemRight:      { x: 0.85, y: 0.95 },
    },
    widthScale: 1.6,
    heightScale: 1.3,
  },
  shirt: {
    type: 'shirt',
    anchors: {
      neckCenter:    { x: 0.50, y: 0.06 },
      leftShoulder:  { x: 0.15, y: 0.10 },
      rightShoulder: { x: 0.85, y: 0.10 },
      leftSleeve:    { x: 0.00, y: 0.42 },
      rightSleeve:   { x: 1.00, y: 0.42 },
      hemLeft:       { x: 0.18, y: 0.97 },
      hemRight:      { x: 0.82, y: 0.97 },
    },
    widthScale: 1.55,
    heightScale: 1.35,
  },
  longsleeve: {
    type: 'longsleeve',
    anchors: {
      neckCenter:    { x: 0.50, y: 0.06 },
      leftShoulder:  { x: 0.20, y: 0.10 },
      rightShoulder: { x: 0.80, y: 0.10 },
      leftSleeve:    { x: 0.00, y: 0.55 },
      rightSleeve:   { x: 1.00, y: 0.55 },
      hemLeft:       { x: 0.20, y: 0.96 },
      hemRight:      { x: 0.80, y: 0.96 },
    },
    widthScale: 1.5,
    heightScale: 1.4,
  },
  hoodie: {
    type: 'hoodie',
    anchors: {
      neckCenter:    { x: 0.50, y: 0.10 },
      leftShoulder:  { x: 0.18, y: 0.15 },
      rightShoulder: { x: 0.82, y: 0.15 },
      leftSleeve:    { x: 0.00, y: 0.50 },
      rightSleeve:   { x: 1.00, y: 0.50 },
      hemLeft:       { x: 0.18, y: 0.95 },
      hemRight:      { x: 0.82, y: 0.95 },
    },
    widthScale: 1.65,
    heightScale: 1.35,
  },
  oversized: {
    type: 'oversized',
    anchors: {
      neckCenter:    { x: 0.50, y: 0.08 },
      leftShoulder:  { x: 0.12, y: 0.12 }, // wider shoulders
      rightShoulder: { x: 0.88, y: 0.12 },
      leftSleeve:    { x: 0.00, y: 0.40 },
      rightSleeve:   { x: 1.00, y: 0.40 },
      hemLeft:       { x: 0.10, y: 0.95 },
      hemRight:      { x: 0.90, y: 0.95 },
    },
    widthScale: 1.75, // significantly wider
    heightScale: 1.25, // relatively shorter boxy fit
  },
};

/** conservative fallback profile for low-confidence analysis */
export const SAFE_PROFILE: GarmentProfile = {
  type: 'tshirt',
  anchors: PRESETS.tshirt.anchors,
  widthScale: 1.4, // narrower, safer
  heightScale: 1.2,
};

export function getGarmentProfile(type: GarmentType, customAnchors?: Partial<GarmentAnchors>): GarmentProfile {
  if (type === 'custom') {
    // Use tshirt as base, override with custom
    const base = { ...PRESETS.tshirt };
    if (customAnchors) {
      base.anchors = { ...base.anchors, ...customAnchors };
    }
    base.type = 'custom';
    return base;
  }
  const preset = PRESETS[type];
  if (customAnchors) {
    return { ...preset, anchors: { ...preset.anchors, ...customAnchors } };
  }
  return preset;
}

/** Auto-estimate garment type from aspect ratio */
export function guessGarmentType(width: number, height: number): GarmentType {
  const ratio = height / width;
  if (ratio > 1.4) return 'longsleeve';
  if (ratio > 1.1) return 'shirt';
  if (ratio < 0.95) return 'oversized';
  return 'tshirt';
}
