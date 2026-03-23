# AI-Kart Maison Luxe: Core Architecture 

AI-Kart is a highly sophisticated, enterprise-grade virtual try-on and spatial size intelligence platform.

## System Topology

### 1. Frontend (Next.js + Three.js + Framer Motion)
The UI provides an unparalleled luxury experience:
- **Spatial AR Engine (`src/ar-engine`)**: Custom Typescript loop targeting 60fps for real-time video overlay.
- **Three.js Pipeline**: Loads `.glb`/`.gltf` 3D digital twins via `GarmentLoader.ts` and composites them over the 2D canvas dynamically.
- **Body Intelligence Module**: Computes keypoint angles (shoulders, collar, waist) to manipulate inverse-kinematics for digital garments. 
- **Glassmorphism UI**: Uses Tailwind and Framer Motion for B2B dashboards, statistics, and AR controls.

### 2. API Gateway & Microservices (Python + FastAPI)
Backend enforces multi-tenant security and handles intense ML workloads:
- **Authentication**: JWT & API Key multi-tenancy (`auth.py`). Checks brand capabilities per endpoint.
- **Rate-Limiting**: Global sliding-window rate locking via Redis.
- **Payload Checks**: Middleware rejects excessive payloads (>10MB) immediately.
- **Size Engine (`size_engine.py`)**: Proprietary mathematical logic comparing ISO-standard body extraction against garment specifications with material stretch limits (e.g., elastane allowances).

### 3. Asynchronous GPU Job Queue (RQ + Redis + Alembic)
Because IDM-VTON and SAM3D require 5-15s per frame generation, requests cannot block HTTP.
- **RQ (Redis Queue)**: Defers High/Low priority ML Generation jobs to scalable workers.
- **Replicate Integration (`worker.py`)**: `yisol/idm-vton` invoked for realistic diffusion-based try-on.
- **Alembic/AsyncPG**: Production readiness with PostgreSQL persistence for analytics, catalogs, and size charts.

## Deployment Strategy
- **Static Frontend**: Vercel/Netlify optimized.
- **Backend API**: Stateless container orchestrators (e.g., Google Cloud Run, AWS ECS).
- **Database**: PostgreSQL (e.g., Supabase, Neon) + managed Redis (Upstash/ElastiCache).
