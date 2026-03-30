# AI-Kart — Principal Engineer Codebase Analysis

**Generated for:** downstream agents (e.g. Claude Code) with zero prior context.  
**Audit date:** 2026-03-30 (workspace snapshot).  
**Repository root:** `AI-Kart/`

---

## 1. PROJECT IDENTITY

| Item | Detail |
|------|--------|
| **Name** | AI-Kart |
| **Purpose** | B2B luxury fashion SaaS: virtual try-on, body intelligence, size recommendations, spatial/body scanning, and (in progress) live AR garment mirror. |
| **Target audience** | Luxury and premium fashion brands (positioning references LVMH / Prada / Kering tier in internal docs). |
| **Problem solved** | Brands need scalable digital fit visualization, measurement intelligence, and API-first integration—not consumer-only apps. |
| **Business model** | **B2B SaaS** — multi-tenant **brands** with **plan tiers** (`trial`, `standard`, `enterprise`) in `backend/models.py` (`Brand.plan_tier`) and `backend/config.py` (`BRAND_CAPABILITIES`, `RATE_LIMITS`). |
| **Vision / ambition** | “Maison Noir” luxury aesthetic; RTX-local inference story; enterprise API gateway with JWT, rate limits, webhooks, telemetry. Cursor rule file `.cursor/rules/AI-Kart-a-B2B-luxury.mdc` states Luminary AI positioning and stack constraints. |

**UNCLEAR:** Single public `README.md` at repo root was not present in the audited tree; marketing copy is scattered in `globals.css` headers, `main.py` docstrings, and handoff docs (`CLAUDE_HANDOFF.md`, `AR_MIRROR_HANDOFF.md`, `USER_GUIDE.md`).

---

## 2. TECH STACK — EXACT VERSIONS

Sources: `aikart-app/package.json`, `aikart-app/tsconfig.json`, `backend/requirements.txt`, `backend/config.py`.

### Frontend (pinned in `package.json`)

| Technology | Version |
|------------|---------|
| **Next.js** | `16.1.6` |
| **React** | `19.2.3` |
| **react-dom** | `19.2.3` |
| **TypeScript** | `^5` (devDependency) |
| **Tailwind CSS** | `^4` (via `@tailwindcss/postcss` ^4) |
| **Framer Motion** | `^12.34.4` |
| **Three.js** | `^0.183.2` |
| **@react-three/fiber** | `^9.5.0` |
| **@react-three/drei** | `^10.7.7` |
| **@mediapipe/tasks-vision** | `^0.10.32` |
| **Zustand** | `^5.0.11` |
| **lucide-react** | `^0.576.0` |
| **canvas** | `^3.2.1` |
| **esbuild** (SDK build) | `^0.27.3` |

### Backend (`requirements.txt`)

**MISSING:** Most Python packages are **unpinned** (no `==` versions). Only comments reference PyTorch install via CUDA wheel index.

| Area | Packages (unversioned unless noted) |
|------|-------------------------------------|
| **Web** | `fastapi`, `uvicorn[standard]` |
| **Data** | `pydantic`, `numpy`, `scipy` |
| **CV** | `opencv-python`, `mediapipe`, `Pillow` |
| **Auth** | `python-multipart`, `python-jose[cryptography]`, `passlib` |
| **Queue / HTTP** | `redis`, `rq`, `httpx` |
| **Local ML** | `diffusers`, `accelerate`, `transformers`, `huggingface_hub`, `xformers`, `safetensors` |

**UNCLEAR:** Actual installed `torch` / `diffusers` versions on a given machine—run `pip freeze` in `backend/venv` for ground truth.

### Database & ORM

| Item | Detail |
|------|--------|
| **Database** | **PostgreSQL** (async via **asyncpg** implied by URL scheme in `database.py`) |
| **Connection** | `DATABASE_URL` env → `create_async_engine` in `backend/database.py` (`postgresql+asyncpg://` after rewrite) |
| **ORM** | **SQLAlchemy 2.x** style (`Mapped`, `mapped_column`) in `backend/models.py` |
| **Secondary store** | **SQLite** for anonymous Physical Twin profiles in `backend/profile_store.py` → `physical_twin.db` |

### State management (frontend)

