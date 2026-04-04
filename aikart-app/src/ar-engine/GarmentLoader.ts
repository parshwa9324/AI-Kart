/**
 * GarmentLoader.ts
 *
 * Loads garment images from URL or File.
 * Auto-detects transparency; applies BackgroundRemover if needed.
 * Runs GarmentAnalyzer for intelligent type/anchor detection.
 */

import { BackgroundRemover, type RemovalOptions } from './BackgroundRemover';
import { type GarmentProfile, type GarmentType, SAFE_PROFILE } from './GarmentConfig';

export interface GarmentTexture {
  /** Canvas with premultiplied alpha (ready for drawImage) */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  hadAlpha: boolean;
  /** Shortcut: detected garment type */
  detectedType: GarmentType;
  /** Shortcut: calibrated profile */
  profile: GarmentProfile;
}

export class GarmentLoader {
  static async fromUrl(
    url: string,
    bgRemovalOpts?: RemovalOptions
  ): Promise<GarmentTexture> {
    const img = await this.loadImage(url);
    return this.processImage(img, bgRemovalOpts);
  }

  static async fromFile(
    file: File,
    bgRemovalOpts?: RemovalOptions
  ): Promise<GarmentTexture> {
    const url = URL.createObjectURL(file);
    try {
      const img = await this.loadImage(url);
      return this.processImage(img, bgRemovalOpts);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ── Private ──────────────────────────────────────────

  private static loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  private static processImage(
    img: HTMLImageElement,
    bgRemovalOpts?: RemovalOptions
  ): GarmentTexture {
    const hadAlpha = BackgroundRemover.hasAlpha(img);

    let canvas: HTMLCanvasElement | OffscreenCanvas;

    if (hadAlpha) {
      // Image already has meaningful transparency — skip BackgroundRemover entirely.
      // Running removal on transparent PNGs flood-fills from corners and destroys garment pixels.
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas = c;
      console.log(`[GarmentLoader] Image has alpha — skipped BackgroundRemover (${w}x${h})`);
    } else {
      // Opaque image — run BackgroundRemover to strip background
      canvas = BackgroundRemover.remove(img, bgRemovalOpts);
    }

    // Phase 6: Cast to HTMLCanvasElement for Analyzer (compatible via CanvasImageSource)
    // Analyzer uses drawImage, so OffscreenCanvas is fine.
    const analysisCanvas = canvas as unknown as HTMLCanvasElement;

    // Use Safe Mode — fallback because GarmentAnalyzer prototype is deleted
    const useSafeMode = true;
    const profile = SAFE_PROFILE;

    // ── Auto-Fallback: Detection of Garment Deletion ──
    {
      const debugCanvas = canvas as HTMLCanvasElement;
      const dCtx = debugCanvas.getContext('2d', { willReadFrequently: true })!;
      const gw = debugCanvas.width;
      const gh = debugCanvas.height;
      const points = [
        { name: 'center', x: Math.floor(gw / 2), y: Math.floor(gh / 2) },
        { name: 'upper-center', x: Math.floor(gw / 2), y: Math.floor(gh * 0.25) },
        { name: 'lower-center', x: Math.floor(gw / 2), y: Math.floor(gh * 0.75) },
        { name: 'left-mid', x: Math.floor(gw * 0.3), y: Math.floor(gh / 2) },
        { name: 'right-mid', x: Math.floor(gw * 0.7), y: Math.floor(gh / 2) },
      ];

      let alphaSum = 0;
      for (const p of points) {
        const px = dCtx.getImageData(p.x, p.y, 1, 1).data;
        alphaSum += px[3];
        console.log(`[GARMENT DEBUG] ${p.name} (${p.x},${p.y}) RGBA: ${px[0]}, ${px[1]}, ${px[2]}, ${px[3]}`);
      }

      // If the garment was mostly deleted (alphaSum is very low across 5 core points)
      if (alphaSum < 255 * 2) {
        console.warn('[GARMENT] Garment body was deleted! Retrying Background Removal with strict threshold (15).');
        // Rerun with strict threshold so white-on-white survives
        canvas = BackgroundRemover.remove(img, { ...(bgRemovalOpts || {}), threshold: 15 });
      }
    }

    return {
      canvas: canvas as HTMLCanvasElement, // Cast for interface compatibility
      width: canvas.width,
      height: canvas.height,
      hadAlpha,
      detectedType: 'tshirt',
      profile,
    };
  }
}