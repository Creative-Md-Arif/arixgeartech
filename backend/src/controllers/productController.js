/* ArixGear controller — public product catalog (Task 27: Layer 1 + 2 + 3).
   Layer 1 · hardened list: regex-escaped search (name + shortDesc), NaN-safe
              price bounds, badge/size/inStock/rating/discounted filters,
              rating + trending sorts.
   Layer 2 · facet metadata (filters), search suggest (typeahead), related with
              order-history cross-sell, live stock check; PDP opens count views.
   Layer 3 · card projection + .lean() payloads + short-TTL cache (bumped by
              every admin mutation / review rating recompute). */
const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Category = require('../models/Category'); // v2 — branch-aware category filters
const Order = require('../models/Order');
const cache = require('../services/cache');
const flashSvc = require('../services/flash'); // Task 57 — scheduled flash sale
const dealSvc = require('../services/dealService'); // Phase 8 — centralized deals & promotions
const specsUtil = require('../utils/specs'); // Step 5 — dynamic spec system
const { thumbUrl } = require('../services/storageService'); // Step 6 — image derivatives

/* ---- helpers ---- */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const slugOf = (req) => String(req.params.slug || '').trim().toLowerCase();

/* card projection — list/suggest/related return light docs (description,
   seo stay PDP-only and out of every grid payload).
   sizeStocks + sizePrices + colors ARE included: the PDP renders
   straight from the list payload, so per-variant pricing, per-variant
   availability and color swatches would silently break without them.
   Phase 2 (v2): brand rides every card (populated {name,slug,logo}),
   warranty/variantLabel feed the PDP, categoryPath feeds tree filters.
   Step 5: `specs` joined the card (English specs rendered EMPTY on the PDP
   for feed-cached products before — specsBn was included but specs wasn't,
   an asymmetry flagged in the Step 4 audit) + the dynamic spec system
   fields (specValues/features/featuresBn/hideEmptySpecs). */
const CARD = 'name nameBn slug category categoryPath price comparePrice flash images badge stock sold views rating reviews featured shortDesc shortDescBn sizes sizeStocks sizePrices colors sizeGuide specs specsBn specValues hideEmptySpecs features featuresBn warranty variantLabel variantLabelBn sku brand createdAt';
const BRAND_POP = 'name nameBn slug logo';

/* Step 6 — CARD DECORATION PASS (one lean loop over every grid payload):
   1. images gain `thumb` — a 420px grid derivative (Cloudinary URL transform
      or the sharp-generated local /uploads/thumbs file) so grids stop
      downloading full-size hero shots;
   2. products gain `specBadges` — the category schema's showOnCard fields
      (e.g. RAM/GPU/Storage) surface their value as compact chips on cards.
   Schemas load once per unique category in the batch (products of one grid
   usually share 1–2 categories), and products without a schema simply don't
   get chips. Never throws — decoration must not break a grid. */
async function decorateCards(items) {
  if (!Array.isArray(items) || !items.length) return items;
  try {
    for (const p of items) {
      for (const img of p.images || []) {
        if (img && img.url && !img.thumb) img.thumb = thumbUrl(img.url);
      }
    }
    const cats = [...new Set(items.map((p) => p.category).filter(Boolean))];
    if (!cats.length) return items;
    const catDocs = await Category.find({ slug: { $in: cats } }).select('slug specGroups').lean();
    const schemas = new Map(catDocs.map((c) => [c.slug, specsUtil.normalizeSpecGroups(c.specGroups || [])]));
    for (const p of items) {
      const schema = schemas.get(p.category);
      if (schema && schema.length) {
        p.specBadges = specsUtil.specBadgesFromDoc(schema, p);
        if (!p.specBadges.length) delete p.specBadges; // keep payloads lean
      }
    }
  } catch (_e) { /* decoration is best-effort */ }
  return items;
}

/* sort map — 'featured' keeps the storefront default (carousel picks first) */
function sortFor(sort) {
  switch (sort) {
    case 'price-asc': return { price: 1 };
    case 'price-desc': return { price: -1 };
    case 'newest': return { createdAt: -1 };
    case 'popular': case 'best-selling': return { sold: -1, views: -1 };
    case 'rating': return { rating: -1, reviews: -1 };
    case 'trending': return { views: -1, sold: -1 };
    default: return { featured: -1, sold: -1, createdAt: -1 }; // featured (default)
  }
}

