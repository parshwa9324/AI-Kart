import { IRenderer } from './IRenderer';
import type { GarmentProfile } from '../GarmentConfig';

/** Pose data needed for mesh deformation */
export interface PoseMeshInput {
  leftShoulder: { x: number; y: number; z?: number };
  rightShoulder: { x: number; y: number; z?: number };
  leftHip: { x: number; y: number; z?: number };
  rightHip: { x: number; y: number; z?: number };
  leftElbow?: { x: number; y: number; z?: number };
  rightElbow?: { x: number; y: number; z?: number };
  /** Nose Y in canvas px for collar fallback */
  noseY?: number;
  /** Phase 1: Horizontal compression from body yaw (0.85–1.0) */
  yawCompression?: number;
  /** Phase 1: Height scale from torso tilt (0.93–1.05) */
  torsoPitchScale?: number;
  /** Phase 1: Collar Y offset computed from ears+nose+shoulders */
  collarY?: number;
  /**
   * Phase 2.5D: Additional width compression from depth (shoulder/hip z).
   * 1.0 = no extra compression, min ~0.88.
   */
  depthWidthScale?: number;
  opacity: number;
  /** True 3D Euler Yaw (Radians) computed via X/Z geometry */
  bodyYawAngle: number;
}

/**
 * Abstraction for the Mesh Deformation Layer.
 * Decouples the Geometry Engine from the orchestration logic.
 */
export interface IMeshLayer {
  readonly lastFrameValid: boolean;
  readonly isHighQuality: boolean;
  readonly currentGridSize: number;
  debugMode: boolean;
  autoAdaptive: boolean;

  /** Update garment profile settings */
  updateProfile(profile: GarmentProfile): void;

  /** Set intelligent parameters from analyzer */
  setGarmentIntelligence(sleeveEndRow: number, hemCurvature: number): void;

  /** 
   * Check FPS and switch density if needed. 
   * Returns true if reconstruction required/performed.
   */
  adaptDensity(fps: number): boolean;

  /** Build the source grid from the texture */
  buildSourceMesh(texW: number, texH: number): void;

  /** 
   * Calculate target mesh from pose. 
   * Returns false if geometry is invalid.
   */
  buildTargetMesh(pose: PoseMeshInput): boolean;

  /** Render the mesh to the renderer */
  render(
    renderer: IRenderer,
    texture: HTMLCanvasElement | HTMLImageElement,
    opacity: number,
    occlusions?: { x: number; y: number; w: number; h: number }[]
  ): void;
}