- **Zustand:** `aikart-app/src/store/PoseStore.ts` (pose / calibration state).
- **React Context:** `PhysicalTwinProvider` + `usePhysicalTwin` for profile + render history.

### Authentication

- **JWT** (`python-jose`) issued by `POST /api/v1/auth/token`; validated in `backend/auth.py` → `get_current_brand`.
- **Bearer** token on protected routes via `HTTPBearer`.

### Deployment target

**UNCLEAR:** No Dockerfile or `vercel.json` in audited root. Next.js implies **Node** hosting; FastAPI implies **uvicorn** behind a reverse proxy. Comments reference Vercel origins in CORS (`main.py`).

---

## 3. PROJECT STRUCTURE — COMPLETE TREE

**Scope rule:** Lists **application source and config**. **Excluded** (by design): `node_modules/`, `.next/`, `backend/venv/`, `**/__pycache__/`, `backend/result_cache/` blobs, binary logs, `.env` contents.

### Repository root (selected)

| Path | Role |
|------|------|
| `CLAUDE_HANDOFF.md` | Session handoff (try-on, telemetry). |
| `AR_MIRROR_HANDOFF.md` | AR mirror product brief. |
| `USER_GUIDE.md` | Operator guide (photo test, ports). |
| `CODEBASE_ANALYSIS.md` | This document. |
| `AI_KART_PRODUCTION_STATE.md` | UNCLEAR: content not fully audited. |
| `first_render_proof.jpg` / `tryon_experience_proof.jpg` | Optional proof artifacts (may be untracked). |

### `aikart-app/`

| Path | Role |
|------|------|
| `package.json` | Scripts: `dev`, `build`, `start`, `lint`; dependency versions. |
| `next.config.ts` | Minimal Next config (empty options object). |
| `tsconfig.json` | `strict: true`, path alias `@/*` → `./src/*`. |
| `postcss.config.mjs` | Tailwind v4 PostCSS plugin. |
| `eslint.config.mjs` | `eslint-config-next` core-web-vitals + typescript. |
| `build.mjs` | esbuild bundle for `AIKartSDK` → `dist/aikart.v1.min.js`. |
| `src/app/globals.css` | Maison Noir design tokens, Tailwind v4 `@import "tailwindcss"`, typography, cursor. |
| `src/app/layout.tsx` | Root layout, fonts (`next/font/google`), `PhysicalTwinProvider`, gold cursor. |
| `src/app/page.tsx` | Marketing / landing experience. |
| `src/app/login/page.tsx` | Login flow. |
| `src/app/try-on/page.tsx` | Main try-on UI: catalog, SDXL render via API, cinematic result, telemetry. |
| `src/app/mirror/page.tsx` | **Live AR mirror** — camera, `PoseDetector`, `Renderer`, `Overlay`, garment carousel (**currently untracked in git** in this workspace snapshot). |
| `src/app/error.tsx` / `global-error.tsx` | Next.js error boundaries. |
| `src/app/admin/layout.tsx` | Admin shell. |
| `src/app/admin/page.tsx` | Admin dashboard. |
| `src/app/admin/analytics/page.tsx` | Analytics UI. |
| `src/app/admin/garments/page.tsx` | Garment admin list. |
| `src/app/admin/garments/upload/page.tsx` | Garment upload. |
| `src/app/admin/size-charts/page.tsx` | Size charts admin. |
| `src/app/api/size/recommend/route.ts` | Next.js API route (BFF-style). |
| `src/ar-engine/APIClient.ts` | `AIKartAPI` — auth, catalog, try-on render, telemetry (`sendTryOnTelemetry`). |
| `src/ar-engine/AIKartSDK.ts` | SDK entry for bundled script. |
| `src/ar-engine/Engine.ts` | Full AR engine orchestration (camera, pose, mesh/overlay, GLB). |
| `src/ar-engine/PoseDetector.ts` | MediaPipe `PoseLandmarker`, `LANDMARK` indices. |
| `src/ar-engine/Renderer.ts` | 2D canvas renderer (mirror, overlay draw, FPS). |
| `src/ar-engine/Overlay.ts` | Garment overlay transforms. |
| `src/ar-engine/GarmentLoader.ts` | Texture / garment loading. |
| `src/ar-engine/GarmentConfig.ts` | Garment type config. |
| `src/ar-engine/BackgroundRemover.ts` | Background removal helper. |
| `src/ar-engine/BodyIntelligence.ts` | Smoothing, yaw, torso, collar, bbox normalization. |
| `src/ar-engine/CentimeterConversionEngine.ts` | Measurement conversion. |
| `src/ar-engine/SizeEngine.ts` | Client-side size logic (large module). |
| `src/ar-engine/index.ts` | Barrel exports. |
| `src/ar-engine/interfaces/IRenderer.ts` | Renderer contract (`drawKeypoints(landmarks: any[])`). |
| `src/ar-engine/interfaces/IMeshLayer.ts` | Mesh layer types. |
| `src/components/PhysicalTwinProvider.tsx` | Context for `usePhysicalTwin`. |
| `src/components/ui/SpatialScanner.tsx` | Kinematic / camera calibration UI (MediaPipe-related). |
| `src/components/ui/BodyCalibrationModal.tsx` | Profile creation modal. |
| `src/components/ui/FitPanel.tsx` | Fit UI. |
| `src/components/ui/PremiumCard.tsx` | Card primitive. |
| `src/components/ui/DataGauge.tsx` | Gauge. |
| `src/components/ui/CrossBrandWidget.tsx` | Cross-brand widget. |
| `src/components/ui/AnimatedButton.tsx` | Button. |
| `src/components/ui/ConsentBanner.tsx` | Consent (untracked in snapshot). |
| `src/components/ui/WelcomeToast.tsx` | Welcome toast (untracked). |
| `src/components/ar/Scene3D.tsx` | Three.js scene helper (uses `any` for mesh checks). |
| `src/components/ar/AutoRigger.ts` | Rigging helper. |
| `src/hooks/usePhysicalTwin.ts` | Physical twin + render history (localStorage). |
| `src/store/PoseStore.ts` | Zustand pose store. |
| `src/services/SaaSClient.ts` | SaaS error type (`details?: any`). |
| `src/data/GarmentCatalog.ts` | Catalog data / types. |
| `src/data/mockGarments.ts` | Mock garments. |
| `src/lib/utils.ts` | Utilities (`cn`, etc.). |
| `src/types/types.ts` | Shared TS types. |
| `src/types/brand.ts` | Brand types. |
| `src/types/ammo.d.ts` | Ammo.js ambient declarations (`any` heavy). |
| `public/garments/canonical/*` | Canonical garment PNGs for mirror (referenced in `mirror/page.tsx`). |
| `public/sdk/v1/*` | Built/minified SDK artifacts (if present). |

