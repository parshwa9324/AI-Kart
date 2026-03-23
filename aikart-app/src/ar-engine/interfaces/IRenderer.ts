export interface FPSStats {
  fps: number;
  frameTime: number;
}

export interface FramingHints {
  tooFar: boolean;
  notAligned: boolean;
  confidenceLabel: 'High' | 'Medium' | 'Low';
  confidenceValue: number;
}

/**
 * Abstraction for the Rendering subsystem.
 * Allows switching between Canvas2D, WebGL, or Headless renderers.
 */
export interface IRenderer {
  readonly stats: FPSStats;
  readonly brightness: number;
  readonly contrast: number;
  showKeypoints: boolean;

  /** Dimensions */
  resize(width: number, height: number): void;

  /** Lifecycle */
  beginFrame(): void;
  clear(): void;
  sampleBrightness(): void;

  /** Drawing commands */
  drawCamera(video: HTMLVideoElement): void;
  drawShirt(
    shirtImg: HTMLImageElement,
    x: number, y: number,
    width: number, height: number,
    angle: number, opacity: number,
    parallaxX?: number,
    stretchY?: number,
    occlusions?: { x: number; y: number; w: number; h: number }[]
  ): void;

  drawHints(hints: FramingHints): void;
  drawFitConfidence(hints: FramingHints): void;
  drawFPS(): void;
  drawWatermark(): void;
  drawKeypoints(landmarks: any[]): void; // Weak typing here to avoid importing mediapipe types if possible, or use generic

  /** 
   * Access to underlying context for optimized MeshWarper drawing.
   * In a WebGL implementation, MeshLayer would likely need a different interface,
   * but for Phase D this decouples the class dependency.
   */
  getContext(): CanvasRenderingContext2D | any; 
}
