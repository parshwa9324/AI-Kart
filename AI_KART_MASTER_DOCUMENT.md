# AI_KART_MASTER_DOCUMENT.md

## 1. PROJECT VISION & IDENTITY
AI-Kart is a premium, enterprise-grade B2B SaaS platform delivering high-fidelity virtual try-on and deterministic "Size Intelligence" for luxury fashion brands. It provides an API gateway and interactive AR engines that allow fashion brands to offer their customers millimeter-accurate sizing recommendations and photorealistic try-on renderings.
This project is history-changing because it completely abandons the flawed "survey-based" or "LLM-guesswork" sizing models used by traditional e-commerce. Instead, it relies on strict geometric computer vision (Multi-Pose Triangulation), true 3D physical modeling (Kalman-filtered body kinematics), and deterministic material math (fabric stretch coefficients) to calculate exact physical fit.
It solves the billion-dollar problem of e-commerce returns by calculating what actually fits the human body, factoring in stretch, drape, and brand-specific tolerances.
**Target Users:** Luxury fashion brands (B2B tenants like Prada, Zegna, Louis Vuitton) and their end consumers.
**Success:** A reduction in garment return rates by 80%, seamless plugin integration into existing luxury storefronts, and try-on visuals indistinguishable from professional photoshoots.
**Monetization:** B2B SaaS subscription tiers (Trial, Standard, Enterprise), with capacity-based rate limiting on GPU rendering and API queries.

## 2. CURRENT PROJECT STATUS
**Completion Estimate:** 65% - 70% complete.
**Working right now:** 
- The entire API Gateway architecture (tenant-routing, rate limiting, capability gating).
- The "Money Maker" Size Intelligence Engine calculating deterministic ease, stretch, and return-risk.
- Next.js frontend with stunning glassmorphism UI, Framer Motion animations, and "live" GPU polling data visualizers.
- AR Engine structural pipeline (Camera -> MediaPipe Pose -> BodyIntelligence filtering -> State Store).
**Half-built / Broken:** 
- The AR rendering pipeline is currently midway through a massive refactor ("Phase 1 3D Transition"). It contains deprecated 2D Mesh-Warping code alongside incoming true 3D Euler/Euler Matrix code. 
- Machine learning elements (diffusion VTON, SAM3D body scan) are currently using `USE_MOCK_ML` in the backend and `USE_MOCK` in the frontend API client. Real GPU integration is mocked out with `asyncio.sleep` to simulate workload.
**Biggest Blocker right now:** Replacing the mock ML pipelines with the actual IDM-VTON diffusion nodes and finishing the Three.js 3D Garment rendering logic (fixing the collar-drop and wrap-around tracking bugs).

## 3. COMPLETE TECH STACK
**Backend:**
- **Language/Framework:** Python 3, FastAPI, Uvicorn (Standard)
- **Queuing & Cache:** Redis, RQ (Redis Queue) for handling async GPU render jobs
- **Data structures:** Pydantic (Strict API payload typing)
- **Computer Vision:** OpenCV (`opencv-python`), MediaPipe, NumPy, SciPy
- **Auth:** `python-jose`, `passlib` (JWT, Tenant separation)

**Frontend:**
- **Framework:** Next.js 16.1.6, React 19.2.3, TypeScript 5
- **Styling:** Tailwind CSS v4, Framer Motion (micro-interactions)
- **State Management:** Zustand
- **3D/AR Engine:** Three.js v0.183.0, `@react-three/fiber`, `@react-three/drei`
- **Vision Models:** `@mediapipe/tasks-vision` (client-side pose detection)
- **Build/Config:** ESLint, PostCSS, Custom Node build scripts (`build.mjs`)

**AI/ML Models (Intended):**
- **Pose:** Google MediaPipe (33 Landmarks)
- **Body Scan:** SAM 3D Body (Segment Anything)
- **Try-On Compositing:** IDM-VTON (Diffusion overlay)

## 4. COMPLETE PROJECT STRUCTURE
- `/backend`: The FastAPI Python application.
  - `main.py`: Enterprise API gateway, routing, rate limiting, and core controller.
  - `auth.py`: JWT generation and Redis sliding-window limitation metrics.
  - `job_queue.py`: RQ worker integration for throwing VTON requests to GPU servers.
  - `size_engine.py`: The deterministic fit calculator. Evaluates stretch, cut, and body delta.
  - `body_scan.py` & `cv_engine.py`: Spatial extraction from multi-pose geometry.
  - `cv_garment.py`: Garment digitization algorithms.
- `/aikart-app`: The Next.js Frontend Application.
  - `/src/app/admin`: Brand dashboard for digitized garment management.
  - `/src/app/try-on`: The core B2C facing AR interface. Real time overlays and size polling.
  - `/src/components/ui`: Premium glassmorphism components (`FitPanel.tsx`, `DataGauge.tsx`, `AnimatedButton.tsx`).
  - `/src/components/ar`: 3D rendering components mapping to `@react-three/fiber` components.
  - `/src/ar-engine`: The client-side computer vision logic.
    - `Engine.ts`: The orchestrator, runs the 60fps loop.
    - `BodyIntelligence.ts`: Applies Kalman filtering, Yaw Deprojection, Torso Tilt, Collar alignment to raw MediaPipe data.
    - `MeshWarper.ts`: Deprecated 2D fabric warping logic.
    - `APIClient.ts`: Strongly typed fetch wrapper connecting to FastAPI.
  - `/src/store`: Zustand global stores (`PoseStore.ts`).

