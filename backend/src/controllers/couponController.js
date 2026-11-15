const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const Product = require('../models/Product');

/* ================================================================
   Coupon API — Task 29 (Layer 1+2+3)
   L1  hardened create/update validation · brute-force-safe public
       validate w/ enriched response · race-safe consumption lives
       in placeOrder · public active-coupons endpoint
   L2  per-user usage limits · first-order-only coupons · category/
       product scoping (eligible-line discount base) · per-coupon
       analytics
   L3  bulk campaign-code generation · CSV export · global coupon
       intelligence (savings, top, unused, expiring)
   ================================================================ */

const CODE_RE = /^[A-Z0-9]([A-Z0-9-]{1,18})[A-Z0-9]$/; // letters/digits, inner hyphens (campaign codes)
const AMBIGUOUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // readable random codes (no O/0/I/1)

/* ---------- shared body validation (create + update) ---------- */
function parseCouponBody(body = {}, { partial = false } = {}) {
  const errors = [];
  const out = {};

  const has = (f) => body[f] !== undefined;

  if (has('code') || !partial) {
    const code = String(body.code || '').toUpperCase().trim();
    if (!code) errors.push('code is required');
    else if (!CODE_RE.test(code)) errors.push('Code must be 3–20 chars: letters/digits, inner hyphens allowed');
    else out.code = code;
  }
  if (has('type') || !partial) {
    const type = String(body.type || 'percent');
    if (!['percent', 'fixed'].includes(type)) errors.push('type must be percent or fixed');
    else out.type = type;
  }
  if (has('value') || !partial) {
    const v = Number(body.value);
    if (!Number.isFinite(v) || v <= 0) errors.push('value must be a positive number');
    else if ((out.type || 'percent') === 'percent' && v > 100) errors.push('percent value cannot exceed 100');
    else if (out.type === 'fixed' && v > 1000000) errors.push('fixed value looks wrong (> ৳10,00,000)');
    else out.value = v;
  }
  if (has('minOrder')) {
    const v = Number(body.minOrder);
    if (!Number.isFinite(v) || v < 0) errors.push('minOrder must be ≥ 0');
    else out.minOrder = Math.round(v * 100) / 100;
  }
  if (has('maxUses')) {
    const v = Number(body.maxUses);
    if (!Number.isInteger(v) || v < 0) errors.push('maxUses must be an integer ≥ 0 (0 = unlimited)');
    else out.maxUses = v;
  }
  if (has('perUser')) {
    const v = Number(body.perUser);
    if (!Number.isInteger(v) || v < 0) errors.push('perUser must be an integer ≥ 0 (0 = unlimited)');
    else out.perUser = v;
  }
  if (has('firstOrderOnly')) out.firstOrderOnly = !!body.firstOrderOnly;
  if (has('public')) out.public = !!body.public;
  /* Phase 4 (4.1) — coupon↔flash stacking switch (default false: flash prices
     are already deals; coupons skip those lines unless explicitly stacked) */
  if (has('stackWithFlash')) out.stackWithFlash = !!body.stackWithFlash;
  if (has('description')) out.description = String(body.description || '').trim().slice(0, 140);
  if (has('descriptionBn')) out.descriptionBn = String(body.descriptionBn || '').trim().slice(0, 140); // Task 58

  if (has('expiresAt')) {
    if (body.expiresAt === null || body.expiresAt === '') out.expiresAt = null;
    else {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) errors.push('expiresAt is not a valid date');
      else out.expiresAt = d;
    }
  } else if (!partial) {
    out.expiresAt = null;
  }

  if (has('appliesTo') || !partial) {
    const a = body.appliesTo || {};
    const mode = String(a.mode || 'all');
    if (!['all', 'categories', 'products'].includes(mode)) {
      errors.push('appliesTo.mode must be all | categories | products');
    } else {
      const cats = (Array.isArray(a.categories) ? a.categories : String(a.categories || '').split(','))
        .map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 20);
      const prods = (Array.isArray(a.products) ? a.products : String(a.products || '').split(','))
        .map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 50);
      if (mode === 'categories' && !cats.length) errors.push('appliesTo.categories needs at least one category');
      if (mode === 'products' && !prods.length) errors.push('appliesTo.products needs at least one product slug');
      out.appliesTo = { mode, categories: cats, products: prods };
    }
  }

  return { errors, out };
}

