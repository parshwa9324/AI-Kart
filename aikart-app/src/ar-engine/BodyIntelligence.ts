/**
 * BodyIntelligence.ts — Body & Anatomy Intelligence
 *
 * Pure geometry body analysis. No ML.
 *
 * - KalmanFilter1D: Lightweight 1D Kalman for position+velocity
 * - LandmarkSmoother: Per-landmark Kalman with confidence weighting
 * - BodyYaw: Shoulder depth ratio → horizontal compression
 * - TorsoTilt: Shoulder-hip gap vs expected → height adjustment
 * - CollarAlignment: Ear + Nose + Shoulder → precise collar Y
 */

// ── Kalman Filter 1D ──────────────────────────────────────────
// State: [position, velocity], minimal 2×2 matrix math, zero alloc after init

export class KalmanFilter1D {
  // State vector [position, velocity]
  private x = 0;
  private v = 0;

  // Error covariance (2×2 stored flat)
  private p00 = 1;
  private p01 = 0;
  private p10 = 0;
  private p11 = 1;

  // Tuning
  private readonly processNoise: number;
  private readonly baseR: number;

  constructor(processNoise = 0.05, measurementNoise = 2.0) {
    this.processNoise = processNoise;
    this.baseR = measurementNoise;
  }

  /**
   * Predict + Update in one call.
   * @param measurement Raw position value
   * @param confidence 0-1 landmark confidence. Higher = trust measurement more (lower R)
   * @param dt Time delta (normalized, typically 1.0 for per-frame)
   * @returns Filtered position
   */
  update(measurement: number, confidence: number, dt = 1.0): number {
    // ── PREDICT ──
    // x' = x + v * dt
    this.x += this.v * dt;
    // v' = v (constant velocity model)

    // P' = F * P * F' + Q
    const q = this.processNoise;
    const dt2 = dt * dt;
    this.p00 += dt * (this.p10 + this.p01) + dt2 * this.p11 + q;
    this.p01 += dt * this.p11;
    this.p10 += dt * this.p11;
    this.p11 += q * 0.5;

    // ── UPDATE ──
    // R scales inversely with confidence: high confidence → low noise
    const R = this.baseR * (1.5 - Math.min(confidence, 1.0));

    // S = P[0][0] + R
    const S = this.p00 + R;
    if (S < 1e-10) return this.x; // degenerate

    const invS = 1.0 / S;

    // Kalman gain K = P * H' * inv(S), where H = [1, 0]
    const k0 = this.p00 * invS;
    const k1 = this.p10 * invS;

    // Innovation
    const y = measurement - this.x;

    // State update
    this.x += k0 * y;
    this.v += k1 * y;

    // Covariance update: P = (I - K*H) * P
    const t00 = this.p00;
    const t01 = this.p01;
    this.p00 -= k0 * t00;
    this.p01 -= k0 * t01;
    this.p10 -= k1 * t00;
    this.p11 -= k1 * t01;

    return this.x;
  }

  /** Hard reset to specific value */
  reset(value: number): void {
    this.x = value;
    this.v = 0;
    this.p00 = 1;
    this.p01 = 0;
    this.p10 = 0;
    this.p11 = 1;
  }

  get position(): number { return this.x; }
  get velocity(): number { return this.v; }
}

// ── Landmark Smoother ─────────────────────────────────────────
// Wraps two KalmanFilter1D (x,y) per landmark ID

interface SmoothedPoint {
  x: number;
  y: number;
  z?: number;
}

// ── Bounding Box Normalizer ───────────────────────────────────
// distance-invariant landmark normalization (Fixes BUG 2)

