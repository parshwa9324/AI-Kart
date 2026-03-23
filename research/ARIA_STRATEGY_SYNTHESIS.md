# AI-Kart — ARIA Strategic Synthesis

## Consolidated from Two Independent Expert Analyses

> Two independent ARIA instances analyzed the complete AI-Kart codebase (21 files, ~5,700 lines) and provided strategic guidance. This document merges their insights, highlights consensus (high-confidence signals), and flags decision points where they diverge.

---

## 1. CONSENSUS VERDICT

Both ARIAs independently arrived at the same core conclusion:

> **"The engine is production-grade. The product is not yet a product."**

| Dimension         | Bot 1 | Bot 2 | Consensus                            |
| ----------------- | ----- | ----- | ------------------------------------ |
| Render Engine     | 9/10  | 9/10  | ✅ Elite                             |
| Math / Validation | 10/10 | 9/10  | ✅ Best-in-class                     |
| Code Quality      | 8/10  | 7/10  | ✅ Strong, needs decomposition       |
| SaaS Readiness    | 0/10  | 1/10  | ✅ Non-existent                      |
| Auth/Security     | 1/10  | 2/10  | ✅ Must build from scratch           |
| Deployment        | 4/10  | 2/10  | ✅ No CDN, versioning, or pipeline   |
| Testability       | —     | 4/10  | ⚠️ Synthetic tests exist, no unit/CI |

**Key insight both independently identified:** Client-side compute = zero GPU server costs at scale. This is our **business moat** — infrastructure cost scales with revenue, not users.

---

## 2. UNIFIED TECH STACK (Both Agree)

Both ARIAs converge on nearly identical recommendations:

```
┌───────────────────────────────────────────────────┐
│               SAAS LAYER STACK                    │
├─────────────────┬─────────────────────────────────┤
│ Auth            │ Clerk                            │
│ Database        │ Neon (serverless Postgres)        │
│ API Server      │ Hono.js on Cloudflare Workers     │
│ Storage         │ Cloudflare R2 (zero egress fees)  │
│ CDN             │ Cloudflare CDN                    │
│ Billing         │ Stripe + Stripe Metering          │
│ Analytics       │ PostHog Cloud (GDPR-safe)         │
│ Error Monitor   │ Sentry                            │
│ Email           │ Resend                            │
│ Logging         │ Axiom                             │
│ Dashboard FE    │ Next.js 15 + shadcn/ui            │
│ Compliance      │ Vanta (when needed)               │
│ Bundler         │ esbuild                           │
└─────────────────┴─────────────────────────────────┘

Engine: NO CHANGES. WebGL 2.0 + MediaPipe stays as-is.
```

> [!IMPORTANT]
> **Why Cloudflare Workers over Express/VM:** Our API is thin (~10 endpoints — session start/end, garment upload, analytics). Workers run at the edge with zero cold starts, sub-1ms global latency, and native R2/KV bindings. Dramatically simpler than a VM for this surface area.

> [!IMPORTANT]
> **Why Clerk over Auth0:** Cheaper, better DX at early stage. Built-in Organization model maps directly to our retailer tenants. API key management out of the box.

---

## 3. MISSING INFRASTRUCTURE — PRIORITY RANKED

### 🔴 P0 — BLOCKS REVENUE

#### Authentication & API Keys

```
AIKartSDK.init({ apiKey: 'ak_live_xxx', garmentImage: '...' })
  → POST /v1/sessions/start { apiKey, domain, garmentId }
  → returns sessionToken (short-lived JWT, 1hr)
```

- **Buy** Clerk for dashboard auth
- **Build** API key system (50 lines of Postgres + JWT)
- Domain whitelisting: keys only work on pre-approved retailer domains

#### Multi-Tenancy Data Model

```sql
tenants   (id, slug, api_key_hash, plan_tier, garment_quota, session_quota)
garments  (id, tenant_id, url, cdn_key, analysis_json, created_at)
sessions  (id, tenant_id, garment_id, started_at, ended_at, device_info)
```

All data FK-scoped to `tenant_id`. Zero cross-tenant data leakage.

#### Billing

- **Stripe + Stripe Metering** — non-negotiable
- Launch pricing: **$99/mo flat** + **$0.003/session** overage (simplest to explain)
- Meter via `session_end` event POST from SDK `dispose()`

### 🟡 P1 — BLOCKS SCALE

#### Garment Asset Pipeline