### `backend/`

| Path | Role |
|------|------|
| `main.py` | FastAPI app: middleware, routes, `BackgroundTasks` try-on, static `/renders`. |
| `config.py` | All env-driven settings including `VTON_MODEL_ID`, `INFERENCE_STEPS`, Redis, JWT. |
| `database.py` | Async SQLAlchemy engine + `get_db`. |
| `models.py` | ORM: `Brand`, `Garment`, `BodyProfile`, `RenderJob`. |
| `auth.py` | JWT, rate limits, capabilities, `get_current_brand`. |
| `job_queue.py` | Redis/RQ job creation + fallback; `get_job_status`. |
| `worker.py` | `run_tryon_inference` — GPU path, `ProgressReporter`, updates `local_state`. |
| `local_state.py` | `LOCAL_JOBS` + lock + `init_job` / `update_job` / `get_job`. |
| `local_vton_engine.py` | SDXL inpainting pipeline, `run_local_tryon`, `load_pipeline`, VRAM opts. |
| `body_scan.py` | Body scan from photo / landmarks. |
| `size_engine.py` | Size recommendation engine (Python). |
| `profile_store.py` | SQLite Physical Twin persistence. |
| `cv_engine.py` | OpenCV topology / spatial. |
| `cv_garment.py` | Garment digitization CV. |
| `seed_db.py` / `reset_and_seed_db.py` | DB seeding. |
| `e2e_render_test.py` | End-to-end render poll test. |
| `test_real_photo.py` | Real disk photo → render. |
| `benchmark_two_renders.py` | Two back-to-back renders timing. |
| `test_api.py`, `test_tryon_endpoint.py`, `test_size_engine.py`, `test_load.py`, `conftest.py` | Tests. |
| `debug_endpoint.py`, `patch.py` | Ad-hoc / debug (treat as non-production). |
| `alembic/env.py` | Alembic environment. |
| `alembic/versions/001_initial_schema.py` | Baseline 4-table schema migration. |
| `alembic/versions/9eb9a2ba2fe2_migrate_to_simplified_schema.py` | Follow-up migration (exists in tree). |
| `requirements.txt` | Python dependencies (mostly unpinned). |