export class BoundingBoxNormalizer {
  static normalize(
    absoluteX: number,
    absoluteY: number,
    minX: number,
    minY: number,
    boxWidth: number,
    boxHeight: number
  ): { x: number; y: number } {
    // Distance-invariant scaling factor
    if (boxWidth < 0.0001) boxWidth = 0.0001;
    if (boxHeight < 0.0001) boxHeight = 0.0001;

    // Replace absolute coordinates with anchor-relative offsets
    return {
      x: (absoluteX - minX) / boxWidth,
      y: (absoluteY - minY) / boxHeight,
    };
  }
}


export class LandmarkSmoother {
  private filters = new Map<number, { fx: KalmanFilter1D; fy: KalmanFilter1D; fz: KalmanFilter1D }>();

  constructor(
    private processNoise = 0.04,
    private measurementNoise = 1.8
  ) { }

  /**
   * Smooth a landmark position.
   * @param id Landmark index
   * @param rawX Raw X position (canvas pixels)
   * @param rawY Raw Y position (canvas pixels)
   * @param confidence Landmark visibility/confidence 0-1
   * @param target Optional object to write result into (avoids allocation)
   * @param rawZ Optional Raw Z position (MediaPipe depth)
   * @returns Smoothed position
   */
  smooth(id: number, rawX: number, rawY: number, confidence: number, target?: SmoothedPoint, rawZ: number = 0): SmoothedPoint {
    let f = this.filters.get(id);
    if (!f) {
      f = {
        fx: new KalmanFilter1D(this.processNoise, this.measurementNoise),
        fy: new KalmanFilter1D(this.processNoise, this.measurementNoise),
        fz: new KalmanFilter1D(this.processNoise, this.measurementNoise),
      };
      f.fx.reset(rawX);
      f.fy.reset(rawY);
      f.fz.reset(rawZ);
      this.filters.set(id, f);
      if (target) { target.x = rawX; target.y = rawY; target.z = rawZ; return target; }
      return { x: rawX, y: rawY, z: rawZ };
    }

    const x = f.fx.update(rawX, confidence);
    const y = f.fy.update(rawY, confidence);
    const z = f.fz.update(rawZ, confidence);

    if (target) { target.x = x; target.y = y; target.z = z; return target; }
    return { x, y, z };
  }

  /** Get velocity magnitude for a landmark (useful for dampening decisions) */
  getVelocity(id: number): number {
    const f = this.filters.get(id);
    if (!f) return 0;
    return Math.hypot(f.fx.velocity, f.fy.velocity);
  }

  reset(): void {
    this.filters.clear();
  }
}

// ── Body Yaw Estimation ───────────────────────────────────────
// Uses shoulder Z depth difference to approximate body yaw rotation

export class BodyYaw {
  private smoothedYaw = 0;
  private readonly SMOOTH = 0.12;

  /**
   * Compute yaw from shoulder z-depths.
   * @param leftZ Left shoulder z (MediaPipe normalized depth)
   * @param rightZ Right shoulder z
   * @param shoulderDist Shoulder pixel distance (for normalization)
   * @returns Compression factor 0.85–1.0 (1.0 = facing camera)
   */
  compute(leftZ: number, rightZ: number, shoulderDist: number): number {
    // BUG 1 Fix: Numerical guard against dx = 0
    let dx = shoulderDist;
    if (Math.abs(dx) < 0.0001) dx = 0.0001;

    // Z difference relative to shoulder width
    let dz = leftZ - rightZ;
    if (Number.isNaN(dz)) dz = 0;

    // Yaw approximation: atan of normalized depth difference
    let rawYaw = Math.atan2(dz * 200, dx);
    if (Number.isNaN(rawYaw) || !Number.isFinite(rawYaw)) rawYaw = 0;

    // Smooth
    this.smoothedYaw += (rawYaw - this.smoothedYaw) * this.SMOOTH;

    // Convert to horizontal compression: max 15% compression at extreme yaw
    const absYaw = Math.abs(this.smoothedYaw);
    const result = Math.max(0.85, 1.0 - absYaw * 0.3);
    
    // Final output validator
    if (Number.isNaN(result) || !Number.isFinite(result)) return 1.0;
    return result;
  }

