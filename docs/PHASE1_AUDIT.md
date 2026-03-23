# PHASE 1 AUDIT: Codebase State & Architecture Lock

## 1. Overview
The AI-Kart project contains the structural foundation of a B2B SaaS platform for virtual try-on and size intelligence.
Currently, it operates at roughly 65-70% completion. The core routing, premium UI framework, and "Size Intelligence" math exist, but all heavy AI/ML nodes are artificially mocked, and the 3D AR engine contains critical mathematical bugs and deprecated 2D warping code.

## 2. Mock Flags & Bypasses Identified
The entire ML pipeline currently runs in a simulated state governed by `USE_MOCK_ML` (backend) and `USE_MOCK` (frontend).

**Frontend Mocks (`aikart-app/src/ar-engine/APIClient.ts`):**
- `const USE_MOCK = false;` is conditionally driving localized delays instead of actual API hits for `scanBody`, `uploadGarment`, `renderTryOn`, and `pollRenderStatus`.
- These methods use internal functions (`mockScanBody`, `mockUploadGarment`, `mockRenderTryOn`, `mockPollStatus`) to hardcode responses.

**Backend Mocks:**
- `backend/config.py`: `USE_MOCK_ML = not bool(FAL_AI_KEY or REPLICATE_API_KEY)` defaults the system to mock mode if keys are absent.
- `backend/main.py`: Injects `mockMode=USE_MOCK_ML`.
- `backend/worker.py`: If `USE_MOCK_ML` is true, real IDM-VTON inference is bypassed. At line 223, it throws `NotImplementedError` if ML is required but keys are missing.
- `backend/body_scan.py`: Bypasses SAM3D geometric extraction if `USE_MOCK_ML` is true.
- `backend/job_queue.py`: Fallback redis pooling logic based on `USE_MOCK_ML`.

## 3. Discovered Critical Bugs (The Kinematic Flaws)
The AR Engine relies on strict multi-pose geometry. The following bugs have been identified via instruction and code review that will corrupt the entire kinematic pipeline:

- **BUG 1 (NaN Cascade):** `BodyIntelligence.ts` lacks zero-division guards when calculating Yaw (`dz/dx` where `dx` = 0).
- **BUG 2 (Shoulder Drift):** Shoulders drift out of the viewport when depth (Z-distance) changes. Normalization isn't anchored to the detection bounding box.
- **BUG 3 (Collar Anchor Drift):** `CollarY` in `BodyIntelligence.ts` sags below shoulders under Torso Tilt because it isn't anchored to a fixed anatomical ratio.
- **BUG 4 (Memory Exhaustion/Crash):** `APIClient.ts` buffers entire camera feeds (Blob > Base64) into memory strings using `photo.startsWith('data:image')`.

## 4. Architectural Gaps & Technical Debt
- **The MeshWarper Liability:** The `/aikart-app/src/ar-engine/MeshWarper.ts` file physically contains legacy 2D mesh manipulation logic that conflicts with the incoming true 3D GLB injection. It must be purged.
- **Database Non-Existence:** The backend uses hardcoded dictionary structures (`DEMO_BRANDS`, `DEMO_BRAND_SIZE_CHARTS`) simulating a Postgres database.
- **Incomplete Render Loop:** `Engine.ts` runs synchronously, blocking the main thread during heavy MediaPipe extraction.

## 5. Next Steps (Proceeding to Phase 2)
1. Lock the branch: `feature/v2-complete-production-build`
2. Enter `BodyIntelligence.ts` to implement rigorous mathematical safeguards against zero-division (Fixing Bug 1, 2, 3).
3. Enter `APIClient.ts` to implement chunked `FormData` (Fixing Bug 4).
4. Delete `MeshWarper.ts` and wipe its imports.