---

## 4. FRONTEND ARCHITECTURE

### Routing (App Router)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Landing / hero. |
| `/login` | `src/app/login/page.tsx` | Auth UI. |
| `/try-on` | `src/app/try-on/page.tsx` | **Primary product:** catalog + **SDXL render** + luxury result UI. |
| `/mirror` | `src/app/mirror/page.tsx` | **Live AR mirror** (camera + 2D overlay). |
| `/admin` | `src/app/admin/page.tsx` | Admin home. |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | Analytics. |
| `/admin/garments` | `src/app/admin/garments/page.tsx` | Garments. |
| `/admin/garments/upload` | `src/app/admin/garments/upload/page.tsx` | Upload. |
| `/admin/size-charts` | `src/app/admin/size-charts/page.tsx` | Size charts. |
| API | `src/app/api/size/recommend/route.ts` | Size recommend proxy/BFF. |

### Component hierarchy (high level)

- **`layout.tsx`** wraps all pages with **`PhysicalTwinProvider`** and global chrome.
- **`try-on/page.tsx`** is large (~1400+ lines): orchestrates catalog filter, `AIKartAPI.renderTryOn`, Framer Motion modals, comparison slider, history, telemetry batching.
- **`SpatialScanner.tsx`** embeds calibration / camera UX used from try-on flow.
- **`mirror/page.tsx`** composes **MediaPipe** + **canvas `Renderer`** + **`Overlay`** + **`GarmentLoader`** without going through SDXL.

### Shared components — props (representative)

**UNCLEAR:** Exhaustive prop listing for every UI file would be enormous; key patterns:

- **`PhysicalTwinProvider`**: `children: React.ReactNode` — value from `usePhysicalTwin()`.
- **`BodyCalibrationModal`**: multiple callbacks; uses `data: any` on scan complete (see grep §13).
- **`SpatialScanner`**: large internal state; drives MediaPipe/camera.

### API patterns

- Primary client: **`AIKartAPI`** in `src/ar-engine/APIClient.ts` — `fetch` to `NEXT_PUBLIC` or default localhost backend; JWT in `Authorization`.
- Try-on: `renderTryOn` → `POST /api/v1/tryon/render` then poll status (implemented in client).

### Styling

- **Tailwind v4** via `@import "tailwindcss"` and `@theme inline` bridge in `globals.css`.
- **Maison Noir** tokens as **CSS variables** on `:root` (see §10).
- **next/font/google** in `layout.tsx`: Playfair Display, Space Grotesk (also Google Fonts link in `globals.css` — dual path).

### TypeScript

- **`strict`: true** in `tsconfig.json`.
- Some **`any`** usages remain (see §13).

---

## 5. BACKEND ARCHITECTURE

### API routes (`backend/main.py`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health (`HealthResponse`). |
| POST | `/api/v1/telemetry/tryon` | Ingest telemetry batches. |
| POST | `/api/v1/auth/token` | JWT from `apiKey` + `brandId`. |
| POST | `/api/v1/brand/webhook` | Save brand `webhook_url`. |
| POST | `/api/v1/consent` | GDPR consent stamp on profile. |
| POST | `/api/v1/tryon/render` | Enqueue try-on; **`BackgroundTasks`** → `worker.run_tryon_inference`. |
| GET | `/api/v1/tryon/status/{job_id}` | Poll job; reads `local_state.get_job` then Redis fallback. |
| POST | `/api/v1/body/scan` | Body scan from photo. |
| POST | `/api/v1/body/scan/landmarks` | Landmarks-based scan. |
| POST | `/api/v1/spatial/extract` | Multi-image topology (`cv_engine`). |
| POST | `/api/v1/garment/digitize` | Garment flat-lay measurements. |
| POST | `/api/v1/size/recommend` | Size engine JSON API. |
| POST | `/api/v1/size/compare-brands` | Cross-brand comparison. |
| GET | `/api/v1/size/materials` | Material DB. |
| POST | `/api/v1/profile/save` | SQLite profile save. |
| GET | `/api/v1/profile/{session_token}` | Load profile. |
| DELETE | `/api/v1/profile/{session_token}` | Delete profile. |
| GET | `/api/v1/catalog` | Garments for JWT brand. |
| GET | `/api/v1/admin/brands` | Admin brand list. |
| GET | `/api/v1/gpu/health` | `get_gpu_stats()` from `local_vton_engine`. |

