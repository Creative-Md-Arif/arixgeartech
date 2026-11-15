/* Phase 8 — Centralized Deals & Promotions controller.

   Thin on purpose: all money math, scope matching, scheduling and
   validation live in services/dealService.js so ANY new campaign type is
   registry entry + data — never a new controller. Public reads serve the
   storefront deals hub; admin handlers serve the Deals Manager module
   (permission module key: 'deals'). */

const Deal = require('../models/Deal');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const ComboBundle = require('../models/ComboBundle');
const dealSvc = require('../services/dealService');
const flashSvc = require('../services/flash');

const CARD = 'name nameBn slug category categoryPath price comparePrice flash images badge stock sold views rating reviews featured shortDesc shortDescBn sizes sizeStocks sizeColors colors sizePrices warranty variantLabel variantLabelBn sku brand createdAt';

/* ─────────────────────────────── PUBLIC ───────────────────────────────── */

/* GET /api/deals?type=&featured=&channel= — live deals only (drafts,
   pauses, scheduled and expired windows are invisible by design) */
exports.listLive = async (req, res, next) => {
  try {
    const now = new Date();
    const idx = await dealSvc.activeIndex(now);
    let items = idx.deals.filter((d) => Deal.statusOf(d, now) === 'active');

    const { type, featured, channel } = req.query;
    if (type) items = items.filter((d) => d.type === String(type));
    if (featured === '1' || featured === 'true') items = items.filter((d) => d.featured);
    if (channel) items = items.filter((d) => (d.channels || []).includes(String(channel)));
    items = items.map((d) => ({
      ...new Deal(d).summary(now),
      endsIn: Math.max(0, +new Date(d.window.endsAt) - now),
    }));
    res.json({ total: items.length, items });
  } catch (e) { next(e); }
};

/* GET /api/deals/:slug — one live deal + its product grid (scope resolved
   server-side; every card already carries the deal price) */
exports.getBySlug = async (req, res, next) => {
  try {
    const now = new Date();
    const idx = await dealSvc.activeIndex(now);
    const slug = String(req.params.slug || '').toLowerCase();
    const d = idx.deals.find((x) => x.slug === slug && Deal.statusOf(x, now) === 'active');
    if (!d) return res.status(404).json({ message: 'Deal not found or not live' });

    const query = scopeQuery(d, idx);
    const items = await Product.find({ active: true, ...query })
      .select(CARD).sort({ sold: -1, rating: -1 }).limit(48).lean();
    await dealSvc.applyDeals(items, now);

    res.json({
      deal: { ...new Deal(d).summary(now), endsIn: Math.max(0, +new Date(d.window.endsAt) - now) },
      total: items.length,
      items,
    });
  } catch (e) { next(e); }
};

/* scope → product query (branch-aware categories via categoryPath) */
function scopeQuery(d, idx) {
  const s = d.scope || {};
  if (s.kind === 'all') return {};
  if (s.kind === 'categories') {
    const wanted = (s.categories || []).map((c) => String(c).toLowerCase());
    return { $or: [{ category: { $in: wanted } }, { categoryPath: { $in: wanted } }] };
  }
  if (s.kind === 'brands') {
    const ids = (s.brands || []).map((slug) => idx.brandIdBySlug[slug]).filter(Boolean);
    return ids.length ? { brand: { $in: ids } } : { _id: null };
  }
  if (s.kind === 'products') return { slug: { $in: (s.products || []).map(String) } };
  return {};
}

/* ──────────────────────────────── ADMIN ───────────────────────────────── */

/* GET /api/admin/deals?type=&status=&q=&page=&limit= — full list with
   computed status chips; admins see everything (drafts included) */