/* ================= LIST ================= */

// GET /api/products — list with filters (server pagination is the primary path)
// ?category=laptops,desktops&search=rtx&sort=featured|price-asc|price-desc|newest|popular|rating|trending
// &minPrice=&maxPrice=&featured=true&badge=sale&size=1TB&inStock=true&rating=4&discounted=true
// &brand=asus,lenovo&brandId=&page=1&limit=12
exports.list = async (req, res, next) => {
  try {
    const { category, search, sort, minPrice, maxPrice, featured, badge, size, inStock, rating, discounted, brand } = req.query;
    const q = { active: true };

    /* Task 43 — `cat` alias: the storefront's own deep links use ?cat=Apparel
       (footer + shop filters), so the API honours both spellings.
       Phase 2 — TREE-AWARE: a category slug matches its whole branch (the
       slug itself + every descendant), so ?cat=laptops returns ultrabooks,
       gaming-laptops and creator-laptops alike. Comma-separated multi works
       too: ?category=laptops,monitors unions the branches. */
    const cat = category || req.query.cat;
    if (cat) {
      const requested = String(cat).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      /* descendants of a requested slug = every category whose path includes it */
      const ancestors = await Category.find({ path: { $in: requested } }).select('slug').lean();
      const leaves = new Set([...requested, ...ancestors.map((a) => a.slug)]);
      // categoryPath covers moved/deleted category branches and legacy product
      // labels whose category string no longer matches an active tree leaf.
      q.$and = [...(q.$and || []), { $or: [
        { category: { $in: [...leaves] } },
        { categoryPath: { $in: requested } },
      ] }];
    }
    /* Phase 2 — brand filter: comma-separated brand SLUGS resolved to ids */
    if (brand && String(brand).trim()) {
      const slugs = String(brand).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const ids = await Brand.find({ slug: { $in: slugs } }).select('_id').lean();
      q.brand = { $in: ids.map((b) => b._id) };
    }
    /* audit fix — brandId arrives through the extended query parser, so
       "?brandId[$ne]=x" used to splice a Mongo operator object straight into
       the filter. Accept a plain 24-hex ObjectId only. */
    if (req.query.brandId && /^[a-f\d]{24}$/i.test(String(req.query.brandId))) {
      q.brand = String(req.query.brandId);
    }
    if (featured === 'true') q.featured = true;
    if (badge) q.badge = String(badge).trim().toLowerCase();
    if (size) q.sizes = String(size).trim(); // array field → matches docs containing this size
    if (inStock === 'true') q.stock = { ...q.stock, $gt: 0 };
    if (rating !== undefined && rating !== '') {
      const r = num(rating);
      if (r === null || r < 0 || r > 5) return res.status(400).json({ message: 'rating must be a number between 0 and 5' });
      q.rating = { $gte: r };
    }
    if (discounted === 'true') q.comparePrice = { $ne: null, $gt: 0 };

    /* Step 5 — DYNAMIC SPEC FILTERS. Any query param shaped spec_<fieldKey>=
       v1,v2 (or spec_<fieldKey>_min / _max for number fields) filters against
       the requested category's schema — filterable fields only. Legacy flat
       `specs` rows match too (label variants), so CSV-imported products still
       respond before their migration. Unknown keys are ignored, never 500s. */
    const specCat = cat || null;
    let specSchema = null;
    {
      const rawSpecParams = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (/^spec_[a-z0-9_-]+(_min|_max)?$/i.test(k)) rawSpecParams[k] = v;
      }
      if (Object.keys(rawSpecParams).length) {
        if (specCat) {
          const requestedSlugs = String(specCat).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
          const catDoc = await Category.findOne({ slug: requestedSlugs[0] }).select('specGroups').lean();
          specSchema = specsUtil.normalizeSpecGroups((catDoc && catDoc.specGroups) || []);
          const specQ = specsUtil.specQueryFromParams(specSchema, rawSpecParams);
          if (specQ && Array.isArray(specQ.$and) && specQ.$and.length) {
            q.$and = [...(q.$and || []), ...specQ.$and]; // $and composes safely with the search $or (flat clauses)
          }
        }
      }
    }

    /* Layer 1: search escapes regex metacharacters (user input like "(a+)+$" is
       literal text now, not a regex) and ALSO matches shortDesc via $or */
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRe(String(search).trim()), 'i');
      q.$or = [{ name: rx }, { shortDesc: rx }];
    }

    /* Layer 1: NaN guard — "?minPrice=abc" is ignored instead of poisoning the
       query with NaN (MongoDB would reject it as an invalid numeric value) */
    if (minPrice || maxPrice) {
      q.price = {};
      const lo = num(minPrice), hi = num(maxPrice);
      if (minPrice && lo === null) return res.status(400).json({ message: 'minPrice must be a number' });
      if (maxPrice && hi === null) return res.status(400).json({ message: 'maxPrice must be a number' });
      if (lo !== null) q.price.$gte = lo;
      if (hi !== null) q.price.$lte = hi;
    }

    const sortQ = sortFor(sort);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(60, parseInt(req.query.limit) || 12);

    /* cache key from the RAW query values — never from the built query object:
       RegExp instances JSON.stringify to {} which would collapse every search
       into one shared (stale) cache entry (caught by Task 27 QA).
       Task 43: the key uses the RESOLVED cat (category || cat alias) — using
       the destructured `category` alone made ?cat= requests share (and poison)
       the unfiltered cache entry. Phase 2: brand joins the key. */
    const key = 'plist:' + JSON.stringify([cat, brand, search, sort, minPrice, maxPrice, featured, badge, size, inStock, rating, discounted, page, limit, Object.fromEntries(Object.entries(req.query).filter(([k]) => /^spec_/i.test(k)))]);
    const cached = cache.get(key);
    if (cached) return res.json(cached);

    const [items, total] = await Promise.all([
      Product.find(q).select(CARD).populate('brand', BRAND_POP).sort(sortQ).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(q),
    ]);
    await dealSvc.applyDeals(items); // Phase 8 — central pricing pass (flash + deals, best price wins)
    await decorateCards(items); // Step 6 — thumbs + showOnCard spec chips

    const out = { items, total, page, pages: Math.ceil(total / limit) };
    cache.set(key, out);
    res.json(out);
  } catch (e) { next(e); }
};

