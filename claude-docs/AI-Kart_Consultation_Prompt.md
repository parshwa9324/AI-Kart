# AI-Kart: Virtual Try-On System — Architecture Consultation

## Who I Am
I'm a solo founder building **AI-Kart** — a B2B SaaS virtual clothing try-on platform. I will sell this as a subscription service to high-end clothing brands (like Zara, H&M, luxury labels). Brand employees upload photos of their garments, and end-consumers use my platform to virtually try on clothes and get accurate size recommendations.

I have already built a working prototype and received a detailed CTO-level architectural assessment from Claude (Anthropic). I'm now consulting multiple AI experts to get diverse perspectives before committing to the final architecture. **I want you to be brutally honest — tell me what's wrong, what's missing, what could be better, and any ideas I haven't considered.**

---

## What I've Already Built (Current Prototype)

A real-time AR clothing try-on system with the following stack:

**Tech:** Next.js 16 + React 19 + TypeScript  
**Pose Detection:** MediaPipe pose_landmarker_lite (33 landmarks, 640×480, client-side)  
**3D Rendering:** React Three Fiber + Three.js 0.183  
**State Management:** Zustand  
**3D Model:** A single free low-poly gaming jacket (free_lowpoly_jacket.glb, ~500 polygons)

### Current Pipeline:
1. Webcam captures video at 30fps
2. MediaPipe detects 33 body landmarks
3. Custom Kalman filter smooths landmark jitter (BodyIntelligence.ts)
4. Body yaw calculated from shoulder depth difference (atan2)
5. Collar position estimated from ears/nose/shoulders
6. Zustand store updated with all pose data
7. React Three Fiber maps 2D canvas coordinates to 3D world space
8. Custom AutoRigger procedurally generates 5-bone skeleton from GLB bounding box
9. Sleeve bones rotate via quaternion slerp based on shoulder-to-elbow angles

### Current Codebase: ~7,674 lines of TypeScript
- `Engine.ts` (953 lines) — Main orchestration, state machine, camera→pose→render loop
- `BodyIntelligence.ts` (309 lines) — Kalman filter, body yaw, torso tilt, collar alignment
- `Scene3D.tsx` — React Three Fiber component, NDC conversion, garment positioning
- `AutoRigger.ts` — Procedural skeleton from bounding box (shoulder at 18% width, elbow at 35%)
- `GarmentAnalyzer.ts` (374 lines) — Pixel contour analysis, garment type detection, anchor calibration
- `PhysicsEngine.ts` (318 lines) — Ammo.js cloth simulation (EXISTS but completely disconnected)
- `PoseStore.ts` — Zustand bridge between vanilla JS engine and React Three Fiber

---

## Critical Problems Identified

### 1. Zero Body Measurement
The system tracks pose (joint positions) but never measures the body in real units. No chest width, waist, shoulder breadth in centimeters. Garment scaling uses pixel-based shoulder distance which changes with camera distance. Cannot determine if a garment is 2 inches too wide or too tight.

### 2. No Real Garments
Using a free low-poly gaming asset with no size metadata, no material properties. Real try-on needs garments with actual measurements (chest=42cm, sleeve=64cm). Current garments have no concept of "size."

### 3. No Metric Grounding
Scene3D converts canvas pixels → NDC → Three.js world space. Works visually but has no real-world metric dimensions. Neither person nor garment has a real-world scale.

### 4. No Cloth Physics Running
PhysicsEngine.ts exists but is completely disconnected. Garments are rigid 3D models that rotate/scale — no draping, folding, or deformation. A loose T-shirt and a fitted blazer look identical.

### 5. AutoRigger Too Naive
Bones placed by bounding box proportions. Same placement for a poncho and a fitted shirt. Only 2 bones per sleeve — cannot express wrist rotation, forearm twist, or shoulder shrug.

### 6. Single Camera, Lite Model
pose_landmarker_lite at 640×480 has ±3-5cm landmark error. Sub-centimeter accuracy needed for size confidence. No depth sensor. Body measurement from single RGB is under-constrained.

---

## My Business Model

### B2B SaaS — Subscription to Clothing Brands
- I sell to brands (Zara, H&M, luxury labels, etc.), not directly to consumers
- Brands pay monthly subscription
- Brand employees photograph new stock garments (flat-lay photos) and upload to my system
- Consumers use the try-on via the brand's website, app, or in-store kiosk
- **Every brand has different sizes for the same label** (Zara M ≠ H&M M) — my system must handle brand-specific size charts
- Different fabric materials affect fit (cotton vs spandex vs silk) — the system must account for material stretch and drape