exports.adminList = async (req, res, next) => {
  try {
    const now = new Date();
    const page = Math.max(1, +req.query.page || 1);
    const limit = Math.min(100, Math.max(1, +req.query.limit || 50));
    const q = {};
    if (req.query.type) q.type = String(req.query.type);
    if (req.query.published === 'true') q.published = true;
    if (req.query.published === 'false') q.published = false;
    if (req.query.active === 'true') q.active = true;
    if (req.query.active === 'false') q.active = false;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ name: rx }, { slug: rx }, { badge: rx }];
    }
    const [docs, total] = await Promise.all([
      Deal.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Deal.countDocuments(q),
    ]);
    const items = docs.map((d) => ({
      ...new Deal(d).summary(now),
      live: new Deal(d).isLive(now),
      usedPct: d.usageLimit > 0 ? Math.round((d.usedCount / d.usageLimit) * 100) : null,
    }));
    res.json({ total, page, pages: Math.ceil(total / limit) || 1, items });
  } catch (e) { next(e); }
};

/* GET /api/admin/deals/meta — the ONE call powering the admin form:
   type registry (drives the form fields), category/brand/product/bundle
   pickers, and the scope-kind contract per type. New deal type in TYPES →
   the form renders it with zero admin-side changes. */
exports.adminMeta = async (_req, res, next) => {
  try {
    const [cats, brands, prods, bundles] = await Promise.all([
      Category.find({}).select('slug name parent path').sort({ path: 1, slug: 1 }).lean(),
      Brand.find({}).select('slug name').sort({ name: 1 }).lean(),
      Product.find({ active: true }).select('slug name price stock').sort({ name: 1 }).limit(200).lean(),
      ComboBundle.find({ active: true }).select('slug title bundlePrice').sort({ sortOrder: 1 }).lean(),
    ]);
    res.json({
      types: Object.entries(dealSvc.TYPES).map(([key, v]) => ({ key, ...v })),
      categories: cats.map((c) => ({ slug: c.slug, name: c.name, parent: c.parent || null, path: c.path || [] })),
      brands: brands.map((b) => ({ slug: b.slug, name: b.name })),
      products: prods.map((p) => ({ slug: p.slug, name: p.name, price: p.price, stock: p.stock })),
      bundles: bundles.map((b) => ({ slug: b.slug, title: b.title, bundlePrice: b.bundlePrice })),
      channels: ['home', 'deals', 'pdp', 'cart'],
    });
  } catch (e) { next(e); }
};

/* GET /api/admin/deals/stats — dashboard strip */
exports.adminStats = async (_req, res, next) => {
  try {
    const now = new Date();
    const docs = await Deal.find({}).lean();
    const byStatus = { draft: 0, paused: 0, scheduled: 0, active: 0, expired: 0 };
    const byType = {};
    for (const d of docs) {
      byStatus[Deal.statusOf(d, now)] = (byStatus[Deal.statusOf(d, now)] || 0) + 1;
      byType[d.type] = (byType[d.type] || 0) + 1;
    }
    res.json({ total: docs.length, byStatus, byType });
  } catch (e) { next(e); }
};

exports.adminGet = async (req, res, next) => {
  try {
    const now = new Date();
    const d = await Deal.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ message: 'Deal not found' });
    res.json({ deal: { ...new Deal(d).summary(now), live: new Deal(d).isLive(now) } });
  } catch (e) { next(e); }
};

