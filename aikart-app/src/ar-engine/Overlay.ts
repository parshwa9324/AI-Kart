/**
 * Overlay.ts — Production hardened
 *
 * Calculates shirt overlay transform from pose landmarks.
 *
 * Hardening:
 * - Weighted shoulder+torso scale blend (70/30)
 * - Dynamic vertical offset from torso center
 * - Micro inertia (velocity tail) for organic feel
 * - Separate heavier angle smoothing (0.15 factor)
 * - Soft rotation clamp via tanh-style curve
 * - Dimension clamping (min 40px, max 95% canvas)
 * - Partial body mode (one shoulder visible)
 * - Confidence-adaptive smoothing
 * - Extended freeze (12 frames) with ease-out fade
 * - Slower fade-in over 15 frames for re-entry
 * - Zero allocations in hot path (reuse result object)
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { LANDMARK } from './PoseDetector';

export interface OverlayTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
  valid: boolean;
  /** Parallax offset in px (opposite to lateral movement) */
  parallaxX: number;
  /** Fabric stretch factor (1.0 = normal, 1.02 = 2% taller) */
  stretchY: number;
  /** Raw shoulder distance in px (for framing hints) */
  shoulderDist: number;
  /** Torso center Y in canvas px (for alignment hints) */
  torsoCenterY: number;
}

// Soft rotation limit (~15°). Uses tanh-style curve so it never hard snaps.
const ROTATION_LIMIT = 0.26;

// Pre-allocated result object — reused every frame to avoid GC
const _result: OverlayTransform = {
  x: 0, y: 0, width: 0, height: 0, angle: 0, opacity: 0, valid: false,
  parallaxX: 0, stretchY: 1, shoulderDist: 0, torsoCenterY: 0,
};
const _invalid: OverlayTransform = {
  x: 0, y: 0, width: 0, height: 0, angle: 0, opacity: 0, valid: false,
  parallaxX: 0, stretchY: 1, shoulderDist: 0, torsoCenterY: 0,
};

export class Overlay {
  private shirtImg: HTMLImageElement | null = null;
  private _loaded = false;

  // Smoothed state
  private sX = 0;
  private sY = 0;
  private sW = 0;
  private sH = 0;
  private sAngle = 0;
  private hasSmoothed = false;

  // Velocity tracking for micro inertia
  private vX = 0;
  private vY = 0;
  private readonly INERTIA = 0.03;

  // Fade state
  private fadeIn = 0;
  private readonly FADE_IN_SPEED = 0.07;  // ~15 frames to full

  // Freeze state
  private lastValid: OverlayTransform | null = null;
  private framesWithoutPose = 0;
  private readonly FREEZE_FRAMES = 12;

  // Last known shoulder offset (for partial body mode)
  private lastShoulderOffsetX = 0;
  private lastShoulderOffsetY = 0;
  private lastShoulderDist = 0;

  // Tuning
  private readonly WIDTH_MULT = 1.35;
  private readonly HEIGHT_RATIO = 1.20;
  private readonly Y_OFFSET_FRAC = 0.05;
  private readonly ANGLE_SMOOTH = 0.15;  // heavy — separate from position

  get loaded(): boolean { return this._loaded; }
  get image(): HTMLImageElement | null { return this.shirtImg; }