**Static:** `app.mount("/renders", StaticFiles(directory=RESULT_CACHE_DIR))`.

### Database schema (SQLAlchemy models — `backend/models.py`)

**`brands`:** `id`, `name`, `api_key`, `plan_tier`, `webhook_url`  
**`garments`:** `id`, `brand_id` → brands, `name`, `type`, `sizes` (JSON), `material_code`, `stretch_coefficient`  
**`body_profiles`:** `id`, `session_uuid`, `brand_id`, `measurements` (JSON), `created_at`, `consented_at`  
**`render_jobs`:** `id`, `job_uuid`, `brand_id`, `status`, `result_url`, `created_at`

**SQLite (`profile_store.py`):** separate anonymous profile rows keyed by `session_token` — not the same as Postgres `body_profiles` unless unified later.

### Auth flow

1. Client `POST /api/v1/auth/token` with `TokenRequest` (`apiKey`, `brandId`).
2. Server validates against Postgres `brands` table.
3. JWT returned; `sub` = brand id, `plan` = tier.
4. Routes use `Depends(get_current_brand)`; if `ENFORCE_AUTH` false and no header, **`brand_default`** fallback (dev hazard).

### Background / GPU jobs

- **Primary path (Windows-friendly):** `main.render_virtual_try_on` adds **`run_inference_bg`** to **`BackgroundTasks`**, which calls **`worker.run_tryon_inference`**.
- **State:** in-process **`local_state.LOCAL_JOBS`** updated by **`ProgressReporter.update`**.
- **Redis/RQ:** intended for multi-worker; `job_queue.py` implements queue + **`get_job_status`** when Redis available. Local dev often falls back.

### Middleware (`main.py`)

- **CORS** — `CORSMiddleware` (localhost:3000).
- **`PayloadSizeLimitMiddleware`** — 10MB cap.
- **`SecurityHeadersMiddleware`** — CSP, HSTS, frame deny, etc.
- **`request_id_middleware`** — UUID per request, timing headers.

### Error handling

- Global `@app.exception_handler(Exception)` returns generic 500 JSON (`ErrorCode.INTERNAL`).
- Route-level `HTTPException` with structured `detail` dicts.

### Environment variables (names only — **no values**)

From `backend/config.py` and related usage:

`REDIS_URL`, `JWT_SECRET_KEY`, `CLOUDFLARE_R2_*`, `FAL_AI_KEY`, `REPLICATE_API_KEY`, `DATABASE_URL`, `USE_LOCAL_GPU`, `ENFORCE_AUTH`, `ENFORCE_RATE_LIMITS`, `GPU_MAX_CONCURRENT_RENDERS`, `RESULT_CACHE_DIR`, `RESULT_BASE_URL`, `VTON_MODEL_ID`, `VTON_SKIP_STARTUP_WARMUP`, `INFERENCE_STEPS`

**Frontend:** `NEXT_PUBLIC_API_URL` (optional); default API base `http://localhost:8001` (`aikart-app/src/ar-engine/APIClient.ts` ~L38, `BASE_URL`).

---

## 6. AI/ML PIPELINE

### Models in use

| Layer | Technology |
|-------|------------|
| **Virtual try-on (server)** | **SDXL Inpainting** — `diffusers.AutoPipelineForInpainting`, hub id default `diffusers/stable-diffusion-xl-1.0-inpainting-0.1` (`VTON_MODEL_ID`). |
| **Pose (browser)** | **MediaPipe Tasks Vision** — `PoseLandmarker` in `PoseDetector.ts` (WASM from jsDelivr CDN). |
| **Body scan (server)** | **MediaPipe** (Python) + CV in `body_scan.py` / `cv_engine.py` (details in those modules). |
| **Legacy comments** | `requirements.txt` still mentions “IDM-VTON / OOTDiffusion” in comments; **runtime path is SDXL inpaint** in `local_vton_engine.py`. |