```
Retailer uploads → /upload endpoint
  → Cloudflare R2 raw storage
  → Worker runs GarmentPreprocessor + GarmentAnalyzer
  → Outputs: processed PNG + analysis.json
  → CDN-fronted signed URL returned
```

- **Cloudflare R2** (zero egress) over S3+CloudFront (10× cheaper)
- **Signed URLs** with 1hr expiry for garment IP protection

#### Analytics & Conversion Tracking

PostHog events from SDK:

```typescript
posthog.capture("ar_session_start", {
  tenantId,
  garmentId,
  device,
  fps_target,
});
posthog.capture("ar_session_end", { duration_ms, avg_fps, pose_loss_frames });
posthog.capture("garment_changed", { from_garment_id, to_garment_id });
posthog.capture("conversion_intent", { trigger: "add_to_cart_click" });
```

> [!TIP]
> **Conversion tracking is our B2B killer feature.** Retailers care about "sessions that ended with add-to-cart" more than FPS numbers.

### 🟢 P2 — BLOCKS ENTERPRISE

- Rate limiting via Cloudflare Workers + KV store
- Sentry for SDK-side JS error monitoring ($26/mo)
- Structured error taxonomy with `onError` callback to retailers
- Axiom for serverside logging ($25/mo)

---

## 4. WIDGET DEPLOYMENT ARCHITECTURE

### Bundle Strategy

```
aikart.min.js          ~120KB gzipped   (engine + SDK)
pose_landmarker.task   ~6MB             (lazy, cached aggressively)
MediaPipe JS runtime   ~180KB gzipped   (lazy)
Garment PNG            ~200-500KB       (per garment, cached)
──────────────────────────────────────────────────────
Cold start payload     ~300KB           (first meaningful render)
Warm start payload     ~120KB           (returning user, WASM cached)
```

### CDN URL Versioning

```
/sdk/v1/aikart.min.js           ← recommended (major pin)
/sdk/v1.2/aikart.min.js         ← cautious retailers
/sdk/v1.2.3/aikart.min.js       ← enterprise (exact pin)
```

**Never** use `latest` in retailer-facing URLs.

### Iframe vs. Direct Embed

|                    | Direct `<script>`    | `<iframe>`                  |
| ------------------ | -------------------- | --------------------------- |
| Camera access      | ✅ Native            | ✅ With `allow="camera"`    |
| Performance        | ✅ Faster            | ⚠️ Marginal overhead        |
| CSP isolation      | ❌ Inherits host CSP | ✅ Fully isolated           |
| Add-to-cart events | ✅ Direct DOM        | ❌ PostMessage bridge       |
| **Recommendation** | **Default**          | **Enterprise CSP fallback** |

### Required CSP for Direct Embed

```
script-src 'self' https://cdn.aikart.com;
worker-src blob: https://cdn.aikart.com;
connect-src 'self' https://api.aikart.com https://cdn.aikart.com;
wasm-unsafe-eval;  ← MediaPipe requires this
```

> [!WARNING]
> `wasm-unsafe-eval` **will block** enterprise retailers with locked CSPs. The iframe fallback is mandatory for this segment.

### Lazy Loading Pattern

```typescript
// SDK loads instantly (0KB AR cost)
// Engine + MediaPipe loaded only on user "Try On" click
placeholder.onActivate(async () => {
  const { Engine } = await import("./engine-bundle.js");
  await loadMediaPipeWASM(); // from our CDN
  const engine = new Engine(config);
  await engine.init();
  engine.start();
});
```

Target: **< 3 seconds** cold start to first frame on broadband.

---

## 5. PHASED ROADMAP

### Phase 1: Technical Demo — 3-4 weeks

| Task                                         | Effort | Priority |
| -------------------------------------------- | ------ | -------- |
| Demo page at `demo.aikart.com`               | 1 week | P0       |
| Pre-permission camera UX                     | 3 days | P0       |
| Loading spinner during `PoseDetector.init()` | 2 days | P0       |
| Garment switcher (3 demo garments)           | 3 days | P1       |
| "Powered by AI-Kart" watermark               | 1 day  | P1       |
| Screen-capture demo video at 30fps           | 1 day  | P1       |

**Go/No-Go:** 28+ FPS on M1 MacBook Air, sub-3s cold start, 3 garment types.

> [!CAUTION]
> **Risk:** MediaPipe model download latency on investor WiFi. **Pre-warm the WASM cache before demo meetings.**

