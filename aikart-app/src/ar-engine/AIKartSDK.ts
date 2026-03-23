/**
 * AIKartSDK.ts — Lightweight SDK Entry Point
 *
 * This file is the ONLY thing loaded up front (<5KB minified).
 * All heavy engine code (WebGL, MediaPipe, mesh warping) is loaded
 * lazily via dynamic import() only after the user clicks "Enable Camera".
 *
 * Usage:
 *   const instance = await window.AIKart.init({
 *     garmentImage: 'https://example.com/shirt.png',
 *     container: document.getElementById('ar-container'),
 *     onLoadProgress: (stage, msg) => console.log(`[${stage}/3] ${msg}`),
 *     onError: (code, msg) => console.error(`[${code}] ${msg}`),
 *   });
 *
 *   // Feature detection (no heavy imports):
 *   const check = AIKart.isSupported();
 *   if (!check.supported) console.warn(check.reason);
 */

// ── Type-only imports — erased at compile time, 0 bytes runtime ──
import type { EngineConfig, AIKartError } from './Engine';
// ── Error Taxonomy ────────────────────────────────────────────

export enum AIKartErrorCode {
  CAMERA_DENIED = 'AK-E001',
  POSE_MODEL_FAILED = 'AK-E002',
  GARMENT_LOAD_FAILED = 'AK-E003',
  WEBGL_NOT_SUPPORTED = 'AK-E004',
  VERTEX_EXPLOSION = 'AK-E005',
  DOMAIN_NOT_AUTHORIZED = 'AK-E006',
}

// ── Public Types ──────────────────────────────────────────────

export interface GarmentOption {
  /** Unique identifier for this garment */
  id: string;
  /** Display label (e.g. "White T-Shirt") */
  label: string;
  /** Full-resolution garment image URL */
  imageUrl: string;
  /** Optional thumbnail URL for UI lists */
  thumbnailUrl?: string;
}

export interface AIKartSDKConfig {
  /** URL to the garment image */
  garmentImage: string;
  /** Container element to mount the AR canvas into */
  container: HTMLElement;
  /** Enable debug overlay (wireframe + anchors). Default false. */
  debug?: boolean;
  /** Quality mode: 'auto', 'high', 'low'. Default 'auto'. */
  qualityMode?: 'auto' | 'high' | 'low';
  /** FPS target. Default 30. */
  targetFPS?: number;
  /** Status change callback */
  onStatusChange?: (status: string, msg?: string) => void;
  /** Structured error callback — fires before the error is re-thrown */
  onError?: (code: AIKartErrorCode, message: string) => void;
  /** Loading progress callback — fires as heavy assets are loaded */
  onLoadProgress?: (stage: number, message: string) => void;
  /** Fires when garment is switched via switchGarment() */
  onGarmentChange?: (id: string) => void;
}

export interface AIKartInstance {
  changeGarment(url: string): Promise<void>;
  changeGarmentFromFile(file: File): Promise<void>;
  /** Store a garment catalog for use with switchGarment(). Data only, no UI. */
  loadGarmentCatalog(garments: GarmentOption[]): void;
  /** Switch to a garment by catalog ID. Emits onGarmentChange. */
  switchGarment(id: string): Promise<void>;
  /** Returns the active garment's catalog ID, or null if none set. */
  currentGarmentId(): string | null;
  debug(enabled: boolean): void;
  stress(enabled: boolean): void;
  telemetry(): Record<string, any> | null;
  fps(): number;
  dispose(): void;
}

export interface SupportCheck {
  supported: boolean;
  reason?: string;
}

// ── Error Mapping (lightweight — no engine imports) ───────────

function mapErrorCode(err: unknown): AIKartErrorCode | null {
  if (!(err instanceof Error)) return null;

  const code = (err as AIKartError).code;
  if (code === 'AK-E001') return AIKartErrorCode.CAMERA_DENIED;

  const msg = err.message.toLowerCase();

  if (msg.includes('camera') && (msg.includes('denied') || msg.includes('not allowed'))) {
    return AIKartErrorCode.CAMERA_DENIED;
  }
  if (msg.includes('getusermedia') || msg.includes('notallowederror')) {
    return AIKartErrorCode.CAMERA_DENIED;
  }
  if (msg.includes('pose') || msg.includes('mediapipe') || msg.includes('model')) {
    return AIKartErrorCode.POSE_MODEL_FAILED;
  }
  if (msg.includes('garment') || msg.includes('shirt') || msg.includes('image')) {
    return AIKartErrorCode.GARMENT_LOAD_FAILED;
  }
  if (msg.includes('webgl') || msg.includes('gl context') || msg.includes('rendering context')) {
    return AIKartErrorCode.WEBGL_NOT_SUPPORTED;
  }

  return null;
}

