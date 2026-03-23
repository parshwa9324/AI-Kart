# AI-Kart: Revised CTO Strategy — B2B SaaS Architecture

**Update:** March 1, 2026  
**Context:** B2B subscription service for high-end clothing brands  
**Deployment:** Web + App + In-Store Kiosk (McDonald's-style large display)

---

## Your Business Model Changes Everything

You're not building a consumer app. You're building **infrastructure that luxury brands pay monthly to use.** This changes every technical decision because:

- Brands won't accept 70% accuracy. They need results that reduce returns, not increase them.
- Brand employees (not engineers) will upload garment photos. The pipeline must be foolproof.
- Different brands have completely different size charts. "Medium" at Zara ≠ "Medium" at H&M.
- You need white-label capability — each brand gets their own branded experience.
- Multi-deployment (web, app, kiosk) means your core engine must be API-first, screen-agnostic.

You are competing against **Kivisense** ($8-15K/month per brand), **Perfect Corp** (NYSE: PERF, just launched GenAI clothing try-on), **Fashn.ai**, **GlamAR**, and **Zakeke**. The B2B virtual try-on market is projected to reach $22 billion by 2035. This is real. But your differentiator needs to be **size-confidence accuracy** — which none of them do perfectly yet.

---

## The Four Pillars of Your System

### Pillar 1: Body Scanning (User Side)
### Pillar 2: Garment Digitization (Brand Employee Side)
### Pillar 3: Try-On Engine (The Magic)
### Pillar 4: Size Intelligence (The Money Maker)

Let me break each one down.

---

## Pillar 1: Body Scanning

**The problem:** You need real centimeter measurements of the user's body from a phone/webcam/kiosk camera.

**The solution:** Meta's **SAM 3D Body** (released Nov 2025, open source) is a game-changer for you.

From a single photo, SAM 3D Body gives you:
- Full 3D body mesh (pred_vertices — thousands of 3D points on the body surface)
- 70 body keypoints covering body, feet, and hands
- Separated skeletal structure AND soft tissue shape (MHR format)
- Works on real-world photos with occlusions, clothing, and unusual poses

**What this means for you:** From one user photo + their height input, you can mathematically extract:
- Chest circumference (trace the 3D mesh vertices around the chest)
- Waist circumference
- Hip circumference
- Shoulder width (vertex-to-vertex on the mesh)
- Arm length (follow the skeletal chain from shoulder to wrist)
- Torso length
- Inseam

SAM 3D Body runs at $0.02 per generation via fal.ai API, or you can self-host it on your own GPU server for unlimited use.

**For the in-store kiosk:** The kiosk has a fixed camera at a known position. This is actually an advantage because you control the lighting, distance, and background. You can get even more accurate body estimation because:
- Fixed camera means fixed focal length (no need to guess)
- Controlled lighting means better pose detection
- You can add a depth sensor (like Intel RealSense or iPhone LiDAR) to the kiosk for millimeter-accuracy

**Calibration flow:**
1. User stands on a floor marker (2m from camera)
2. System captures front-facing photo
3. Optional: captures side-view photo (user turns 90°)
4. User inputs their height (or kiosk uses LiDAR to measure it automatically)
5. SAM 3D Body generates full body mesh
6. Your code extracts all measurements from the mesh in centimeters
7. Measurements are stored in user's profile (for returning customers)

---

## Pillar 2: Garment Digitization

**The problem:** Brand employees will photograph flat-lay garments. You need to extract both measurements AND a 3D-ready visual from these photos.

**This is actually TWO separate problems:**

### Problem 2A: Garment Measurement Extraction

**The approach that works (proven by Shaku, Stitch Fix, Tailored):**

1. Employee lays garment flat on a surface
2. They place a **reference object** next to it (an A4 sheet of paper, a branded calibration card you provide, or ruler markings on a board)
3. They take a photo from directly above
4. Your AI pipeline does:
   - Detects the reference object → establishes pixel-to-cm ratio
   - Segments the garment from the background (UNet-based segmentation)
   - Detects keypoints (shoulders, hem, sleeve tips, waist, etc.)
   - Calculates distances between keypoints in centimeters
   - Returns structured measurements

Research shows this achieves **sub-1.5cm accuracy** (the 2022 paper achieved 0.75cm on dresses, 1.27cm on blazers). With a controlled reference object, you can hit sub-1cm.

**Your output per garment:**
```
{
  "garmentId": "brand_abc_shirt_001",
  "brand": "Zara",
  "type": "shirt",
  "sizeLabel": "M",
  "measurements_cm": {
    "chestWidth": 52.3,
    "shoulderWidth": 45.8,
    "sleeveLength": 63.1,
    "garmentLength": 72.5,
    "hemWidth": 51.0,
    "neckOpening": 18.2
  },
  "material": {
    "type": "cotton_blend",  // employee selects from dropdown
    "stretch": 0.15,         // 15% stretch capability
    "weight": "medium",
    "drapeStiffness": 0.6    // 0=silk, 1=denim
  }
}
```

**Critical business insight:** You should provide brand employees a **calibration board** (a physical product — your branded measurement board with precise markings). You ship this to every subscribing brand. It costs you $5 to produce, the brand sees it as professional hardware, and it dramatically improves measurement accuracy. This is exactly what Stitch Fix does internally.

### Problem 2B: 2D Photo to Visual Try-On Asset

For the try-on rendering, you do NOT need to convert the 2D photo into a full 3D model. Here's why:

**The industry has converged on 2D-to-2D try-on, not 2D-to-3D-to-2D.** Models like IDM-VTON, CatVTON, and 3DFit take a flat garment image directly and composite it onto a person's photo. They internally estimate the 3D draping but output a 2D image. This is faster, more realistic, and avoids the entire 3D asset pipeline.

**However, for the kiosk real-time mirror experience, you DO need some 3D.**

So here's the split:

| Use Case | Approach |
|----------|----------|
| Web/App try-on | 2D-to-2D (IDM-VTON / CatVTON) — photo in, photo out |
| Kiosk live mirror | Simplified 3D overlay (your current approach, improved) |
| Size recommendation | Pure math (body measurements vs garment measurements) |

For the kiosk live experience, you can use **Style3D AI** or **Meshy.ai** to pre-generate a basic 3D model from the garment photo during the brand upload process. This gets pre-rigged and stored. Then at kiosk runtime, you overlay it in real-time using your existing Three.js pipeline (but properly rigged with Mixamo, not your AutoRigger).

---

## Pillar 3: The Try-On Engine

### For Web & App (Photo-Based)

This is the core revenue driver. The flow:

1. User uploads or takes a selfie (full body)
2. SAM 3D Body estimates their body shape
3. User browses the brand's catalog
4. User taps "Try On" on a garment
5. Backend runs the VTON model (3-8 seconds)
6. User sees a photorealistic image of themselves wearing the garment
7. Alongside the image: size recommendation with confidence score

**The key VTON models to evaluate:**
- **IDM-VTON** — current SOTA, open source, handles complex poses well
- **CatVTON** — newer, lighter, better with accessories
- **3DFit** (January 2026 paper) — uses SMPL 3D body estimation internally, best at showing how different sizes fit differently. This is especially relevant for you because size-awareness is your differentiator.

**Material physics in the try-on render:** These diffusion-based models already understand fabric physics implicitly. They've been trained on millions of images of real clothes on real people. A silk shirt and a denim jacket naturally render differently because the model learned what draping looks like from training data. You don't need to build explicit cloth physics — it's embedded in the neural network.

However, for **size variation visualization** (showing the user how an L looks vs an M), you'll need to:
- Adjust the garment image slightly (scale up/down with proper deformation) before feeding it to the VTON model
- Or use 3DFit's approach which accepts body parameters AND garment parameters as inputs

### For In-Store Kiosk (Real-Time Mirror)

This is the "wow" factor for brands. The flow:

1. Customer walks up to the kiosk (large touchscreen + camera)
2. Camera captures them in real time
3. A simplified garment overlay tracks their body (your existing MediaPipe approach, cleaned up)
4. Customer browses garments on the touchscreen
5. Tapping "See Accurate Fit" triggers the server-side render (5-second wait, photorealistic result)
6. Kiosk shows size recommendation

For the real-time part, you keep a simplified version of your current engine but fix the fundamental issues:
- Use MediaPipe Full model (not Lite)
- Pre-rig garments with Mixamo during upload (not procedurally at runtime)
- Use the simplified 3D overlay just for the live preview effect
- The actual "accurate" rendering happens server-side via the same VTON pipeline

The kiosk hardware:
- 43" or 55" touchscreen display (portrait orientation)
- Embedded PC with GPU (RTX 4060 is sufficient for MediaPipe real-time)
- HD webcam at eye level (fixed mount)
- Optional: Intel RealSense depth camera for body measurement
- Network connection to your cloud API

---

## Pillar 4: Size Intelligence (This Is Your Real Product)

This is what brands will actually pay for. Every competitor does try-on visuals. Very few do accurate size recommendation with confidence.

### The Size Matching Algorithm

```
Input: UserBody (measured by SAM 3D Body)
Input: GarmentSpec (measured by your garment pipeline)
Output: FitScore per measurement point + overall recommendation

For each measurement dimension:
  gap = garment_dimension - body_dimension
  
  Adjust for material stretch:
    effective_gap = gap + (garment_dimension * material.stretch)
  
  Classify:
    if effective_gap < -2cm → TOO_TIGHT (garment is too small)
    if effective_gap < 0cm  → SNUG (fitted)
    if effective_gap < 4cm  → REGULAR (standard fit)
    if effective_gap < 8cm  → RELAXED (loose fit)
    if effective_gap > 8cm  → OVERSIZED

Overall recommendation = weighted average across all dimensions
  (chest gets 30% weight, waist 25%, shoulders 20%, length 15%, sleeves 10%)
```

### Brand-Specific Size Charts

Each brand has its own size chart. During onboarding, you import their size chart:

```
Brand "Zara" → Size M Shirt:
  chest: 96-100cm
  waist: 82-86cm
  shoulderWidth: 44-46cm

Brand "H&M" → Size M Shirt:
  chest: 92-96cm
  waist: 78-82cm
  shoulderWidth: 43-45cm
```

Your system maps: "Your body chest = 94cm → In Zara, you're a tight M. In H&M, you're a comfortable M."

### Material-Aware Physics

You mentioned cloth material matters. Absolutely right.

| Material | Stretch Factor | Drape Behavior | Impact on Fit |
|----------|---------------|----------------|---------------|
| 100% Cotton | 2-5% | Stiff, structured | Size is what it is |
| Cotton-Spandex | 10-20% | Fitted, conforms | Can go 1 size smaller |
| Linen | 1-3% | Relaxed, boxy | Needs room, runs tight |
| Silk | 0-2% | Fluid, draping | Size chart is exact |
| Polyester | 3-8% | Smooth, slight stretch | Moderate flexibility |
| Denim | 1-5% (or 15-20% with stretch) | Rigid or flexible | Varies enormously |
| Wool knit | 5-15% | Structured but gives | Moderate flexibility |

When a brand employee uploads a garment, they select the material from a dropdown. Your system uses this to:
1. Adjust the size recommendation (a stretchy shirt in M might fit someone who's normally L)
2. Adjust the visual rendering (the VTON model can be prompted with material hints)
3. Display to the user: "This fabric has 15% stretch — even though it measures M, it will accommodate your L-size chest comfortably"

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT TIER                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │
│  │ Web App  │  │ iOS/     │  │ Kiosk App          │   │
│  │ (Next.js)│  │ Android  │  │ (Electron/Next.js) │   │
│  └────┬─────┘  └────┬─────┘  └────────┬───────────┘   │
│       │              │                 │               │
│       └──────────────┼─────────────────┘               │
│                      │ HTTPS / WebSocket               │
└──────────────────────┼─────────────────────────────────┘
                       │
┌──────────────────────┼─────────────────────────────────┐
│                 API GATEWAY (FastAPI)                    │
│                                                         │
│  /api/body/scan        → Body measurement pipeline      │
│  /api/garment/upload   → Garment digitization pipeline  │
│  /api/tryon/render     → VTON rendering pipeline        │
│  /api/size/recommend   → Size matching engine           │
│  /api/brand/dashboard  → Brand admin panel              │
│                                                         │
└──────────────────────┬─────────────────────────────────┘
                       │
┌──────────────────────┼─────────────────────────────────┐
│              GPU WORKER POOL                            │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────┐             │
│  │ SAM 3D Body     │  │ IDM-VTON /       │             │
│  │ (Body scanning) │  │ CatVTON          │             │
│  │                 │  │ (Try-on render)   │             │
│  └─────────────────┘  └──────────────────┘             │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────┐             │
│  │ Garment         │  │ Style3D / Meshy  │             │
│  │ Segmentation &  │  │ (2D→3D for       │             │
│  │ Keypoint Model  │  │  kiosk assets)   │             │
│  └─────────────────┘  └──────────────────┘             │
│                                                         │
│  Hosted on: RunPod / Modal / AWS g5 instances           │
└─────────────────────────────────────────────────────────┘
                       │
┌──────────────────────┼─────────────────────────────────┐
│                  DATA LAYER                             │
│                                                         │
│  PostgreSQL: Brands, garments, measurements, users      │
│  Redis: Session cache, render queue                     │
│  S3/R2: Garment images, 3D assets, render outputs       │
│  Vector DB: Body shape embeddings (for similar-body     │
│             recommendations)                            │
└─────────────────────────────────────────────────────────┘
```

---

## Deployment: Web vs App vs Kiosk

**Don't choose one. Build all three.** Here's why:

### Web App (Primary — launch first)
- Lowest friction for brands to integrate (embed via iframe or SDK)
- Works on any device
- Brands can put a "Virtual Try-On" button on their product pages
- This is where 80% of your revenue will come from
- **Tech:** Next.js, deployed on Vercel or Cloudflare Pages

### Mobile App (Second — for premium brands)
- Better camera access for body scanning
- Push notifications ("New arrivals from Brand X — try them on!")
- Can use phone LiDAR (iPhone Pro) for precise body measurement
- White-labeled per brand
- **Tech:** React Native (share code with web) or Flutter

### In-Store Kiosk (Premium tier — highest margin)
- This is a hardware + software product
- You sell/lease the kiosk hardware + monthly software subscription
- Brands love this because it's a physical installation in their flagship stores
- Highest price point ($500-2000/month per kiosk + hardware cost)
- **Tech:** Electron app wrapping your Next.js frontend, connected to cloud API
- Real-time preview runs locally, heavy rendering runs on your cloud

---

## Revised Roadmap

### Phase 1 (Month 1-2): Foundation
- [ ] Set up FastAPI backend with GPU workers (RunPod or Modal)
- [ ] Integrate SAM 3D Body for body measurement extraction
- [ ] Build garment upload pipeline (photo → segmentation → keypoints → measurements)
- [ ] Design and order physical calibration boards for brands
- [ ] Build the size matching algorithm

### Phase 2 (Month 3-4): Core Try-On
- [ ] Integrate IDM-VTON or CatVTON for photo-based try-on
- [ ] Build the web frontend (brand catalog + try-on + size recommendation)
- [ ] Build the brand admin dashboard (garment upload, size chart management)
- [ ] API documentation for brand integration

### Phase 3 (Month 5-6): Multi-Tenant SaaS
- [ ] White-labeling system (custom branding, domains, colors per brand)
- [ ] Billing & subscription management (Stripe)
- [ ] Analytics dashboard (try-on count, conversion rate, size distribution)
- [ ] Multi-brand isolation (each brand's data is separate)

### Phase 4 (Month 7-8): Kiosk
- [ ] Prototype kiosk hardware (camera + display + compute)
- [ ] Build real-time mirror overlay (cleaned-up version of your current MediaPipe engine)
- [ ] Kiosk management system (remote update, monitoring, crash reporting)
- [ ] Pilot with 1-2 brands

### Phase 5 (Month 9-12): Scale & Differentiate
- [ ] Mobile app (React Native)
- [ ] Batch processing for brands (upload entire catalog → auto-measure all)
- [ ] "Similar body" recommendations ("People with your body shape loved these items")
- [ ] Material-aware rendering improvements
- [ ] International sizing translation

---

## What You Keep From Current Codebase

| Component | Keep? | Why |
|-----------|-------|-----|
| Next.js shell | YES | Good framework choice, keep it |
| Page routing & UI | YES | Redesign but keep the structure |
| Zustand store | YES | Still useful for client state |
| MediaPipe integration | PARTIALLY | Only for kiosk real-time preview |
| BodyIntelligence.ts (Kalman filter) | YES | Still useful for smoothing kiosk preview |
| PoseDetector.ts | YES | Keep for kiosk, upgrade to Full model |
| Scene3D.tsx | REWRITE | Simplify for kiosk preview only |
| AutoRigger.ts | DELETE | Replace with Mixamo pre-rigging |
| PhysicsEngine.ts (Ammo.js) | DELETE | Not needed |
| MeshWarper.ts | DELETE | Not needed |
| WebGLMeshLayer.ts | DELETE | Not needed |
| GarmentLoader.ts | REWRITE | New server-side pipeline |
| GarmentAnalyzer.ts | REWRITE | Replace with ML-based keypoint detection |
| BackgroundRemover.ts | KEEP | Useful for garment image preprocessing |
| OcclusionMask.ts | DELETE | Not needed |
| All validator files | DELETE | Build new server-side test suite |

---

## Your Competitive Moat

What will make AI-Kart win against Kivisense, Perfect Corp, and Fashn:

1. **Size-confidence score** — nobody else gives a quantified "93% fit confidence" with per-measurement breakdown. This is what brands care about because it directly reduces returns.

2. **The calibration board** — a physical product that standardizes garment photography across all brand locations. This creates lock-in (the board has your branding, your app, your workflow).

3. **Material-aware sizing** — you adjust recommendations based on fabric stretch, which competitors treat as a black box.

4. **Kiosk hardware** — a physical presence in flagship stores that no pure-software competitor can match. This is the premium tier that justifies enterprise pricing.

5. **Cross-brand sizing** — "You're a Zara M, an H&M L, and a Uniqlo M." Nobody does this well because it requires standardized garment measurements, which your calibration board solves.

---

## Final Architecture Decision

You asked whether to change everything. Here is the honest answer:

**Your current 7,600-line TypeScript AR engine is a prototype.** It taught you the domain. It proved you can track a body and overlay a 3D model. That knowledge is invaluable. But the codebase itself is not the foundation of a B2B SaaS product.

The new architecture is:
- **Python backend** (FastAPI + ML models) — this is 70% of the product
- **Next.js frontend** (keep, redesign) — this is 20% of the product
- **Hardware kiosk** (Electron + camera) — this is 10% but commands 40% of the price

Build the Python backend first. The web frontend second. The kiosk third.

Your dream is not just achievable — it's timely. The market is ready, the models exist, and the B2B pricing makes the unit economics work. Now go execute.
