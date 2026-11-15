# arixgear.tech — Tech & Gadget E-commerce (Full-Stack, ৳ BDT)

**ArixGear** is a production-grade Bangladeshi tech & gadget store: React storefront + React admin + Express/MongoDB API, all prices in **৳ Bangladeshi Taka (BDT)**, with a built-in **AI system** (product import, RAG knowledge assistant, customer support chat, admin console).

```
arixgear-full-project/
├── frontend/   STOREFRONT — React 18 SPA (44+ routes, lazy per-page chunks)
│   ├── src/routes.jsx       full route registry (44 pages, data-driven)
│   ├── src/components/      Layout · Header · PDP · CatalogBrowser · ChatWidget (AI) …
│   ├── src/pages/           one component per route (+ sections/ for home blocks)
│   └── dist/                BUILD OUTPUT (served by the API at "/")
├── admin/      ADMIN PANEL — React 18 SPA mounted at /admin (30+ modules, lazy chunks)
│   ├── src/App.jsx          guarded route table (login eager, modules lazy)
│   ├── src/pages/           dashboard · orders · products · deals · ai · seo …
│   └── dist/                BUILD OUTPUT (served at "/admin")
├── backend/    Express REST API + MongoDB — all business logic
│   ├── server.js            single-port server (API + both SPAs + Socket.IO)
│   ├── src/models/          34+ Mongoose models (Product v2, Deal, Order, AiSetting …)
│   ├── src/controllers/     feature controllers (+ admin/ sub-modules)
│   ├── src/services/        deals · flash · ai/ (provider·rag·chat·importer) · email · sms …
│   └── src/seed/            npm run seed → full demo catalog
├── scripts/    QA suites (qa_phase2/4/7/8/ai) + tooling
└── docs/       DEPLOYMENT.md · API.md
```

**Stack**: React 18 + Vite 5 · Tailwind utility classes · Express 4 · Mongoose 8 (Atlas replica-set ready, transactions) · Socket.IO (JWT) · Cloudinary · Resend · SSLWireless SMS · SSLCOMMERZ · Gemini / OpenAI-compatible LLMs.

---

## Quickstart (local dev)

```bash
npm run install:all     # backend + frontend + admin deps
npm run mongo           # in-memory MongoDB on :27017 (dev)
npm run seed            # demo catalog: 18 brands · 40 products · 36 categories ·
                        # deals (11.11/flash/BOGO/bundles) · users · settings
npm start               # single server → http://localhost:4000
                        #   storefront  http://localhost:4000/
                        #   admin panel http://localhost:4000/admin/
```

**Logins (seeded):** `admin@arixgear.tech / ArixAdmin2026` (owner) · `demo@arixgear.tech / arix2026` (customer) · `staff@arixgear.tech / ArixStaff2026` (sub-admin: orders, products, brands, messages).

**AI out of the box:** with no API key the assistant runs in **grounded-rules mode** — answers composed deterministically from database facts, zero cost, zero hallucination. Add `GEMINI_API_KEY` (env or Admin → AI Console → Settings) or an OpenAI-compatible endpoint (Ollama/vLLM) for conversational answers. See `docs/DEPLOYMENT.md`.

## QA suites (all green at v2.25.0 — 330 checks)

| Suite | Command | Checks |
|---|---|---|
| Phase 2 — catalog v2, auth, orders, admin | `bash scripts/qa_phase2_api.sh` | 44 |
| Phase 4 — backend expansion (bundles, flash, service, FCM) | `bash scripts/qa_phase4_api.sh` | 81 |
| Phase 7 — integration: SSLCOMMERZ E2E, PWA, pixel, CMS | `bash scripts/qa_phase7_integration.sh` | 73 |
| Phase 8 — centralized deals & promotions | `bash scripts/qa_phase8_deals.sh` | 59 |
| Phase 9 — AI system (chat · RAG · import · admin) | `bash scripts/qa_ai.sh` | 73 |

Suites boot their own stack when needed (`qa_ai.sh` also boots mongo + seed). Full logs land in `/tmp/qa-*.log`.

## Feature map

| System | Where |
|---|---|
| **Catalog v2** | Category tree (parent/`path`), Brand collection w/ facets, SKU `ARG-…`, warranty blocks, generalized variant axis (`variantLabel`), branch-aware filters, server-driven shop (facets, 7 sorts, deep links) |
| **Cart / Checkout / Orders** | Guest or account checkout, idempotency keys, coupons, loyalty points, BOGO lines, deal-priced lines with provenance, COD + manual bKash/Nagad/Rocket + SSLCOMMERZ sim/live, guest checkout kill-switch, maintenance mode |
| **Deals & Promotions (Phase 8)** | ONE reusable stack (`Deal` model + service + controller) for every campaign type — 11.11, 12.12, flash, mega, daily, seasonal, brand, combo, BOGO, clearance, custom; scheduling computed at read time (no cron); admin Deals Manager renders from the backend type registry |
| **Combo Bundles / Flash Campaigns** | `ComboBundle` (allocated pricing) + `FlashCampaign` windows; flash price wins ties |
| **AI System (Phase 9)** | AI Product Import (URL → extract → rewrite EN/BN → dedupe → Cloudinary → approve), RAG knowledge assistant (whitelisted projections, PII never enters AI context), customer chat (Bangla/English, follow-ups, comparisons, order status), admin AI console (settings/imports/knowledge/chats/analytics) — see below |
| **After-sales (Phase 4)** | Warranty registrations, service tickets, service centers, returns/RMA, stock log, loyalty logs |
| **Notifications** | Resend email (dry-run logs), SSLWireless SMS (dry-run), FCM push (dry-run), SSE + Socket.IO bells, notification templates (EN/BN), web-push (VAPID) |
| **Marketing** | Meta Pixel + GA4 (admin-driven), newsletter → welcome coupon `ARIX10`, coupons engine, homepage section CMS, banners, blog/journal |
| **SEO** | Admin-managed meta per page/product, sitemap.xml + robots.txt (dynamic), JSON-LD product/org schema, canonical URLs |
| **PWA** | manifest + service worker (offline shell), install prompt, push |
| **Security** | JWT (stateless + per-request user re-read), sub-admin module permissions (`MODULES` registry + `requirePermission`), rate limiting (global, auth, AI chat), helmet, CORS allowlist, SSRF-guarded importer, owner-only team/audit, audit log |
| **i18n** | Bengali fallbacks across storefront copy (`*Bn` fields + `useLang`), bilingual AI answers |

## Project rules

- **Zero hardcoded content** — products, banners, sections, policies, AI widget copy: all admin-managed via API.
- **One pricing truth** — cards, PDP, search, order totals all compute `min(base, flash, deal)` server-side.
- **No cron** — scheduled/active/expired states computed from the clock at read time.
- **Privacy by design** — AI reads only public projections; customer names/phones/addresses/TrxIDs never enter prompts or replies.
- **Versioning** — `VERSION` file + stage entries in `worklog.md`; every phase closes with a committed QA-green milestone.

## Documentation

- `docs/DEPLOYMENT.md` — production deployment (Atlas, env vars, Cloudinary, gateway, AI keys, checklist)
- `docs/API.md` — endpoint reference (public + admin + AI)
- `backend/.env.example` — every variable documented
- `worklog.md` — full build history, stage by stage
