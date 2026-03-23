# AI-Kart API Reference

## Base URL
All API requests should be prefixed by `/api/v1`

## Authentication
AI-Kart supports B2B multi-tenant authentication via API Keys exchange or direct JWT tokens.
To exchange an API Key for a short-lived token:
**`POST /auth/token`**
- **Body**: `{ "apiKey": "string", "brandId": "string" }`
- **Response**: `{ "access_token": "string", "plan": "enterprise|standard|trial", "capabilities": {...} }`

Include the token in all subsequent requests: `Authorization: Bearer <token>`

---

## Endpoints

### 1. `GET /health` (or `/`)
System infrastructure health check.
- **Response**: 
  - `status` (str)
  - `redis` (Object) Queue and worker status
  - `sla` (Object) Expected processing latencies
  - `mockMode` (bool) True if Replicate API is disabled for local dev

### 2. `POST /tryon/render`
Enqueues a Virtual Try-On generation job.
- **Payload**:
  - `userPhoto` (str): Base64-encoded image
  - `garmentId` (str): Catalog item string
  - `includeRecommendation` (bool): If True, run size inference automatically
- **Response**: Returns `jobId` and `status` (typically "QUEUED"). Wait for Webhook or poll `/tryon/status`.

### 3. `GET /tryon/status/{job_id}`
Poll the current state of a Generation Job.
- **Response**:
  - `status`: One of `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`
  - `progressPct`: 0-100 integer
  - `imageUrl`: Presigned CDN link to the final try-on output
  - `recommendation`: Fits intelligence dict (if requested)

### 4. `POST /body/scan`
Extracts precision body measurements using SAM3D (or fallback height estimations).
- **Payload**:
  - `photo` (str): Base64 image
  - `heightCm` (float): Crucial base anchor
  - `weightKg` (float): Optional BMI-awareness anchor
- **Response**: Dictionary of 9 standard body measurements (chest, waist, inseam, etc.) with confidence scores.

## Error Handling
The API returns structured error codes:
- `VALIDATION_ERROR` (400, 422)
- `AUTH_FAILED` (401)
- `RATE_LIMIT_EXCEEDED` (429)
- `PLAN_UPGRADE_REQUIRED` (403)
- `JOB_NOT_FOUND` (404)
- `GPU_TIMEOUT` (504)
- `INTERNAL_ERROR` (500)