### Load strategy

- **Module singleton:** `_PIPELINE` in `local_vton_engine.py`.
- **`load_pipeline()`** — cold load from Hugging Face cache; optional **`VTON_SKIP_STARTUP_WARMUP`** skips **`main.py` `startup_event`** preload.
- **Warm-up:** small CUDA tensor alloc after load (lines ~138–153 in `local_vton_engine.py`).

### I/O

- **In:** base64 **user photo** (+ optional garment image path in engine; worker passes `garment_image_b64=None` today).
- **Out:** JPEG on disk under `RESULT_CACHE_DIR`, URLs built with `RESULT_BASE_URL`; thumbnail `*_thumb.jpg`.

### VRAM management

- `torch.float16`, `enable_model_cpu_offload()`, attention slicing, VAE slicing/tiling, optional xFormers (`local_vton_engine.py`).
- **`GPU_MAX_CONCURRENT_RENDERS`** semaphore in `run_local_tryon`.

### End-to-end (try-on render)

1. `POST /api/v1/tryon/render` creates `job_id`, seeds `local_state.init_job`.
2. Background thread: `worker.run_tryon_inference` → `_load_vton_model` → `run_local_tryon`.
3. Preprocess/crop to **768×1024**, build torso mask, composite garment hint if provided, **`pipe(...)`** with `callback_on_step_end` for progress.
4. Post-enhance, save JPEGs, update `LOCAL_JOBS` to `completed` with `imageUrl` / `thumbUrl`.

### Model files / sizes

- Hugging Face cache under user profile (typical multi-GB for SDXL). Exact GB **environment-specific**.

---

## 7. WHAT IS FULLY BUILT AND WORKING

| Feature | Access | Implementation | Status |
|---------|--------|----------------|--------|
| **JWT + brand auth** | `POST /api/v1/auth/token` | `main.py`, `auth.py`, Postgres `brands` | Working when DB seeded. |
| **Catalog API** | `GET /api/v1/catalog` | `main.py` + `GarmentModel` | Working. |
| **SDXL try-on render** | `POST …/tryon/render` + poll | `main.py`, `worker.py`, `local_vton_engine.py` | **Working** on GPU setups; timing ~minutes class on 6GB + CPU offload. |
| **Job progress** | Poll `…/tryon/status/{id}` | `local_state.py`, `ProgressReporter` | Fixed to shared dict + lock (recent work). |
| **Try-on UI** | `/try-on` | `try-on/page.tsx`, `APIClient.ts` | **Working** — cinematic UI, history, telemetry client. |
| **Telemetry sink** | `POST …/telemetry/tryon` | `main.py` | Working (logs + accepts batch). |
| **Size engine API** | `POST …/size/*` | `size_engine.py`, `main.py` | Working (unit tests exist). |
| **Physical Twin SQLite** | profile routes | `profile_store.py` | Working for anonymous sessions. |
| **GPU health** | `GET …/gpu/health` | `local_vton_engine.get_gpu_stats` | Working. |
| **Live AR mirror (basic)** | `/mirror` | `mirror/page.tsx`, `PoseDetector`, `Renderer`, `Overlay` | **Functional prototype** — 2D tracked overlay; quality bar is subjective. |

---

## 8. WHAT IS PARTIALLY BUILT OR BROKEN

| Item | Intended | Actual / gap |
|------|----------|--------------|
| **“Real-time mirror = Prada jacket physics”** | LVMH-grade garment simulation | **2D image warp / overlay** + MediaPipe — not full physics cloth. |
| **Try-on garment from catalog in SDXL path** | Garment image fused | Worker passes **`garment_image_b64=None`** — inpaint uses mask + prompts; **catalog garment photo may not be fed** into `run_local_tryon`. |
| **Redis/RQ on Windows** | Distributed workers | Documented fork/process issues; **BackgroundTasks** path is the reliable local pattern. |
| **SLA vs reality** | `max_inference_seconds` 90 in config | Long SDXL runs can exceed; **tuning** or SLA text mismatch. |
| **Dual body profile stores** | Single source of truth | **Postgres `body_profiles`** vs **SQLite `profile_store`** — consolidation UNCLEAR. |
| **Git tracking** | Clean repo | **`mirror/`**, consent/welcome components, proofs — **untracked** in snapshot; risk of “works locally, not in CI”. |

