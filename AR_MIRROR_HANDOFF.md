# AI-Kart — Live AR Mirror Session

## Project
AI-Kart — B2B luxury fashion SaaS by Luminary AI.
Target clients: LVMH, Prada, Kering tier brands.

## What We Want To Build
Real-time live AR garment mirror.
User stands in front of camera.
Selected garment appears on their body.
Moves with them like a real mirror.

## Existing Foundation (Already Built)
- MediaPipe body tracking in ar-engine/
- 33 body landmarks tracked in real-time
- Three.js canvas setup
- SpatialScanner.tsx with camera access
- Full luxury Next.js frontend running
- Backend on port 8001 (FastAPI)

## Key Landmarks
11 = left shoulder
12 = right shoulder  
23 = left hip
24 = right hip
0  = nose (NEVER cover face)

## File Locations
- Frontend: aikart-app/src/
- AR Engine: aikart-app/src/ar-engine/
- Try-On Page: aikart-app/src/app/try-on/page.tsx
- Scanner: aikart-app/src/components/ui/SpatialScanner.tsx

## Tech Stack
Next.js 16, React 19, TypeScript strict,
Tailwind v4, Framer Motion, Three.js,
MediaPipe Holistic/Pose

## Quality Standard
When person stands in front of camera
and selects a Prada jacket —
that jacket appears on their body,
moves with them, tilts with their body angle.
with realistic level physics that a LVMH executive smiles.
That is the only standard that matters.

## What NOT To Do
- Do not build SDXL photo render (already done)
- Do not mock anything
- Do not use any types in TypeScript
- Do not break existing working pages
