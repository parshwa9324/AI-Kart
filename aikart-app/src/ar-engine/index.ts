/**
 * AR Engine barrel export.
 */
export { Engine, type EngineConfig, type EngineState, type EngineStatus, type AIKartError } from './Engine';
export { PoseDetector, LANDMARK, type PoseResult } from './PoseDetector';
export { Renderer } from './Renderer';
export type { FPSStats, FramingHints } from './interfaces/IRenderer';
export { Overlay, type OverlayTransform } from './Overlay';
// MeshWarper: planned but not yet implemented — export removed to unblock build
export type { PoseMeshInput } from './interfaces/IMeshLayer';
export { GarmentLoader, type GarmentTexture } from './GarmentLoader';
export { BackgroundRemover, type RemovalOptions } from './BackgroundRemover';
export {
  getGarmentProfile, guessGarmentType,
  type GarmentAnchors, type GarmentType, type GarmentProfile
} from './GarmentConfig';
export { AIKartErrorCode, type SupportCheck, type GarmentOption } from './AIKartSDK';