// ── SDK Class ─────────────────────────────────────────────────

class AIKartSDKImpl {

  /**
   * Check browser compatibility. No heavy imports — purely DOM API probes.
   */
  static isSupported(): SupportCheck {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) {
        return { supported: false, reason: 'WebGL 2.0 is not supported by this browser' };
      }
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch {
      return { supported: false, reason: 'WebGL 2.0 context creation failed' };
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return { supported: false, reason: 'Camera access (getUserMedia) is not available' };
    }

    return { supported: true };
  }

  /**
   * Initialize the AR try-on engine.
   *
   * Flow:
   *   1. Show pre-permission overlay (no heavy imports yet)
   *   2. User clicks "Enable Camera"
   *   3. Show loading progress overlay
   *   4. Stage 1: dynamic import('./Engine') — loads all AR code
   *   5. Stage 2: engine.init() — camera + MediaPipe + garment
   *   6. Stage 3: "Ready" — brief flash, overlay removed, AR starts
   */
  async init(config: AIKartSDKConfig): Promise<AIKartInstance> {
    const {
      container,
      garmentImage,
      debug = false,
      qualityMode = 'auto',
      targetFPS = 30,
      onStatusChange,
      onError,
      onLoadProgress,
      onGarmentChange,
    } = config;

    // Create canvas (hidden until AR starts)
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'none';
    canvas.style.objectFit = 'contain';
    container.appendChild(canvas);

    // ── Step 1: Pre-permission overlay (0 heavy imports) ──
    await AIKartSDKImpl.showPrePermission(container);

    // ── Step 2: Loading progress overlay ──
    const loader = AIKartSDKImpl.showLoadingProgress(container);

    // ── Stage 1: Load engine bundle (all heavy code) ──
    loader.update(1, 'Loading AR engine...');
    onLoadProgress?.(1, 'Loading AR engine...');

    let EngineClass: typeof import('./Engine')['Engine'];
    try {
      const mod = await import('./Engine');
      EngineClass = mod.Engine;
    } catch (err) {
      loader.remove();
      if (onError) {
        onError(AIKartErrorCode.WEBGL_NOT_SUPPORTED,
          err instanceof Error ? err.message : 'Failed to load AR engine module');
      }
      throw err;
    }

    // Reveal canvas and size it
    canvas.style.display = 'block';
    const rect = container.getBoundingClientRect();
    canvas.width = Math.max(rect.width, 320);
    canvas.height = Math.max(rect.height, 240);

    // Build engine config
    const engineConfig: EngineConfig = {
      canvas,
      shirtUrl: garmentImage,
      useMeshWarp: true,
      targetFPS,
      demoMode: false,
      onStatusChange: onStatusChange as EngineConfig['onStatusChange'],
    };

    const engine = new EngineClass(engineConfig);

    // ── Stage 2: Init engine (camera + pose model + garment) ──
    loader.update(2, 'Initializing pose detection...');
    onLoadProgress?.(2, 'Initializing pose detection...');

    try {
      await engine.init();
    } catch (err) {
      loader.remove();
      const code = mapErrorCode(err);
      if (code && onError) {
        onError(code, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }

    // ── Stage 3: Ready ──
    loader.update(3, 'Ready');
    onLoadProgress?.(3, 'Ready');

    // Brief "Ready" flash so the user sees the final state
    await new Promise<void>((r) => setTimeout(r, 600));
    loader.remove();

    // Apply quality mode
    if (qualityMode !== 'auto' && engine['meshWarper']) {
      engine['meshWarper'].autoAdaptive = false;
    }

    if (debug) {
      engine.setDebugMode(true);
    }

    engine.start();

    // ── Garment catalog state ──
    const catalog = new Map<string, GarmentOption>();
    let activeGarmentId: string | null = null;

    // ── Build public instance ──
    const instance: AIKartInstance = {
      async changeGarment(url: string): Promise<void> {
        activeGarmentId = null;
        await engine.changeGarment(url);
      },
      async changeGarmentFromFile(file: File): Promise<void> {
        activeGarmentId = null;
        await engine.changeGarmentFromFile(file);
      },
      loadGarmentCatalog(garments: GarmentOption[]): void {
        catalog.clear();
        for (const g of garments) {
          catalog.set(g.id, g);
        }
      },
      async switchGarment(id: string): Promise<void> {
        const entry = catalog.get(id);
        if (!entry) {
          throw new Error(`Garment ID "${id}" not found in catalog`);
        }
        await engine.changeGarment(entry.imageUrl);
        activeGarmentId = id;
        onGarmentChange?.(id);
      },
      currentGarmentId(): string | null {
        return activeGarmentId;
      },
      debug(enabled: boolean): void {
        engine.setDebugMode(enabled);
      },
      stress(enabled: boolean): void {
        engine.setStressTest(enabled);
      },
      telemetry(): Record<string, any> | null {
        const stats = engine.stats;
        return {
          fpsAvg: stats.fps,
          fpsMin: 0,
          fpsMax: 0,
          frameVariance: 0,
          densitySwitchCount: 0,
          densitySwitchLog: [],
          invalidFrameCount: 0,
          nanFrameCount: 0,
          explosionResetCount: 0,
        };
      },
      fps(): number {
        return engine.stats.fps;
      },
      dispose(): void {
        catalog.clear();
        activeGarmentId = null;
        engine.dispose();
        if (canvas.parentElement) {
          canvas.parentElement.removeChild(canvas);
        }
      },
    };

    return instance;
  }

  // ── Pre-Permission Overlay ──────────────────────────────────

  /**
   * Shadow DOM overlay explaining camera usage.
   * Resolves when the user clicks "Enable Camera".
   */
  private static showPrePermission(container: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      const host = document.createElement('div');
      host.style.position = 'absolute';
      host.style.inset = '0';
      host.style.zIndex = '1000';
      container.appendChild(host);

      const containerPos = getComputedStyle(container).position;
      if (containerPos === 'static') {
        container.style.position = 'relative';
      }

      const shadow = host.attachShadow({ mode: 'closed' });

      shadow.innerHTML = `
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          .aikart-overlay {
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: rgba(10, 10, 15, 0.92);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #fff; text-align: center;
            gap: 16px; padding: 24px;
            opacity: 1; transition: opacity 0.35s ease-out;
          }
          .aikart-overlay.aikart-hide { opacity: 0; pointer-events: none; }
          .aikart-logo { font-size: 24px; font-weight: 800; letter-spacing: 3px; margin-bottom: 8px; }
          .aikart-accent {
            background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          }
          .aikart-icon {
            width: 64px; height: 64px; border-radius: 50%;
            background: rgba(99,102,241,0.15);
            display: flex; align-items: center; justify-content: center; margin-bottom: 4px;
          }
          .aikart-icon svg { width: 32px; height: 32px; fill: none; stroke: #a78bfa; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
          .aikart-title { font-size: 18px; font-weight: 600; color: #f1f5f9; }
          .aikart-sub { font-size: 13px; color: #94a3b8; max-width: 320px; line-height: 1.5; }
          .aikart-privacy { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #64748b; margin-top: 4px; }
          .aikart-privacy svg { width: 14px; height: 14px; fill: none; stroke: #22c55e; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
          .aikart-btn {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 12px 28px; border: none; border-radius: 12px;
            background: #fff; color: #0f172a;
            font-size: 15px; font-weight: 600; font-family: inherit; cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            box-shadow: 0 2px 12px rgba(99,102,241,0.25); margin-top: 8px;
          }
          .aikart-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99,102,241,0.4); }
          .aikart-btn:active { transform: translateY(0); }
          .aikart-btn svg { width: 18px; height: 18px; fill: none; stroke: #6366f1; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        </style>
        <div class="aikart-overlay">
          <div class="aikart-logo"><span class="aikart-accent">AI-KART</span></div>
          <div class="aikart-icon">
            <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
          <div class="aikart-title">Try on clothes using your camera</div>
          <div class="aikart-sub">See how garments look on you in real time with augmented reality.</div>
          <button class="aikart-btn" type="button">
            <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Enable Camera
          </button>
          <div class="aikart-privacy">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Your video is processed locally. Nothing is sent to our servers.
          </div>
        </div>
      `;

      const btn = shadow.querySelector('.aikart-btn') as HTMLButtonElement;
      const overlay = shadow.querySelector('.aikart-overlay') as HTMLElement;

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        host.remove();
        resolve();
      };

      btn.addEventListener('click', () => {
        overlay.classList.add('aikart-hide');
        overlay.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, 400);
      }, { once: true });
    });
  }

  // ── Loading Progress Overlay ────────────────────────────────

  /**
   * Shadow DOM loading overlay with 3-stage progress indicator.
   * Returns update() and remove() controls.
   */
  private static showLoadingProgress(container: HTMLElement): {
    update: (stage: number, message: string) => void;
    remove: () => void;
  } {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.inset = '0';
    host.style.zIndex = '1001';
    container.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .aikart-loader {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: rgba(10, 10, 15, 0.95);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #fff; text-align: center; gap: 20px; padding: 24px;
          opacity: 1; transition: opacity 0.3s ease-out;
        }
        .aikart-loader.aikart-hide { opacity: 0; pointer-events: none; }
        .aikart-logo { font-size: 20px; font-weight: 800; letter-spacing: 3px; }
        .aikart-accent {
          background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .aikart-spinner {
          width: 40px; height: 40px;
          border: 3px solid rgba(99,102,241,0.2);
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: aikart-spin 0.8s linear infinite;
        }
        @keyframes aikart-spin { to { transform: rotate(360deg); } }
        .aikart-msg { font-size: 14px; font-weight: 500; color: #e2e8f0; min-height: 20px; }
        .aikart-stages {
          display: flex; align-items: center; gap: 8px; margin-top: 4px;
        }
        .aikart-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: rgba(99,102,241,0.25);
          transition: background 0.3s ease, transform 0.3s ease;
        }
        .aikart-dot.aikart-done { background: #6366f1; }
        .aikart-dot.aikart-active {
          background: #a78bfa;
          transform: scale(1.3);
          animation: aikart-pulse 1s ease-in-out infinite;
        }
        @keyframes aikart-pulse {
          0%, 100% { transform: scale(1.3); opacity: 1; }
          50% { transform: scale(1); opacity: 0.6; }
        }
        .aikart-bar-wrap {
          position: relative; width: 180px; height: 3px;
          background: rgba(99,102,241,0.15); border-radius: 2px;
          overflow: hidden;
        }
        .aikart-bar-fill {
          position: absolute; left: 0; top: 0; height: 100%;
          background: linear-gradient(90deg, #6366f1, #a855f7);
          border-radius: 2px;
          transition: width 0.5s ease-out;
          width: 0%;
        }
        .aikart-check {
          display: none;
          width: 40px; height: 40px;
          fill: none; stroke: #22c55e; stroke-width: 2.5;
          stroke-linecap: round; stroke-linejoin: round;
        }
        .aikart-loader.aikart-ready .aikart-spinner { display: none; }
        .aikart-loader.aikart-ready .aikart-check { display: block; }
        .aikart-loader.aikart-ready .aikart-msg { color: #22c55e; font-weight: 600; }
      </style>
      <div class="aikart-loader">
        <div class="aikart-logo"><span class="aikart-accent">AI-KART</span></div>
        <div class="aikart-spinner"></div>
        <svg class="aikart-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        <div class="aikart-msg">Loading AR engine...</div>
        <div class="aikart-stages">
          <div class="aikart-dot" data-stage="1"></div>
          <div class="aikart-dot" data-stage="2"></div>
          <div class="aikart-dot" data-stage="3"></div>
        </div>
        <div class="aikart-bar-wrap">
          <div class="aikart-bar-fill"></div>
        </div>
      </div>
    `;

    const loaderEl = shadow.querySelector('.aikart-loader') as HTMLElement;
    const msgEl = shadow.querySelector('.aikart-msg') as HTMLElement;
    const barEl = shadow.querySelector('.aikart-bar-fill') as HTMLElement;
    const dots = shadow.querySelectorAll('.aikart-dot');

    const update = (stage: number, message: string) => {
      msgEl.textContent = message;

      // Progress bar: stage 1 = 33%, stage 2 = 66%, stage 3 = 100%
      barEl.style.width = `${Math.round((stage / 3) * 100)}%`;

      // Update dots
      dots.forEach((dot, i) => {
        const s = i + 1;
        dot.classList.toggle('aikart-done', s < stage);
        dot.classList.toggle('aikart-active', s === stage);
      });

      // Stage 3 = ready state (swap spinner for checkmark)
      if (stage >= 3) {
        loaderEl.classList.add('aikart-ready');
      }
    };

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      loaderEl.classList.add('aikart-hide');
      const cleanup = () => { try { host.remove(); } catch { /* safe */ } };
      loaderEl.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 350);
    };

    return { update, remove };
  }
}

// ── Global Registration ───────────────────────────────────────

const sdk = new AIKartSDKImpl();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).AIKart = {
    init: sdk.init.bind(sdk),
    isSupported: AIKartSDKImpl.isSupported,
  };
}

export { AIKartSDKImpl as AIKartSDK };
export default sdk;