/* customer identity for per-user / first-order rules — account id and/or the
   phone number used at checkout (covers guests + guest-order adoption) */
function identityFilter(user, phone) {
  const or = [];
  if (user) or.push({ user: user._id || user });
  if (phone) or.push({ 'customer.phone': String(phone).trim() });
  return or.length ? { $or: or } : null;
}

/* ================= PUBLIC ================= */

// POST /api/coupons/validate  {code, subtotal, items?:[{slug, lineTotal}]}
// Enriched response drives the checkout UI (final total, usage left, unlock hint).
// Scoped coupons MUST receive items — the eligible-line base is computed here.
exports.validate = async (req, res, next) => {
  try {
    const { code, subtotal, items } = req.body || {};
    const sub = Number(subtotal) || 0;
    if (!code) return res.status(400).json({ message: 'Coupon code is required' });

    const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
    if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });

    /* cart lines for scoped coupons — categories are filled server-side */
    let lines = null;
    if (Array.isArray(items) && items.length) {
      lines = items
        .filter((i) => i && i.slug)
        .map((i) => ({ slug: String(i.slug).toLowerCase(), lineTotal: Number(i.lineTotal) || 0, category: '' }));
      if (lines.length) {
        const prods = await Product.find({ slug: { $in: lines.map((l) => l.slug) } }).select('slug category');
        const catBySlug = Object.fromEntries(prods.map((p) => [p.slug, p.category]));
        for (const l of lines) l.category = catBySlug[l.slug] || '';
      }
    }

    const check = coupon.isValidFor(sub, lines);
    if (!check.ok) return res.status(400).json({ message: check.msg });

    const discount = coupon.discountFor(sub, lines);

    /* per-user limit — authoritative enforcement is placeOrder; this is UX */
    let perUserLeft = null;
    const ident = identityFilter(req.user);
    if (coupon.perUser > 0 && ident) {
      const used = await Order.countDocuments({
        'totals.couponCode': coupon.code, status: { $ne: 'cancelled' }, ...ident,
      });
      perUserLeft = Math.max(0, coupon.perUser - used);
      if (perUserLeft === 0) return res.status(400).json({ message: 'You have already used this coupon' });
    }
    if (coupon.firstOrderOnly && ident) {
      const prior = await Order.countDocuments({ status: { $ne: 'cancelled' }, ...ident });
      if (prior > 0) return res.status(400).json({ message: 'This coupon is valid on your first order only' });
    }

    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      finalTotal: Math.max(0, Math.round((sub - discount) * 100) / 100),
      minOrder: coupon.minOrder,
      minRemaining: Math.max(0, Math.round((coupon.minOrder - sub) * 100) / 100),
      usageLeft: coupon.maxUses > 0 ? Math.max(0, coupon.maxUses - coupon.usedCount) : null,
      perUserLeft,
      expiresAt: coupon.expiresAt,
      description: coupon.description,
      descriptionBn: coupon.descriptionBn || '', // Task 58
      scoped: coupon.appliesTo && coupon.appliesTo.mode !== 'all',
    });
  } catch (e) { next(e); }
};

// GET /api/coupons/active — public picker for the storefront (private codes stay hidden)
exports.active = async (_req, res, next) => {
  try {
    const now = new Date();
    const docs = await Coupon.find({
      active: true, public: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      $and: [{ $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] }],
    })
      .sort({ value: -1, createdAt: -1 })
      .limit(12)
      .select('code type value minOrder expiresAt description descriptionBn appliesTo');
    res.json({ items: docs.map((c) => c.publicView()) });
  } catch (e) { next(e); }
};

/* ================= ADMIN ================= */

// GET /api/admin/coupons?q=&status=all|active|inactive|expiring|expired
exports.adminList = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.q) {
      const esc = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (esc) q.$or = [{ code: new RegExp(esc, 'i') }, { description: new RegExp(esc, 'i') }];
    }
    const now = new Date();
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (req.query.status === 'active') { q.active = true; }
    if (req.query.status === 'inactive') { q.active = false; }
    if (req.query.status === 'expired') { q.expiresAt = { $ne: null, $lt: now }; }
    if (req.query.status === 'expiring') {
      q.active = true;
      q.expiresAt = { $ne: null, $gte: now, $lte: soon };
    }

    const items = await Coupon.find(q).sort({ createdAt: -1 }).limit(500).lean();
    // derived flags for the table (expiring/expired chips)
    for (const c of items) {
      c.isExpired = !!(c.expiresAt && c.expiresAt < now);
      c.isExpiringSoon = !!(c.expiresAt && c.expiresAt >= now && c.expiresAt <= soon);
      c.usageLeft = c.maxUses > 0 ? Math.max(0, c.maxUses - (c.usedCount || 0)) : null;
    }
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
};

