# FORGED — client contract (v2, SPA era)

Both apps are **React 18 SPAs** (react-router v6) built with **Vite 5 + Tailwind CSS 3**.
Root layout: `backend/` (Express API, untouched) · `frontend/` (storefront source, build → `dist/`) · `admin/` (panel source, build → `dist/`).

## Apps & routes

**Storefront (`frontend/`, mounted at `/`)** — entry `src/main.jsx` → `src/App.jsx`:
`/` home · `/shop` · `/about` · `/guides` · `/contact` · `/membership` · `/account` · `/reset-password` (public, `?token=`) · `/checkout` · `/success`.
Legacy `*.html` paths redirect (App.jsx LEGACY map). `App.jsx` owns: route effects
(body[data-page], PageView pixel event, scroll top, #hash scrolling), route table, redirects.

**Admin (`admin/`, mounted at `/admin`, basename set)** — `src/App.jsx`:
`/login` + public `/reset-password` (single-use token) + guarded `/dashboard /orders /orders/:id /reports /products /catalog /reviews /questions
/membership /banners /homepage /coupons /customers /messages /content /seo /settings`. `App.jsx` owns the auth
Guard; pages never redirect manually.

## Rules (must hold)

1. **Layout chrome renders ONCE** around the router `Outlet` (storefront
   `components/Layout.jsx`). Pages return **only their content** — no `<Layout>` inside pages,
   no `mount()` calls anywhere. Providers must not remount on navigation.
2. **Navigation** goes through react-router: `<Link to>` for page links, `go()` (storefront
   `lib/go.js`) for programmatic nav + in-page `#anchors`, `navTo()` (admin `lib/nav.js`)
   inside non-component code. **Never** `location.href = 'x.html'`.
3. **API access only via `src/services/*`** (category modules over `services/http.js`).
   No component/context imports the raw fetch client. Storefront services: products,
   categories, badges, banners, sections, settings (+getChat), orders, auth, messages,
   reviews, questions, membership, seo. Admin services: auth, stats, products, categories, badges,
   banners, homeSections, coupons, orders (+createManual/updateManual/remove/exportCsv),
   reports (sales/salesCsv), customers (+resetPasswordLink), messages, reviews, questions,
   settings, uploads, membership, seo (+gsc*), analytics (ga4Funnel).
4. **Zero hardcoded content.** Every visible text/image that is "site content" comes from the
   API (products, categories, banners, home-sections configs, settings.content) or from
   `backend/src/config/contentDefaults.js` (merged server-side into `/settings/content`).
   If a section has no admin data → render `null`. No bundled fallback catalogs/journals/FAQs.
   Presentation-only literals (icon paths, demo asset paths, theme copy *inside*
   contentDefaults) are fine.
5. **Tokens only** — Tailwind config tokens (bg/bg2/panel/panel2/line/line2/txt/muted/dim/
   silver/orange/orange2, font-disp/head/cond). No hex colors in JSX, no new custom CSS,
   no rounded corners, 320px-safe (no fixed widths, grid blowout guards).
6. **QA/DOM contracts stay**: storefront `#shopSearch #shopCats .scat[data-cat] #shopSort
   #shopRange #shopRangeLab #shopGrid #shopCount #shopEmpty #shopClear #heroIndices idx-bars
   #carTrack #carPrev #carNext #carDots #tickerTrack #ftabs .ftab[data-f] #goals #gear
   #gearGrid #athletes #stories [data-add] [data-open] [data-list] #acctBtn #burgerBtn
   #cartBtn #wishBtn #goCheckout #coFirst #coLast #coPhone #coEmail #coAddr #coCity
   #coDivision .pm[data-pay] #placeOrder`; PDP additions: `#pdpSizes .size-chip[data-s]
   #pdpColors .color-dot[data-c] #pdpPrice #pdpAdd #revList #pdpReviews #revName #revStars
   [data-star] #revText #revSubmit #pdpQA #qaList #qaName #qaText #qaSubmit #pdpRelated
   #relatedGrid`; chat widget: `#chatWidget #chatBtn #chatPanel #chatName #chatMsg #chatSend
   #waBtn #tgBtn #waLink #tgLink`;
   membership page: `#page-membership #memDuration #memMonthly #memJoin #memJoinForm #mName
   #mPhone #mEmail #mPlan #mMethod #mTxid #mProof #mJoinBtn #mDue #memJoinDone #memTrack
   #mTrackPhone #mTrackBtn #memTrackResult #rMethod #rTxid #rProof #mRenewBtn`; admin additions: `#catName #catSlug #catOrder #catImage
   #catAdd #badgeLabel #badgeColor #badgeAdd #revTabs [data-tab] #revModerationList [data-review]
   #qaTabs #qaModerationList [data-question] #faqRows [data-faqrow] #faqAdd #postRows
   [data-postrow] #postAdd #chatEnabled #chatWhatsapp #chatTelegram #chatGreeting #tabPlans
   #tabMembers #mbSearch #mpType #mpName #mpMonths #mpPrice #mpAdmission #mpMonthly
   #mpFeatures #mpBadge`, reports page `#rpGran #rpFrom #rpTo #rpApply #rpExport [data-period]
   [data-rrow] [data-pm]`, pills
   `#verifyingPill #unreadMsgPill #reviewsPill #questionsPill`.
   Pixel globals: `window.forgedPixel`, `window.__fbEvents`, `fbTrack()/fbTrackCtx()`;
   GA globals: `window.forgedGA`, `window.__gaEvents`, `gaTrack()/gaPageView()`;
   SEO page: `#seoManage #seoPageList #seoPageForm #seoProductList #seoProductForm
   #seoSiteForm #seoSitemapForm #seoRobotsForm #seoGoogleForm`;
   localStorage keys unchanged (`forged_v1` — cart lines now carry `price`,
   `forged_catalog` + `forged_catalog_raw`, `forged_session`, `forged_admin_token`,
   `forged_api_base`).

7. **Pricing & catalog model**: product `category` and `badge` are free strings resolved
   against the Category/Badge collections (Admin → Catalog manages both — no enums).
   `sizes` rows merge `sizeStocks` + `sizePrices` ({s, stock, price}) — PDP price, cart
   line price, checkout and the server-side order recalculation all resolve the per-size
   price (`priceFor(p,size)` client, `priceFor()` in orderController server). Colors carry
   an optional `image` — selecting a color on the PDP switches the main photo. Reviews are
   approved-only on the PDP; approving recomputes Product.rating/reviews server-side.
   Admin content page has ZERO JSON editors — FAQs are Q/A text rows, posts are cards.
8. **No direct DOM manipulation** (no document.* writes outside the approved hooks in
   App.jsx/Layout/pixel). React state/props/handlers only. `window.confirm` allowed for
   destructive admin flows.
9. **Membership business rules**: plan `type` is `duration` (durationMonths + one-time
   price) or `monthly` (admissionFee charged ONLY at join + monthlyFee for every renewal).
   One membership per phone (normalized `01XXXXXXXXX`). Join amount = firstMonthTotal
   (monthly: admission+1st month · duration: package price); renew amount = monthlyFee
   only for monthly plans (admission never again), package price for duration re-buys.
   TrxID 6-12 alphanumeric + screenshot required + one TrxID per method across members
   (anti-fraud, same as orders). Admin verify join → startDate=now, admissionPaid=true
   (monthly), expiry=now+term, status active; verify renew → expiry extended from
   max(now, expiry). Reject join → member rejected (cannot renew). Members keep a plan
   fee snapshot so renewals price correctly even after plan deletion. `expired` is a
   lazy status applied whenever a record is read past its expiry.
10. **Manual orders, edit/delete & sales report rules**: manual orders live in the SAME
   Order collection (`source:'manual'`, `channel`, `entryBy`) so every dashboard metric
   syncs automatically. **Edit** (`PUT /api/admin/orders/:id`) is manual-only (online
   orders are customer records) and blocked once `delivered`; totals are recalculated
   server-authoritatively (size-price fallback + per-line admin override, discount cap,
   division shipping + free threshold); **stock/sold reconcile by DELTA** vs the original
   lines (no double-count, 409 when the delta exceeds stock); payment status is preserved
   unless method/paid state actually changes (fixing an address never downgrades a verified
   payment); verifying/processing status follows the new payment state; an "Order edited
   (correction)" statusHistory entry is always appended. **Delete**
   (`DELETE /api/admin/orders/:id`) restores stock/sold exactly as deducted and is blocked
   for delivered orders — dashboard metrics drop automatically. **Sales report**
   (`GET /api/admin/reports/sales[.csv]`) groups by day/month in **Asia/Dhaka** dates,
   splits manual vs online, excludes cancelled/payment-rejected (same revenue rule as the
   dashboard), fills empty buckets, and caps ranges (200 daily / 3y monthly).
11. **Backend is read/write via API only** — never edit `backend/` from client tasks
   (server static + seed + contentDefaults already prepared).
12. **SEO & analytics rules**: the storefront `<head>` is applied ONLY through
   `lib/seo.jsx` (`useSEO(pageKey)` on static pages, `usePdpSEO(product)` on the
   PDP) — no other component writes meta tags. **Per-product overrides** live on
   `Product.seo` (Admin → SEO → Products) and win over the `product` page
   template field-by-field; every empty field falls back to the automatic
   template, so clearing an override always restores auto SEO. Meta fields are
   angle-bracket-sanitized server-side (injection-safe) and `{product.*}`
   placeholders interpolate against the RAW API shape (category, shortDescription
   are bridged to the adapted cat/desc). **GA4** config lives in
   `SeoSite.analytics {enabled, ga4Id}`, reaches the client exclusively via the
   public `GET /api/seo` payload, and `lib/analytics.js` is the only place that
   injects gtag.js; enabling without a valid `G-…` Measurement ID is rejected
   server-side (400). Tracking touchpoints stay mirrored for QA:
   `window.forgedGA`/`window.__gaEvents` alongside `window.forgedPixel`/
   `window.__fbEvents`; the Purchase event is once-per-order (localStorage flag)
   and fires GA-only when the Meta Pixel is off. **Google services** (Task 26):
   `SeoSite.googleService` holds the GCP service account — `privateKey` is
   `select:false` so it can never leave the backend (admin responses carry only
   `hasKey`); auth is a hand-rolled RS256 JWT (node `crypto`, zero new deps).
   Without credentials every GSC/Indexing/GA4 action runs in **dry-run** and
   still logs to `GscLog` (capped 400 rows) — no code path may call Google
   outside `services/googleApi.js`, and automations (product → `/shop` ping,
   sitemap auto-resubmit) must stay opt-in toggles and fire-and-forget (never
   block or fail the triggering request). The dashboard funnel reads GA4 via
   `GET /api/admin/analytics/funnel` only; Google-side errors surface inline
   instead of breaking the dashboard. Indexing batch is capped at 100 URLs
   (Google quota ~200/day).
13. **Product catalog API rules (Task 27)**: the public list ALWAYS filters
   `active:true`; search input is regex-ESCAPED server-side (never interpolated
   raw) and matches name + shortDesc; `minPrice/maxPrice/rating` are validated
   (garbage → 400, not NaN queries); list/suggest/related respond with the CARD
   projection (`name slug category price comparePrice images badge stock sold
   views rating reviews featured shortDesc sizes` — no description/specs/seo/
   sizeStocks) through `.lean()`. Every admin product mutation (create/update/
   delete/bulk/duplicate/import) and every review-rating recompute calls
   `cache.bump()` — the 15s in-memory cache (`services/cache.js`) must never
   outlive a catalog change, and `npm run seed` (separate process) is covered by
   the short TTL. PDP opens increment `Product.views` fire-and-forget; the
   trending sort and dashboard mostViewed read it. Bulk ops cap at 200 ids;
   duplicate always creates an INACTIVE draft with a `-copy` slug and zeroed
   sold/views/rating; CSV import upserts by slug (slug never changes on update),
   caps 500 rows, and imageless CREATE rows get the branded SVG placeholder while
   UPDATE rows never touch images unless the CSV supplies `imageUrl`. The
   storefront PDP re-checks live stock via `/api/products/:slug/stock` and the
   header search merges `/search/suggest` results beyond the 48-item mirror —
   deep-suggestion PDPs fetch `/api/products/:slug` and run through `adaptOne`.
14. **Order API rules (Task 28)**: client totals are NEVER trusted — preview
   and placement recompute price/coupon/shipping server-side; placement is
   idempotent (storefront sends `idempotencyKey`, replay → 200 + original
   order; `idemKey` is a SPARSE unique index and must stay absent — not null —
   on orders without a key). Stock moves ONLY through `services/orderOps.js`:
   decrements are atomic (`stock:{$gte:qty}` in the same update — never
   check-then-inc) and restores are one-shot via the `stockRestored` claim
   flag; customer-cancel / admin-cancel / payment-reject all restore stock +
   coupon usage through it. Checkout phones are validated `01[3-9]XXXXXXXX`
   (880/+880 normalized) and the normalized form is stored. Phone-proof
   endpoints (track/cancel/invoice/returns) share one rate limiter and grant
   access ONLY on ≥6-digit phone-suffix match or matching JWT (owner/admin).
   RMA: one ACTIVE request per order, delivered-only, 7-day window; refunds
   are ledger entries on `order.payment.refunds` (never edit grandTotal).
   Courier credentials live in admin Settings; unconfigured provider answers
   a dry-run (never throws), and both courier + auto-push calls are
   fire-and-forget. `register`/`login` adopt guest orders by phone/email and
   report the count as `linkedOrders`.

15. **Review + Coupon API rules (Task 29)**: the review `verified` flag is
   SERVER-derived only (a DELIVERED order of that product owned by the JWT
   caller) — never accept it from the client. One review per ACCOUNT per
   product is enforced by a partial-unique index `({user:1,product:1},
   partialFilterExpression user $type objectId)` — a compound SPARSE index
   would still index guest docs as `{user:null,…}` and collide; guest docs
   must keep the `user` field ABSENT. Every approve/unapprove/edit/delete
   recalculates the product's public `rating`/`reviews` and bumps the
   catalog cache. Owner edits go back to pending; admin content edits
   (`PATCH /api/admin/reviews/:id`) and admin-bypass owner edits preserve
   approval state. Coupons: percent `value` ≤ 100, codes `A-Z0-9` with inner
   hyphens (3–20), duplicate code → 409, expiry backdating allowed on update
   only (kill switch). Coupon consumption in placeOrder MUST stay race-safe:
   the `usedCount` `$inc` is conditional (active + unexpired +
   `$expr usedCount<maxUses`), `modifiedCount 0` aborts the order (fallback
   path deletes the orphan + gives stock back). Scoped coupons
   (`appliesTo`) discount ONLY the eligible cart lines (base = eligible
   lineTotals, capped there) while `minOrder` still reads the FULL cart;
   per-user/first-order identity = account id OR normalized checkout phone,
   counted over non-cancelled orders via `totals.couponCode`. Analytics
   aggregations must filter `'totals.couponCode': {$nin: [null,'']}` — null
   (no coupon) matches `$exists`. Public `GET /api/coupons/active` exposes
   only `active && public && unexpired && under maxUses` docs via
   `publicView()` (never `usedCount` or private codes).

16.  **Q&A + Membership + Banner API rules (Task 30).** Questions: the
   public/asker list endpoint NEVER returns raw docs — both `items` and
   `mine` are mapped shapes (`id`, `helpfulCount`, `myVote`; `mine` adds
   `status`, no `voters`/`user` keys — voter identity stays server-side).
   Link-spam (≥3 URLs) → 400, identical asker+question on a product within
   10 min → 409. `answer` sets `answeredAt`; `unanswer` clears
   answer/answeredAt/answered together. Membership: `track` REQUIRES
   phone + member code (both must match → 200, else 400/404 — never leak
   which part failed); response adds `expiresInDays` for active members.
   Expired-membership lapse happens via ONE bulk `updateMany` (never a
   per-member save loop). `verifyPayment` stamps `verifiedAt` +
   `verifiedBy` and fires member SMS fire-and-forget; rejected join members
   MAY re-join (record reused, same code, fresh pending join payment).
   Plan delete returns 409 while active/pending members reference the plan
   (`?force=true` overrides). Banners: `link` MUST pass the sanitizer
   (internal path, http(s), mailto — `javascript:`/`data:`/`vbscript:`/
   `file:` → 400); image swap = upload new → save doc → release old
   (never delete-then-upload); `remove` releases the image only when no
   other banner shares its `publicId` (duplicates share references).
   Public banner list is cached (`banners:*` keys) — every admin write
   MUST bump the cache. Scheduled banners hide outside
   `[startsAt, endsAt]` automatically. Click pings `$inc` only on active
   docs. System status: `GET /api/admin/system/status` masks the Mongo URI
   and reports modes (replica set/transactions, cloudinary/local, resend/
   dry-run, sms off/dry-run/live, CORS count, builds) — keep it secret-free.

17. **Variant payload + Size Guide rules (Task 31).** The public product
   card projection (`list` / `suggest` / `related`) MUST include
   `sizeStocks sizePrices colors` alongside `sizes` — the storefront PDP
   renders straight from the list payload, and dropping any of them
   silently breaks per-size pricing, per-size availability or color
   swatches (this exact regression shipped once; do not re-trim `CARD`).
   `Setting.sizeGuide` = `{enabled, title, note, headers, rows}`:
   headers 1–6 non-empty strings (≤40 chars each), rows ≤30 arrays
   normalized to the header width (pad `""` / trim extras) on every save,
   title defaults to "Size Guide" when blanked. Public
   `GET /api/settings/size-guide` returns the block EVEN when disabled —
   the storefront distinguishes admin-hidden (hide accordion + link)
   from API-down (render the legacy default table). Storefront re-aligns
   rows to header width at render as a second guard.

18. **SSLCOMMERZ gateway rules (Task 40).** `Order.payment.method` accepts
   `sslcommerz` — placing such an order 503s while `Setting.gateway.enabled`
   is false, needs NO TrxID/screenshot, and starts as `payment.status=pending`
   + order `verifying`. `/api/payments/init` is phone-proof (6+ digit suffix)
   or owner/admin JWT, 409s on already-paid/cancelled/non-sslcommerz orders,
   and 503s while the gateway is disabled. REAL mode (storeId + storePasswd
   saved) returns the SSLCOMMERZ `GatewayPageURL`; SIM mode (enabled with
   empty creds — dev/QA only) returns `/payment/sandbox` with an HMAC tag.
   `validate` MUST re-verify `val_id` through the SSLCOMMERZ validator API
   server-side (status VALID/VALIDATED + tran_id + amount + BDT) — the
   redirect query alone is NEVER trusted; sim validate only accepts `SIM…`
   val_ids WITH the matching HMAC tag. Marking paid is idempotent (funnel
   through one helper; double IPN + double redirect can never double-move).
   Admin GET masks `storePasswd` as `••••••••` — a save carrying the mask
   keeps the stored secret; enabling requires BOTH credentials. The gateway
   public block (`/api/settings/payment`) must never expose credentials.
19. **Size Guide resolution rules (Task 32).** The PDP guide resolves in a
   strict tier order — **product custom → category table → global table →
   legacy default** — and the rendered `<details>` carries
   `data-guide-source=product|category|global|default` for QA. Product
   `sizeGuide.mode` is `inherit` (tier falls through) or `custom` (own
   table; `enabled=false` hides the guide AND the link on that PDP).
   `Setting.categoryGuides[]` holds one table per category slug with its own
   `enabled` switch — disabling a category hides the guide + link for every
   product in it. `GET /api/settings/size-guide` ships BOTH blocks
   (`sizeGuide` + `categoryGuides`) in one public call. Admin settings PUT
   accepts `categoryGuides[]` with merge semantics: `{category, remove:true}`
   deletes, `{category, enabled}` toggles without touching the table,
   `{category, headers, rows,…}` creates/replaces. ALL guide surfaces
   (global / category / product) normalize through
   `backend/src/utils/sizeGuide.js` — 1–6 non-empty headers (blanks
   auto-named), ≤30 rows, cells trimmed to width, FULLY blank rows dropped.
   The public card projection (`CARD`) includes `sizeGuide` so PDPs opened
   from the grid keep tier-1 resolution — do NOT re-trim it.
20. **Banner media rules (Task 38).** Banners carry `mediaType image|video`;
   video banners store the clip in `video.{url,publicId}` (≤40MB,
   MP4/WEBM/MOV) and optionally `poster.{url,publicId}` (≤5MB image).
   Uploads go through the FIELD-SCOPED media uploader (`uploadMedia`) — the
   `image`/`poster` fields accept images only, the `video` field videos only,
   and every file is magic-byte sniffed server-side (mimetype is never
   trusted). Replacing/switching media snapshots the OLD refs as plain
   values BEFORE mutating the doc (mongoose subdoc aliasing would otherwise
   delete the NEW file) and releases them only after a successful save;
   deletes are refcounted (duplicates share media). The public list ships
   `mediaType` + `video` + `poster`; the hero plays clips muted/autoplay,
   advances onEnded, and unmutes through the existing sound toggle.

18. **Newsletter API rules (Task 49).** `POST /api/newsletter` (public,
   `subscribeLimiter` 8/h prod · 200 dev, `protectOptional`) takes `{email}`
   only. It is IDEMPOTENT per lowercase email: first call → `201
   {ok, alreadySubscribed:false, coupon, message}` and a
   `ContactMessage(topic:'newsletter')` row; repeat calls → `200` with
   `alreadySubscribed:true` and the SAME coupon — never 409. The response
   coupon is the publicView of **FORGE10** (percent 10, minOrder 0), which
   the endpoint ensures via upsert with `$setOnInsert` so admin edits are
   never overwritten. FORGE10 is hardened: `perUser:1, maxUses:500,
   public:true` (picker-visible). `GET /api/admin/messages` now accepts
   `?topic=` and always returns `counts:{all,unread,newsletter}`; the legacy
   list shape (inbound + outbound rows, `unread` field) is unchanged.
   The storefront subscribe service falls back to the legacy
   `/api/messages` topic row ONLY when `/api/newsletter` 404s (old backend).

19. **Email verification + phone login (Task 51).** `POST /api/auth/register`
   creates customers UNVERIFIED: response is `201 {needsVerification:true,
   email, phone, delivery, devOtp?}` — NO token. A 6-digit OTP (SHA-256 hash
   stored, 10-min TTL, single-use, 5 wrong attempts → lockout until resend,
   60s resend cooldown) is emailed; `devOtp` appears ONLY when mail is
   dry-run (no `RESEND_API_KEY`, `RESET_LINK_HIDE != true`). `POST
   /api/auth/verify-email {email, code}` → `200 {token, user}` (auto-login),
   awards deferred referral points (+50/+100, once via
   `loyalty.referralAwarded`) and claims guest orders (Task 28 moved here).
   `POST /api/auth/resend-verification` is always-200/anti-enumeration.
   `POST /api/auth/login` takes `{identifier, password}` where identifier is
   email OR BD phone (normalized `01XXXXXXXXX`; `phone` is unique+sparse on
   User; register/profile reject dup phones with 409, normalize
   `+880/880/dash` forms). Unverified customers get `403
   {needsVerification:true, email}` on login; staff/admin and seeded users
   are pre-verified (`emailVerified:true`). Guest checkout is NOT gated by
   verification — orders stay phone-identity (COD-first market).
   `GET /api/admin/customers` rows carry `emailVerified` (badge column).

20. **Guest checkout kill-switch (Task 52).** `Setting.checkout.guestEnabled`
   (default `true`; legacy docs without the block read as ON). Admin flips it
   via `PUT /api/admin/settings {"checkout":{"guestEnabled":false}}` (auth
   required; non-object `checkout` bodies are ignored safely) — surfaced in
   **Admin → Settings → 🛒 Checkout Rules** with a live GUEST ON/OFF chip and
   a dirty-tracked save. Public surface: `GET /api/settings/payment` (and
   `Setting.publicView()`) carries `checkout:{guestEnabled}` so the
   storefront learns the policy on the call it already makes. While OFF,
   `POST /api/orders` refuses tokenless requests with
   `403 GUEST_CHECKOUT_DISABLED` (machine code + message); logged-in JWT
   orders, admin manual orders (`POST /api/admin/orders/manual`,
   `source:'manual'`) and the public `POST /api/orders/preview` are never
   blocked. Storefront: the checkout form swaps for an account gate card
   (EN/BN via i18n) linking to `/account`; the cart stays saved on-device.

## Build & run

```bash
npm run install:all     # backend + frontend + admin
npm run build           # → frontend/dist + admin/dist
npm run mongo && npm run seed && npm start   # API + both SPAs on :5000
```
