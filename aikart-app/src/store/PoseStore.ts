import { create } from 'zustand';
import type { UserBodyProfile, GarmentSpec, SizeRecommendation } from '../types/types';

export interface Point3D {
    x: number;
    y: number;
    z?: number;
}

export interface PoseState {
    // ── Real-time Pose Tracking ──
    isActive: boolean;
    leftShoulder: Point3D;
    rightShoulder: Point3D;
    leftHip: Point3D;
    rightHip: Point3D;
    leftElbow?: Point3D;
    rightElbow?: Point3D;
    canvasWidth: number;
    canvasHeight: number;
    yawCompression: number;
    torsoPitchScale: number;
    collarY?: number;
    spineLength?: number;
    bodyYawAngle: number;

    // ── Body Measurement & Sizing ──
    /** User's calibrated body profile (set once during calibration) */
    bodyProfile: UserBodyProfile | null;
    /** Currently selected garment with full spec (set when browsing catalog) */
    activeGarmentSpec: GarmentSpec | null;
    /** Size recommendation for current body + garment combination */
    sizeRecommendation: SizeRecommendation | null;
    /** Whether a body scan is currently in progress */
    isScanning: boolean;

    // ── Actions ──
    updatePose: (data: Partial<PoseState>) => void;
    resetPose: () => void;
    setBodyProfile: (profile: UserBodyProfile | null) => void;
    setGarmentSpec: (spec: GarmentSpec | null) => void;
    setSizeRecommendation: (rec: SizeRecommendation | null) => void;
    setScanning: (scanning: boolean) => void;
}

/**
 * Global store to bridge Vanilla JS AR Engine with React-Three-Fiber.
 *
 * Pose data: written 30x/sec by Engine.ts, read by Scene3D.tsx via useFrame.
 * Body/Size data: written during calibration and garment selection.
 */
export const usePoseStore = create<PoseState>((set) => ({
    // Pose tracking defaults
    isActive: false,
    leftShoulder: { x: 0, y: 0 },
    rightShoulder: { x: 0, y: 0 },
    leftHip: { x: 0, y: 0 },
    rightHip: { x: 0, y: 0 },
    leftElbow: undefined,
    rightElbow: undefined,
    canvasWidth: 640,
    canvasHeight: 480,
    yawCompression: 1.0,
    torsoPitchScale: 1.0,
    collarY: undefined,
    spineLength: undefined,
    bodyYawAngle: 0,

    // Body measurement & sizing defaults
    bodyProfile: null,
    activeGarmentSpec: null,
    sizeRecommendation: null,
    isScanning: false,

    // Actions
    updatePose: (data) => set((state) => ({ ...state, ...data, isActive: true })),
    resetPose: () => set({ isActive: false }),
    setBodyProfile: (profile) => set({ bodyProfile: profile }),
    setGarmentSpec: (spec) => set({ activeGarmentSpec: spec }),
    setSizeRecommendation: (rec) => set({ sizeRecommendation: rec }),
    setScanning: (scanning) => set({ isScanning: scanning }),
}));

