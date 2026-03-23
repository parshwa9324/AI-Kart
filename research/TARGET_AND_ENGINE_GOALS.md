# AI-Kart — Core Mission

AI-Kart is a browser-based AR infrastructure platform that enables retail shops to provide real-time garment try-on using a standard camera.

This is not a toy project.
This is intended to become a SaaS infrastructure layer for clothing retailers.

## Long-Term Vision

- Production-grade WebGL AR engine
- Stable at 28–30 FPS on mid-range laptops
- Works on low-to-mid hardware
- Deterministic rendering
- Zero per-frame memory allocations
- Fully self-validating math pipeline
- Modular architecture ready for WebGL → WebGPU migration

## Technical Philosophy

- No hacks.
- No masking broken math with clamping unless mathematically justified.
- CPU–GPU parity is mandatory.
- Validation must never lie.
- No ML dependency unless strictly necessary.
- Performance first.
- Deterministic behavior over visual trickery.

## Current Engine Architecture

- MediaPipe Pose for body landmarks
- Custom 2.5D mesh warping
- Raw WebGL 2.0 (no Three.js)
- Hybrid pipeline (Offscreen GL → 2D composite)
- GPU Transform Feedback for parity validation
- Live frame validation every 120 frames

## Current Stability Targets

### Geometry:

- GPU–CPU Divergence < 0.005 NDC
- Max Clip Coord ≤ 1.1
- Collar Drift < 4%
- Shoulder Width Error < 6%

### Rendering:

- Alpha Leakage < 10%
- No vertex explosion
- No halo artifacts
- No checkerboard bleed

### Performance:

- 28+ FPS sustained
- Frame variance < 5ms
- No GC spikes > 3ms
- No per-frame allocations

## Production Readiness Criteria

The engine is considered production-ready when:

- All live validation metrics pass consistently for 2 minutes.
- No GPU–CPU divergence detected.
- Adaptive span and neck bias stable across pose variation.
- Garment remains visually stable during:
  - Lean
  - Arm raise
  - Forward movement
  - Slight rotation

## What AI Assistants Must NOT Do

- Do not introduce heavy ML segmentation libraries.
- Do not switch to Three.js.
- Do not rewrite architecture.
- Do not disable validation to “pass”.
- Do not change validation thresholds to hide errors.

## What AI Assistants MUST Do

- Maintain strict CPU–GPU parity.
- Log stage-wise transformations when debugging.
- Keep architecture modular.
- Prefer math corrections over visual patches.
- Always explain root cause before applying fix.

## Ultimate Target

AI-Kart should eventually:

- Support garment depth illusion
- Support basic occlusion
- Support fabric shading realism
- Be embeddable as a widget in retailer websites
- Scale to 1000+ garment uploads
- Maintain deterministic performance