## 5. SYSTEM ARCHITECTURE
- **API Structure:** 
  RESTful B2B endpoints structured under `/api/v1/`. 
  - `POST /api/v1/auth/token`: Exchanges Brand API Keys for JWTs.
  - `POST /api/v1/tryon/render`: Dispatches a VTON job and immediately yields a UUID.
  - `GET /api/v1/tryon/status/{job_id}`: Polled by Next.js for live GPU progression.
  - `POST /api/v1/size/recommend`: Synchronous execution of the physical sizing math.
- **Database Schema:** (Currently hardcoded heavily, but designed for PostgreSQL). Tenants (Brands) -> GarmentSpecs (Dimensions, Material Stretch, Cut) -> Users (Body Profile).
- **Authentication:** Tenant-scoped JWTs injected via HTTPBearer token header, with plan limits defining `garment_digitize_enabled` and `vton_enabled` scopes. Rate limiting backed by Redis pipeline operations (sliding window ZSET).
- **AI/ML Pipeline:** 
  1. Client uploads image -> 2. API authenticates and verifies Redis rate limits -> 3. Job injected into Redis Queue (RQ) -> 4. Python GPU Worker picks up job, runs IDM-VTON -> 5. Worker updates `progress_pct` in Redis -> 6. Client pulls update and streams progress bar -> 7. Render pushed to CDN, job marked completed.
- **Frontend Routing:** Standard Next.js App Router topology.

## 6. FEATURE SPECIFICATION (Every Feature)
- **Size Intelligence ("The Money Maker")**
  - *What it does:* Cross-compares brand sizing charts against human telemetry. Returns confidence %, return risk, and a per-dimension fit breakdown.
  - *Status:* Done (Math logic implemented in Python).
  - *Implementation:* Divides body into weighted importance (Chest 30%, Waist 25%). Compares against garment spec while applying specific `MATERIAL_STRETCH_DB` coefficients to calculate "effective gap".
  - *Edge cases handler:* Differentiates tight (snug, uncomfortable) vs loose (oversized). Unreasonable inputs > 230cm rejected. 
- **Virtual Try-On (VTON)**
  - *What it does:* Uses Diffusion ML to composite clothing perfectly onto user imagery.
  - *Status:* Partial (API infrastructure built, actual ML model mocked).
  - *Implementation:* Async Redis Queue mechanism pushing workloads to theoretical GPU nodes.
- **Body Scanning**
  - *What it does:* Calculates physical frame from a 3-pose geometric triangulation combining height and BMI context.
  - *Status:* Partial (Structure exists, relies on mocked CV).
- **Garment Digitization**
  - *What it does:* A clothing flat-lay photo is uploaded; CV algorithms find 24 keypoints to extract exact cm dimensions.
  - *Status:* Partial.
- **Cross-Brand Comparison**
  - *What it does:* Tells a user exactly what size they are across 10 luxury brands simultaneously based on a single body profile.
  - *Status:* Done.

## 7. UI/UX DESIGN SPECIFICATION
- **Style:** Extreme Premium Glassmorphism. Dark mode dominant (Zinc-950, Zinc-900). 
- **Color Palette:** Backgrounds `zinc-950`, text `zinc-200`, heavy accents of Luxury Gold (`#D4AF37`), with structural feedback colored as Emerald (`#10b981`), Amber (`#f59e0b`), and Rose (`#f43f5e`).
- **Typography:** Sleek geometric sans-serif for UI, serif for heavy metric readouts. Use of tabular-nums for live counters.
- **Patterns:** Backdrop blur filters, 1px white/5% opacity borders for glass cards, pulse glows.
- **Interactions:** Heavy usage of Framer Motion (`animate-in`, `fade-in`, `spring` configurations). Real-time nested rings for GPU spinner processing.
- **Mobile Responsive:** Yes, heavily relies on Tailwind grid layouts scaling to stack columns.

## 8. AI/ML SPECIFICATION (Critical Section)
- **Pose Tracking:** `@mediapipe/tasks-vision`. High frequency >30fps. Used client-side to drive the AR camera UI.
- **IDM-VTON / Diffusion:** Python-side heavy composite engine. Needs substantial GPU overhead (A100/H100 tier). 
- **Body Segmentation SAM3D:** Calculates cm dimensions. Falls back to deterministic height/BMI mathematical ratios if imagery is poor.
- **Fallbacks:** Mock image selection in local dev. If MediaPipe fails mid-video, AR engine falls back to a frozen `lastPose` overlay logic.

