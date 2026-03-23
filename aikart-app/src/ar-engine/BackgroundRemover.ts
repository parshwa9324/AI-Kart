/**
 * BackgroundRemover.ts
 *
 * Lightweight canvas-based background removal.
 * No neural networks — pure pixel math.
 *
 * Strategy:
 * 1. Sample background color from 4 corners
 * 2. Threshold: pixels near background color → alpha = 0
 * 3. Erode edges (remove fringe pixels)
 * 4. Feather (smooth alpha transition at edges)
 */

export interface RemovalOptions {
  /** Color distance threshold (0-255). Higher = more aggressive. Default 50. */
  threshold?: number;
  /** Feather radius in pixels. Default 2. */
  featherRadius?: number;
  /** Whether to apply erosion pass. Default true. */
  erode?: boolean;
}

export class BackgroundRemover {
  /**
   * Remove background from a loaded image.
   * Returns a new canvas with transparency.
   */
  static remove(
    source: HTMLImageElement | HTMLCanvasElement,
    options: RemovalOptions = {}
  ): HTMLCanvasElement {
    let threshold = options.threshold ?? 40; // was 50 — reduced for dark garments
    const featherR = options.featherRadius ?? 2;
    const doErode = options.erode ?? true;

    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

    // Draw source to offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // 1. Sample background color(s) from 4 corners (32x32 regions)
    const bgColors = this.sampleCorners(data, w, h);
    if (bgColors.length === 1) {
      console.log(`[BG] Corner color detected: ${bgColors[0].r}, ${bgColors[0].g}, ${bgColors[0].b}`);
    } else {
      console.log(`[BG] Checkerboard/multi-color detected: ${bgColors.length} colors`);
    }
    console.log(`[BG] Threshold: ${threshold}`);

    // Store original opaque pixels to protect center
    const originalData = new Uint8ClampedArray(data);

    // Initialize mask to 255 (Assume FG)
    const mask = new Uint8Array(w * h).fill(255);
    const t2 = threshold * threshold;

    // Flood fill from 4 corners
    const queue: number[] = [];
    // Helper to start flood fill
    const startFill = (x: number, y: number) => {
      const idx = y * w + x;
      const i = idx * 4;
      let minD2 = Infinity;
      for (let c = 0; c < bgColors.length; c++) {
        const bg = bgColors[c];
        const dr = data[i] - bg.r;
        const dg = data[i + 1] - bg.g;
        const db = data[i + 2] - bg.b;
        const d2 = dr * dr + dg * dg + db * db;
        if (d2 < minD2) minD2 = d2;
      }
      if (minD2 <= t2) {
        mask[idx] = 0;
        queue.push(idx);
      }
    };

    startFill(0, 0);
    startFill(w - 1, 0);
    startFill(0, h - 1);
    startFill(w - 1, h - 1);

    while (queue.length > 0) {
      const idx = queue.pop()!;
      const x = idx % w;
      const y = Math.floor(idx / w);
      this.fillNeighbors(x, y, w, h, mask, queue, data, bgColors, t2);
    }

    // 4. Erode edges (optional)
    if (doErode) {
      this.erodeMask(mask, w, h);
    }

    // 5. Feather edges (on mask)
    if (featherR > 0) {
      this.featherMask(mask, w, h, featherR);
    }

    // 6. Apply mask to alpha channel
    // FIX 3: Enhanced Safety Zone
    // 1. Center radius increased 0.25 -> 0.35
    // 2. Vertical strip protection (x:30-70%, y:15-85%)
    const centerX = Math.floor(w / 2);
    const centerY = Math.floor(h / 2);
    const safeRadius = Math.floor(Math.min(w, h) * 0.35); // Increased from 0.25
    const sqSafeRadius = safeRadius * safeRadius;

    // Vertical strip bounds
    const vStripMinX = Math.floor(w * 0.30);
    const vStripMaxX = Math.floor(w * 0.70);
    const vStripMinY = Math.floor(h * 0.15);
    const vStripMaxY = Math.floor(h * 0.85);

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      let alpha = mask[i]; // 0=bg, 255=fg (or feathered)

      // Check safety zone if pixel was removed
      if (alpha < 255) {
        const x = i % w;
        const y = Math.floor(i / w);
        const dx = x - centerX;
        const dy = y - centerY;

        let isSafe = false;
        // Check radial zone
        if (dx * dx + dy * dy < sqSafeRadius) isSafe = true;
        // Check vertical strip
        else if (x >= vStripMinX && x <= vStripMaxX && y >= vStripMinY && y <= vStripMaxY) isSafe = true;

        if (isSafe) {
          // Only restore if pixel is clearly NOT the background color
          const origR = originalData[idx];
          const origG = originalData[idx + 1];
          const origB = originalData[idx + 2];

          let minDist = Infinity;
          for (let c = 0; c < bgColors.length; c++) {
            const bg = bgColors[c];
            const dr = origR - bg.r;
            const dg = origG - bg.g;
            const db = origB - bg.b;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist < minDist) minDist = dist;
          }

          let isRestored = false;
          if (originalData[idx + 3] > 10) {
            if (bgColors.length > 1) {
              // Checkerboard backgrounds have lots of JPEG noise.
              // To NOT restore the checkerboard, we need a strict distance check.
              isRestored = minDist > threshold * 0.6;
            } else {
              isRestored = minDist > threshold * 0.5;
            }
          }

          if (isRestored) {
            alpha = 255;
          }
        }
      }