  reset(): void {
    this.smoothedYaw = 0;
  }
}

// ── Torso Tilt Estimation ─────────────────────────────────────
// Detects forward/backward lean by comparing actual torso length to expected

export class TorsoTilt {
  private smoothedScale = 1.0;
  private readonly SMOOTH = 0.08;
  private expectedTorsoRatio = 0; // calibrated from first stable frames
  private calibrationFrames = 0;

  /**
   * Compute height scale adjustment from torso tilt.
   * @param shoulderMidY Shoulder midpoint Y
   * @param hipMidY Hip midpoint Y
   * @param shoulderDist Shoulder pixel distance
   * @returns Scale factor 0.95–1.0 (1.0 = upright)
   */
  compute(shoulderMidY: number, hipMidY: number, shoulderDist: number): number {
    if (shoulderDist < 20) return 1.0;

    const torsoLen = Math.abs(hipMidY - shoulderMidY);
    const torsoRatio = torsoLen / shoulderDist;

    // Auto-calibrate expected ratio from first 30 stable frames
    if (this.calibrationFrames < 30) {
      if (this.expectedTorsoRatio === 0) {
        this.expectedTorsoRatio = torsoRatio;
      } else {
        this.expectedTorsoRatio += (torsoRatio - this.expectedTorsoRatio) * 0.1;
      }
      this.calibrationFrames++;
      return 1.0;
    }

    // Compare current to expected
    const deviation = torsoRatio / this.expectedTorsoRatio;

    // If shorter than expected (leaning forward), compress height
    // If longer (leaning back), slight stretch
    const rawScale = Math.max(0.93, Math.min(1.05, deviation));

    this.smoothedScale += (rawScale - this.smoothedScale) * this.SMOOTH;
    return this.smoothedScale;
  }

  reset(): void {
    this.smoothedScale = 1.0;
    this.expectedTorsoRatio = 0;
    this.calibrationFrames = 0;
  }
}

// ── Collar Alignment ──────────────────────────────────────────
// Uses ear midpoint (more stable than nose) + shoulder midpoint

export class CollarAlignment {
  private smoothedCollarY = 0;
  private hasInit = false;
  private readonly SMOOTH = 0.15;
  
  // BUG 3 Fix: Dedicated Kalman smoother for collar position
  private filter = new KalmanFilter1D(0.05, 1.5);

  /**
   * Compute collar Y position precisely.
   * @param shoulderMidY Shoulder midpoint Y
   * @param noseY Nose Y
   * @param leftEarY Left ear Y
   * @param rightEarY Right ear Y
   * @param torsoHeight Height of torso for anatomical anchoring
   * @returns Collar Y offset
   */
  compute(
    shoulderMidY: number,
    noseY: number | undefined,
    leftEarY: number | undefined,
    rightEarY: number | undefined,
    torsoHeight: number,
  ): number {
    // BUG 3 Fix: Implement anatomical anchor ratio for CollarY
    const targetCollarY = shoulderMidY - (torsoHeight * 0.08);

    if (!this.hasInit) {
      this.smoothedCollarY = targetCollarY;
      this.filter.reset(targetCollarY);
      this.hasInit = true;
      return targetCollarY;
    }

    // Apply dedicated Kalman smoother to collar position
    const kalmanFiltered = this.filter.update(targetCollarY, 1.0);
    
    // Double smoothing with EMA for ultimate stability
    this.smoothedCollarY += (kalmanFiltered - this.smoothedCollarY) * this.SMOOTH;
    
    if (Number.isNaN(this.smoothedCollarY) || !Number.isFinite(this.smoothedCollarY)) {
        return shoulderMidY; // Fallback to safe value
    }
    
    return this.smoothedCollarY;
  }

  reset(): void {
    this.smoothedCollarY = 0;
    this.hasInit = false;
    // this.filter.reset(0); // Optional reset
  }
}

