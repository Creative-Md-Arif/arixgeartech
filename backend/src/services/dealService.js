/* Phase 8 — the reusable Deal engine (Centralized Deals & Promotions).

   Everything promotion-shaped flows through here:
     · TYPES registry        — add a campaign kind in ONE place; controller,
                               routes, model and admin form all follow.
     · applyDeals(products)  — the ONE read-time pricing pass for catalog
                               cards / PDP / search / related / flash page
                               (replaces the raw flashSvc.applyFlash call —
                               flash still competes, best price wins).
     · activeIndex(now)      — cached live-deal index used at ORDER time so
                               totals are server-authoritative (mirrors the
                               storefront exactly).
     · bogoLinesFor(item)    — BOGO free-unit expansion at order time.
     · CRUD + validation     — one service; the controller stays thin.

   No cron: windows start/stop by the clock (statusOf), the 15s index TTL
   keeps the catalog hot while edits self-heal fast — same contract as the
   flash engine and services/cache.js. */

const Deal = require('../models/Deal');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const ComboBundle = require('../models/ComboBundle');
const cache = require('./cache');
const flashSvc = require('./flash');

/* ── the extensibility point ─────────────────────────────────────────────
   A NEW deal type = ONE entry here. requiresScope pins the scope kind the
   admin form must submit (brand deals → brands, etc.); kinds list which
   money-math the type may carry; `wrap` types carry a link instead of math. */
const TYPES = {
  campaign:  { label: 'Campaign (11.11 / 12.12)', kinds: ['percentage', 'fixed'], icon: '🎯' },
  flash:     { label: 'Flash Deal', kinds: ['percentage', 'fixed'], icon: '⚡' },
  mega:      { label: 'Mega Sale', kinds: ['percentage', 'fixed'], icon: '🔥' },
  daily:     { label: 'Daily Deal', kinds: ['percentage', 'fixed'], icon: '🕐' },
  seasonal:  { label: 'Seasonal Offer', kinds: ['percentage', 'fixed'], icon: '🍂' },
  brand:     { label: 'Brand Deal', kinds: ['percentage', 'fixed'], requiresScope: 'brands', icon: '🏷️' },
  combo:     { label: 'Combo Offer', kinds: [], wrap: 'bundle', icon: '📦' },
  bogo:      { label: 'BOGO (Buy X Get Y)', kinds: ['bogo'], icon: '🎁' },
  clearance: { label: 'Clearance', kinds: ['percentage', 'fixed'], icon: '🧹' },
  custom:    { label: 'Custom Promotion', kinds: ['percentage', 'fixed'], icon: '✨' },
};

const INDEX_KEY = 'deals:active-index';
const DAY = 24 * 60 * 60 * 1000;

/* ── live deal index (15s TTL, bumped on any deal mutation) ───────────────
   Brand scopes are pre-resolved to ObjectIds so order-time matching never
   needs a Brand lookup per product. */
async function activeIndex(now = new Date()) {
  const hit = cache.get(INDEX_KEY);
  if (hit) return hit;
  const docs = await Deal.find({
    published: true, active: true,
    'window.startsAt': { $lte: now }, 'window.endsAt': { $gte: now },
  }).sort({ priority: 1, 'window.endsAt': 1 }).lean();

  const live = [];
  const brandSlugs = new Set();
  for (const d of docs) {
    if (d.usageLimit > 0 && d.usedCount >= d.usageLimit) continue; // exhausted
    (d.scope?.brands || []).forEach((s) => brandSlugs.add(s));
    live.push(d);
  }
  const brandDocs = brandSlugs.size
    ? await Brand.find({ slug: { $in: [...brandSlugs] } }).select('slug').lean()
    : [];
  const brandIdBySlug = Object.fromEntries(brandDocs.map((b) => [b.slug, String(b._id)]));

  const idx = { deals: live, brandIdBySlug, at: +now };
  cache.set(INDEX_KEY, idx);
  return idx;
}

function invalidate() { cache.bump(); }

/* scope match — branch-aware for categories (categoryPath intersection
   covers the whole subtree, same contract as the shop's branch filters) */