      data[idx + 3] = alpha;
    }

    // Phase 3: Halo suppression — edge pixels near bg color → more transparent
    // this.haloSuppress(data, mask, bgColor, w, h); // DISABLED

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /**
   * Check if an image already has meaningful alpha (transparent PNG).
   */
  static hasAlpha(source: HTMLImageElement | HTMLCanvasElement): boolean {
    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(w, 64); // sample small region for speed
    canvas.height = Math.min(h, 64);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentCount = 0;
    const total = canvas.width * canvas.height;

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 240) transparentCount++;
    }

    // If >5% of pixels have meaningful transparency, it's already transparent
    return transparentCount / total > 0.05;
  }

  // ── Private ──────────────────────────────────────────

  private static sampleCorners(
    data: Uint8ClampedArray,
    w: number,
    h: number
  ): { r: number; g: number; b: number }[] {
    const size = Math.min(32, Math.floor(Math.min(w, h) / 4));
    const samples: { r: number, g: number, b: number }[] = [];

    // Corners: TL, TR, BL, BR
    const regions = [
      { x0: 0, y0: 0 },
      { x0: w - size, y0: 0 },
      { x0: 0, y0: h - size },
      { x0: w - size, y0: h - size },
    ];

    for (const { x0, y0 } of regions) {
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const idx = ((y0 + dy) * w + (x0 + dx)) * 4;
          // Ignore fully transparent pixels
          if (data[idx + 3] < 10) continue;
          samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
    }

    if (samples.length === 0) return [{ r: 255, g: 255, b: 255 }];

    // Find the most frequent color (quantized to 16x16x16 bins to handle noise)
    const bins = new Map<number, { r: number, g: number, b: number, count: number }>();
    const quantize = 16;
    for (const s of samples) {
      const hash = Math.floor(s.r / quantize) * 65536 + Math.floor(s.g / quantize) * 256 + Math.floor(s.b / quantize);
      const entry = bins.get(hash);
      if (entry) {
        entry.r += s.r; entry.g += s.g; entry.b += s.b; entry.count++;
      } else {
        bins.set(hash, { r: s.r, g: s.g, b: s.b, count: 1 });
      }
    }

    const sortedBins = Array.from(bins.values()).sort((a, b) => b.count - a.count);

    // Top bin is definitively a background color
    const bgColors = [];
    if (sortedBins.length > 0) {
      bgColors.push({
        r: Math.round(sortedBins[0].r / sortedBins[0].count),
        g: Math.round(sortedBins[0].g / sortedBins[0].count),
        b: Math.round(sortedBins[0].b / sortedBins[0].count),
      });
    }

    // If second bin has > 15% of samples, it's a checkerboard pattern
    if (sortedBins.length > 1 && sortedBins[1].count > samples.length * 0.15) {
      bgColors.push({
        r: Math.round(sortedBins[1].r / sortedBins[1].count),
        g: Math.round(sortedBins[1].g / sortedBins[1].count),
        b: Math.round(sortedBins[1].b / sortedBins[1].count),
      });
    }

    return bgColors;
  }

  private static erodeMask(mask: Uint8Array, w: number, h: number): void {
    // 2 passes of erosion for cleaner edges
    for (let pass = 0; pass < 2; pass++) {
      const copy = new Uint8Array(mask);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (copy[i] === 0) continue;
          // If any neighbor is bg, this becomes bg (erosion)
          if (
            copy[i - 1] === 0 || copy[i + 1] === 0 ||
            copy[i - w] === 0 || copy[i + w] === 0 ||
            copy[i - w - 1] === 0 || copy[i - w + 1] === 0 || // Add diagonal erosion
            copy[i + w - 1] === 0 || copy[i + w + 1] === 0
          ) {
            mask[i] = 0;
          }
        }
      }
    }
  }

  private static featherMask(mask: Uint8Array, w: number, h: number, radius: number): void {
    // Simple distance-from-edge feathering
    const temp = new Uint8Array(mask);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (temp[i] === 0) continue;

        // Check distance to nearest bg pixel within radius
        let minDist = radius + 1;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            if (temp[ny * w + nx] === 0) {
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < minDist) minDist = d;
            }
          }
        }

        if (minDist <= radius) {
          // Fade alpha based on distance to edge
          mask[i] = Math.round(255 * (minDist / (radius + 1)));
        }
      }
    }
  }

  /** Phase 3: 3×3 average blur on mask to smooth jagged edges */
  private static softMask(mask: Uint8Array, w: number, h: number): void {
    const copy = new Uint8Array(mask);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const sum = copy[i - w - 1] + copy[i - w] + copy[i - w + 1]
          + copy[i - 1] + copy[i] + copy[i + 1]
          + copy[i + w - 1] + copy[i + w] + copy[i + w + 1];
        mask[i] = Math.round(sum / 9);
      }
    }
  }

  /** Phase 3: Suppress halo — edge pixels near bg color get reduced alpha */
  private static haloSuppress(
    data: Uint8ClampedArray,
    mask: Uint8Array,
    bgColor: { r: number; g: number; b: number },
    w: number,
    h: number
  ): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const alpha = mask[i];
        // Only process semi-transparent edge pixels
        if (alpha <= 0 || alpha >= 240) continue;

        const idx = i * 4;
        const dr = data[idx] - bgColor.r;
        const dg = data[idx + 1] - bgColor.g;
        const db = data[idx + 2] - bgColor.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        // If pixel color is near background, reduce alpha further
        if (dist < 60) {
          const factor = dist / 60; // 0→1
          data[idx + 3] = Math.round(alpha * factor);
        }
      }
    }
  }
  private static pushIfBg(
    x: number, y: number,
    w: number, h: number,
    mask: Uint8Array,
    queue: number[]
  ): void {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (mask[idx] === 0) return; // Already visited/BG
    queue.push(idx);
  }

  private static fillNeighbors(
    x: number, y: number,
    w: number, h: number,
    mask: Uint8Array,
    queue: number[],
    data: Uint8ClampedArray,
    bgColors: { r: number; g: number; b: number }[],
    t2: number
  ): void {
    const idx = y * w + x;
    const i = idx * 4;

    let minD2 = Infinity;
    for (let c = 0; c < bgColors.length; c++) {
      const bg = bgColors[c];
      const dr = data[i] - bg.r;
      const dg = data[i + 1] - bg.g;
      const db = data[i + 2] - bg.b;
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 < minD2) minD2 = d2;
    }

    if (minD2 <= t2) {
      // Is background
      mask[idx] = 0; // Mark as BG
      // Push neighbors
      this.pushIfBg(x + 1, y, w, h, mask, queue);
      this.pushIfBg(x - 1, y, w, h, mask, queue);
      this.pushIfBg(x, y + 1, w, h, mask, queue);
      this.pushIfBg(x, y - 1, w, h, mask, queue);
    }
  }
}
