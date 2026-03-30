/**
 * Engine.ts — Product Garment Try-On Engine
 *
 * Orchestrates the AR pipeline:
 * - Camera → PoseDetector → MeshWarper → Canvas
 * - GarmentLoader handles image loading + bg removal
 * - MeshWarper deforms 8×8 grid from pose landmarks
 * - Falls back to simple Overlay if mesh warping not available
 *
 * State machine: idle → initializing → running → paused → error → disposed
 */

import { PoseDetector, LANDMARK, type PoseResult } from './PoseDetector';
import { Renderer } from './Renderer';
import type { IRenderer, FramingHints } from './interfaces/IRenderer';
import { Overlay } from './Overlay';
import type { IMeshLayer, PoseMeshInput } from './interfaces/IMeshLayer';
import { GarmentLoader, type GarmentTexture } from './GarmentLoader';
import { type GarmentType } from './GarmentConfig';
import { LandmarkSmoother, BodyYaw, TorsoTilt, CollarAlignment, BoundingBoxNormalizer } from './BodyIntelligence';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { usePoseStore } from '../store/PoseStore';

// Three.js GLB loader — loaded dynamically to avoid blocking initial bundle
type ThreeModule = typeof import('three');
type GLTFLoaderModule = typeof import('three/addons/loaders/GLTFLoader.js');

export type EngineState =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'error'
  | 'disposed';

export type EngineStatus = EngineState;

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  /** Initial garment URL (can be SVG, PNG, JPG, GLB, GLTF) */
  shirtUrl: string;
  /** Garment type hint. Auto-detected if not set. */
  garmentType?: GarmentType;
  /** Use mesh warping (true) or simple overlay (false). Default true. */
  useMeshWarp?: boolean;
  showKeypoints?: boolean;
  /** Target render FPS. Default 60. */
  targetFPS?: number;
  demoMode?: boolean;
  /** Enable verbose console.log debug output. Default false in production. */
  devMode?: boolean;
  onStatusChange?: (status: EngineState, message?: string) => void;
}

interface PerfEntry {
  ts: number;
  frameMs: number;
  detectMs: number;
  detected: boolean;
}

/** Error with an optional structured code for SDK error mapping. */
export interface AIKartError extends Error {
  code?: string;
}

export class Engine {
  private poseDetector: PoseDetector;
  private renderer: IRenderer;
  private overlay: Overlay;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private _state: EngineState = 'idle';
  private targetFrameInterval: number;
  private lastProcessTime = 0;
  private demoMode: boolean;
  private stressTest = false;

  // Mesh warping
  private meshWarper: IMeshLayer | null = null;
  private garmentTexture: GarmentTexture | null = null;
  private useMeshWarp: boolean;

  // GLB / Three.js scene (3D garment path)
  private glbScene: import('three').Group | null = null;
  private glbRenderer: import('three').WebGLRenderer | null = null;
  private glbCamera: import('three').PerspectiveCamera | null = null;
  private glbAnimMixer: import('three').AnimationMixer | null = null;
  private _glbOffscreenCanvas: HTMLCanvasElement | null = null;
  private _glbThreeScene: import('three').Scene | null = null;
  private devMode: boolean;

  // Auto-throttle
  private skipFrame = false;
  private lowFpsCount = 0;
  private readonly LOW_FPS_THRESHOLD = 18;
  private readonly LOW_FPS_TRIGGER = 10;

  // Monotonic timestamp
  private lastDetectTimestamp = 0;
  private lastPose: PoseResult | null = null;

  // Video resolution monitoring
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;

  // Performance logger
  private _perfLog: PerfEntry[] = [];
  private readonly PERF_LOG_SIZE = 100;

  // Body intelligence (Phase 1)
  private landmarkSmoother = new LandmarkSmoother();
  private bodyYaw = new BodyYaw();
  private torsoTilt = new TorsoTilt();
  private collarAlign = new CollarAlignment();

  // Auto-Test Validation removed for SaaS Phase 2
  private _liveFrameCount = 0;

  // Persistent objects to avoid allocation
  private _meshInput: PoseMeshInput = {
    leftShoulder: { x: 0, y: 0 },
    rightShoulder: { x: 0, y: 0 },
    leftHip: { x: 0, y: 0 },
    rightHip: { x: 0, y: 0 },
    opacity: 1,
    bodyYawAngle: 0,
  };
  private _hints: FramingHints = {
    tooFar: false,
    notAligned: false,
    confidenceLabel: 'Low',
    confidenceValue: 0,
  };