---

## 9. THE AR MIRROR — DETAILED STATUS

### Directories / modules

- **Primary:** `aikart-app/src/ar-engine/` — production-oriented TS engine.
- **Secondary:** `aikart-app/src/components/ar/` — `Scene3D.tsx`, `AutoRigger.ts` (Three.js / rigging experiments).
- **Page:** `aikart-app/src/app/mirror/page.tsx` — dedicated **Live AR Garment Mirror** route.

### MediaPipe

- **`PoseDetector.ts`** uses **`@mediapipe/tasks-vision`** `PoseLandmarker` with **full** model asset path (see `createFromOptions` ~L98+).
- Exports **`LANDMARK`** enum matching **33 pose landmarks** (nose `0`, shoulders `11/12`, hips `23/24`, etc.).

### Three.js

- **Dependency present** (`three`, R3F, drei) — **`Renderer.ts` is Canvas 2D**, not WebGL, for the main mirror drawing path.
- **`Scene3D.tsx`** uses Three.js for **3D / GLB** workflows (separate from mirror canvas renderer).

### Webcam / camera

- **`Engine.ts`** (not only mirror page) manages **`getUserMedia`**, video element, and RAF loop — mirror page may inline similar patterns; **mirror/page.tsx** imports **`PoseDetector`**, **`Renderer`**, **`Overlay`**, **`GarmentLoader`** directly.

### Garment overlay

- **`Overlay.ts`** — transforms for garment sprite/texture.
- **`GarmentLoader.ts`** — loads PNG/JPG/SVG/GLB paths.
- **`mirror/page.tsx`** uses static **`MIRROR_GARMENTS`** with **`/garments/canonical/*.png`**.

### Critical classification

| Question | Answer |
|----------|--------|
| **Is there a real-time AR mirror?** | **Yes (client-side):** `/mirror` + MediaPipe + canvas overlay, **without** SDXL per frame. |
| **Is the flagship `/try-on` flow real-time AR?** | **No.** It is **async SDXL inpainting** — upload/render → poll → show result image. |
| **To reach executive-grade live mirror** | Likely needs **better warping/mesh**, **lighting-aware compositing**, **depth/occlusion**, **garment assets aligned to rig**, optional **WebGL** layer, and **performance** work on mobile GPUs. |

---

## 10. DESIGN SYSTEM — EXACT VALUES

From `aikart-app/src/app/globals.css` (`:root` unless noted):

**Colors (sample)**  
- `--background`: `#181117`  
- `--gold`: `#E6C364`, `--gold-dim`: `#C9A84C`, `--gold-raw`: `#FFE08F`, `--gold-deep`: `#755B00`  
- `--foreground` / `--text-primary`: `#EDDFE6`  
- `--accent-ai`: `#B9C4FF`  
- Borders: `--border-gold`: `rgba(230, 195, 100, 0.3)`  

**Radii**  
- `--radius-sm` through `--radius-xl`: **`0px`** (architectural sharp corners)  
- `--radius-full`: `9999px`  

**Motion**  
- `--ease-gold`: `cubic-bezier(0.16, 1, 0.3, 1)`  
- `--duration-fast`: `150ms`, `--duration-normal`: `400ms`, `--duration-slow`: `800ms`, `--duration-cinematic`: `1500ms`  

**Fonts**  
- CSS vars: `--font-serif` Playfair Display; `--font-sans` Space Grotesk.  
- `layout.tsx` also sets `--font-playfair` / `--font-space` via `next/font`.

**Global UX**  
- Custom gold dot cursor (`#maison-cursor`) with `cursor: none !important` on `*` — **accessibility / usability tradeoff**.

**Dark/light**  
- **Dark-first** only; no toggle observed in audited files.

---

## 11. CONFIGURATION FILES

