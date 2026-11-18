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
        nameBn: p ? (p.nameBn || '') : '',
        price: p ? p.price : i.price,
        image: p?.images?.[0]?.url || '',
        stock: p ? p.stock : 0,
        available: Boolean(p),
      };
    });
    view.componentsTotal = Math.round(view.items.reduce((sum, item) => sum + (+item.price || 0) * (+item.qty || 1), 0) * 100) / 100;
    view.savePct = view.componentsTotal > view.bundlePrice && view.componentsTotal > 0
      ? Math.round((1 - view.bundlePrice / view.componentsTotal) * 100)
      : 0;
    view.orderable = view.live && view.componentsTotal > view.bundlePrice && view.items.every((i) => i.available && i.stock >= (+i.qty || 1));
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
    if (q) {
      const escaped = String(q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      qy.$or = [{ title: new RegExp(escaped, 'i') }, { titleBn: new RegExp(escaped, 'i') }, { slug: String(q).toLowerCase() }];
    }
    if (active === 'true' || active === 'false') qy.active = active === 'true';
    const bundles = await ComboBundle.find(qy).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: await bundlePipeline(bundles) });
  } catch (e) { next(e); }
};

/* validate + normalize the admin payload → mongoose-ready doc */
async function buildDoc(body, existing = null) {
  const errors = [];
  body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const asText = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');
  const title = asText(body.title);
  if (!title) errors.push('title is required');
  if (title.length > 80) errors.push('title must be 80 characters or fewer');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const validRawItems = rawItems.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (validRawItems.length !== rawItems.length) errors.push('items must contain product objects');
  const normalizedItems = validRawItems.map((item) => ({
    slug: asText(item.slug).toLowerCase(),
    qty: item.qty === undefined ? 1 : Number(item.qty),
  }));
  if (normalizedItems.some((item) => !item.slug)) errors.push('each bundle item must have a product slug');
  const itemSlugs = normalizedItems.map((item) => item.slug).filter(Boolean);
  if (new Set(itemSlugs).size !== itemSlugs.length) errors.push('bundle items must use distinct product slugs');
  if (itemSlugs.length < 2 || itemSlugs.length > 8) errors.push('a bundle needs 2–8 distinct product slugs');
  if (normalizedItems.some((item) => !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10)) {
    errors.push('each component quantity must be a whole number from 1 to 10');
  }

  const products = await Product.find({ slug: { $in: itemSlugs }, active: true }).select('name slug price');
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  const existingBySlug = new Map((existing?.items || []).map((item) => [item.slug, item]));
  const missing = itemSlugs.filter((s) => !bySlug[s] && !existingBySlug.has(s));
  if (missing.length) errors.push(`unknown or inactive products: ${missing.join(', ')}`);

  const items = itemSlugs.flatMap((s) => {
    const found = normalizedItems.find((i) => i.slug === s) || {};
    const product = bySlug[s];
    const previous = existingBySlug.get(s);
    // Keep validation errors as a 400 response instead of dereferencing a
    // missing product here (for example, a product removed after bundle edit).
    if (!product && previous) {
      if (found.qty !== (+previous.qty || 1)) errors.push(`inactive component ${s} cannot be changed; remove it or reactivate the product first`);
      return [{ product: previous.product, slug: s, name: previous.name, price: +previous.price || 0, qty: +previous.qty || 1 }];
    }
    if (!product) return [];
    const qty = Number.isInteger(found.qty) && found.qty >= 1 && found.qty <= 10 ? found.qty : 1;
    return [{ product: product._id, slug: s, name: product.name, price: +product.price || 0, qty }];
  });

  const componentsTotal = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const rawBundlePrice = Number(body.bundlePrice);
  const bundlePrice = Number.isFinite(rawBundlePrice) ? Math.round(rawBundlePrice * 100) / 100 : NaN;
  if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) errors.push('bundlePrice must be a positive number');
  else if (bundlePrice >= componentsTotal) errors.push(`bundlePrice (৳${bundlePrice}) must be BELOW the components total (৳${componentsTotal}) — otherwise it is not a deal`);

  const slug = String(body.slug || title).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push('could not derive a valid slug from title');

  const windowIn = body.window == null ? {} : body.window;
  if (typeof windowIn !== 'object' || Array.isArray(windowIn)) errors.push('window must be an object');
  const windowFields = windowIn && typeof windowIn === 'object' && !Array.isArray(windowIn) ? windowIn : {};
  const parseDate = (value, key) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      errors.push(`window.${key} must be a valid date`);
      return null;
    }
    return parsed;
  };
  const window = {
    startsAt: parseDate(windowFields.startsAt, 'startsAt'),
    endsAt: parseDate(windowFields.endsAt, 'endsAt'),
  };
  if (window.startsAt && window.endsAt && window.startsAt > window.endsAt) errors.push('window.startsAt must be before window.endsAt');

  const titleBn = asText(body.titleBn);
  const tagline = asText(body.tagline);
  const taglineBn = asText(body.taglineBn);
  const tag = asText(body.tag);
  const image = asText(body.image);
  if (titleBn.length > 80) errors.push('titleBn must be 80 characters or fewer');
  if (tagline.length > 160) errors.push('tagline must be 160 characters or fewer');
  if (taglineBn.length > 160) errors.push('taglineBn must be 160 characters or fewer');
  if (tag.length > 24) errors.push('tag must be 24 characters or fewer');
  if (image.length > 600) errors.push('image must be 600 characters or fewer');

  let active = existing ? existing.active : true;
  if (body.active !== undefined) {
    if (body.active === true || body.active === 'true') active = true;
    else if (body.active === false || body.active === 'false') active = false;
    else errors.push('active must be a boolean');
  }
  const sortOrder = body.sortOrder === undefined ? Number(existing?.sortOrder ?? 0) : Number(body.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) errors.push('sortOrder must be a whole number from 0 to 999');

  const doc = {
    slug,
    title,
    titleBn,
    tagline,
    taglineBn,
    tag,
    image,
    items,
    bundlePrice,
    window,
    active,
    sortOrder,
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
    if (!require('mongoose').isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid bundle id' });
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
    if (!require('mongoose').isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid bundle id' });
    const r = await ComboBundle.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Bundle not found' });
    res.json({ message: 'Bundle deleted' });
  } catch (e) { next(e); }
};

exports._buildDoc = buildDoc;
exports._bundlePipeline = bundlePipeline;