function dealMatches(deal, p, idx) {
  const s = deal.scope || {};
  if (s.kind === 'all') return true;
  if (s.kind === 'categories') {
    const wanted = (s.categories || []).map((c) => String(c).toLowerCase());
    const cat = String(p.category || '').toLowerCase();
    const path = (p.categoryPath || []).map((c) => String(c).toLowerCase());
    return wanted.includes(cat) || path.some((c) => wanted.includes(c));
  }
  if (s.kind === 'brands') {
    /* brand arrives as ObjectId (lean order-time docs) OR as a populated
       { _id, slug, … } object (catalog cards) — accept both shapes */
    let bid = null;
    let bslug = null;
    if (p.brand != null) {
      if (typeof p.brand === 'object' && (p.brand._id || p.brand.slug)) {
        bid = p.brand._id != null ? String(p.brand._id) : null;
        bslug = p.brand.slug ? String(p.brand.slug) : null;
      } else {
        bid = String(p.brand);
      }
    }
    if (!bid && !bslug) return false;
    return (s.brands || []).some((slug) => (bslug ? slug === bslug : idx.brandIdBySlug[slug] === bid));
  }
  if (s.kind === 'products') {
    const slug = String(p.slug || '').toLowerCase();
    const id = p._id != null ? String(p._id) : null;
    return (s.products || []).some((x) => x === slug || x === id);
  }
  return false;
}

/* human discount label for LEAN docs (schema methods are not present) */
function labelFor(deal) {
  const d = deal.discount || {};
  if (deal.type === 'bogo') return `Buy ${deal.bogo?.buyQty || 1} Get ${deal.bogo?.getQty || 1} Free`;
  if (deal.type === 'combo') return 'Combo price';
  if (d.kind === 'percentage') return `${d.value}% OFF`;
  return `\u09F3${d.value} OFF`;
}

function unitPriceForLean(deal, base) {
  const b = +base;
  if (!b || b <= 0) return null;
  const d = deal.discount || {};
  let price = null;
  if (d.kind === 'percentage' && d.value > 0 && d.value <= 100) {
    let off = Math.round(((b * d.value) / 100) * 100) / 100;
    if (d.maxOff > 0 && off > d.maxOff) off = d.maxOff;
    price = b - off;
  } else if (d.kind === 'fixed' && d.value > 0) {
    price = b - d.value;
  }
  if (price == null || price < 1 || price >= b) return null;
  return Math.round(price * 100) / 100;
}

/* resolve ONE product against the index:
   { priceDeal, price, bogoDeal } — priceDeal may be null (bogo-only match) */
function resolveFor(p, idx, now, baseOverride) {
  /* audit fix — percentage/fixed deals must scale off the price the customer
     actually pays for the line (size-selected sizePrice), not the product's
     default price: a 20% deal on a ৳1,000 default charged ৳800 units of a
     ৳2,000 size. Cards stay default-price based (no size context there). */
  const base = baseOverride != null && +baseOverride > 0 ? +baseOverride : +p.price;
  let priceDeal = null;
  let price = null;
  let bogoDeal = null;
  for (const d of idx.deals) {
    if (d.type === 'combo') continue; // combo wraps bundles — no unit pricing
    if (!dealMatches(d, p, idx)) continue;
    if (d.type === 'bogo') {
      if (!bogoDeal || d.priority < bogoDeal.priority) bogoDeal = d;
      continue;
    }
    const cand = unitPriceForLean(d, base);
    if (cand != null && (price == null || cand < price || (cand === price && d.priority < priceDeal.priority))) {
      priceDeal = d; price = cand;
    }
  }
  return { priceDeal, price, bogoDeal };
}

/* ── THE central pricing pass (cards, PDP, search, related, flash page) ──
   One call replaces flashSvc.applyFlash. Best price wins:
     flash price ≤ deal price → flash (Task 57 semantics preserved)
     deal price < flash       → deal (badge + provenance ride along)
   BOGO entitlement resolves independently — it never changes unit price. */
function applyDeals(products, now = new Date()) {
  return Promise.resolve(products).then((items) => {
    if (!Array.isArray(items) || !items.length) return items;
    return activeIndex(now).then((idx) => {
      for (const p of items) {
        const base = +p.price;
        const { priceDeal, price, bogoDeal } = resolveFor(p, idx, now);
        const flashLive = flashSvc.isActive(p.flash, now);
        const flashPrice = flashLive ? +p.flash.price : null;

        let flashWon = false;
        let dealWon = false;
        if (flashLive && price != null) {
          if (flashPrice <= price) flashWon = true; else dealWon = true;
        } else if (flashLive) {
          flashWon = true;
        } else if (price != null) {
          dealWon = true;
        }

        if (flashWon) {
          p._basePrice = base;
          p._baseCompare = p.comparePrice != null ? p.comparePrice : null;
          p.comparePrice = base; // crossed-out original
          p.price = flashPrice;
          p.flashLive = true;
          p.flashEnds = p.flash.endsAt;
          p.dealLive = false; p.dealEnds = null; p.dealBadge = null;
          p.dealSlug = null; p.dealName = null; p.dealType = null;
        } else if (dealWon) {
          p._basePrice = base;
          p._baseCompare = p.comparePrice != null ? p.comparePrice : null;
          p.comparePrice = Math.max(base, +p.comparePrice || 0);
          p.price = price;
          p.dealLive = true;
          p.dealEnds = priceDeal.window.endsAt;
          p.dealBadge = priceDeal.badge || labelFor(priceDeal);
          p.dealSlug = priceDeal.slug;
          p.dealName = priceDeal.name;
          p.dealType = priceDeal.type;
          p.flashLive = false; p.flashEnds = null;
        } else {
          p.dealLive = false; p.dealEnds = null; p.dealBadge = null;
          p.dealSlug = null; p.dealName = null; p.dealType = null;
          p.flashLive = false; p.flashEnds = null;
        }

        /* BOGO badge — same rule as order time: flash took the line → BOGO
           stands down; a unit-deal winner (cheaper price) also stands down */
        const flashTookLine = flashWon;
        const unitDealWon = dealWon && priceDeal.type !== 'bogo';
        if (bogoDeal && !flashTookLine && !unitDealWon) {
          p.dealBogo = {
            buyQty: bogoDeal.bogo.buyQty, getQty: bogoDeal.bogo.getQty,
            slug: bogoDeal.slug, name: bogoDeal.name, badge: bogoDeal.badge || 'BOGO',
          };
        } else {
          p.dealBogo = null;
        }
      }
      return items;
    });
  });
}