// POST /api/admin/coupons
exports.create = async (req, res, next) => {
  try {
    const { errors, out } = parseCouponBody(req.body);
    if (out.expiresAt && out.expiresAt < new Date()) errors.push('expiresAt must be in the future');
    if (errors.length) return res.status(400).json({ message: errors[0] });
    const coupon = await Coupon.create({ ...out, active: req.body.active !== undefined ? !!req.body.active : true });
    res.status(201).json({ coupon });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'A coupon with this code already exists' });
    next(e);
  }
};

// PUT /api/admin/coupons/:id
exports.update = async (req, res, next) => {
  try {
    const c = await Coupon.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Coupon not found' });

    /* full-body validation against the MERGED doc — the percent/fixed value
       rules always see the final type, even on partial updates */
    const merged = { ...c.toObject(), ...(req.body || {}) };
    const { errors, out } = parseCouponBody(merged);
    if (errors.length) return res.status(400).json({ message: errors[0] });
    for (const [k, v] of Object.entries(out)) c[k] = v;
    if (req.body.active !== undefined) c.active = !!req.body.active;
    // note: backdating expiresAt is allowed on update — it doubles as a kill switch

    await c.save();
    res.json({ coupon: c });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'A coupon with this code already exists' });
    next(e);
  }
};

// DELETE /api/admin/coupons/:id
exports.remove = async (req, res, next) => {
  try {
    const c = await Coupon.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (e) { next(e); }
};

// POST /api/admin/coupons/bulk-generate  {count≤100, prefix?, ...shared rules}
// Campaign codes: PREFIX-XXXXXX (readable charset), DB-deduped before insert.
exports.bulkGenerate = async (req, res, next) => {
  try {
    const b = req.body || {};
    const count = Number(b.count);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return res.status(400).json({ message: 'count must be 1–100' });
    }
    const prefix = String(b.prefix || 'FORGE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'FORGE';

    const { errors, out } = parseCouponBody({
      code: 'TMPGEN000', // bulk codes are generated below — bypass the required-code rule
      type: b.type || 'percent', value: b.value, minOrder: b.minOrder, maxUses: b.maxUses,
      expiresAt: b.expiresAt, perUser: b.perUser, firstOrderOnly: b.firstOrderOnly,
      public: b.public, description: b.description, descriptionBn: b.descriptionBn, appliesTo: b.appliesTo,
    });
    delete out.code;
    if (errors.length) return res.status(400).json({ message: errors[0] });

    const existing = new Set((await Coupon.find({}).select('code')).map((c) => c.code));
    const docs = [];
    let guard = 0;
    while (docs.length < count && guard < count * 20) {
      guard += 1;
      let rnd = '';
      for (let i = 0; i < 6; i += 1) rnd += AMBIGUOUS[Math.floor(Math.random() * AMBIGUOUS.length)];
      const code = `${prefix}-${rnd}`;
      if (existing.has(code)) continue;
      existing.add(code);
      docs.push({ ...out, code });
    }
    if (docs.length < count) return res.status(500).json({ message: 'Could not generate enough unique codes — try again' });
    const created = await Coupon.insertMany(docs);
    res.status(201).json({ created: created.length, items: created, codes: created.map((c) => c.code) });
  } catch (e) { next(e); }
};

// GET /api/admin/coupons/export.csv — Excel-friendly (৳ BDT, BOM)
exports.exportCsv = async (_req, res, next) => {
  try {
    const docs = await Coupon.find().sort({ createdAt: -1 }).lean();
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [
      ['code', 'type', 'value', 'min_order_bdt', 'max_uses', 'used_count', 'usage_left', 'per_user', 'first_order_only', 'public', 'scope', 'expires_at', 'active', 'description', 'created_at'],
      ...docs.map((c) => [
        c.code, c.type, c.value, c.minOrder || 0, c.maxUses || 0, c.usedCount || 0,
        c.maxUses > 0 ? Math.max(0, c.maxUses - (c.usedCount || 0)) : 'unlimited',
        c.perUser || 0, c.firstOrderOnly ? 'yes' : 'no', c.public ? 'yes' : 'no',
        c.appliesTo && c.appliesTo.mode !== 'all'
          ? `${c.appliesTo.mode}:${(c.appliesTo.mode === 'products' ? c.appliesTo.products : c.appliesTo.categories).join('|')}`
          : 'all',
        c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : '', c.active ? 'yes' : 'no',
        c.description || '', new Date(c.createdAt).toISOString(),
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forged-coupons-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (e) { next(e); }
};

// GET /api/admin/coupons/:id/analytics — one coupon's life story
exports.couponAnalytics = async (req, res, next) => {
  try {
    const c = await Coupon.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Coupon not found' });

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totals, byDay] = await Promise.all([
      Order.aggregate([
        { $match: { 'totals.couponCode': c.code, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: null,
          orders: { $sum: 1 },
          discount: { $sum: '$totals.discount' },
          revenue: { $sum: '$totals.grandTotal' },
          customers: { $addToSet: '$customer.phone' },
          accounts: { $addToSet: '$user' },
        } },
        { $project: {
          orders: 1, discount: { $round: ['$discount', 2] }, revenue: { $round: ['$revenue', 2] },
          customers: { $size: '$customers' }, accounts: { $size: { $setDifference: ['$accounts', [null]] } },
        } },
      ]),
      Order.aggregate([
        { $match: { 'totals.couponCode': c.code, status: { $ne: 'cancelled' }, createdAt: { $gte: since30 } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          discount: { $sum: '$totals.discount' },
        } },
        { $sort: { _id: 1 } },
        { $project: { orders: 1, discount: { $round: ['$discount', 2] } } },
      ]),
    ]);

    const t = totals[0] || { orders: 0, discount: 0, revenue: 0, customers: 0, accounts: 0 };
    res.json({
      coupon: { code: c.code, type: c.type, value: c.value, maxUses: c.maxUses, usedCount: c.usedCount, expiresAt: c.expiresAt, active: c.active },
      totals: { ...t, aov: t.orders ? Math.round((t.revenue / t.orders) * 100) / 100 : 0 },
      byDay,
    });
  } catch (e) { next(e); }
};

// GET /api/admin/coupons/analytics — global coupon intelligence
exports.adminAnalytics = async (_req, res, next) => {
  try {
    const now = new Date();
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [global, perCode, unused, expiring] = await Promise.all([
      Order.aggregate([
        { $match: { 'totals.couponCode': { $nin: [null, ''] }, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: null,
          orders: { $sum: 1 },
          discount: { $sum: '$totals.discount' },
          revenue: { $sum: '$totals.grandTotal' },
        } },
        { $project: { orders: 1, discount: { $round: ['$discount', 2] }, revenue: { $round: ['$revenue', 2] } } },
      ]),
      Order.aggregate([
        { $match: { 'totals.couponCode': { $nin: [null, ''] }, status: { $ne: 'cancelled' } } },
        { $group: {
          _id: '$totals.couponCode',
          orders: { $sum: 1 },
          discount: { $sum: '$totals.discount' },
          revenue: { $sum: '$totals.grandTotal' },
        } },
        { $sort: { orders: -1 } },
        { $limit: 5 },
        { $project: { orders: 1, discount: { $round: ['$discount', 2] }, revenue: { $round: ['$revenue', 2] } } },
      ]),
      Coupon.find({ active: true, usedCount: 0 }).sort({ createdAt: -1 }).limit(10)
        .select('code type value minOrder expiresAt appliesTo description'),
      Coupon.find({ active: true, expiresAt: { $ne: null, $gte: now, $lte: soon } })
        .sort({ expiresAt: 1 }).limit(10).select('code type value expiresAt usedCount maxUses'),
    ]);

    const allCoupons = await Coupon.countDocuments();
    res.json({
      global: global[0] || { orders: 0, discount: 0, revenue: 0 },
      coupons: { total: allCoupons, active: await Coupon.countDocuments({ active: true }) },
      topCodes: perCode,
      unusedActive: unused,
      expiringSoon: expiring,
    });
  } catch (e) { next(e); }
};
