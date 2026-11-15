/* Phase 2 (v2 catalog) — Brand controller.
   Public:  GET /api/brands (facet list w/ live product counts)
            GET /api/brands/:slug (brand detail + count)
   Admin:   GET/POST /api/admin/brands · PUT/DELETE /api/admin/brands/:id
            (mounted with module key 'brands'; full admins bypass the gate) */
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { saveImage } = require('../services/storageService');
const cache = require('../services/cache');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const withCounts = async (brands) => {
  const rows = await Product.aggregate([
    { $match: { active: true, brand: { $in: brands.map((b) => b._id) } } },
    { $group: { _id: '$brand', n: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  return brands.map((b) => ({ ...b, products: map[String(b._id)] || 0 }));
};

/* ============ PUBLIC ============ */

// GET /api/brands?featured=true — active brands, live product-count facet
exports.list = async (req, res, next) => {
  try {
    const q = { active: true };
    if (req.query.featured === 'true') q.featured = true;
    const docs = await Brand.find(q).sort({ featured: -1, order: 1, name: 1 }).lean();
    const items = await withCounts(docs);
    cache.set('blist:' + (req.query.featured || ''), items);
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
};

// GET /api/brands/:slug — one active brand
exports.bySlug = async (req, res, next) => {
  try {
    const b = await Brand.findOne({ slug: String(req.params.slug || '').toLowerCase(), active: true }).lean();
    if (!b) return res.status(404).json({ message: 'Brand not found' });
    const [withCount] = await withCounts([b]);
    res.json({ brand: withCount });
  } catch (e) { next(e); }
};

/* ============ ADMIN ============ */

// GET /api/admin/brands — full list incl. inactive + counts
exports.adminList = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 9));
    const q = String(req.query.q || '').trim();
    const filter = q
      ? { $or: [{ name: { $regex: escapeRe(q), $options: 'i' } }, { slug: { $regex: escapeRe(q), $options: 'i' } }] }
      : {};
    const [total, docs] = await Promise.all([
      Brand.countDocuments(filter),
      Brand.find(filter).sort({ order: 1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    const items = await withCounts(docs);
    res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) { next(e); }
};

// POST /api/admin/brands (multipart: logo)
exports.create = async (req, res, next) => {
  try {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ message: 'Brand name is required' });
    const slug = slugify(req.body.slug || name);
    const dupe = await Brand.findOne({ $or: [{ slug }, { name }] });
    if (dupe) return res.status(409).json({ message: `Brand "${dupe.name}" already exists` });
    const logo = req.file ? await saveImage(req.file, 'arixgear/brands') : null;
    const doc = await Brand.create({
      name,
      nameBn: String(req.body.nameBn || '').trim(),
      slug,
      logo: logo ? logo.url : String(req.body.logo || ''),
      description: String(req.body.description || ''),
      descriptionBn: String(req.body.descriptionBn || ''),
      website: String(req.body.website || '').trim(),
      featured: req.body.featured === 'true' || req.body.featured === true,
      order: Number(req.body.order) || 0,
      active: req.body.active !== 'false' && req.body.active !== false,
    });
    cache.bump();
    res.status(201).json({ brand: doc });
  } catch (e) { next(e); }
};

// PUT /api/admin/brands/:id (multipart: logo)
exports.update = async (req, res, next) => {
  try {
    const b = await Brand.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Brand not found' });
    const body = req.body || {};
    if (body.name) b.name = String(body.name).trim();
    if (body.nameBn !== undefined) b.nameBn = String(body.nameBn || '').trim();
    if (body.slug) b.slug = slugify(body.slug);
    if (body.logo !== undefined) b.logo = body.logo;
    if (req.file) { const logo = await saveImage(req.file, 'arixgear/brands'); b.logo = logo.url; }
    if (body.description !== undefined) b.description = String(body.description || '');
    if (body.descriptionBn !== undefined) b.descriptionBn = String(body.descriptionBn || '');
    if (body.website !== undefined) b.website = String(body.website || '').trim();
    if (body.featured !== undefined) b.featured = body.featured === 'true' || body.featured === true;
    if (body.order !== undefined) b.order = Number(body.order) || 0;
    if (body.active !== undefined) b.active = body.active === 'true' || body.active === true;
    await b.save();
    cache.bump();
    res.json({ brand: b });
  } catch (e) { next(e); }
};

// DELETE /api/admin/brands/:id — products are detached (brand → null), never orphaned
exports.remove = async (req, res, next) => {
  try {
    const b = await Brand.findByIdAndDelete(req.params.id);
    if (!b) return res.status(404).json({ message: 'Brand not found' });
    await Product.updateMany({ brand: b._id }, { $set: { brand: null } });
    cache.bump();
    res.json({ ok: true, detached: true });
  } catch (e) { next(e); }
};