/* ── order-time helpers (server-authoritative totals) ─────────────────── */

/* price candidates for one order line — mirrors applyDeals' rule exactly:
     min( base/size price, live flash price, live unit-deal price )
   BOGO resolves as the line's winner only when nothing else took it —
   flash beats BOGO (urgency rule), a cheaper unit deal beats BOGO too. */
function linePriceFor(p, size, idx, now) {
  const sizePrice = (() => {
    if (size && Array.isArray(p.sizePrices)) {
      const hit = p.sizePrices.find((v) => String(v.s) === String(size));
      if (hit && +hit.price > 0) return +hit.price;
    }
    return null;
  })();
  const base = sizePrice != null ? sizePrice : +p.price || 0;
  const flashLive = flashSvc.isActive(p.flash, now);
  const flashPrice = flashLive ? +p.flash.price : null;
  const { priceDeal, price, bogoDeal } = resolveFor(p, idx, now, base);

  let unit = base;
  let winner = null; // { flash: true } | { deal }
  if (flashLive && flashPrice < unit) { unit = flashPrice; winner = { flash: true }; }
  if (price != null && price < unit) { unit = price; winner = { deal: priceDeal }; }
  if (!winner && bogoDeal) winner = { deal: bogoDeal }; // BOGO rides the base price
  return { unit: Math.round(unit * 100) / 100, winner };
}

/* BOGO free units for a paid line: floor(qty / buyQty) * getQty.
   (The order controller expands these into price-0 lines inline — it owns
   the item shape; the service owns only the arithmetic and matching.) */
function bogoFreeQty(deal, qty) {
  const buy = Math.max(1, +deal.bogo?.buyQty || 1);
  const get = Math.max(1, +deal.bogo?.getQty || 1);
  return Math.floor(qty / buy) * get;
}

/* usage attribution — guarded $inc per deal slug, then the index cache is
   dropped so public summaries (usedCount chips, exhaustion guard) reflect
   the order immediately; the next read rebuilds from MongoDB. */
