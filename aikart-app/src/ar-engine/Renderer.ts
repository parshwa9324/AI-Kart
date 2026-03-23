/**
 * Renderer.ts — Perception Upgraded
 *
 * Canvas rendering:
 * - Mirrored camera, shirt overlay with parallax + fabric stretch
 * - Subtle shadow under shirt
 * - Adaptive brightness + contrast from camera feed
 * - Framing hints (too far / misaligned)
 * - Fit confidence indicator
 * - Pose keypoints (debug)
 * - FPS counter
 * - Watermark branding
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { LANDMARK } from './PoseDetector';
import { IRenderer, FPSStats, FramingHints } from './interfaces/IRenderer';

const KEYPOINT_INDICES = [
  LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER,
  LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP,
  LANDMARK.LEFT_ELBOW, LANDMARK.RIGHT_ELBOW,
];

const CONNECTIONS: readonly (readonly [number, number])[] = [
  [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER],
  [LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP],
  [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP],
  [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP],
];

const TWO_PI = Math.PI * 2;

export class Renderer implements IRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private readonly _stats: FPSStats = { fps: 0, frameTime: 0 };

  // Brightness + contrast sampling (Phase 3: 3-zone)
  private _sampledBrightness = 1.0;
  private _sampledContrast = 1.0;
  private _brightnessLeft = 1.0;
  private _brightnessRight = 1.0;
  private _sampleFrame = 0;
  private readonly SAMPLE_INTERVAL = 20;
  private _frameCount = 0;
  private _zones: number[] = [0, 0, 0];

  get brightness() { return this._sampledBrightness; }
  get contrast() { return this._sampledContrast; }

  public showKeypoints = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'medium';
  }

  get stats(): FPSStats { return this._stats; }

  /** Expose context for MeshWarper direct drawing */
  getContext(): CanvasRenderingContext2D { return this.ctx; }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  beginFrame(): void {
    this._frameCount++;
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      if (delta < 200) {
        this.frameTimes.push(delta);
        if (this.frameTimes.length > 30) this.frameTimes.shift();
      }
      if (this.frameTimes.length > 0) {
        let sum = 0;
        for (let i = 0; i < this.frameTimes.length; i++) sum += this.frameTimes[i];
        const avg = sum / this.frameTimes.length;
        this._stats.fps = Math.round(1000 / avg);
        this._stats.frameTime = Math.round(avg * 10) / 10;
      }
    }
    this.lastFrameTime = now;

    // Normalize canvas state at the start of every frame to avoid
    // accidental leakage of composite/alpha/filter between draws.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.filter = 'none';
    this.clear();
  }

  drawCamera(video: HTMLVideoElement): void {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /** Phase 3: Sample brightness from 3 zones (left shoulder, chest center, right shoulder) */
  sampleBrightness(): void {
    if (this._frameCount - this._sampleFrame < this.SAMPLE_INTERVAL) return;
    this._sampleFrame = this._frameCount;

    const { ctx, canvas } = this;
    const size = 6;
    const cy = Math.floor(canvas.height * 0.35);

    // 3 zones: left (25%), center (50%), right (75%)
    // 3 zones: left (25%), center (50%), right (75%)
    this._zones[0] = Math.floor(canvas.width * 0.25);
    this._zones[1] = Math.floor(canvas.width * 0.50);
    this._zones[2] = Math.floor(canvas.width * 0.75);

    const results: number[] = [];
    let overallSum = 0;
    let overallSumSq = 0;
    let overallCount = 0;

    try {
      for (const zx of this._zones) {
        const data = ctx.getImageData(zx - size / 2, cy - size / 2, size, size).data;
        let sum = 0;
        const count = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          sum += lum;
          overallSum += lum;
          overallSumSq += lum * lum;
          overallCount++;
        }
        results.push(sum / count / 255);
      }

      // Per-zone brightness targets
      const brL = 0.9 + results[0] * 0.2;
      const brC = 0.9 + results[1] * 0.2;
      const brR = 0.9 + results[2] * 0.2;

      this._brightnessLeft += (brL - this._brightnessLeft) * 0.15;
      this._sampledBrightness += (brC - this._sampledBrightness) * 0.15;
      this._brightnessRight += (brR - this._brightnessRight) * 0.15;

      // Contrast from variance
      const avgLum = overallSum / overallCount;
      const variance = (overallSumSq / overallCount - avgLum * avgLum) / (255 * 255);
      const ctTarget = variance < 0.02 ? 1.04 : variance < 0.05 ? 1.02 : 1.0;
      this._sampledContrast += (ctTarget - this._sampledContrast) * 0.1;
    } catch {
      this._sampledBrightness = 1.0;
      this._brightnessLeft = 1.0;
      this._brightnessRight = 1.0;
      this._sampledContrast = 1.0;
    }
  }

  drawKeypoints(landmarks: NormalizedLandmark[]): void {
    if (!this.showKeypoints) return;
    const { ctx, canvas } = this;
    for (let i = 0; i < KEYPOINT_INDICES.length; i++) {
      const lm = landmarks[KEYPOINT_INDICES[i]];
      if (!lm || (lm.visibility ?? 0) < 0.5) continue;
      const x = (1 - lm.x) * canvas.width;
      const y = lm.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TWO_PI);
      ctx.fillStyle = '#00ff88';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,255,136,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < CONNECTIONS.length; i++) {
      const lmA = landmarks[CONNECTIONS[i][0]];
      const lmB = landmarks[CONNECTIONS[i][1]];
      if (!lmA || !lmB || (lmA.visibility ?? 0) < 0.5 || (lmB.visibility ?? 0) < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo((1 - lmA.x) * canvas.width, lmA.y * canvas.height);
      ctx.lineTo((1 - lmB.x) * canvas.width, lmB.y * canvas.height);
      ctx.stroke();
    }
  }

  /** Subtle shadow ellipse underneath shirt */
  private drawShirtShadow(x: number, y: number, w: number, h: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.92, w * 0.3, h * 0.05, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw shirt with parallax, fabric stretch, shadow, adaptive brightness/contrast.
   * Phase 3: armpit shadow + fabric gradient + 3-zone regional brightness.
   */
  drawShirt(
    shirtImg: HTMLImageElement,
    x: number, y: number,
    width: number, height: number,
    angle: number, opacity: number,
    parallaxX = 0,
    stretchY = 1,
    occlusions?: { x: number; y: number; w: number; h: number }[]
  ): void {
    if (opacity <= 0.01) return;
    const { ctx } = this;

    const stretchedH = height * stretchY;
    const px = x + parallaxX;

    // Shadow behind shirt
    this.drawShirtShadow(px, y, width, stretchedH);

    ctx.save();
    ctx.globalAlpha = opacity;
    const br = Math.round(this._sampledBrightness * 100) / 100;
    const ct = Math.round(this._sampledContrast * 100) / 100;
    ctx.filter = `brightness(${br}) contrast(${ct})`;
    ctx.translate(px + width / 2, y + stretchedH / 2);
    ctx.rotate(angle);
    ctx.drawImage(shirtImg, -width / 2, -stretchedH / 2, width, stretchedH);

    // Phase 4: Fabric gradient — subtle top-to-bottom darkening (≤4%)
    ctx.globalCompositeOperation = 'multiply';
    const grad = ctx.createLinearGradient(0, -stretchedH / 2, 0, stretchedH / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(240,240,240,1)'); // slightly darker bottom (~4%)
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -stretchedH / 2, width, stretchedH);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    // Phase 4: Occlusion mask — clear arm regions crossing the body with 2px feather
    if (occlusions && occlusions.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      for (let i = 0; i < occlusions.length; i++) {
        const occ = occlusions[i];
        const cx = occ.x + occ.w * 0.5;
        const cy = occ.y + occ.h * 0.5;
        const rx = occ.w * 0.5;
        const ry = occ.h * 0.5;

        // Core cut
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO_PI);
        ctx.fill();

        // Feather edge ~2px using a soft stroke
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, TWO_PI);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // Phase 3: Armpit shadows — subtle dark ellipses under each shoulder
    this.drawArmpitShadow(px + width * 0.2, y + stretchedH * 0.15, width * 0.08, stretchedH * 0.06);
    this.drawArmpitShadow(px + width * 0.8, y + stretchedH * 0.15, width * 0.08, stretchedH * 0.06);

    // Phase 4: Shoulder contour shadow — very subtle rim near top edge
    const contourY = y + stretchedH * 0.12;
    const contourH = stretchedH * 0.04;
    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(px + width * 0.5, contourY, width * 0.45, contourH, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /** Phase 3: Subtle armpit shadow for depth illusion */
  private drawArmpitShadow(cx: number, cy: number, rx: number, ry: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.03; // very subtle
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  /** Task 2: Draw framing feedback hints on canvas */
  drawHints(hints: FramingHints): void {
    const { ctx, canvas } = this;

    let msg = '';
    if (hints.tooFar) {
      msg = '↕ Move closer for better fit';
    } else if (hints.notAligned) {
      msg = '◎ Align your torso in frame';
    }

    if (msg) {
      ctx.save();
      ctx.font = '500 15px system-ui, sans-serif';
      const metrics = ctx.measureText(msg);
      const tw = metrics.width;
      const px = (canvas.width - tw) / 2 - 12;
      const py = canvas.height - 50;

      // Pill background
      ctx.fillStyle = 'rgba(0,0,0,0.50)';
      const pw = tw + 24;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(px, py - 16, pw, 28, 14);
        ctx.fill();
      } else {
        ctx.fillRect(px, py - 16, pw, 28);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(msg, px + 12, py + 4);
      ctx.restore();
    }
  }

  /** Task 3: Draw fit confidence indicator top-right */
  drawFitConfidence(hints: FramingHints): void {
    const { ctx, canvas } = this;
    const label = `Fit: ${hints.confidenceLabel}`;
    const colors = {
      High: '#00ff88',
      Medium: '#ffaa00',
      Low: '#ff6666',
    };

    ctx.save();
    ctx.font = 'bold 12px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const px = canvas.width - tw - 28;
    const py = 12;

    // Pill background
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    const pw = tw + 20;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(px, py, pw, 24, 12);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, pw, 24);
    }

    ctx.fillStyle = colors[hints.confidenceLabel];
    ctx.fillText(label, px + 10, py + 16);
    ctx.restore();
  }

  /** Task 7: Draw watermark bottom-right */
  drawWatermark(): void {
    const { ctx, canvas } = this;
    const text = 'Powered by AI-Kart';

    ctx.save();
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    const tw = ctx.measureText(text).width;
    ctx.fillText(text, canvas.width - tw - 12, canvas.height - 10);
    ctx.restore();
  }

  drawFPS(): void {
    const { ctx } = this;
    const { fps, frameTime } = this._stats;

    ctx.save();
    ctx.font = 'bold 14px monospace';
    const text = `${fps} FPS (${frameTime}ms)`;
    const tw = ctx.measureText(text).width || 120;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const px = 8, py = 8, ph = 28, pw = tw + 20;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 6);
      ctx.fill();
    } else {
      ctx.fillRect(px, py, pw, ph);
    }

    ctx.fillStyle = fps >= 25 ? '#00ff88' : fps >= 15 ? '#ffaa00' : '#ff4444';
    ctx.fillText(text, 18, 27);
    ctx.restore();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