/* ================= DETAIL ================= */

// GET /api/products/:slug — full product + related; every open counts a view
exports.bySlug = async (req, res, next) => {
  try {
    const p = await Product.findOne({ slug: slugOf(req), active: true }).populate('brand', BRAND_POP);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    /* fire-and-forget view counter — powers the trending sort + the dashboard
       "Most Viewed" widget; never blocks or fails the response */
    Product.updateOne({ _id: p._id }, { $inc: { views: 1 } }).catch(() => {});
    /* related: same leaf first, then siblings from the same root branch
       (a lone gaming laptop still gets a full "complete the kit" row) */
    let related = await Product.find({ category: p.category, _id: { $ne: p._id }, active: true })
      .select(CARD).populate('brand', BRAND_POP).limit(4).lean();
    if (related.length < 4 && Array.isArray(p.categoryPath) && p.categoryPath.length > 0) {
      const exclude = [p._id, ...related.map((r) => r._id)];
      const fill = await Product.find({ categoryPath: p.categoryPath[0], _id: { $nin: exclude }, active: true })
        .select(CARD).populate('brand', BRAND_POP).limit(4 - related.length).lean();
      related = [...related, ...fill];
    }
    await dealSvc.applyDeals(related);
    await decorateCards(related); // Step 6 — thumbs + badges on the related row
    const product = p.toObject();
    await dealSvc.applyDeals([product]); // Phase 8 — PDP shows the winning price (flash or deal)
    /* Step 5 — the PDP renders GROUPED specs from the category's live schema;
       the resolved schema rides the response (null → legacy flat table). */
    const catDoc = await Category.findOne({ slug: p.category }).select('specGroups hideEmptyFields').lean();
    const specSchema = catDoc ? specsUtil.normalizeSpecGroups(catDoc.specGroups || []) : null;
    res.json({ product, related, specSchema, hideEmptyFields: catDoc ? catDoc.hideEmptyFields !== false : true });
  } catch (e) { next(e); }
};

