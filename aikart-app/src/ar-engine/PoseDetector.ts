/**
 * PoseDetector.ts
 *
 * MediaPipe Pose Landmarker wrapper — hardened.
 * - Uses FULL model for production-grade accuracy (±1-2cm vs Lite's ±3-5cm)
 * - Init race guard
 * - Dispose idempotent with try/catch
 * - Confidence metadata exposed
 * - All 33 landmarks exposed for body measurement extraction
 */

import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
  type NormalizedLandmark,
  type Landmark,
} from '@mediapipe/tasks-vision';

/**
 * All 33 MediaPipe Pose landmarks.
 * Used for pose tracking (real-time preview) and body measurement extraction.
 *
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const LANDMARK = {
  // Face
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,

  // Upper body
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,

  // Hands
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,

  // Lower body
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export interface PoseResult {
  landmarks: NormalizedLandmark[];
  worldLandmarks?: Landmark[];
  timestamp: number;
  /** Average visibility of torso landmarks (shoulders + hips) */
  avgConfidence: number;
}

export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private _ready = false;
  private _initializing = false;
  private _disposed = false;

  get ready(): boolean {
    return this._ready;
  }

  async init(): Promise<void> {
    if (this._ready || this._initializing || this._disposed) return;
    this._initializing = true;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      if (this._disposed) return; // disposed during WASM load

      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      if (this._disposed) {
        // disposed during model load
        try { this.landmarker.close(); } catch { /* safe */ }
        this.landmarker = null;
        return;
      }

      this._ready = true;
    } finally {
      this._initializing = false;
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): PoseResult | null {
    if (!this.landmarker || !this._ready) return null;

    let result: PoseLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, timestampMs);
    } catch {
      return null;
    }

    if (!result.landmarks || result.landmarks.length === 0) return null;

    const lm = result.landmarks[0];

    // Compute average confidence of torso landmarks
    const torsoIndices = [
      LANDMARK.LEFT_SHOULDER,
      LANDMARK.RIGHT_SHOULDER,
      LANDMARK.LEFT_HIP,
      LANDMARK.RIGHT_HIP,
    ];
    let visSum = 0;
    let visCount = 0;
    for (const idx of torsoIndices) {
      if (lm[idx]) {
        visSum += lm[idx].visibility ?? 0;
        visCount++;
      }
    }

    return {
      landmarks: lm,
      worldLandmarks: result.worldLandmarks?.[0],
      timestamp: timestampMs,
      avgConfidence: visCount > 0 ? visSum / visCount : 0,
    };
  }

  dispose(): void {
    this._disposed = true;
    this._ready = false;
    this._initializing = false;
    if (this.landmarker) {
      try { this.landmarker.close(); } catch { /* already closed or destroyed */ }
      this.landmarker = null;
    }
  }
}