/* POST /api/admin/deals — create (draft by default; publish to schedule) */
exports.adminCreate = async (req, res, next) => {
  try {
    const body = { ...req.body };
    const scope = await dealSvc.validatePayload(body);
    const slug = dealSvc.slugify(body.slug || body.name);
    if (!slug) return res.status(400).json({ message: 'Could not derive a slug — name it with letters/digits' });
    const dup = await Deal.findOne({ slug });
    if (dup) return res.status(409).json({ message: `Deal slug "${slug}" already exists` });
    const doc = await Deal.create({
      name: String(body.name).trim(),
      nameBn: String(body.nameBn || '').trim(),
      slug,
      type: body.type,
      description: String(body.description || '').trim(),
      badge: String(body.badge || '').trim().slice(0, 24),
      banner: String(body.banner || ''),
      accent: body.accent || '#7C5CFF',
      discount: {
        kind: body.discount?.kind === 'fixed' ? 'fixed' : 'percentage',
        value: +body.discount?.value || 0,
        maxOff: +body.discount?.maxOff || 0,
      },
      bogo: { buyQty: +body.bogo?.buyQty || 1, getQty: +body.bogo?.getQty || 1 },
      bundleSlug: String(body.bundleSlug || '').toLowerCase(),
      scope,
      window: {
        startsAt: new Date(body.window.startsAt),
        endsAt: new Date(body.window.endsAt),
      },
      published: !!body.published,
      active: body.active !== false,
      priority: body.priority != null ? +body.priority : 100,
      featured: !!body.featured,
      channels: body.channels || ['deals'],
      usageLimit: +body.usageLimit || 0,
      minOrder: +body.minOrder || 0,
    });
    dealSvc.invalidate();
    res.status(201).json({ deal: doc.summary(), message: 'Deal created' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    if (e.code === 11000) return res.status(409).json({ message: 'Deal slug already exists' });
    next(e);
  }
};

/* PUT /api/admin/deals/:id — full edit (same validation as create) */
exports.adminUpdate = async (req, res, next) => {
  try {
    const existing = await Deal.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Deal not found' });
    const body = { ...req.body };
    await dealSvc.validatePayload(body);
    if (body.slug || body.name) {
      const slug = dealSvc.slugify(body.slug || body.name);
      if (slug && slug !== existing.slug) {
        const dup = await Deal.findOne({ slug, _id: { $ne: existing._id } });
        if (dup) return res.status(409).json({ message: `Deal slug "${slug}" already exists` });
        existing.slug = slug;
      }
    }
    existing.set({
      name: body.name != null ? String(body.name).trim() : existing.name,
      nameBn: body.nameBn != null ? String(body.nameBn).trim() : existing.nameBn,
      type: body.type || existing.type,
      description: body.description != null ? String(body.description).trim() : existing.description,
      badge: body.badge != null ? String(body.badge).trim().slice(0, 24) : existing.badge,
      banner: body.banner != null ? String(body.banner) : existing.banner,
      accent: body.accent || existing.accent,
      discount: body.discount ? {
        kind: body.discount.kind === 'fixed' ? 'fixed' : 'percentage',
        value: +body.discount.value || 0,
        maxOff: +body.discount.maxOff || 0,
      } : existing.discount.toObject(),
      bogo: body.bogo ? { buyQty: +body.bogo.buyQty || 1, getQty: +body.bogo.getQty || 1 } : existing.bogo.toObject(),
      bundleSlug: body.bundleSlug != null ? String(body.bundleSlug).toLowerCase() : existing.bundleSlug,
      scope: body.scope || existing.scope.toObject(),
      window: body.window ? {
        startsAt: new Date(body.window.startsAt),
        endsAt: new Date(body.window.endsAt),
      } : existing.window.toObject(),
      priority: body.priority != null ? +body.priority : existing.priority,
      featured: body.featured != null ? !!body.featured : existing.featured,
      channels: body.channels || existing.channels,
      usageLimit: body.usageLimit != null ? +body.usageLimit : existing.usageLimit,
      minOrder: body.minOrder != null ? +body.minOrder : existing.minOrder,
    });
    if (body.published != null) existing.published = !!body.published;
    if (body.active != null) existing.active = !!body.active;
    await existing.save();
    dealSvc.invalidate();
    res.json({ deal: existing.summary(), message: 'Deal saved' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    if (e.code === 11000) return res.status(409).json({ message: 'Deal slug already exists' });
    next(e);
  }
};

/* PATCH /api/admin/deals/:id/state — the two human switches (draft/publish,
   pause/resume) without touching the payload */
exports.adminSetState = async (req, res, next) => {
  try {
    const d = await Deal.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Deal not found' });
    const { published, active } = req.body || {};
    if (published != null) d.published = !!published;
    if (active != null) d.active = !!active;
    await d.save();
    dealSvc.invalidate();
    res.json({ deal: d.summary(), message: `Deal ${d.published ? (d.active ? 'running' : 'paused') : 'draft'}` });
  } catch (e) { next(e); }
};

exports.adminRemove = async (req, res, next) => {
  try {
    const d = await Deal.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ message: 'Deal not found' });
    dealSvc.invalidate();
    res.json({ message: `Deal "${d.name}" deleted` });
  } catch (e) { next(e); }
};
