# AI-Kart: CTO Architecture Assessment & Strategic Roadmap

**Assessment Date:** March 1, 2026  
**Scope:** Full codebase review of `aikart-app/src` (7,674 LOC across 22 files)  
**Goal:** Achieve Lenskart-level accuracy for virtual clothing try-on with size-confidence

---

## Part 1: Honest Assessment of Where You Are

### What You Have Built

You have a working **proof-of-concept** AR overlay system. The pipeline is real:

- MediaPipe Pose Landmarker detects 33 body landmarks at 30fps
- A Kalman-filtered BodyIntelligence layer smooths the jittery data
- A Zustand store bridges the vanilla JS engine to React Three Fiber
- An AutoRigger procedurally generates skeleton bones for arbitrary GLB models
- Scene3D maps 2D pose data into 3D space with yaw deprojection

This is genuinely impressive scaffolding. Most people never get this far.

### What Is Fundamentally Broken

I need to be direct with you. **The gap between where you are and where you want to be is not a code-fix gap. It is an architecture gap.** Here are the core problems:

**Problem 1: You have zero body measurement capability.**  
Your system tracks *pose* (where joints are) but never measures *body* (how wide the chest is, how long the torso is, what the waist circumference is). Lenskart measures the exact distance between your pupils in millimeters. You don't measure anything. You just overlay a 3D model and scale it by shoulder pixel distance — which changes when you step forward or back.

**Problem 2: You have no real garments.**  
You're using `free_lowpoly_jacket.glb` — a gaming asset with ~500 polygons, no physical material properties, no size metadata, no seam lines. Real garment try-on requires garments modeled with actual measurements (chest width = 42cm, sleeve length = 64cm). Your garment has no concept of "size."

**Problem 3: The 2D-to-3D bridge is a hack, not a system.**  
Your `Scene3D.tsx` converts canvas pixel positions to NDC coordinates to Three.js world space. This works visually but has no metric grounding. You cannot answer: "Is this garment 2 inches too wide for this person?" because neither the person nor the garment has real-world dimensions.

**Problem 4: No cloth physics is actually running.**  
`PhysicsEngine.ts` exists with Ammo.js (Bullet physics) integration, but it's completely disconnected. Your garments are rigid 3D models that rotate and scale — they don't *drape*, *fold*, or *deform* like fabric. A loose t-shirt and a tight t-shirt look identical on the user.

**Problem 5: The AutoRigger is too naive for production.**  
It places bones based on bounding box proportions (shoulder at 18% width, elbow at 35% width). This means a poncho and a fitted shirt get the same bone placement. The 2-bone-per-sleeve approach cannot express wrist rotation, forearm twist, or shoulder shrug.

**Problem 6: Single low-res camera, Lite model.**  
You're using `pose_landmarker_lite` at 640×480. The Lite model has ±3-5cm landmark error. For size-confidence try-on, you need sub-centimeter accuracy. You also have no depth sensor, which makes body measurement from a single RGB image an under-constrained problem.

---

## Part 2: What The Competition Actually Does

### Lenskart (Glasses)
- Uses **face mesh** (468 landmarks) not just pose (33 landmarks)
- Measures **pupillary distance** to 0.5mm accuracy using the phone screen width as a reference ruler
- 3D glasses models have exact dimensions in millimeters
- Runs at 60fps because glasses have zero physics/deformation

### Kivisense / Zara AR / Amazon Virtual Try-On (Clothes)
- Use **server-side ML models** (not client-side MediaPipe)
- Body shape is estimated using **anthropometric regression** from a calibration photo (front + side pose)
- Garments are **parametric 3D models** — same garment, different sizes generated procedurally
- Use **neural cloth simulation** (learned physics, not Bullet/Ammo)
- Many use a **2D image-to-image approach** (GAN/diffusion) rather than 3D at all

### Key Insight
The industry has largely **abandoned the real-time 3D overlay approach** for clothing. The physics is too expensive, the accuracy is too low, and users don't need to see it move in real time. Instead, they take a photo → estimate body → render a photorealistic still image of the garment on that body. This is the path you should seriously consider.

---

## Part 3: The Two Paths Forward

You have two fundamentally different directions. Read both before deciding.

---

### Path A: "Polished Real-Time 3D" (Evolutionary)
**Timeline:** 3-6 months | **Accuracy ceiling:** ~70-80% size confidence