## 9. PERFORMANCE & SCALE REQUIREMENTS
- **User Load & Scale:** Enterprise constraints. The API requires extreme resiliency. Redis queue prevents API from dropping connections under high inference load. 
- **Response Targets:** Size Intelligence execution <50ms. Try-On ML execution target <15s per garment.
- **Client Frame Rate:** The AR tracking must never drop below 30FPS on modern mobile devices. The frontend uses a custom autothrottle (`skipFrame`) if the client drops below 18FPS locally.
- **Cost:** High GPU compute costs per inference, addressed by rate-limiting (e.g., 20 renders/hour on specific plans).

## 10. SECURITY REQUIREMENTS
- **Auth Flow:** Strict API Key -> JWT token flow. No database touch required mid-request due to stateless JWT containing the tenant `brand_id`.
- **Data Privacy:** Body metrics (height, weight, geometry) are hyper-sensitive. The API strips PII. Webhooks and responses utilize temporal UUIDs `userId: session_{brand_id}_{id}`.
- **CORS:** FastAPI specifically locked to whitelist domains. 

## 11. INTEGRATION REQUIREMENTS
- **External Services:** Redis (Job Queuing, Rate Limiting), GPU Compute nodes (RunPod/AWS/etc), CDN for artifact delivery (images).
- **Client integrations:** Brands using standard API protocols via server-to-server fetches.

## 12. KNOWN BUGS & ISSUES
- **BUG 2 diagnostic:** Shoulder Y coordinates occasionally drift out of the required "top third" of the canvas space depending on user distance.
- **BUG 3 safety:** Potential for `NaN/Infinity` cascades from BodyIntelligence (Specifically inverse kinematics calculating Yaw around depth axis `dz/dx` if `dx` becomes identically `0`).
- **Collar Anchor Drift:** The virtual collar `CollarY` frequently falls below the shoulders when the user leans back. Logs currently denote: "Collar is significantly below shoulders!"
- **VTON Mock:** ML functionality is bypassed right now.

## 13. WHAT NEEDS TO BE BUILT (Priority Order)
- **CRITICAL:** Hook up real IDM-VTON inference script to the `worker.py` replacing `mockRenderTryOn`.
- **CRITICAL:** Fix the Three.js GLB procedural skeletal injection (Phase 1 3D transition).
- **HIGH:** Deploy persistent PostgreSQL database to replace hardcoded `DEMO_BRANDS` and `DEMO_BRAND_SIZE_CHARTS`.
- **HIGH:** Finalize SAM3D Body Measurement scripts, replacing the `estimate_from_height` fake fallback.
- **MEDIUM:** Refine Collar alignment math in `BodyIntelligence.ts`.
- **LOW:** Add more luxury garment templates to the demo pipeline.

## 14. TECHNICAL DEBT & REFACTORING NEEDS
- `Engine.ts` and `MeshWarper.ts` contain old 2D WebGL mesh manipulation code meant for flat images. It is tangled with the new 3D logic. The codebase needs a pure split: purge the 2D mesh-warp in favor of rigorous 3D GLB model injection.
- The `APIClient.ts` relies on checking `photo.startsWith('data:image')` and fetching Blobs, which is unstable for very large memory buffers.

## 15. ENVIRONMENT & CONFIGURATION
- **Requirements:** Python 3.10+, Node.js v20+, Redis-Server running.
- **To Run Backend:** `redis-server`, then `rq worker aikart_tryon_high aikart_tryon aikart_tryon_low`, then `uvicorn main:app --reload --port 8001`.
- **To Run Frontend:** `npm install`, then `npm run dev`.
- **Variables:** `JWT_SECRET_KEY`, `REDIS_URL`, `USE_MOCK_ML`, `NEXT_PUBLIC_API_URL`.

## 16. COMPETITIVE ANALYSIS
Other systems (TrueFit, FitAnalytics) use lightweight surveys ("What is your height and weight?"). They look up statistical averages and spit out "Large." 
AI-Kart acts like a digital tailor. It uses exact textile stretch coefficients multiplied against human metric circumferences and tests it against the literal CAD blueprint of the garment. It tells the user *why* it fits ("Wait opening too snug by -2.0cm"). It is fundamentally technically superior and visually vastly more premium.

## 17. THE PERFECT VISION (Most Important Section)
The ultimate, perfect version of AI-Kart works so seamlessly it feels like magic. A user visits a luxury brand's site, turns on their webcam for exactly 3 seconds to spin in a circle, and the system permanently generates their "Physical Twin." 
When they click "Try On" for a $3,000 cashmere coat, a hyper-realistic render loads in under 5 seconds. The fabric flows accurately. The lighting matches their room. The UI dynamically pops up advising them that while size M is their default, they should purchase a size L because the Italian cashmere blend used in this specific coat has a 0.08 drape stiffness and they need +3cm of shoulder clearance. 
This changed everything because sizing anxiety vanished entirely. It becomes a billion-dollar product when it is the invisible, ubiquitous protocol powering the checkout button for LVMH, Kering, and every major fashion conglomerate on earth.
