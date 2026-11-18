# arixgear.tech — Production Deployment Guide

From zero to a live store in one pass. Everything below is verified by the
production boot checklist the server prints (and exposes at
`GET /api/admin/system/status`).

---

## 1. Topology

```
                ┌────────────────────────────┐
 Browser ─────► │  Node (backend/server.js)  │ ◄──── MongoDB Atlas (replica set)
                │  · REST API  /api/*        │       (M10+ recommended — replica set
                │  · storefront SPA  /       │        enables multi-doc transactions)
                │  · admin SPA       /admin  │ ◄──── Cloudinary (images)
                │  · Socket.IO  /socket.io   │ ◄──── Resend / SSLWireless / SSLCOMMERZ
                └────────────────────────────┘
```

One process, one port (default 4000). Put nginx / Cloudflare / Render /
Railway in front for TLS; `trust proxy` is already on.

## 2. Environment (backend/.env)

Copy `backend/.env.example` → `backend/.env` and fill in:

### Core (required)
| Variable | Notes |
|---|---|
| `NODE_ENV=production` | refuses weak JWT secrets, enables prod guards |
| `JWT_SECRET` | 32+ random chars — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES=7d` | |
| `MONGODB_URI` | Atlas SRV string. Atlas clusters ARE replica sets → transactions ON (order + stock + coupon). Local dev omits this. |
| `CORS_ORIGINS` | `https://arixgear.tech,https://admin.arixgear.tech` — **required in prod** (empty allowlist is dev-only) |
| `PORT=4000` | |

### Images (required for durability)
| Variable | Notes |
|---|---|
| `CLOUDINARY_URL` | single-string form: `cloudinary://key:secret@cloud` — **without it images sit on local disk and are lost on redeploy** |

### Communication (dry-run safe)
| Variable | Notes |
|---|---|
| `RESEND_API_KEY` + `EMAIL_FROM` | order/status/OTP emails. Without a key → dry-run logs `backend/logs/emails.jsonl` |
| `SMS_PROVIDER=sslwireless`, `SMS_DRY_RUN=false`, `SSLWIRELESS_API_TOKEN`, `SSLWIRELESS_SID` | keep `SMS_DRY_RUN=true` until you're ready to pay for sends |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | customer push; without → dry-run logs |
| `ADMIN_NOTIFY_EMAIL` | new product-question alerts |

### Payments
Admin → Settings → Gateway: SSLCOMMERZ `storeId`/`storePasswd` stored
**server-side in DB, masked on read**. `sandbox:true` hits
sandbox.sslcommerz.com. Enabled-with-empty-creds runs a local simulated
session (`/payment/sandbox`) so the full pay→validate lifecycle stays
testable. bKash/Nagad/Rocket numbers, division shipping charges and the
free-shipping threshold are all admin-editable, live, no deploy.

### AI system (optional — works free without it)
| Variable | Notes |
|---|---|
| `AI_PROVIDER` | `auto` (default) · `gemini` · `openai` · `rules` |
| `GEMINI_API_KEY` | Google AI Studio key → conversational answers. Without it the assistant stays in **grounded-rules mode** (free, deterministic, DB-only answers) |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` | any OpenAI-compatible endpoint — Ollama (`http://127.0.0.1:11434/v1`), vLLM, LM Studio, OpenRouter |
| `AI_IMPORT_ALLOW_HOSTS` | keep **empty** in production (localhost/private ranges are always blocked; this only widens the importer's fetch allowlist for trusted feeds) |

Everything AI can also be configured at runtime in **Admin → Intelligence → AI Console → Settings** (DB values win; keys are stored server-side and always returned masked `••••••••`).

The AI settings screen includes an optional OpenRouter free-model preset (`https://openrouter.ai/api/v1`, model `openrouter/free`). It requires an OpenRouter API key; the free router selects only free models, whose availability and rate limits can change. Product import sends extracted product facts and the allowed category/brand labels to the selected AI provider. Review that provider's data terms before enabling a hosted endpoint, and do not send personal or confidential data.

## 3. Build & run

```bash
npm run install:all
npm run build          # frontend/dist + admin/dist (both served by the API)
npm run seed           # FIRST DEPLOY ONLY — demo catalog + users. Skip to keep prod data.
NODE_ENV=production node backend/server.js
```

- Storefront → `https://your-domain/`
- Admin → `https://your-domain/admin/`
- Boot prints the **PRODUCTION READINESS** report (✓/⚠ per line, now
  including the AI line). Same checklist at `GET /api/admin/system/status`.
- Process manager: `pm2 start backend/server.js --name arixgear` (or a
  container; the app is stateless besides MongoDB + logs dir).

## 4. Go-live checklist

- [ ] `JWT_SECRET` strong, `NODE_ENV=production`, `CORS_ORIGINS` locked
- [ ] MongoDB Atlas (replica set) — verify "transactions ON" line at boot
- [ ] Cloudinary configured (✓ Images line)
- [ ] Resend key (✓ Email line) + SSLWireless live when ready
- [ ] Gateway: real storeId/storePasswd, `sandbox:false`
- [ ] Admin password changed (Team page), sub-admins granted only needed modules
- [ ] Store identity + phone numbers updated in Admin → Settings
- [ ] Demo catalog replaced or curated via AI Import + approval
- [ ] AI: key configured (or intentional rules mode), widget greeting reviewed
- [ ] `import.allowHosts` empty in AI settings
- [ ] robots.txt / sitemap verified via Admin → SEO
- [ ] First order placed end-to-end (COD + gateway sandbox→live)

## 5. Operations notes

- **Logs**: `backend/logs/*.jsonl` (emails, sms, fcm dry-runs). Ship or mount a volume.
- **Backups**: Admin → System → database JSON export (owner-only) + Atlas continuous backup on M10+.
- **Scaling**: stateless API → scale horizontally behind the proxy. Socket.IO needs sticky sessions (or the Redis adapter) for >1 node. The AI import queue is per-process and sequential by design (gentle on sources).
- **Rate limits**: global 800/15min/IP; auth 20/15min; AI chat 40/15min. Tune in `backend/server.js`.
- **Zero-cron rule**: deals/flash windows are computed from the clock at read time — servers can restart any time without schedulers drifting.