---

### Phase 2: MVP — 2-3 months

| Task                                                  | Effort  |
| ----------------------------------------------------- | ------- |
| Clerk org + API key generation                        | 2 weeks |
| Garment upload → R2 → CDN URL                         | 1 week  |
| Session metering (start/end → Postgres)               | 1 week  |
| Stripe flat-fee billing ($99/mo)                      | 1 week  |
| Retailer dashboard (catalog, sessions, embed snippet) | 3 weeks |
| CDN versioned SDK deploy (`@1`)                       | 3 days  |
| PostHog analytics + conversion events                 | 1 week  |
| Sentry error tracking                                 | 2 days  |

**Skip for MVP:** Multi-region CDN, advanced analytics, SLA, SOC 2, iframe variant, WebGPU, mobile optimization.

**Go/No-Go:** First retailer paying, embed working on their live site, self-serve garment upload.

---

### Phase 3: Production SaaS — 6-9 months

- Full multi-tenant isolation with org-level rate limits
- Usage-based billing with Stripe Metering
- White-label embed (retailer's own CORS domain)
- Analytics dashboard with conversion attribution
- Shopify / WooCommerce plugin wrappers
- iOS Safari WebGL2 mobile testing (2 weeks dedicated)
- SLA 99.9% uptime (Cloudflare handles this)
- SOC 2 Type I prep via Vanta (when enterprise deals require)
- WebGPU migration begins (parallel `IMeshLayer` implementation)

---

## 6. SCALING ANALYSIS

| Bottleneck                        | Severity   | Mitigation                                                |
| --------------------------------- | ---------- | --------------------------------------------------------- |
| MediaPipe WASM cold start (6MB)   | 🔴 4/5     | Service Worker pre-cache; lite model (3MB) for mobile     |
| iOS Safari WebGL2 quirks          | 🔴 4/5     | 2-week QA pass; fallback to `MeshWarper.ts` CPU path      |
| Retailer CSP blocks WASM          | 🟡 3/5     | iframe embed fallback + clear CSP docs                    |
| Garment image processing at scale | 🟡 3/5     | Server-side Worker preprocessing; cache `analysis.json`   |
| Network: first garment load       | 🟡 3/5     | Cloudflare Images auto-optimization + progressive loading |
| **Concurrent sessions**           | 🟢 **1/5** | **Client-side = unlimited. This is our moat.**            |
| Garment catalog at 10k+           | 🟢 2/5     | Lazy pagination; CDN-cached analysis JSON per garment     |

---

## 7. BUILD vs BUY MATRIX

| Capability       | Decision  | Service            | Cost @ 100/1k/10k Retailers |
| ---------------- | --------- | ------------------ | --------------------------- |
| Auth/Identity    | **Buy**   | Clerk              | $25 / $99 / $350 /mo        |
| Billing          | **Buy**   | Stripe             | 2.9% + 30¢/txn              |
| CDN + Storage    | **Buy**   | Cloudflare R2      | $5 / $40 / $400 /mo         |
| Analytics        | **Buy**   | PostHog            | Free / $0 / $450 /mo        |
| Error Monitoring | **Buy**   | Sentry             | $26 / $80 / $300 /mo        |
| Email            | **Buy**   | Resend             | Free / $20 / $90 /mo        |
| Feature Flags    | **Buy**   | PostHog (included) | $0                          |
| API Key Mgmt     | **Build** | Custom (50 LOC)    | $0                          |

> [!IMPORTANT]
> **Do not build auth. Do not build billing. Do not build error monitoring.** Build cost = 3-6 months. Buy cost = $100-500/month. The math is obvious.

---

## 8. SECURITY & COMPLIANCE

### Camera / GDPR

- Add **pre-permission screen** before `getUserMedia`: _"Video is processed locally. No video is ever transmitted."_
- Document in privacy policy that no biometric data is stored (GDPR Article 9 does not apply)
- `dispose()` hard-stops camera stream — already implemented ✅

### Garment IP Protection

- **Signed URLs** (R2 presigned, 1hr expiry) for all garment assets
- SDK requests signed URL from API with session token before loading
- Never expose raw CDN paths

### SOC 2

- Target at **$500k ARR** — use Vanta ($7,500/yr) to automate
- Not needed before enterprise deals require it

---

## 9. ARCHITECTURE RECOMMENDATIONS

### Decompose `Engine.ts` (864 lines → target 500)

- Extract `runAutoTest()` → `EngineTestHarness.ts`
- Extract `extractMeshInput()` → `BodyIntelligence.ts` (where landmark logic already lives)

### Add Structured Error Taxonomy

```typescript
enum AIKartErrorCode {
  CAMERA_DENIED = "E001",
  POSE_MODEL_LOAD_FAILED = "E002",
  GARMENT_LOAD_FAILED = "E003",
  WEBGL_NOT_SUPPORTED = "E004",
  VERTEX_EXPLOSION = "E005",
}
```

Surface via `onError` callback in `EngineConfig` — retailers need this for fallback UIs.

### Add `IValidator` Interface

`GarmentFitValidator`, `LiveFrameValidator`, `EngineValidator` share no interface — impossible to mock in tests. Unify with:

```typescript
interface IValidator {
  validate(input: ValidationInput): ValidationReport;
  reset(): void;
}
```

### Extract Shaders to `.glsl` Files

GLSL inlined as template literals in `WebGLMeshLayer.ts` makes shader diffing hard. Extract to separate files imported as strings. Also eases future WGSL porting.

### Fix `GpuParityChecker` Sync Stall

`gl.getBufferSubData()` stalls the GPU pipeline. Move parity checks to Web Worker or use `gl.fenceSync()` + async readback.

### Unit Test Targets (Low Effort, High Value)

1. `BodyIntelligence.ts` — `KalmanFilter1D`, `BodyYaw.compute()`, `CollarAlignment.compute()` are pure functions → Vitest in 2 days
2. `GarmentAnalyzer.ts` — snapshot tests with known PNG inputs
3. Shader tests — headless WebGL context via `gl` npm package

---

## 10. RISK REGISTER

| #   | Risk                                      | L×I         | Mitigation                                         |
| --- | ----------------------------------------- | ----------- | -------------------------------------------------- |
| 1   | MediaPipe 6MB blocks mobile adoption      | 🔴 High     | Lite model (3MB) as mobile fallback                |
| 2   | iOS Safari WebGL2 breaks rendering        | 🔴 High     | 2-week dedicated QA before any retailer launch     |
| 3   | Retailer CSP blocks WASM                  | 🟡 Med-Hi   | iframe fallback + CSP documentation                |
| 4   | Garment CDN URLs scraped                  | 🟡 Med-Hi   | Signed URLs from day 1                             |
| 5   | MediaPipe API breaking changes            | 🟡 Med-Hi   | Pin version; adapter layer in `PoseDetector.ts`    |
| 6   | GDPR camera disclosure failure            | 🟡 Low-Crit | Pre-permission UI before `getUserMedia`            |
| 7   | `Engine.ts` unmaintainable at 1200+ lines | 🟡 Med      | 500-line ESLint rule + decomposition               |
| 8   | Cold start > 5s on slow connections       | 🟡 Med      | Service Worker pre-caching for WASM                |
| 9   | GPU parity failures on obscure hardware   | 🟢 Low-Med  | Sentry breadcrumb on every `runLiveValidation()`   |
| 10  | Competitor replicates engine              | 🟡 Med      | Speed to market + patent GpuParityChecker approach |

---

## 11. WebGL → WebGPU MIGRATION

- **When:** Phase 3+ (WebGPU at ~78% global browser support, ~60% mobile as of early 2026)
- **Do NOW:** Keep `IMeshLayer` interface; add `capabilities()` method; isolate all `gl.*` calls behind a `GpuBackend` interface
- **Key challenge:** Transform Feedback → Compute Shaders (no direct equivalent)
- **Expected gain:** +3-5 FPS on mid-range hardware
- **Strategy:** Ship WebGPU as opt-in flag during 6-month beta; hard cut when mobile hits 80%

---

## 12. IMMEDIATE NEXT ACTIONS

```
Week 1:  Demo page at demo.aikart.com + camera pre-permission UX
Week 2:  Garment switcher + loading polish + demo video
Week 3:  Clerk setup + Neon database + tenant schema
Week 4:  API key validation endpoint on Cloudflare Workers
Week 5:  Garment upload → R2 pipeline
Week 6:  Stripe billing integration
Week 7-8: Retailer dashboard (Next.js + shadcn/ui)
Week 9:  PostHog analytics + Sentry
Week 10: SDK CDN versioning + embed docs
```

**First paying customer target: 10 weeks from today.**