  // Garment change sequencing — ensures only latest request wins
  private garmentToken = 0;

  constructor(private config: EngineConfig) {
    this.poseDetector = new PoseDetector();
    this.renderer = new Renderer(config.canvas);
    this.overlay = new Overlay();
    this.renderer.showKeypoints = config.showKeypoints ?? false;
    this.demoMode = config.demoMode ?? true;
    this.devMode = config.devMode ?? false;
    this.useMeshWarp = config.useMeshWarp ?? true;
    // Default to 60fps for smooth AR experience
    this.targetFrameInterval = 1000 / (config.targetFPS ?? 60);
  }

  // ── Public API ────────────────────────────────────────────

  get state(): EngineState { return this._state; }
  get status(): EngineState { return this._state; }
  get stats() {
    return this.renderer.stats;
  }
  get perfLog(): readonly PerfEntry[] { return this._perfLog; }
  get currentGarment(): GarmentTexture | null { return this.garmentTexture; }

  set showKeypoints(v: boolean) { this.renderer.showKeypoints = v; }

  async init(): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error(`Cannot init from state: ${this._state}`);
    }
    this.transition('initializing');

    try {
      // Load camera, pose model, and initial garment in parallel
      const initialToken = ++this.garmentToken;
      const [stream] = await Promise.all([
        this.startCamera(),
        this.poseDetector.init(),
        this.loadGarment(this.config.shirtUrl, this.config.garmentType, initialToken),
      ]);

      if ((this._state as string) === 'disposed') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.stream = stream;

      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.playsInline = true;
      this.video.muted = true;
      await this.video.play();

      if ((this._state as string) === 'disposed') {
        this.cleanupVideo();
        return;
      }

      // Wait for video dimensions
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const check = () => {
          if ((this._state as string) === 'disposed') { reject(new Error('Disposed')); return; }
          if (this.video!.videoWidth > 0 && this.video!.videoHeight > 0) {
            resolve();
          } else if (++attempts > 90) {
            reject(new Error('Camera failed to produce frames'));
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });

      this.lastVideoWidth = this.video.videoWidth;
      this.lastVideoHeight = this.video.videoHeight;
      this.renderer.resize(this.video.videoWidth, this.video.videoHeight);
    } catch (err) {
      if ((this._state as string) !== 'disposed') {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.transition('error', msg);
      }
      throw err;
    }
  }

  start(): void {
    if (this._state !== 'initializing' && this._state !== 'paused') return;
    this.transition('running');
    this.lastProcessTime = 0;
    this.lastDetectTimestamp = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this._state === 'running') {
      this.transition('paused');
    }
    this.cancelRaf();
  }

  async changeGarment(url: string, type?: GarmentType): Promise<void> {
    const token = ++this.garmentToken;
    this.resetGarmentPipeline(true);
    await this.loadGarment(url, type, token);
  }

  /** Toggle mesh debug overlay. Use keyboard "D" to trigger. */
  setDebugMode(enabled: boolean): void {
    if (this.meshWarper) this.meshWarper.debugMode = enabled;
  }

  /** Trigger stress test mode (random NaN/explosions) */
  setStressTest(enabled: boolean): void {
    this.stressTest = enabled;
  }

  /**
   * Hot-swap garment from a File object.
   */
  async changeGarmentFromFile(file: File, type?: GarmentType): Promise<void> {
    const token = ++this.garmentToken;
    this.resetGarmentPipeline(true);
    try {
      const texture = await GarmentLoader.fromFile(file);
      if (token !== this.garmentToken) {
        // A newer garment request has superseded this one
        return;
      }

      this.garmentTexture = texture;
      this.overlay.setTexture(texture.canvas);
    } catch (err) {
      if (!this.demoMode) console.error('[AR Engine] Garment load failed:', err);
    }
  }

  dispose(): void {
    if (this._state === 'disposed') return;
    this.transition('disposed');
    this.cancelRaf();

    if (this.stream) {
      try { this.stream.getTracks().forEach((t) => t.stop()); } catch { /* safe */ }
      this.stream = null;
    }

    this.cleanupVideo();
    try { this.poseDetector.dispose(); } catch { /* safe */ }
    this.meshWarper = null;
    this.garmentTexture = null;
  }

  // ── Private: Garment Loading ─────────────────────────────

  private async loadGarment(url: string, type: GarmentType | undefined, token: number): Promise<void> {
    // 3D path: GLB / GLTF → Three.js skeletal injection
    if (url.toLowerCase().endsWith('.glb') || url.toLowerCase().endsWith('.gltf')) {
      if (token !== this.garmentToken) return;
      await this.loadGlbGarment(url, token);
      return;
    }

    // SVG path: load directly via Overlay, skip BackgroundRemover
    // (SVGs have transparent backgrounds which BackgroundRemover flood-fills and destroys)
    if (url.toLowerCase().endsWith('.svg')) {
      if (token !== this.garmentToken) return;
      if (this.demoMode) console.log(`[AE-Engine] SVG garment — direct load: ${url.split('/').pop()}`);
      await this.overlay.loadShirt(url);
      return;
    }

    try {
      const texture = await GarmentLoader.fromUrl(url);
      if (token !== this.garmentToken) {
        // A newer garment request has superseded this one
        return;
      }

      this.garmentTexture = texture;

      if (this.useMeshWarp) {
        if (this.demoMode) {
          console.log(`[AE-Engine] Loaded Garment: ${url.split('/').pop()} (${texture.width}x${texture.height}) hadAlpha=${texture.hadAlpha} type=${texture.detectedType}`);
        }
      }

      this.overlay.setTexture(texture.canvas);
    } catch (err) {
      // Fallback: try loading as simple image (SVG etc.)
      if (!this.demoMode) console.warn('[AR Engine] GarmentLoader failed, trying simple load:', err);
      // In fallback mode we still respect the garment token to avoid stale draws
      if (token !== this.garmentToken) return;
      await this.overlay.loadShirt(url);
    }
  }

  /**
   * Load a GLB/GLTF garment via Three.js and bind skeleton bones to pose landmarks.
   * The Three.js scene renders into a hidden OffscreenCanvas then composites
   * onto the main AR canvas each frame via drawImage.
   */
  private async loadGlbGarment(url: string, token: number): Promise<void> {
    try {
      // Dynamic import to avoid bundling Three.js into the main chunk
      const [THREE, { GLTFLoader }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
      ]);

      if (token !== this.garmentToken) return; // stale request

      // Offscreen canvas for Three.js WebGL rendering
      const offscreen = document.createElement('canvas');
      offscreen.width = this.config.canvas.width;
      offscreen.height = this.config.canvas.height;

      const glRenderer = new THREE.WebGLRenderer({ canvas: offscreen, alpha: true, antialias: true });
      glRenderer.setPixelRatio(1); // always 1:1 for performance
      glRenderer.setSize(offscreen.width, offscreen.height);
      glRenderer.setClearColor(0x000000, 0); // transparent background

      const camera = new THREE.PerspectiveCamera(45, offscreen.width / offscreen.height, 0.1, 100);
      camera.position.set(0, 1.2, 2.5);

      const scene = new THREE.Scene();

      // Lights: hemisphere + directional for realistic cloth shading
      scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(0, 2, 2);
      scene.add(dirLight);

      // Load GLTF
      const gltf = await new Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(url, resolve, undefined, reject);
      });

      if (token !== this.garmentToken) {
        glRenderer.dispose();
        return;
      }

      this.glbScene = gltf.scene;
      this.glbRenderer = glRenderer;
      this.glbCamera = camera;

      // Set up animation mixer if clips exist
      if (gltf.animations.length > 0) {
        this.glbAnimMixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach(clip => this.glbAnimMixer!.clipAction(clip).play());
      }

      // Center garment at world origin
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      gltf.scene.position.y -= box.getSize(new THREE.Vector3()).y * 0.3;

      scene.add(gltf.scene);

      // Store scene reference in overlay pipeline for compositing
      this._glbOffscreenCanvas = offscreen;
      this._glbThreeScene = scene;

      if (this.devMode) console.log('[AR Engine] GLB loaded:', url);

    } catch (err) {
      console.warn('[AR Engine] GLB load failed, falling back to 2D overlay:', err);
      // Fallback: try as 2D image (handles wrong extension)
      if (token === this.garmentToken) {
        await this.overlay.loadShirt(url);
      }
    }
  }

  /**
   * Reset all garment-dependent state so that previous textures,
   * meshes, and occlusion history cannot leak into a new garment.
   */
  private resetGarmentPipeline(clearCanvas: boolean): void {
    this.meshWarper = null;
    this.garmentTexture = null;
    this.overlay.reset(true);
    // Dispose Three.js GLB resources
    if (this.glbRenderer) {
      this.glbRenderer.dispose();
      this.glbRenderer = null;
    }
    this.glbScene = null;
    this.glbCamera = null;
    this.glbAnimMixer = null;
    this._glbOffscreenCanvas = null;
    this._glbThreeScene = null;

    if (clearCanvas) {
      this.renderer.clear();
    }
  }

  // ── Private: State Machine ────────────────────────────────

  private transition(to: EngineState, msg?: string): void {
    this._state = to;
    this.config.onStatusChange?.(to, msg);
    if (!this.demoMode) {
      console.log(`[AR Engine] ${to}${msg ? ': ' + msg : ''}`);
    }
  }

  // ── Private: Camera ───────────────────────────────────────

  private async startCamera(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        const typed = new Error('Camera access denied by user');
        (typed as AIKartError).code = 'AK-E001';
        throw typed;
      }
      throw err;
    }
  }

  private cleanupVideo(): void {
    if (this.video) {
      try { this.video.pause(); } catch { /* safe */ }
      this.video.srcObject = null;
      this.video = null;
    }
  }

  private cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // ── Private: Render Loop ──────────────────────────────────

  private loop = (): void => {
    if (this._state !== 'running') return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    if (this.lastProcessTime > 0 && now - this.lastProcessTime < this.targetFrameInterval) return;
    if (this.lastProcessTime > 0 && now - this.lastProcessTime > 200) {
      this.lastProcessTime = now;
      return;
    }

    this.lastProcessTime = now;
    this.processFrame(now);
  };

  private processFrame(timestamp: number): void {
    if (!this.video || this.video.readyState < 2) return;

    // Video resolution change detection
    if (this.video.videoWidth !== this.lastVideoWidth || this.video.videoHeight !== this.lastVideoHeight) {
      this.lastVideoWidth = this.video.videoWidth;
      this.lastVideoHeight = this.video.videoHeight;
      this.renderer.resize(this.video.videoWidth, this.video.videoHeight);
    }

    this.renderer.beginFrame();
    this.renderer.drawCamera(this.video);
    this.renderer.sampleBrightness();

    // Reset PoseStore at start of frame, assuming no pose until proven otherwise
    usePoseStore.getState().resetPose();

    // Pose detection
    const shouldDetect = this.shouldDetectPose();
    const detectStart = performance.now();
    let pose: PoseResult | null = null;
    let isSkipFrame = false;

    if (shouldDetect) {
      const detectTs = Math.max(timestamp, this.lastDetectTimestamp + 1);
      this.lastDetectTimestamp = detectTs;
      pose = this.poseDetector.detect(this.video, detectTs);
      if (pose) this.lastPose = pose;
    } else {
      isSkipFrame = true;
      pose = this.lastPose;
    }

    const detectMs = performance.now() - detectStart;
    const cw = this.config.canvas.width;
    const ch = this.config.canvas.height;
    let currentConfidence = 0;
    let currentShoulderDist = 0;
    let hasPoseData = false;

    if (pose) {
      currentConfidence = pose.avgConfidence;
      this.renderer.drawKeypoints(pose.landmarks);

      // Step 2: Adaptive density auto-switch
      if (this.meshWarper) {
        const densityChanged = this.meshWarper.adaptDensity(this.renderer.stats.fps);
        if (densityChanged && this.garmentTexture) {
          this.meshWarper.buildSourceMesh(this.garmentTexture.width, this.garmentTexture.height);
        }
      }

      // ── Step 3.5: Extract Pose for 3D Map (Phase 1 3D) ───────────
      let poseMeshInput = null;
      let shoulderDist = 0;
      let shoulderMidX = 0;

      if (pose && pose.landmarks) {
        poseMeshInput = this.extractMeshInput(pose.landmarks, cw, ch);
        if (poseMeshInput) {

          shoulderDist = Math.hypot(
            poseMeshInput.rightShoulder.x - poseMeshInput.leftShoulder.x,
            poseMeshInput.rightShoulder.y - poseMeshInput.leftShoulder.y
          );
          shoulderMidX = (poseMeshInput.leftShoulder.x + poseMeshInput.rightShoulder.x) / 2;

          currentShoulderDist = shoulderDist;
          hasPoseData = true;

          // Unconditionally update 3D Store even if bypassing 2D textures
          usePoseStore.getState().updatePose({
            leftShoulder: { x: poseMeshInput.leftShoulder.x, y: poseMeshInput.leftShoulder.y },
            rightShoulder: { x: poseMeshInput.rightShoulder.x, y: poseMeshInput.rightShoulder.y },
            leftHip: { x: poseMeshInput.leftHip.x, y: poseMeshInput.leftHip.y },
            rightHip: { x: poseMeshInput.rightHip.x, y: poseMeshInput.rightHip.y },
            leftElbow: poseMeshInput.leftElbow,
            rightElbow: poseMeshInput.rightElbow,
            canvasWidth: cw,
            canvasHeight: ch,
            yawCompression: poseMeshInput.yawCompression,
            torsoPitchScale: poseMeshInput.torsoPitchScale,
            collarY: poseMeshInput.collarY,
            bodyYawAngle: poseMeshInput.bodyYawAngle
          });
        }
      }

      // Decide: mesh warp or simple overlay
      let usedMeshWarp = false;
      if (this.meshWarper && this.garmentTexture) {
        // ─── MESH WARP PATH ───
        if (!poseMeshInput) {
          // No valid pose data
          this.rafId = requestAnimationFrame(this.loop);
          return;
        }

        // ── Step 5: Occlusion Detection (Phase 4) ───────────
        const safeOcclusions = undefined;

        // ── Step 6: Mesh Warping ────────────────────────────
        if (this.useMeshWarp && this.meshWarper && this.garmentTexture) {
          // Build mesh (returns false if invalid geometry)
          const valid = this.meshWarper.buildTargetMesh(poseMeshInput);
          if (!valid) {
            // Invalid frame; skip
          } else {
            // Render mesh with Phase 3 lighting + Phase 4 occlusions
            // [DEPRECATED FOR PHASE 1 3D TRANSITION]
            // this.meshWarper.render(
            //   this.renderer,
            //   this.garmentTexture.canvas,
            //   poseMeshInput.opacity,
            //   safeOcclusions
            // );

            // For now, we just update state variables so telemetry doesn't crash
            usedMeshWarp = true;

            // Auto frame counting
            this._liveFrameCount++;
          }
        }
      }

      // ── GLB 3D Composite Pass ──────────────────────────────
      // If a GLB garment is loaded, tick animation mixer, render Three.js scene,
      // and composite the offscreen canvas over the AR camera feed.
      if (this.glbRenderer && this.glbCamera && this._glbThreeScene && this._glbOffscreenCanvas) {
        // Adjust camera to track shoulder position in world space
        if (poseMeshInput) {
          const shoulderMidXNorm = ((poseMeshInput.leftShoulder.x + poseMeshInput.rightShoulder.x) / 2) / cw;
          const shoulderMidYNorm = ((poseMeshInput.leftShoulder.y + poseMeshInput.rightShoulder.y) / 2) / ch;
          // Map canvas coords → subtle camera pan (±0.5 units)
          this.glbCamera.position.x = (shoulderMidXNorm - 0.5) * -1.0;
          this.glbCamera.position.y = 1.2 - (shoulderMidYNorm - 0.35) * 1.5;
          // Yaw: rotate garment model to match body yaw angle
          if (this.glbScene && poseMeshInput.bodyYawAngle !== undefined) {
            this.glbScene.rotation.y = poseMeshInput.bodyYawAngle ?? 0;
          }
        }

        // Tick animations
        if (this.glbAnimMixer) {
          const delta = this.targetFrameInterval / 1000; // convert ms → seconds
          this.glbAnimMixer.update(delta);
        }

        // Render Three.js scene to offscreen canvas
        this.glbRenderer.render(this._glbThreeScene, this.glbCamera);

        // Composite: drawImage offscreen Three.js frame onto AR canvas
        const ctx2d = this.config.canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.globalAlpha = 0.92;
          ctx2d.drawImage(this._glbOffscreenCanvas, 0, 0, cw, ch);
          ctx2d.globalAlpha = 1.0;
        }

        usedMeshWarp = true;
        this._liveFrameCount++;
        hasPoseData = true;
      }

      // Record performance
      this.rafId = requestAnimationFrame(this.loop);

      if (!usedMeshWarp && this.overlay.loaded && this.overlay.image) {
        // ─── FALLBACK SIMPLE PATH ───
        if (pose && pose.landmarks) {
          const t = this.overlay.calculate(pose.landmarks, cw, ch, pose.avgConfidence);
          if (t.valid) {
            // [DEPRECATED FOR PHASE 1 3D TRANSITION]
            // this.renderer.drawShirt(
            //   this.overlay.image,
            //   t.x, t.y, t.width, t.height, t.angle, t.opacity,
            //   t.parallaxX, t.stretchY
            // );

            // Just update variables to avoid telemetry errors
            currentShoulderDist = t.shoulderDist;
            hasPoseData = true;
          }
        }
      }
    } else {
      // No pose — use fallback overlay freeze
      if (this.overlay.loaded && this.overlay.image) {
        const t = this.overlay.handleNoPose(isSkipFrame);
        if (t.valid && t.opacity > 0.01) {
          // [DEPRECATED FOR PHASE 1 3D TRANSITION]
          // this.renderer.drawShirt(
          //   this.overlay.image,
          //   t.x, t.y, t.width, t.height, t.angle, t.opacity,
          //   t.parallaxX, t.stretchY
          // );

          currentShoulderDist = t.shoulderDist;
          hasPoseData = true;
          currentConfidence = 0.4;
        }
      }
    }

    // Perception overlays
    // Perception overlays
    const confidenceLabel = currentConfidence > 0.75 ? 'High' as const
      : currentConfidence > 0.5 ? 'Medium' as const : 'Low' as const;

    this._hints.tooFar = hasPoseData && currentShoulderDist < cw * 0.15;
    this._hints.notAligned = !hasPoseData && pose === null && !isSkipFrame;
    this._hints.confidenceLabel = confidenceLabel;
    this._hints.confidenceValue = currentConfidence;

    if (hasPoseData) {
      this.renderer.drawFitConfidence(this._hints);
    }
    this.renderer.drawHints(this._hints);
    this.renderer.drawFPS();
    this.renderer.drawWatermark();
    this.logPerf(timestamp, this.renderer.stats.frameTime, detectMs, !!pose);
  }

  // ── Private: Landmark → MeshInput ─────────────────────────

  /**
   * Extract smoothed landmark positions for mesh warping.
   * Uses Kalman-filtered BodyIntelligence for stability.
   */
  private extractMeshInput(
    landmarks: NormalizedLandmark[],
    cw: number,
    ch: number
  ): PoseMeshInput | null {
    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    const lh = landmarks[LANDMARK.LEFT_HIP];
    const rh = landmarks[LANDMARK.RIGHT_HIP];

    if (!ls || !rs || (ls.visibility ?? 0) < 0.15 || (rs.visibility ?? 0) < 0.15) {
      return null;
    }

    const lsConf = ls.visibility ?? 0.5;
    const rsConf = rs.visibility ?? 0.5;

    // BUG 2 Fix: Normalize Y coordinates relative to bounding box top
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const l of landmarks) {
      if ((l.visibility ?? 0) > 0.3) {
        if (l.x < minX) minX = l.x;
        if (l.y < minY) minY = l.y;
        if (l.x > maxX) maxX = l.x;
        if (l.y > maxY) maxY = l.y;
      }
    }
    const bboxMinX = minX * cw;
    const bboxMinY = minY * ch;
    const bboxW = Math.max((maxX - minX) * cw, 1);
    const bboxH = Math.max((maxY - minY) * ch, 1);

    const normLS = BoundingBoxNormalizer.normalize((1 - ls.x) * cw, ls.y * ch, bboxMinX, bboxMinY, bboxW, bboxH);
    const normRS = BoundingBoxNormalizer.normalize((1 - rs.x) * cw, rs.y * ch, bboxMinX, bboxMinY, bboxW, bboxH);

    // Mirror X for selfie camera + Kalman smooth (write to persistent object)
    const sLS = this.landmarkSmoother.smooth(
      LANDMARK.LEFT_SHOULDER, normLS.x * cw, normLS.y * ch, lsConf,
      this._meshInput.leftShoulder, (ls.z ?? 0) * cw
    );
    const sRS = this.landmarkSmoother.smooth(
      LANDMARK.RIGHT_SHOULDER, normRS.x * cw, normRS.y * ch, rsConf,
      this._meshInput.rightShoulder, (rs.z ?? 0) * cw
    );

    // ── BUG 2 diagnostic: shoulder Y must be in top third of canvas
    if (this.devMode && this._liveFrameCount % 60 === 0) {
      console.log('[AR Debug] Shoulders: L.y=', sLS.y.toFixed(1), 'R.y=', sRS.y.toFixed(1), 'Canvas H:', ch);
    }

    // Hips: use actual or estimate
    let rawLHx: number, rawLHy: number, rawRHx: number, rawRHy: number;
    let hipConf = 0.5;

    if (lh && rh && (lh.visibility ?? 0) > 0.3 && (rh.visibility ?? 0) > 0.3) {
      rawLHx = (1 - lh.x) * cw;
      rawLHy = lh.y * ch;
      rawRHx = (1 - rh.x) * cw;
      rawRHy = rh.y * ch;
      hipConf = ((lh.visibility ?? 0.5) + (rh.visibility ?? 0.5)) * 0.5;
    } else {
      const sdist = Math.hypot(sRS.x - sLS.x, sRS.y - sLS.y);
      const midX = (sLS.x + sRS.x) / 2;
      const midY = (sLS.y + sRS.y) / 2;
      const hipW = sdist * 0.85;
      rawLHx = midX - hipW / 2;
      rawLHy = midY + sdist * 1.3;
      rawRHx = midX + hipW / 2;
      rawRHy = midY + sdist * 1.3;
      hipConf = 0.3;
    }

    const sLH = this.landmarkSmoother.smooth(
      LANDMARK.LEFT_HIP, rawLHx, rawLHy, hipConf, this._meshInput.leftHip, (lh?.z ?? 0) * cw
    );
    const sRH = this.landmarkSmoother.smooth(
      LANDMARK.RIGHT_HIP, rawRHx, rawRHy, hipConf, this._meshInput.rightHip, (rh?.z ?? 0) * cw
    );

    const le = landmarks[LANDMARK.LEFT_ELBOW];
    const re = landmarks[LANDMARK.RIGHT_ELBOW];

    if (le && (le.visibility ?? 0) > 0.3) {
      this._meshInput.leftElbow = this.landmarkSmoother.smooth(
        LANDMARK.LEFT_ELBOW, (1 - le.x) * cw, le.y * ch, le.visibility ?? 0.5,
        this._meshInput.leftElbow, (le.z ?? 0) * cw
      );
    }
    if (re && (re.visibility ?? 0) > 0.3) {
      this._meshInput.rightElbow = this.landmarkSmoother.smooth(
        LANDMARK.RIGHT_ELBOW, (1 - re.x) * cw, re.y * ch, re.visibility ?? 0.5,
        this._meshInput.rightElbow, (re.z ?? 0) * cw
      );
    }

    // ── Body Intelligence ──
    const shoulderDist = Math.hypot(sRS.x - sLS.x, sRS.y - sLS.y);
    const shoulderMidY = (sLS.y + sRS.y) * 0.5;
    const hipMidY = (sLH.y + sRH.y) * 0.5;

    // Yaw compression from shoulder z-depth
    const yawCompression = this.bodyYaw.compute(
      ls.z ?? 0, rs.z ?? 0, shoulderDist
    );

    // Torso tilt height adjustment
    const torsoPitchScale = this.torsoTilt.compute(
      shoulderMidY, hipMidY, shoulderDist
    );

    // Collar alignment
    const nose = landmarks[LANDMARK.NOSE];
    const noseY = (nose && (nose.visibility ?? 0) > 0.4) ? nose.y * ch : undefined;

    const leftEar = landmarks[LANDMARK.LEFT_EAR];
    const rightEar = landmarks[LANDMARK.RIGHT_EAR];
    const leftEarY = (leftEar && (leftEar.visibility ?? 0) > 0.3) ? leftEar.y * ch : undefined;
    const rightEarY = (rightEar && (rightEar.visibility ?? 0) > 0.3) ? rightEar.y * ch : undefined;

    const garmentH = Math.abs(hipMidY - shoulderMidY) * 1.3;
    const collarY = this.collarAlign.compute(
      shoulderMidY, noseY, leftEarY, rightEarY, garmentH
    );

    // Fix 2: Log collar offset to diagnose low-garment issue
    if (this.devMode && this._liveFrameCount % 60 === 0) {
      console.log(`[AR Debug] CollarY=${collarY.toFixed(1)} ShoulderY=${shoulderMidY.toFixed(1)} Diff=${(collarY - shoulderMidY).toFixed(1)}`);
      if (collarY > shoulderMidY + 50) {
        console.warn('[AR WARN] Collar is significantly below shoulders!');
      }
    }

    // Depth-based width compression (Phase 2): use shoulder/hip z-span.
    let depthWidthScale = 1.0;
    const lsZ = ls.z ?? 0;
    const rsZ = rs.z ?? 0;
    let depthSpan = Math.abs(lsZ - rsZ);
    if (lh && rh) {
      const lhZ = lh.z ?? 0;
      const rhZ = rh.z ?? 0;
      depthSpan = (depthSpan + Math.abs(lhZ - rhZ)) * 0.5;
    }
    if (depthSpan > 0) {
      const depthNorm = Math.min(1, depthSpan * 4); // tuned for Mediapipe z-range
      depthWidthScale = 1 - depthNorm * 0.12;       // up to 12% extra compression
    }

    // ── BUG 3 safety: guard against NaN/Infinity from body intelligence
    this._meshInput.yawCompression = isFinite(yawCompression) ? yawCompression : 1.0;
    this._meshInput.torsoPitchScale = isFinite(torsoPitchScale) ? torsoPitchScale : 1.0;
    this._meshInput.collarY = isFinite(collarY) ? collarY : (sLS.y + sRS.y) * 0.5;
    this._meshInput.depthWidthScale = isFinite(depthWidthScale) ? depthWidthScale : 1.0;
    this._meshInput.opacity = 0.92;
    this._meshInput.noseY = noseY; // Add noseY to _meshInput
    this._meshInput.leftElbow = (le && (le.visibility ?? 0) > 0.3) ? this._meshInput.leftElbow : undefined;
    this._meshInput.rightElbow = (re && (re.visibility ?? 0) > 0.3) ? this._meshInput.rightElbow : undefined;

    // [BUGFIX] True 3D Euler Yaw Calculation
    // We use the pixel distance (X) and MediaPipe depth (Z) scaled via canvas width to get true radians.
    // This perfectly encapsulates Left vs Right 45-degree turns, AND 180-degree wrap-around!
    
    // BUG 1 Fix: Numerical guard against dx = 0
    let dx = sRS.x - sLS.x;
    if (Math.abs(dx) < 0.0001) dx = 0.0001;
    let dz = ((rs.z ?? 0) - (ls.z ?? 0)) * cw;

    // Apply moving average to bodyYawAngle to prevent jitter during noisy depth reads
    let rawYawAngle = Math.atan2(dz, dx);
    if (Number.isNaN(rawYawAngle) || !Number.isFinite(rawYawAngle)) rawYawAngle = 0;
    
    this._meshInput.bodyYawAngle = this._meshInput.bodyYawAngle
      ? this._meshInput.bodyYawAngle * 0.7 + rawYawAngle * 0.3
      : rawYawAngle;

    // Stress Test Injection
    if (this.stressTest) {
      if (Math.random() < 0.02) this._meshInput.leftShoulder.x = NaN; // Trigger NaN check
      if (Math.random() < 0.02) this._meshInput.rightShoulder.x += 10000; // Trigger explosion check
    }

    return this._meshInput;
  }

  // ── Private: Auto-Throttle ────────────────────────────────

  private shouldDetectPose(): boolean {
    const { fps } = this.renderer.stats;

    if (fps > 0 && fps < this.LOW_FPS_THRESHOLD) {
      this.lowFpsCount++;
    } else {
      this.lowFpsCount = Math.max(0, this.lowFpsCount - 2);
    }

    if (this.lowFpsCount >= this.LOW_FPS_TRIGGER) {
      this.skipFrame = !this.skipFrame;
      return this.skipFrame;
    }

    return true;
  }

  // ── Private: Perf Logger ──────────────────────────────────

  private logPerf(ts: number, frameMs: number, detectMs: number, detected: boolean): void {
    if (this._perfLog.length >= this.PERF_LOG_SIZE) {
      this._perfLog.shift();
    }
    this._perfLog.push({ ts, frameMs, detectMs, detected });
    // Record in performance validator removed
  }

  // Auto-test mode removed (migrated to dedicated unit tests in SaaS Phase 1)
}