/* ================= FLASH SALE (Task 57) ================= */

// GET /api/products/flash — products whose flash window is live right now,
// soonest-ending first (urgency order). Prices already swapped to flash price.
exports.flashList = async (_req, res, next) => {
  try {
    const now = new Date();
    const items = await Product.find(flashSvc.liveQuery(now))
      .select(CARD).sort({ 'flash.endsAt': 1, sold: -1 }).limit(48).lean();
    await dealSvc.applyDeals(items); // Phase 8 — a live deal may beat the flash price
    await decorateCards(items); // Step 6 — thumbs + badges on the flash rail
    res.json({ items, total: items.length, serverNow: now });
  } catch (e) { next(e); }
};

/* ================= LAYER 2 ENDPOINTS ================= */

// GET /api/products/filters — facet metadata for dynamic filter UIs
// (categories/sizes/badges/colors with counts + live price bounds).
// Step 5 — ?category=<slug> scopes the payload and adds `specs`: dynamic
// facets generated from that category's FILTERABLE fields (select/multi/
// boolean → {value,count} options, number → {min,max} range). Unscoped calls
// keep the global cache; scoped calls cache per category slug.
exports.filters = async (req, res, next) => {
  try {
    const catSlug = String(req.query.category || req.query.cat || '').trim().toLowerCase();
    const cacheKey = catSlug ? 'pfilters:' + catSlug : 'pfilters';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const requestedCats = catSlug ? catSlug.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const branchCats = requestedCats.length
      ? await Category.find({ path: { $in: requestedCats } }).select('slug specGroups').lean()
      : [];
    const scopedCats = [...new Set([...requestedCats, ...branchCats.map((c) => c.slug)])];

    const [cats, sizeRows, priceAgg, badgeRows, colorRows, brandRows] = await Promise.all([
      Product.aggregate([
        { $match: { active: true } },
        { $group: { _id: '$category', n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Product.aggregate([
        { $match: { active: true } },
        { $unwind: '$sizes' },
        { $group: { _id: '$sizes', n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 24 },
      ]),
      Product.aggregate([
        { $match: { active: true } },
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
      ]),
      Product.aggregate([
        { $match: { active: true, badge: { $ne: 'none' } } },
        { $group: { _id: '$badge', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
      Product.aggregate([
        { $match: { active: true } },
        { $unwind: '$colors' },
        { $group: { _id: { name: '$colors.name', hex: '$colors.hex' }, n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 24 },
      ]),
      /* Phase 2 — brand facet: active products grouped by brand, names resolved */
      Product.aggregate([
        { $match: { active: true, brand: { $ne: null }, ...(catSlug ? { $or: [
          { category: { $in: scopedCats } },
          { categoryPath: { $in: requestedCats } },
        ] } : {}) } },
        { $group: { _id: '$brand', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
    ]);

    const brandIds = brandRows.map((b) => b._id);
    const brandDocs = brandIds.length ? await Brand.find({ _id: { $in: brandIds }, active: true }).select('name nameBn slug logo').lean() : [];
    const bmap = Object.fromEntries(brandDocs.map((b) => [String(b._id), b]));

    const out = {
      categories: cats.map((c) => ({ slug: c._id, count: c.n })),
      sizes: sizeRows.map((s) => ({ s: s._id, count: s.n })),
      badges: badgeRows.map((b) => ({ key: b._id, count: b.n })),
      colors: colorRows.map((c) => ({ name: c._id.name, hex: c._id.hex, count: c.n })),
      brands: brandRows.filter((b) => bmap[String(b._id)]).map((b) => ({ ...bmap[String(b._id)], count: b.n })),
      price: priceAgg[0] ? { min: priceAgg[0].min, max: priceAgg[0].max } : { min: 0, max: 0 },
    };

    /* Step 5 — dynamic spec facets for the requested category branch. The
       union of filterable fields across the branch's schema is used; counts
       run over the branch's active products in one lean pass (both the
       dynamic specValues shape and the legacy flat rows are counted). */
    if (catSlug) {
      const leaves = new Set(scopedCats);
      /* merged schema: same field key from different leaf categories dedupes
         (first definition wins), so a shared field shows ONE facet */
      const merged = [];
      for (const c of branchCats) {
        for (const g of specsUtil.normalizeSpecGroups(c.specGroups || [])) {
          let target = merged.find((x) => x.key === g.key);
          if (!target) { target = { ...g, fields: [] }; merged.push(target); }
          for (const f of g.fields || []) {
            if (!target.fields.some((x) => x.key === f.key)) target.fields.push(f);
          }
        }
      }
      const schema = specsUtil.normalizeSpecGroups(merged);
      if (schema.length) {
        const docs = await Product.find({ active: true, $or: [
          { category: { $in: [...leaves] } },
          { categoryPath: { $in: requestedCats } },
        ] })
          .select('specValues specs').lean();
        out.specs = specsUtil.specFacetsFromDocs(schema, docs);
        out.specSchema = schema;
      } else {
        out.specs = [];
        out.specSchema = null;
      }
    }

    cache.set(cacheKey, out);
    res.json(out);
  } catch (e) { next(e); }
};

// GET /api/products/search/suggest?q=whe&limit=8 — typeahead (name + shortDesc
// + category), best-sellers first; runs against the WHOLE catalog, not just
// the 48-product storefront mirror.
// Step 7 — SCHEMA-AWARE SEARCH (#2): spec VALUES join the typeahead. "16GB"
// now surfaces products whose RAM spec says "16 GB" even when the name lacks
// the token, "RTX 4060" finds the graphics spec — and every row reports the
// spec chip that matched (specHit) so the dropdown can render "RAM · 16GB".
// The legacy flat rows (always strings) carry the DB match; specValues scalars
// and multiselect arrays match too. Field keys resolve to labels through the
// categories' schemas (one bulk load, cached in-process for 60s).
let _specLabelCache = null; // { at, bySlug: Map(fieldKey → {label,labelBn,icon}) }
async function specLabelMap(slugs) {
  const now = Date.now();
  if (!_specLabelCache || now - _specLabelCache.at > 60_000) _specLabelCache = { at: now, bySlug: new Map() };
  const cache = _specLabelCache.bySlug;
  const map = new Map();
  const missing = [];
  for (const s of slugs) {
    if (cache.has(s)) { for (const [k, v] of cache.get(s)) map.set(k, v); }
    else missing.push(s);
  }
  if (missing.length) {
    const cats = await Category.find({ slug: { $in: missing } }).select('slug specGroups').lean();
    for (const c of cats) {
      const local = new Map();
      for (const g of c.specGroups || []) {
        for (const f of g.fields || []) local.set(f.key, { label: f.label, labelBn: f.labelBn || '', icon: f.icon || '' });
      }
      cache.set(c.slug, local);
      for (const [k, v] of local) map.set(k, v);
    }
  }
  return map;
}

exports.suggest = async (req, res, next) => {
  try {
    const qStr = String(req.query.q || '').trim();
    if (qStr.length < 2) return res.json({ items: [], q: qStr, specMatches: [] });
    const limit = Math.min(12, Math.max(1, parseInt(req.query.limit) || 8));
    const rx = new RegExp(escapeRe(qStr), 'i');
    const items = await Product.find({ active: true, $or: [
      { name: rx }, { shortDesc: rx }, { category: rx },
      /* Step 7 — spec-value match: flat rows are always strings; specValues.v
         can be string, number (string-form match via JS pass below), boolean
         or a multiselect array */
      { specs: { $elemMatch: { v: rx } } },
      { specValues: { $elemMatch: { $or: [{ v: rx }, { v: { $elemMatch: { $in: [rx] } } }] } } },
    ] })
      .select(CARD).populate('brand', BRAND_POP).sort({ sold: -1, views: -1 }).limit(limit).lean();
    await dealSvc.applyDeals(items); // Phase 8 — typeahead shows the winning price too
    await decorateCards(items); // Step 6 — thumbs in the typeahead row

    /* label the spec hits per row + aggregate the top matches for the dropdown */
    const specMatches = [];
    const seen = new Set();
    const labelMap = await specLabelMap([...new Set(items.map((i) => i.category).filter(Boolean))]);
    for (const it of items) {
      let hit = null;
      const sv = (it.specValues || []).find((s) =>
        rx.test(String(s.v ?? '')) || (Array.isArray(s.v) && s.v.some((x) => rx.test(String(x)))));
      if (sv) {
        const meta = labelMap.get(sv.k) || {};
        hit = { k: sv.k, label: meta.label || sv.k, labelBn: meta.labelBn || '', icon: meta.icon || '',
          v: Array.isArray(sv.v) ? sv.v.map(String).join(', ') : specsUtil.valueToString(sv.v) };
      } else {
        const leg = (it.specs || []).find((s) => rx.test(String(s.v || '')));
        if (leg) hit = { k: leg.k, label: leg.k, labelBn: '', icon: '', v: String(leg.v || '') };
      }
      if (!hit) continue;
      it.specHit = hit;
      const dedupe = hit.label + '|' + hit.v;
      if (!seen.has(dedupe)) { seen.add(dedupe); specMatches.push({ ...hit, product: { slug: it.slug, name: it.name } }); }
    }
    res.json({ items, q: qStr, specMatches: specMatches.slice(0, 8) });
  } catch (e) { next(e); }
};

// GET /api/products/:slug/related?mode=auto|crosssell|category
// auto (default): order-history "frequently bought together" leads, same
//                 category fills the rest up to 4
// crosssell: only co-purchased items (may be fewer) · category: legacy behaviour
exports.related = async (req, res, next) => {
  try {
    const mode = ['auto', 'crosssell', 'category'].includes(req.query.mode) ? req.query.mode : 'auto';
    const p = await Product.findOne({ slug: slugOf(req), active: true }).select('_id category').lean();
    if (!p) return res.status(404).json({ message: 'Product not found' });

    let cross = [];
    if (mode !== 'category') {
      const rows = await Order.aggregate([
        { $match: { 'items.product': p._id, status: { $nin: ['cancelled', 'payment-rejected'] } } },
        { $project: { items: { $filter: { input: '$items', as: 'it', cond: { $ne: ['$$it.product', p._id] } } } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product', n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 4 },
      ]);
      if (rows.length) {
        const docs = await Product.find({ _id: { $in: rows.map((r) => r._id) }, active: true }).select(CARD).lean();
        const byId = Object.fromEntries(docs.map((d) => [String(d._id), d]));
        cross = rows.map((r) => byId[String(r._id)]).filter(Boolean);
      }
    }

    let items = cross;
    if (mode === 'auto' && cross.length < 4) {
      const exclude = [...cross.map((c) => c._id), p._id];
      const fill = await Product.find({ category: p.category, _id: { $nin: exclude }, active: true })
        .select(CARD).limit(4 - cross.length).lean();
      items = [...cross, ...fill];
    }
    res.json({ items, crossSell: cross.length, mode });
  } catch (e) { next(e); }
};

// GET /api/products/:slug/stock?size=M — live availability for cart/checkout
// verification (per-sizeStocks when present, else general stock)
exports.stock = async (req, res, next) => {
  try {
    const p = await Product.findOne({ slug: slugOf(req), active: true }).select('name slug stock sizeStocks sizes').lean();
    if (!p) return res.status(404).json({ message: 'Product not found' });

    const size = req.query.size ? String(req.query.size).trim() : '';
    const sizeStocks = p.sizeStocks && p.sizeStocks.length
      ? p.sizeStocks.map((x) => ({ s: x.s, stock: Math.max(0, +x.stock || 0) }))
      : null;

    let available;
    if (size && sizeStocks) {
      const hit = sizeStocks.find((x) => x.s.toLowerCase() === size.toLowerCase());
      available = hit ? hit.stock : null; // null = unknown size for this product
    } else if (sizeStocks) {
      available = sizeStocks.reduce((a, x) => a + x.stock, 0);
    } else {
      available = Math.max(0, +p.stock || 0);
    }

    res.json({
      product: p.slug,
      name: p.name,
      size: size || null,
      available,
      inStock: available === null ? false : available > 0,
      sizeStocks,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) { next(e); }
};