This path keeps your current architecture and fixes it properly. You won't reach Lenskart-level precision but you'll have a good demo.

**A1. Body Measurement System (you don't have this at all)**

Build a **calibration flow** before try-on begins:

1. Ask the user to stand at a specific distance (use a reference object — like holding a credit card — to establish metric scale)
2. Switch to `pose_landmarker_full` or `pose_landmarker_heavy` model (not Lite)
3. Capture a **T-pose** frame (arms out) and a **side-view** frame
4. From the T-pose: measure shoulder width, torso width, hip width, arm length, torso height — all in the calibrated metric units
5. Store these as a `UserBodyProfile` with real centimeter values

This one feature alone will 10x your project because suddenly the garment and the body share a measurement language.

**A2. Garment Digitization Pipeline (admin side)**

Every garment in your system needs to be a structured data object:

```
GarmentSpec {
  id: string
  sizeLabel: "S" | "M" | "L" | "XL" | ...
  measurements: {
    chestWidth: 52cm
    shoulderWidth: 46cm
    sleeveLength: 62cm
    garmentLength: 72cm
    waistWidth: 48cm
  }
  model3D: URL to properly rigged GLB
  material: { thickness, drape, stretch }
}
```

Without this, you can never answer "is this too big?" The admin upload flow should include a measurement entry form, not just a file upload.

**A3. Proper Skeletal Rigging**

Replace AutoRigger's bounding-box approach with a real rigging pipeline:

- Use Mixamo auto-rigger (free, works on any humanoid mesh) during the garment upload process
- Pre-rig every garment with a standardized skeleton (Mixamo's 65-bone humanoid)
- At runtime, you just map MediaPipe landmarks to the pre-rigged skeleton — no procedural generation needed
- This gives you proper shoulder rotation, elbow bend, wrist twist, and spine deformation

**A4. Upgrade Three.js Rendering**

- Add basic cloth simulation using Three.js `ClothSimulation` or a vertex shader that simulates fabric drape
- Implement **shadow mapping** so the garment casts a shadow on the user's body (huge for realism)
- Add **ambient occlusion** where the garment meets the body
- Use the `Environment` probe you already have to match garment lighting to room lighting

**A5. Size Comparison UI**

Once you have body measurements and garment measurements, build the comparison layer:

- Show a visual indicator: "This garment's shoulder width (46cm) is 4cm wider than yours (42cm) — it will sit slightly loose"
- Color-coded fit map on the garment (green = perfect fit, yellow = slightly loose, red = too tight)
- "Your size recommendation: M" based on the measurement comparison

---

### Path B: "AI Image-Based Try-On" (Revolutionary)
**Timeline:** 2-4 months to MVP | **Accuracy ceiling:** ~90-95% visual confidence

This path throws away most of your current 3D pipeline and replaces it with a machine learning approach that the entire industry is converging on.

**How it works:**

1. User takes a full-body photo (or you capture one frame from the webcam)
2. A body estimation model extracts body measurements from the photo (SMPL/SMPL-X body model)
3. A garment transfer model composites the garment onto the person's body photo
4. The output is a photorealistic still image of the person wearing the garment

**Why this is better:**

- No real-time 3D rendering needed (eliminates all the jitter, scaling, and rigging problems)
- Photorealistic results (the garment looks like a real photograph, not a 3D overlay)
- Established open-source models exist: IDM-VTON, StableVITON, OOTDiffusion, CatVTON
- Body measurement from single image is a solved problem (using SMPL body models like SHAPY, PIXIE, or PyMAF-X)
- Works on any device (processing happens server-side, result is just an image)

**What you'd build:**

1. **Frontend (keep Next.js):** Photo capture UI → upload → show result
2. **Backend (new, Python):** FastAPI service running the ML models
3. **Body estimation:** SHAPY or PyMAF-X → extracts height, weight, body shape parameters
4. **Virtual try-on:** IDM-VTON or CatVTON → renders the garment on the person
5. **Size recommendation:** Compare estimated body to garment spec → recommend size

**What you'd keep from current code:**
- The Next.js app shell, routing, UI design
- The garment gallery / upload system
- The `GarmentConfig.ts` measurement structure (expanded)
- The overall product concept and flow

**What you'd discard:**
- The entire `ar-engine/` folder (Engine, BodyIntelligence, PoseDetector, MeshWarper, etc.)
- Scene3D, AutoRigger
- The real-time camera loop
- PhysicsEngine, OcclusionMask

**The tradeoff:** You lose real-time interactivity (no live mirror effect). But you gain accuracy, realism, and the ability to show size-confidence. You can add a simple pose-guided live preview using just MediaPipe + a 2D image warp as a "preview" while the full render processes server-side.

---

## Part 4: My Recommendation

**Go with Path B, but keep a simplified version of Path A as a live preview.**

Here's the hybrid approach:

1. **Live camera view** (keep your MediaPipe + a very simple 2D garment overlay — not the 3D rig, just a flat image positioned at shoulders). This gives the user the "magic mirror" feeling instantly.

2. **"See accurate fit" button** triggers the server-side ML pipeline. Takes 3-5 seconds. Shows a photorealistic render with size annotations.

3. **Body calibration** happens once. User takes a front photo + enters their height. The SMPL model estimates all other measurements. These are stored in their profile.

4. **Admin garment pipeline** stays web-based but now includes structured size measurements, not just 3D model upload.

This hybrid gives you both the emotional "wow" of a live mirror AND the accuracy of ML-based rendering.

---

## Part 5: Immediate Action Items (Priority Order)

### Week 1-2: Decision & Research
- [ ] Run IDM-VTON or CatVTON on your own photo with a garment image. See the quality yourself.
- [ ] Run SHAPY or PyMAF-X on a full-body photo. See what body measurements it extracts.
- [ ] Decide: Path A, Path B, or Hybrid.

### Week 3-4: Backend Foundation
- [ ] Set up a Python FastAPI server with GPU support (use RunPod, Modal, or Replicate for GPU hosting)
- [ ] Integrate your chosen VTON model as an API endpoint
- [ ] Integrate body estimation model

### Week 5-8: Product Integration
- [ ] Build the calibration flow (photo capture + height input)
- [ ] Build the garment spec system (measurements + images)
- [ ] Connect frontend to backend API
- [ ] Build the size recommendation engine (simple: compare body measurements to garment measurements)

### Week 9-12: Polish
- [ ] Add the live preview overlay (simplified 2D from your current engine)
- [ ] Build the fit visualization (color-coded areas)
- [ ] Optimize server response time (model quantization, caching)
- [ ] Mobile responsiveness

---

## Part 6: Technology Stack Recommendation

| Layer | Current | Recommended |
|-------|---------|-------------|
| Frontend | Next.js 16 + React 19 | **Keep** — it's modern and fine |
| Pose Detection | MediaPipe Lite (client) | MediaPipe Full (client) for preview only |
| Body Estimation | None | **SHAPY or PyMAF-X** (server, Python) |
| Virtual Try-On | Custom 3D rig (Three.js) | **IDM-VTON or CatVTON** (server, Python) |
| 3D Rendering | React Three Fiber | **Remove** for production; keep for live preview only |
| Physics | Ammo.js (unused) | **Remove** — ML handles draping |
| State Management | Zustand | **Keep** |
| Backend | None | **FastAPI (Python)** with GPU workers |
| GPU Hosting | N/A | RunPod / Modal / Replicate |
| Database | None | Supabase or Firebase (user profiles, garment catalog) |

---

## Part 7: What NOT To Do

1. **Don't keep tuning the AutoRigger.** Procedural rigging from bounding boxes will never be accurate enough. It's a dead end.

2. **Don't integrate Ammo.js cloth physics.** Client-side physics simulation for fabric is too expensive and too unrealistic. Even AAA games struggle with this.

3. **Don't try to extract body measurements from MediaPipe Pose alone.** It gives you joint positions, not body surface geometry. You cannot measure chest circumference from 33 skeleton dots.

4. **Don't build everything client-side.** The accuracy you want requires ML models that need GPUs. Move heavy computation to a server.

5. **Don't use free low-poly models as garments.** Every garment needs proper measurements and ideally a proper flat-lay photograph (front view on white background).

---

## Final Thought

Your dream is valid and achievable. The technology exists today. But the path to get there is not "fix the Three.js pipeline" — it's "build a proper ML-powered backend and use the webcam as an input device, not a render target."

The best virtual try-on systems in the world don't render 3D models in real time. They use AI to generate a photorealistic image of you wearing the garment. That's the target. Your current frontend skills + a Python ML backend = the product you're envisioning.

You've already proven you can build complex systems. Now channel that energy into the right architecture.