function attributeUsage(slugs) {
  const list = [...new Set((slugs || []).filter(Boolean))];
  if (!list.length) return Promise.resolve();
  return Promise.all(list.map((slug) => Deal.updateOne(
    { slug, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
    { $inc: { usedCount: 1 } },
  ).catch(() => {}))).then(() => invalidate());
}

/* ── validation (async — scope refs and bundle links hit the DB) ───────── */

function fail(status, message) { const e = new Error(message); e.status = status; throw e; }

function checkWindow(body) {
  const w = body.window || {};
  if (!w.startsAt || !w.endsAt) fail(400, 'Deal window needs startsAt and endsAt');
  const s = new Date(w.startsAt); const e = new Date(w.endsAt);
  if (isNaN(s) || isNaN(e)) fail(400, 'Deal window dates are invalid');
  if (e <= s) fail(400, 'Deal window: endsAt must be after startsAt');
  if (e - s > 366 * DAY) fail(400, 'Deal window cannot exceed 366 days');
}

function checkDiscount(body) {
  const t = body.type;
  const spec = TYPES[t];
  if (!spec) fail(400, `Unknown deal type: ${t} — valid: ${Object.keys(TYPES).join(', ')}`);
  const d = body.discount || {};
  if (spec.wrap) {
    if (!body.bundleSlug) fail(400, `Combo deals must link a bundle (bundleSlug)`);
    return;
  }
  if (t === 'bogo') {
    const b = body.bogo || {};
    if (!Number.isInteger(b.buyQty) || b.buyQty < 1 || b.buyQty > 99) fail(400, 'BOGO buyQty must be 1–99');
    if (!Number.isInteger(b.getQty) || b.getQty < 1 || b.getQty > 99) fail(400, 'BOGO getQty must be 1–99');
    return;
  }
  if (d.kind === 'percentage') {
    if (!(d.value > 0 && d.value <= 100)) fail(400, 'Percentage discount must be 1–100');
    if (d.maxOff != null && d.maxOff < 0) fail(400, 'maxOff cannot be negative');
  } else if (d.kind === 'fixed') {
    if (!(d.value > 0)) fail(400, 'Fixed discount must be a positive BDT amount');
    if (d.maxOff != null && d.maxOff > 0) fail(400, 'maxOff applies to percentage deals only');
  } else {
    fail(400, 'discount.kind must be percentage or fixed');
  }
}

function checkScope(body) {
  const spec = TYPES[body.type] || {};
  const s = body.scope || {};
  if (spec.requiresScope && s.kind !== spec.requiresScope) {
    fail(400, `${TYPES[body.type].label} requires scope.kind = '${spec.requiresScope}'`);
  }
  if (!['all', 'categories', 'brands', 'products'].includes(s.kind)) fail(400, 'scope.kind is invalid');
  const cats = (s.categories || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  const brands = (s.brands || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  const prods = (s.products || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  if (s.kind === 'categories' && !cats.length) fail(400, 'Category scope needs at least one category slug');
  if (s.kind === 'brands' && !brands.length) fail(400, 'Brand scope needs at least one brand slug');
  if (s.kind === 'products' && !prods.length) fail(400, 'Product scope needs at least one product slug');
  body.scope = { kind: s.kind, categories: cats, brands, products: prods };
  return body.scope;
}

async function checkRefsExist(body) {
  const s = body.scope || {};
  if (s.categories?.length) {
    const found = await Category.find({ slug: { $in: s.categories } }).select('slug').lean();
    const missing = s.categories.filter((x) => !found.some((f) => f.slug === x));
    if (missing.length) fail(400, `Unknown categories: ${missing.join(', ')}`);
  }
  if (s.brands?.length) {
    const found = await Brand.find({ slug: { $in: s.brands } }).select('slug').lean();
    const missing = s.brands.filter((x) => !found.some((f) => f.slug === x));
    if (missing.length) fail(400, `Unknown brands: ${missing.join(', ')}`);
  }
  if (s.products?.length) {
    const found = await Product.find({ slug: { $in: s.products } }).select('slug').lean();
    const missing = s.products.filter((x) => !found.some((f) => f.slug === x));
    if (missing.length) fail(400, `Unknown products: ${missing.join(', ')}`);
  }
  if (body.bundleSlug) {
    const b = await ComboBundle.findOne({ slug: body.bundleSlug }).select('slug').lean();
    if (!b) fail(400, `Unknown bundle: ${body.bundleSlug}`);
  }
}

/* validate + normalize the admin payload (create & update share this) */
async function validatePayload(body) {
  if (!body.name || !String(body.name).trim()) fail(400, 'Deal name is required');
  if (!body.type) fail(400, 'Deal type is required');
  checkWindow(body);
  checkDiscount(body);
  const scope = checkScope(body);
  await checkRefsExist(body);
  if (body.channels != null) {
    if (!Array.isArray(body.channels)) fail(400, 'channels must be an array');
    const ok = ['home', 'deals', 'pdp', 'cart'];
    const ch = [...new Set(body.channels.map(String))];
    if (!ch.length || ch.some((c) => !ok.includes(c))) fail(400, `channels must be a non-empty subset of ${ok.join(', ')}`);
    body.channels = ch;
  }
  if (body.priority != null && (!Number.isFinite(+body.priority) || +body.priority < 0)) fail(400, 'priority must be ≥ 0');
  if (body.usageLimit != null && (!Number.isInteger(+body.usageLimit) || +body.usageLimit < 0)) fail(400, 'usageLimit must be ≥ 0');
  if (body.minOrder != null && (!Number.isFinite(+body.minOrder) || +body.minOrder < 0)) fail(400, 'minOrder must be ≥ 0');
  if (body.accent && !/^#[0-9a-fA-F]{6}$/.test(body.accent)) fail(400, 'accent must be a #RRGGBB hex color');
  return scope;
}

/* normalize a slug from the name (admin may leave slug empty) */
function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = {
  TYPES,
  activeIndex,
  invalidate,
  applyDeals,
  dealMatches,
  resolveFor,
  linePriceFor,
  bogoFreeQty,
  attributeUsage,
  validatePayload,
  slugify,
  unitPriceForLean,
  labelFor,
};
