const FlashCampaign = require('../models/FlashCampaign');
const Product = require('../models/Product');
const flash = require('../services/flash');
const notifier = require('../services/notifier');

/* Phase 4 (4.1) — FlashCampaign APIs.
   Admin:   CRUD + apply (sync deal prices + window onto products' flash
            engine fields) + end (clear them).
   Public:  GET /api/flash-campaigns/current → the live campaign + product
            cards (the storefront flash section uses this; per-product flash
            engine stays the single source of truth for PRICES). */

/* ---------- admin ---------- */

async function buildDoc(body) {
  const errors = [];
  const title = String(body.title || '').trim();
  if (!title) errors.push('title is required');

  const slug = String(body.slug || title).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push('could not derive a valid slug');

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (!startsAt || Number.isNaN(+startsAt)) errors.push('startsAt is required');
  if (!endsAt || Number.isNaN(+endsAt)) errors.push('endsAt is required');
  if (startsAt && endsAt && startsAt >= endsAt) errors.push('endsAt must be after startsAt');

  const raw = Array.isArray(body.products) ? body.products : [];
  const slugs = [...new Set(raw.map((p) => String(p.slug || '').toLowerCase()).filter(Boolean))];
  if (!slugs.length) errors.push('pick at least one product for the campaign');
  const docs = await Product.find({ slug: { $in: slugs }, active: true }).select('name slug price flash');
  const bySlug = Object.fromEntries(docs.map((p) => [p.slug, p]));
  const missing = slugs.filter((s) => !bySlug[s]);
  if (missing.length) errors.push(`unknown or inactive products: ${missing.join(', ')}`);

  const products = slugs.map((s) => {
    const found = raw.find((p) => String(p.slug || '').toLowerCase() === s) || {};
    const dealPrice = Number(found.dealPrice);
    if (!Number.isFinite(dealPrice) || dealPrice <= 0) {
      errors.push(`dealPrice for ${s} must be a positive number`);
      return null;
    }
    if (dealPrice >= (+bySlug[s].price || 0)) errors.push(`dealPrice for ${s} (৳${dealPrice}) must be below the regular price (৳${bySlug[s].price})`);
    return { product: bySlug[s]._id, slug: s, name: bySlug[s].name, basePrice: +bySlug[s].price || 0, dealPrice: Math.round(dealPrice * 100) / 100 };
  }).filter(Boolean);

  return {
    doc: {
      title,
      titleBn: String(body.titleBn || '').trim(),
      slug,
      description: String(body.description || '').trim().slice(0, 300),
      banner: String(body.banner || '').trim(),
      startsAt, endsAt,
      products,
      active: body.active === undefined ? true : Boolean(body.active),
    },
    errors,
  };
}

exports.adminList = async (req, res, next) => {
  try {
    const items = await FlashCampaign.find({}).sort({ createdAt: -1 }).lean();
    const now = new Date();
    res.json({
      items: items.map((c) => ({ ...c, live: Boolean(c.active && c.startsAt <= now && now <= c.endsAt), productCount: (c.products || []).length })),
    });
  } catch (e) { next(e); }
};

exports.adminCreate = async (req, res, next) => {
  try {
    const { doc, errors } = await buildDoc(req.body || {});
    if (errors.length) return res.status(400).json({ message: errors.join(' · ') });
    const dupe = await FlashCampaign.findOne({ slug: doc.slug });
    if (dupe) return res.status(409).json({ message: `Campaign slug already exists: ${doc.slug}` });
    const created = await FlashCampaign.create(doc);
    res.status(201).json({ campaign: created });
  } catch (e) { next(e); }
};

exports.adminUpdate = async (req, res, next) => {
  try {
    const c = await FlashCampaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Campaign not found' });
    const { doc, errors } = await buildDoc({ ...c.toObject(), ...req.body });
    if (errors.length) return res.status(400).json({ message: errors.join(' · ') });
    const dupe = await FlashCampaign.findOne({ slug: doc.slug, _id: { $ne: c._id } });
    if (dupe) return res.status(409).json({ message: `Campaign slug already exists: ${doc.slug}` });
    Object.assign(c, doc);
    await c.save();
    res.json({ campaign: c });
  } catch (e) { next(e); }
};

/* POST /api/admin/flash-campaigns/:id/apply — sync dealPrice + window onto
   each product's flash engine field (read-time evaluation takes over). */
exports.adminApply = async (req, res, next) => {
  try {
    const c = await FlashCampaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Campaign not found' });
    if (!c.products.length) return res.status(400).json({ message: 'Campaign has no products' });

    let applied = 0;
    for (const p of c.products) {
      const r = await Product.updateOne(
        { _id: p.product },
        { $set: { flash: { price: p.dealPrice, startsAt: c.startsAt, endsAt: c.endsAt } } }
      );
      if (r.modifiedCount === 1) applied += 1;
    }
    c.appliedAt = new Date();
    await c.save();
    notifier.notifyAdmin('system', `Flash campaign applied — ${c.title}`,
      `${applied}/${c.products.length} products now carry deal prices until ${c.endsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      '/admin/marketing');
    res.json({ message: `Applied: ${applied}/${c.products.length} products`, applied });
  } catch (e) { next(e); }
};

/* POST /api/admin/flash-campaigns/:id/end — clear flash fields on campaign
   products (only when this campaign owns the current window). */
exports.adminEnd = async (req, res, next) => {
  try {
    const c = await FlashCampaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Campaign not found' });
    let cleared = 0;
    for (const p of c.products) {
      const doc = await Product.findById(p.product).select('flash');
      if (doc && doc.flash && +doc.flash.price === +p.dealPrice) {
        doc.set('flash', undefined, { strict: false });
        await doc.save();
        cleared += 1;
      }
    }
    c.endedAt = new Date();
    c.active = false; // an ended campaign is no longer "current" for the storefront
    await c.save();
    res.json({ message: `Cleared: ${cleared} products`, cleared });
  } catch (e) { next(e); }
};

exports.adminDelete = async (req, res, next) => {
  try {
    const r = await FlashCampaign.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Campaign not found' });
    res.json({ message: 'Campaign deleted' });
  } catch (e) { next(e); }
};

/* ---------- public ---------- */

exports.current = async (_req, res, next) => {
  try {
    const now = new Date();
    const campaign = await FlashCampaign.findOne({
      active: true, startsAt: { $lte: now }, endsAt: { $gte: now },
    }).sort({ endsAt: 1 }).lean();
    if (!campaign) return res.json({ campaign: null, items: [] });

    const products = await Product.find({
      slug: { $in: campaign.products.map((p) => p.slug) },
      active: true,
    }).select('name nameBn slug images price category badge stock').lean();

    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
    const items = campaign.products
      .map((p) => {
        const prod = bySlug[p.slug];
        if (!prod) return null;
        const view = flash.applyFlash({ ...prod, flash: { price: p.dealPrice, startsAt: campaign.startsAt, endsAt: campaign.endsAt } });
        return {
          slug: view.slug, name: view.name, nameBn: view.nameBn || '',
          image: view.images?.[0]?.url || '', category: view.category,
          price: view.price, comparePrice: view.comparePrice, stock: view.stock,
        };
      })
      .filter(Boolean);

    res.json({
      campaign: {
        title: campaign.title, titleBn: campaign.titleBn || '',
        slug: campaign.slug, description: campaign.description || '',
        banner: campaign.banner || '', endsAt: campaign.endsAt,
      },
      items,
    });
  } catch (e) { next(e); }
};
