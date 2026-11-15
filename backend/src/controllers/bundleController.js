const ComboBundle = require('../models/ComboBundle');
const Product = require('../models/Product');

/* Phase 4 (4.1) — ComboBundle APIs.
   Public:  GET /api/bundles            → live bundles with fresh component cards
            GET /api/bundles/:slug      → one bundle
   Admin:   CRUD under /api/admin/bundles (module: catalog) with validation —
            2–8 distinct active products, bundlePrice < components total. */

const bundlePipeline = async (bundles) => {
  /* refresh component cards against the LIVE product docs (price/stock/image) */
  const slugs = [...new Set(bundles.flatMap((b) => (b.items || []).map((i) => i.slug)))];
  const products = await Product.find({ slug: { $in: slugs }, active: true }).select('name nameBn slug images price stock category').lean();
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  return bundles.map((b) => {
    const view = b.publicView();
    view.items = (b.items || []).map((i) => {
      const p = bySlug[i.slug];
      return {
        slug: i.slug,
        qty: i.qty,
        name: p ? p.name : i.name,
        price: p ? p.price : i.price,
        image: p?.images?.[0]?.url || '',
        stock: p ? p.stock : 0,
        available: Boolean(p),
      };
    });
    view.orderable = view.live && view.items.every((i) => i.available && i.stock > 0);
    return view;
  });
};

/* ---------- public ---------- */

exports.list = async (req, res, next) => {
  try {
    const bundles = await ComboBundle.find({ active: true }).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: await bundlePipeline(bundles) });
  } catch (e) { next(e); }
};

exports.detail = async (req, res, next) => {
  try {
    const b = await ComboBundle.findOne({ slug: String(req.params.slug || '').toLowerCase() });
    if (!b || !b.isLive()) return res.status(404).json({ message: 'Bundle not found' });
    res.json({ bundle: (await bundlePipeline([b]))[0] });
  } catch (e) { next(e); }
};

/* ---------- admin ---------- */

exports.adminList = async (req, res, next) => {
  try {
    const { q, active } = req.query;
    const qy = {};
    /* audit fix — escape the search like every other controller (a literal
       ".*" used to match everything; pathological patterns cost CPU) */
    if (q) qy.$or = [{ title: new RegExp(String(q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { slug: String(q).toLowerCase() }];
    if (active === 'true' || active === 'false') qy.active = active === 'true';
    const bundles = await ComboBundle.find(qy).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: await bundlePipeline(bundles) });
  } catch (e) { next(e); }
};

/* validate + normalize the admin payload → mongoose-ready doc */
async function buildDoc(body, existing = null) {
  const errors = [];
  const title = String(body.title || '').trim();
  if (!title) errors.push('title is required');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const validRawItems = rawItems.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (validRawItems.length !== rawItems.length) errors.push('items must contain product objects');
  const itemSlugs = [...new Set(validRawItems.map((i) => String(i.slug || '').trim().toLowerCase()).filter(Boolean))];
  if (itemSlugs.length < 2 || itemSlugs.length > 8) errors.push('a bundle needs 2–8 distinct product slugs');

  const products = await Product.find({ slug: { $in: itemSlugs }, active: true }).select('name slug price');
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  const missing = itemSlugs.filter((s) => !bySlug[s]);
  if (missing.length) errors.push(`unknown or inactive products: ${missing.join(', ')}`);

  const items = itemSlugs.flatMap((s) => {
    const found = validRawItems.find((i) => String(i.slug || '').trim().toLowerCase() === s) || {};
    const product = bySlug[s];
    // Keep validation errors as a 400 response instead of dereferencing a
    // missing product here (for example, a product removed after bundle edit).
    if (!product) return [];
    const qty = Number(found.qty) || 1;
    return [{ product: product._id, slug: s, name: product.name, price: +product.price || 0, qty: Math.min(Math.max(qty, 1), 10) }];
  });

  const componentsTotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const bundlePrice = Number(body.bundlePrice);
  if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) errors.push('bundlePrice must be a positive number');
  else if (bundlePrice >= componentsTotal) errors.push(`bundlePrice (৳${bundlePrice}) must be BELOW the components total (৳${componentsTotal}) — otherwise it is not a deal`);

  const slug = String(body.slug || title).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push('could not derive a valid slug from title');

  const windowIn = body.window || {};
  const window = {
    startsAt: windowIn.startsAt ? new Date(windowIn.startsAt) : null,
    endsAt: windowIn.endsAt ? new Date(windowIn.endsAt) : null,
  };
  if (window.startsAt && window.endsAt && window.startsAt > window.endsAt) errors.push('window.startsAt must be before window.endsAt');

  const doc = {
    slug,
    title,
    titleBn: String(body.titleBn || '').trim(),
    tagline: String(body.tagline || '').trim(),
    taglineBn: String(body.taglineBn || '').trim(),
    tag: String(body.tag || '').trim().slice(0, 24),
    image: String(body.image || '').trim(),
    items,
    bundlePrice: Math.round(bundlePrice * 100) / 100,
    window,
    active: body.active === undefined ? (existing ? existing.active : true) : Boolean(body.active),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : (existing ? existing.sortOrder : 0),
  };
  return { doc, errors, componentsTotal };
}

exports.adminCreate = async (req, res, next) => {
  try {
    const { doc, errors } = await buildDoc(req.body || {});
    if (errors.length) return res.status(400).json({ message: errors.join(' · ') });
    const dupe = await ComboBundle.findOne({ slug: doc.slug });
    if (dupe) return res.status(409).json({ message: `Bundle slug already exists: ${doc.slug}` });
    const created = await ComboBundle.create(doc);
    res.status(201).json({ bundle: (await bundlePipeline([created]))[0] });
  } catch (e) { next(e); }
};

exports.adminUpdate = async (req, res, next) => {
  try {
    const b = await ComboBundle.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Bundle not found' });
    const { doc, errors } = await buildDoc({ ...b.toObject(), ...req.body }, b);
    if (errors.length) return res.status(400).json({ message: errors.join(' · ') });
    const dupe = await ComboBundle.findOne({ slug: doc.slug, _id: { $ne: b._id } });
    if (dupe) return res.status(409).json({ message: `Bundle slug already exists: ${doc.slug}` });
    Object.assign(b, doc);
    await b.save();
    res.json({ bundle: (await bundlePipeline([b]))[0] });
  } catch (e) { next(e); }
};

exports.adminDelete = async (req, res, next) => {
  try {
    const r = await ComboBundle.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Bundle not found' });
    res.json({ message: 'Bundle deleted' });
  } catch (e) { next(e); }
};