### Deployment: Three Channels (haven't decided which to prioritize)
1. **Web-based** — embedded in brand's e-commerce site (iframe or SDK)
2. **Mobile app** — standalone or white-labeled per brand
3. **In-store kiosk** — large touchscreen display with camera (like McDonald's ordering kiosks), branded with my company identity, placed in flagship stores

---

## The Architecture Proposed by Claude

### Hybrid Approach:
1. **Live camera preview** — Keep MediaPipe + simplified 2D garment overlay for instant "magic mirror" feeling
2. **"See accurate fit" button** — Triggers server-side ML pipeline (3-8 seconds) for photorealistic render with size annotations
3. **Body measurement** — SAM 3D Body (Meta, open source, Nov 2025) extracts full 3D body mesh from single photo + height input
4. **Garment measurement** — Brand employee photographs flat-lay garment next to a physical calibration board (reference object for pixel-to-cm conversion). AI segments garment, detects keypoints, calculates centimeter measurements.
5. **Virtual try-on rendering** — IDM-VTON / CatVTON / 3DFit (diffusion-based models) — takes user photo + garment photo → outputs photorealistic composite
6. **Size recommendation** — Mathematical comparison: body measurements vs garment measurements, adjusted for material stretch factor

### Proposed Tech Stack:
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (keep current) |
| Backend | FastAPI (Python) — new |
| Body Estimation | Meta SAM 3D Body |
| Virtual Try-On | IDM-VTON or CatVTON (diffusion models) |
| Garment Measurement | Custom pipeline: UNet segmentation + keypoint detection + reference scaling |
| Database | PostgreSQL + Redis + S3 |
| GPU Hosting | RunPod / Modal / AWS g5 |
| Real-time Preview | Simplified MediaPipe + Three.js (kiosk only) |

### Proposed Roadmap:
- Month 1-2: FastAPI backend, SAM 3D Body integration, garment upload pipeline
- Month 3-4: VTON model integration, web frontend, brand admin dashboard
- Month 5-6: White-labeling, billing (Stripe), analytics
- Month 7-8: Kiosk prototype
- Month 9-12: Mobile app, batch processing, cross-brand sizing

---

## Material-Aware Sizing

Different fabrics fundamentally change how a garment fits:
| Material | Stretch | Fit Impact |
|----------|---------|-----------|
| 100% Cotton | 2-5% | Rigid, size is exact |
| Cotton-Spandex | 10-20% | Flexible, can size down |
| Linen | 1-3% | Runs tight, needs room |
| Silk | 0-2% | Fluid drape, exact sizing |
| Denim | 1-20% (varies) | Depends on stretch blend |
| Wool knit | 5-15% | Moderate give |

The system adjusts size recommendations based on material properties that brand employees select during garment upload.

---

## What I Want From You

Please analyze this entire project and give me your honest, detailed thoughts on:

### Architecture & Technical
1. **Is the hybrid approach (live preview + server-side accurate render) the right strategy?** Or should I go fully one direction?
2. **Are SAM 3D Body, IDM-VTON, CatVTON the best model choices in 2026?** Are there newer or better alternatives I should consider?
3. **The garment measurement pipeline (flat-lay photo + reference object → centimeter measurements)** — is this the most reliable approach? How would you improve it?
4. **2D-to-3D garment conversion** — for the kiosk real-time experience, I need 3D garment models. What's the best way to generate these from 2D product photos? Should I use Style3D, Meshy.ai, Tripo3D, or build my own?
5. **Material/fabric physics** — how should I handle cloth material behavior beyond simple stretch percentages? Should I use neural cloth simulation, or is the implicit physics in VTON models sufficient?
6. **What infrastructure would you recommend for GPU inference?** RunPod vs Modal vs Replicate vs self-hosted? I need to keep costs manageable as a startup.

### Business & Product
7. **Web vs App vs Kiosk — which should I build first?** What's the fastest path to revenue?
8. **Pricing model** — what would you charge brands? Per-try-on, monthly subscription, or tiered?
9. **Competitive moat** — Kivisense, Perfect Corp (NYSE:PERF), Fashn.ai, GlamAR, Zakeke are all in this space. What would make AI-Kart win?
10. **The calibration board idea** (physical board shipped to brands for standardized garment photography) — good idea or unnecessary friction?

### What Am I Missing?
11. **What technical challenges have I not considered?** (e.g., lighting normalization, skin tone handling, garment occlusion, multi-garment try-on, accessories)
12. **What business challenges have I not considered?** (e.g., brand onboarding friction, garment catalog management at scale, privacy/GDPR for body data)
13. **Any emerging technologies or papers from late 2025 / early 2026 that I should look at?**
14. **What would you do differently if you were building this from scratch?**

### Scale & Future
15. **How should I design the system so it can handle 100+ brands and millions of try-ons per month?**
16. **Should I consider building my own foundation model for virtual try-on, or keep using open-source models?**
17. **What about video try-on (real-time video output instead of still images)?** Is the technology ready?

Please be specific and technical. Don't tell me "it depends" — give me your best recommendation and explain the trade-offs.

---

## Files I Can Share If Needed
- Full source code (~7,674 lines TypeScript)
- package.json (dependency list)
- TECHNICAL_EXTRACTION_REPORT.md (detailed code analysis)
- AI-Kart_Working_Architecture.md (system architecture breakdown)
- AI-Kart_CTO_Assessment.md (Claude's full analysis)
- AI-Kart_B2B_SaaS_Strategy.md (Claude's B2B strategy)
- Previous chat with Antigravity AI about sleeve tracking bugs
