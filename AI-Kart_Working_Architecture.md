# AI-Kart AR Tracking Engine Breakdown

This document serves as a comprehensive guide to understanding the underlying mathematics and data flow of the AI-Kart AR Garment Engine. It breaks down the system from the moment the camera captures a frame to the final 3D garment rendering on the screen.

Our system consists of three massive architectural pillars:
1. **MediaPipe (The Eyes)** - Watches the user and generates 2D/3D raw coordinates.
2. **BodyIntelligence (The Brain)** - Filters noisy data and mathematically deduces posture (turning, tilting).
3. **Three.js (The Muscle)** - Converts the Brain's physics into fluid 3D graphics on your screen.

---

## Pillar 1: The Core Pipeline

The application begins in [Engine.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/Engine.ts). This file orchestrates the entire continuous loop.

1. **Camera Feed:** [Engine.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/Engine.ts) grabs the 2D video feed from your webcam.
2. **MediaPipe Analysis:** It passes the video into Google's raw AI model ([PoseDetector.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/PoseDetector.ts)), which returns 33 "Landmarks" representing joints on your body (Shoulders, Hips, Nose).
3. **The Smoothing:** Raw AI is extremely jerky. [Engine.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/Engine.ts) immediately feeds these landmarks into our custom Kalmin Filter ([BodyIntelligence.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/BodyIntelligence.ts)) which smooths out the jitter into buttery-smooth frame data.
4. **The Hand-Off:** Every frame, [Engine.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/Engine.ts) packages this smoothed data into a payload and sends it straight into [PoseStore.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/store/PoseStore.ts) (a global memory vault).

---

## Pillar 2: The Logic Engine ([BodyIntelligence.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/BodyIntelligence.ts))

This is the most mathematically intense file in the project. It doesn't draw anything; instead, it uses geometry to analyze *what your body is doing* based on the raw Landmark dots.

### 1. The Collar Alignment (Why the shirt doesn't slide down)
MediaPipe only tells us where your "Shoulder Joints" are. But clothes don't sit on joints, they lock onto the *base of your neck*. 
The [CollarAlignment](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/BodyIntelligence.ts#250-305) class mathematically estimates where your neck is by measuring the distance between your Shoulders, Ears, and Nose, dynamically pinning a "Virtual Anchor Point" exactly at your collarbone.

### 2. The Spacial Scale Lock (Why turning doesn't shrink you)
MediaPipe struggles heavily when you turn 90-degrees (because one arm hides behind the other). 
When you turn left or right, the 2D pixel distance between your shoulders mathematically shrinks toward zero. If we scale the shirt off of this, the shirt vanishes! 
We fix this in [Scene3D](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/components/ar/Scene3D.tsx#258-283) by calculating a geometric un-shrinking algorithm ("Yaw Deprojection"), which acts as a "memory bank" for your true size whenever your turn radius exceeds 50-degrees.

---

## Pillar 3: The 3D Render ([Scene3D.tsx](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/components/ar/Scene3D.tsx))

This React component acts as the 3D studio. It runs a `useFrame` loop (60 times a second) that constantly reads the latest data from `PoseStore` and repositions the 3D [.glb](file:///F:/Parshwa/AI%20-%20Kart/aikart-app/public/garments/3D%20asset/free_lowpoly_jacket.glb) model to match.

### Rotation Math: The 360-Degree Euler Matrix
To allow you to turn completely around without the model snapping backward, we must map 2D video data to a 3D physical world using an **Euler Matrix**.

```typescript
// Found inside Engine.ts
const dx = RightShoulder.x - LeftShoulder.x;
const dz = RightShoulder.z - LeftShoulder.z;
const rawYawAngle = Math.atan2(dz, dx);
```
**How it Works:**
1. `dx` represents how far left/right your shoulders are on the 2D screen.
2. `dz` represents which shoulder is *closer* to the webcam (MediaPipe Z-Depth).
3. `Math.atan2` takes these two numbers and creates a perfect mathematical arc (Radians). 

This arc seamlessly wraps around in a perfect circle, meaning the Three.js garment naturally spins around with your body without any manual "flip" booleans.

### Skeletal Auto-Rigging (The Sleeves)
Instead of forcing 3D artists to create complex rigged skeletons for every jacket, our system procedurally generates bones on the fly via [AutoRigger.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/components/ar/AutoRigger.ts). 

Inside [Scene3D.tsx](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/components/ar/Scene3D.tsx), we calculate the angle between your Shoulder and your Elbow:
```typescript
const lDx = state.leftElbow.x - state.leftShoulder.x;
const lDy = state.leftElbow.y - state.leftShoulder.y;
const lAngle = -Math.atan2(lDy, lDx);
```
We then directly inject this exact angle into the procedurally generated invisible "Bones" inside the garment's mesh, allowing the sleeves to biologically copy your arm movements.

---

## How to Modify the Engine in the Future

*   **To change how the Garment Bounces/Smooths**: Open [Scene3D.tsx](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/components/ar/Scene3D.tsx) and find the `THREE.MathUtils.lerp(... , 0.45)` functions. Lowering the number (e.g., `0.1`) makes it floaty and lagged. Raising it (`0.9`) makes it snap instantly but look robotic.
*   **To change where the Collar sits:** Open [Scene3D.tsx](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/components/ar/Scene3D.tsx) and adjust `const collarOffsetScaled = (scene.userData.collarLocalY || 0.4)`. Changing `0.4` up or down physically moves the anchor point on the chest.
*   **To fix any Left/Right Glitches:** Investigate [Engine.ts](file:///f:/Parshwa/AI%20-%20Kart/aikart-app/src/ar-engine/Engine.ts) inside the `Math.atan2(dz, dx)` payload. The math here is absolute ground-stage for all spatial rotations.
