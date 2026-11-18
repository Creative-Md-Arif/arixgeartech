# arixgear.tech — API Reference (concise)

Base URL: `/api` · Auth: `Authorization: Bearer <JWT>` · All prices ৳ BDT.
Admin routes live under `/api/admin/*` and require staff JWT (admin or
sub-admin); module gates are noted as `P('module')` — full admins bypass,
sub-admins need the module granted (Admin → Team).

## Public — catalog

| Endpoint | Notes |
|---|---|
| `GET /products` | server-driven list: `?cat=` (branch-aware subtree) `?brand= &q= &min=&max= &sort= &page= &limit=` + facets (price/badges/sizes/brands); cards carry deal-adjusted prices + `dealBogo` |
| `GET /products/:slug` | PDP payload + related (leaf-first, branch fill) |
| `GET /categories` · `/categories/tree` | active flat list and nested tree; each category includes active branch product counts and `showInNavbar` visibility |
| `GET /brands` · `/brands/:slug` | facet list w/ counts · brand page |
| `GET /bundles` · `GET /flash-campaigns` · `GET /deals` · `GET /deals/:slug` | live only (windows computed at read time); per-deal product grids |
| `GET /banners` · `/home-sections` | homepage CMS |

The seeded category tree has a maximum depth of three levels. In `backend/`,
run `npm run seed:categories` before `npm run seed:category-spec-schemas`;
both commands upsert/merge and preserve custom categories and existing spec
fields. Category names were normalized from Bangladesh retailer listings,
primarily [Star Tech components](https://www.startech.com.bd/component),
[phones](https://www.startech.com.bd/mobile-phone),
[networking](https://www.startech.com.bd/networking/router),
[appliances](https://www.startech.com.bd/appliance),
[lifestyle](https://www.startech.com.bd/lifestyle),
[power](https://www.startech.com.bd/power), and
[laptops/desktops](https://www.startech.com.bd/laptop-notebook).

## Public — orders & account

| Endpoint | Notes |
|---|---|
| `POST /orders` | multipart `payload` JSON; guest or JWT; `paymentMethod`: `cod` · `bkash` · `nagad` · `rocket` · `sslcommerz`; `idempotencyKey` honored; guest gate: `403 GUEST_CHECKOUT_DISABLED` when disabled; maintenance: `503` |
| `GET /orders/track/:orderNumber?phone=` | public tracking (last-6 phone OK) |
| `POST /auth/register` → email OTP → `POST /auth/verify-email` | unverified accounts can't log in until verified (`403 needsVerification`) |
| `POST /auth/login` | identifier: email OR BD phone |
| `POST /auth/forgot-password` · `/reset-password` | hashed single-use token |
| `GET /orders` (JWT) · `/account/*` | customer order history, returns, reviews |
| `POST /messages` · `/newsletter` | contact inbox (topic `chat` from widget) · newsletter → `ARIX10` |
| `GET /settings/payment` · `/settings/public` · `/settings/content` | checkout config · flags (maintenance/guest) · CMS content |
| `GET /reviews` · `/questions` | per-product social proof |

## Public — AI (`/api/ai`)

| Endpoint | Notes |
|---|---|
| `GET /ai/config` | widget bootstrap: `enabled`, greeting EN/BN, suggestion chips, provider label (`grounded` in rules mode) |
| `POST /ai/chat` | `{ message, sessionKey }` → `{ reply, lang, intent, provider, grounded, products[card], links[], order? }`. Bangla in → Bangla out. Follow-ups via same `sessionKey`. Rate-limited (40/15min prod). Order-status answers carry **no customer PII** |
| `GET /ai/faqs` | knowledge FAQs for the widget/help pages |

**AI guarantees**: answers use ONLY retrieved DB facts (strict-grounding prompt; deterministic composer floor without an LLM); customer phones/emails/addresses are masked out of prompts and never appear in replies; the LLM never receives database access.

## Admin — core (`P(module)`)

| Block | Endpoints |
|---|---|
| stats/search | `GET /admin/stats` · `GET /admin/search` (⌘K) |
| orders `P('orders')` | list/detail/manual create/update/status/courier/dispatch/verify/reject/delete + `export.csv` + analytics |
| returns | `GET /admin/returns` · `PATCH /admin/returns/:id` |
| products `P('products')` | CRUD + sku/category/brand resolution + size guides |
| catalog `P('catalog')` | categories CRUD (tree-safe) · badges · bundles · flash campaigns |
| brands `P('brands')` | CRUD + facet counts (delete detaches products) |
| deals `P('deals')` | `GET /admin/deals` (+`/meta` `/stats`) CRUD + `PATCH /:id/state` — the centralized promotions manager |
| marketing | coupons (bulk-generate, export, analytics) · banners · homepage sections · notification templates |
| community | reviews · questions · messages (mark read, delete) |
| service | warranty · tickets · service centers |
| reports `P('reports')` | `GET /admin/reports/sales(.csv)` · trend |
| CMS `P('content','settings')` | `GET/PUT /admin/settings` (content blocks, shipping, payments, gateway, pixel, chat, checkout, maintenance, loyalty, size guides) |
| seo `P('seo')` | page meta · product overrides · site/schema · robots · GSC dry-run + GA4 funnel |
| customers `P('customers')` | list/detail · loyalty adjust/reset-password |
| system | `GET /admin/system/status` (readiness) · owner-only: team CRUD, audit log, DB export |
| uploads | `POST /admin/uploads` (multer 5MB → Cloudinary/local) |

## Admin — AI console (`P('ai')`, `/api/admin/ai/*`)

| Endpoint | Notes |
|---|---|
| `GET/PUT /ai/settings` | provider/model/keys (masked `••••••••`, save-with-mask keeps stored), features, widget copy, import + RAG knobs; PUT returns fresh `runtime` (effectiveProvider, keySource) |
| `POST /ai/imports` | `{urls: [...]}` ≤ maxBatch → staged docs (status `pending→processing→ready`) |
| `GET /ai/imports(?status=)` · `GET /ai/imports/:id` | queue with counts · detail (extracted + aiContent + duplicates + images) |
| `PUT /ai/imports/:id` | admin edits (price/category/brand/warranty + all EN/BN copy + SEO) |
| `POST /ai/imports/:id/approve` | → real Product (unique slug, SKU, categoryRef/path, brand). Requires a price |
| `POST /ai/imports/:id/reject` · `/retry` · `DELETE /ai/imports/:id` | audit-trail states |
| `GET/POST /ai/faqs` · `PUT/DELETE /ai/faqs/:id` | knowledge entries (EN/BN, topic, tags, active) |
| `GET /ai/knowledge/stats` | coverage: products/categories/brands/deals/bundles/faqs/imports |
| `GET /ai/chats(?channel=&q=)` · `GET /ai/chats/:id` · `DELETE /ai/chats/:id` | history + thread viewer |
| `POST /ai/chat/test` | full pipeline, channel `admin-test` (kept out of customer analytics) |
| `GET /ai/analytics` | 7-day chats/sessions, intent/language/provider splits, tokens, top questions, import funnel |

## Realtime & SEO

- `ws /socket.io` — JWT handshake; rooms `user:<id>`, `admin`, `order:<NUM>`; SSE bells at `/api/notifications`.
- `GET /robots.txt` · `GET /sitemap.xml` — dynamic, admin-managed (Admin → SEO).

## Errors

Uniform JSON `{ message }` (+ machine `code` where policy-relevant, e.g.
`GUEST_CHECKOUT_DISABLED`, `MAINTENANCE_MODE`). 401 unauthenticated · 403
forbidden/permission · 404 missing · 409 duplicate (SKU/TrxID) · 429 rate
limited · 503 disabled (maintenance / AI off).