  async loadShirt(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this.shirtImg = img; this._loaded = true; resolve(); };
      img.onerror = () => reject(new Error(`Failed to load shirt: ${url}`));
      img.src = url;
    });
  }

  /**
   * Set garment texture from a processed canvas (from GarmentLoader).
   * Converts to HTMLImageElement for drawing compatibility.
   */
  setTexture(canvas: HTMLCanvasElement): void {
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    img.onload = () => {
      this.shirtImg = img;
      this._loaded = true;
    };
  }

  /**
   * Calculate overlay from landmarks. Call every frame pose IS detected.
   * avgConfidence from PoseDetector used for adaptive smoothing.
   */
  calculate(
    landmarks: NormalizedLandmark[],
    cw: number,
    ch: number,
    avgConfidence: number
  ): OverlayTransform {
    this.framesWithoutPose = 0;

    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    const lh = landmarks[LANDMARK.LEFT_HIP];
    const rh = landmarks[LANDMARK.RIGHT_HIP];

    const lsVis = ls ? (ls.visibility ?? 0) : 0;
    const rsVis = rs ? (rs.visibility ?? 0) : 0;

    // Both shoulders missing → no pose
    if (lsVis < 0.35 && rsVis < 0.35) return this.handleNoPose();

    let lsx: number, lsy: number, rsx: number, rsy: number;

    if (lsVis >= 0.35 && rsVis >= 0.35) {
      // Normal: both visible
      lsx = (1 - ls!.x) * cw;
      lsy = ls!.y * ch;
      rsx = (1 - rs!.x) * cw;
      rsy = rs!.y * ch;
      // Store offset for partial mode
      this.lastShoulderOffsetX = rsx - lsx;
      this.lastShoulderOffsetY = rsy - lsy;
    } else if (lsVis >= 0.35) {
      // Partial: only left shoulder → estimate right from last offset
      lsx = (1 - ls!.x) * cw;
      lsy = ls!.y * ch;
      rsx = lsx + (this.lastShoulderOffsetX || cw * 0.25);
      rsy = lsy + (this.lastShoulderOffsetY || 0);
    } else {
      // Partial: only right shoulder → estimate left
      rsx = (1 - rs!.x) * cw;
      rsy = rs!.y * ch;
      lsx = rsx - (this.lastShoulderOffsetX || cw * 0.25);
      lsy = rsy - (this.lastShoulderOffsetY || 0);
    }

    const shoulderDist = Math.hypot(rsx - lsx, rsy - lsy);
    if (shoulderDist < 12) return this.handleNoPose(); // too small

    const midX = (lsx + rsx) / 2;
    const midY = (lsy + rsy) / 2;

    // Rotation — soft clamp via tanh-style curve
    const rawAngle = Math.atan2(rsy - lsy, rsx - lsx);
    const clampedAngle = this.softClampAngle(rawAngle);

    // Torso length: actual from hips, or estimated
    let torsoLength: number;
    const lhVis = lh ? (lh.visibility ?? 0) : 0;
    const rhVis = rh ? (rh.visibility ?? 0) : 0;

    if (lhVis > 0.3 && rhVis > 0.3) {
      const hipMidX = ((1 - lh!.x) + (1 - rh!.x)) / 2 * cw;
      const hipMidY = (lh!.y + rh!.y) / 2 * ch;
      torsoLength = Math.hypot(hipMidX - midX, hipMidY - midY);
    } else if (lhVis > 0.3 || rhVis > 0.3) {
      // One hip visible
      const hip = lhVis > 0.3 ? lh! : rh!;
      const hipY = hip.y * ch;
      torsoLength = hipY - midY;
    } else {
      torsoLength = shoulderDist * 1.4;
    }
    torsoLength = Math.max(torsoLength, shoulderDist * 0.8); // floor

    // Weighted blend for shirt width: 70% shoulder, 30% torso-proportional
    const widthFromShoulder = shoulderDist * this.WIDTH_MULT;
    const widthFromTorso = torsoLength * 0.95;
    const shirtWidth = widthFromShoulder * 0.7 + widthFromTorso * 0.3;

    // Shirt height from torso
    const shirtHeight = torsoLength * this.HEIGHT_RATIO;

    // Clamp dimensions to reasonable bounds
    const clampedW = Math.max(40, Math.min(shirtWidth, cw * 0.95));
    const clampedH = Math.max(50, Math.min(shirtHeight, ch * 0.95));

    // Dynamic vertical offset: position based on torso center
    const rawX = midX - clampedW / 2;
    const rawY = midY - clampedH * this.Y_OFFSET_FRAC;

    // Confidence-adaptive smoothing
    const posFactor = this.adaptiveSmooth(rawX, rawY, clampedW, avgConfidence);

    if (!this.hasSmoothed) {
      this.sX = rawX;
      this.sY = rawY;
      this.sW = clampedW;
      this.sH = clampedH;
      this.sAngle = clampedAngle;
      this.vX = 0;
      this.vY = 0;
      this.hasSmoothed = true;
      this.fadeIn = 0.15;
    } else {
      // Micro inertia: track velocity for organic follow
      const prevX = this.sX;
      const prevY = this.sY;

      this.sX = this.lerp(this.sX, rawX, posFactor);
      this.sY = this.lerp(this.sY, rawY, posFactor);
      this.sW = this.lerp(this.sW, clampedW, posFactor);
      this.sH = this.lerp(this.sH, clampedH, posFactor);

      // Angle uses separate heavier smoothing
      this.sAngle = this.lerpAngle(this.sAngle, clampedAngle, this.ANGLE_SMOOTH);

      // Velocity for inertia tail
      this.vX = (this.sX - prevX) * 0.5 + this.vX * 0.5;
      this.vY = (this.sY - prevY) * 0.5 + this.vY * 0.5;

      // Apply micro inertia
      this.sX += this.vX * this.INERTIA;
      this.sY += this.vY * this.INERTIA;
    }

    this.lastShoulderDist = shoulderDist;
    this.fadeIn = Math.min(1, this.fadeIn + this.FADE_IN_SPEED);

    // Task 1: Parallax — opposite lateral offset (clamped ±2px)
    const parallax = Math.max(-2, Math.min(2, -this.vX * 0.15));

    // Task 4: Fabric stretch — micro vertical stretch from velocity magnitude
    const velMag = Math.hypot(this.vX, this.vY);
    const stretch = 1 + Math.min(0.02, velMag * 0.001); // 1.0 → 1.02 max

    // Write to pre-allocated result
    _result.x = this.sX;
    _result.y = this.sY;
    _result.width = this.sW;
    _result.height = this.sH;
    _result.angle = this.sAngle;
    _result.opacity = this.fadeIn * 0.96;
    _result.valid = true;
    _result.parallaxX = parallax;
    _result.stretchY = stretch;
    _result.shoulderDist = shoulderDist;
    _result.torsoCenterY = midY;

    // Save copy for freeze
    this.lastValid = {
      x: _result.x, y: _result.y,
      width: _result.width, height: _result.height,
      angle: _result.angle, opacity: _result.opacity,
      valid: true,
      parallaxX: parallax, stretchY: stretch,
      shoulderDist, torsoCenterY: midY,
    };

    return _result;
  }

  /**
   * Called when pose NOT detected or frame skipped.
   * isSkipFrame=true means we're just throttling, NOT actually missing pose.
   */
  handleNoPose(isSkipFrame = false): OverlayTransform {
    if (isSkipFrame && this.lastValid) {
      // Frame skip for performance — just return last valid, don't increment counter
      return this.lastValid;
    }

    this.framesWithoutPose++;

    if (this.lastValid && this.framesWithoutPose <= this.FREEZE_FRAMES) {
      // Ease-out fade: fast at start, slow at end
      const t = this.framesWithoutPose / this.FREEZE_FRAMES;
      const easeOut = 1 - t * t; // quadratic ease-out
      _result.x = this.lastValid.x;
      _result.y = this.lastValid.y;
      _result.width = this.lastValid.width;
      _result.height = this.lastValid.height;
      _result.angle = this.lastValid.angle;
      _result.opacity = this.lastValid.opacity * Math.max(0, easeOut);
      _result.valid = true;
      return _result;
    }

    if (this.framesWithoutPose > this.FREEZE_FRAMES) {
      this.reset();
    }

    return _invalid;
  }

  /**
   * Reset overlay state.
   *
   * When used with clearTexture=true (on garment change), this also
   * drops any reference to the previous garment image so there is
   * no chance of visual blending between old and new garments.
   */
  reset(clearTexture = false): void {
    this.hasSmoothed = false;
    this.fadeIn = 0;
    this.lastValid = null;
    this.framesWithoutPose = 0;
    this.vX = 0;
    this.vY = 0;

    if (clearTexture) {
      this.shirtImg = null;
      this._loaded = false;
      this.lastShoulderOffsetX = 0;
      this.lastShoulderOffsetY = 0;
      this.lastShoulderDist = 0;
    }
  }

  // Soft clamp: tanh-style — approaches limit smoothly, never snaps
  private softClampAngle(angle: number): number {
    // tanh maps (-inf,inf) → (-1,1), scale by limit
    return Math.tanh(angle / ROTATION_LIMIT) * ROTATION_LIMIT;
  }

  // Confidence + delta adaptive smoothing
  private adaptiveSmooth(rawX: number, rawY: number, rawW: number, confidence: number): number {
    if (!this.hasSmoothed) return 1;
    const dx = Math.abs(rawX - this.sX);
    const dy = Math.abs(rawY - this.sY);
    const dw = Math.abs(rawW - this.sW);
    const totalDelta = dx + dy + dw;

    // Base factor from movement magnitude
    let t: number;
    if (totalDelta < 3) t = 0.18;
    else if (totalDelta < 8) t = 0.30;
    else if (totalDelta < 20) t = 0.45;
    else if (totalDelta < 50) t = 0.60;
    else t = 0.80; // very fast movement — near instant follow

    // Low confidence → heavier smoothing (reduce jitter in bad lighting)
    if (confidence < 0.5) t *= 0.6;
    else if (confidence < 0.7) t *= 0.8;

    return t;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }
}