| File | Key settings |
|------|----------------|
| `aikart-app/next.config.ts` | Default export; no experimental flags set. |
| `aikart-app/tsconfig.json` | `strict: true`, `moduleResolution: "bundler"`, `@/*` paths. |
| `aikart-app/postcss.config.mjs` | `@tailwindcss/postcss` plugin. |
| `aikart-app/eslint.config.mjs` | Next core-web-vitals + TS; ignores `.next`, `out`, `build`. |
| `aikart-app/package.json` | Scripts: `dev`, `build` (= next build + `build.mjs`), `start`, `lint`. |
| `backend/alembic.ini` | Alembic config (present under `backend/`). |
| **Docker / CI** | **MISSING** in audited root. |

`.env` — **never commit**; variable **names** listed in §5.

---

## 12. DATABASE STATE

- **Postgres:** brands, garments, body_profiles, render_jobs (see migrations + models).
- **SQLite:** `physical_twin.db` for session profiles via `profile_store.py`.
- **Migrations:** `001_initial_schema.py` (baseline); `9eb9a2ba2fe2_migrate_to_simplified_schema.py` (follow-up).
- **Connection pattern:** `DATABASE_URL` — supports Neon-style Postgres URI when configured.

---

## 13. DEPENDENCIES — HEALTH CHECK

| Check | Finding |
|-------|---------|
| **Unpinned Python** | High drift risk; pin for production reproducibility. |
| **`any` in TS** | Present in `APIClient.ts`, `BodyCalibrationModal.tsx`, `Scene3D.tsx`, `IRenderer.ts`, `SaaSClient.ts`, `ammo.d.ts`, etc. |
| **xFormers / torch** | Version skew can break CUDA extensions (seen in past logs) — treat as **fragile**. |
| **Duplicate font loading** | Google Fonts in CSS + `next/font` — minor redundancy. |
| **Unused deps** | **UNCLEAR** without `depcheck` / `npm ls`; R3F/drei may be underused if mirror stays 2D-only. |

---

## 14. CRITICAL WARNINGS FOR THE NEXT DEVELOPER

1. **`local_state.LOCAL_JOBS`** is **in-memory** — lost on restart; not multi-instance safe.
2. **`ENFORCE_AUTH=false`** (default) → **`brand_default`** — dangerous if exposed publicly.
3. **Windows** — RQ/fork pain; prefer **BackgroundTasks** or dedicated worker design.
4. **SDXL latency** — CPU offload makes **step time** large; SLA numbers may be wrong.
5. **Do not commit** `backend/.env`, API keys, or `venv/`.
6. **`mirror` route** — verify **git tracking** before assuming deployment includes it.
7. **Cursor hides default cursor** globally — test keyboard/accessibility impact.

---

## 15. COMMANDS AND SCRIPTS

### Frontend

```bash
cd aikart-app
npm install
npm run dev          # http://localhost:3000
npm run build
npm start
npm run lint
node build.mjs       # SDK bundle to dist/
```

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Install torch per CUDA instructions in requirements.txt comments
uvicorn main:app --port 8001
```

### DB migrations

```bash
cd backend
alembic upgrade head   # if alembic.ini configured
```

### Tests / scripts

- `pytest` in `backend/` (files: `test_*.py`, `conftest.py`).
- `python e2e_render_test.py`, `test_real_photo.py`, `benchmark_two_renders.py` (require env + DB + running API).

---

## 16. GIT STATUS (snapshot)

| Item | Value |
|------|--------|
| **Branch** | `main` |
| **HEAD** | `f582c35` (at time of audit) |
| **Commit count** | `git rev-list --count HEAD` → **17** |
| **Remote** | `origin/main` tracked |
| **Uncommitted / untracked** | Many paths including **`aikart-app/src/app/mirror/`**, `.cursor/`, `backend/.env`, `venv/`, logs, proofs — **working tree not clean** |

---

## Appendix — Representative code patterns

**FastAPI try-on dispatch** (`main.py`, illustrative):

```python
background_tasks.add_task(run_inference_bg)
# run_inference_bg imports worker.run_tryon_inference(...)
```

**MediaPipe landmark enum** (`PoseDetector.ts`):

```typescript
export const LANDMARK = { NOSE: 0, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, ... } as const;
```

**SDXL load** (`local_vton_engine.py`):

```python
pipe = AutoPipelineForInpainting.from_pretrained(
    VTON_MODEL_ID, torch_dtype=torch.float16, use_safetensors=True, variant="fp16",
)
```

---

*End of CODEBASE_ANALYSIS.md*
