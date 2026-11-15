/* Phase 4 (4.5) — adminController split: catalog. Product CRUD: create/update/delete, bulk, duplicate, CSV import/export. */
const {
  loyaltyEngine,
  Product,
  Brand,
  Category,
  saveImage,
  deleteImage,
  sendStatusUpdate,
  autoNotifyProduct,
  cache,
  orderOps,
  slugify,
  resolveCatRefs,
  resolveBrand,
  warrantyFromPayload,
  skuFor,
  guideFromPayload,
  priceFor,
} = require('./_shared');
const specsUtil = require('../../utils/specs'); // Step 5 — dynamic spec system
const { thumbUrl } = require('../../services/storageService'); // Step 6 — grid derivatives

/* Step 5 — parse a JSON-or-object body field into an array; null when absent */
const arrFromPayload = (raw) => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
};

/* Step 5 — KEY FEATURES normalizer (add/edit/manage from the admin form) */
const featuresFromPayload = (raw) => {
  const arr = arrFromPayload(raw);
  if (arr === undefined) return undefined;
  return arr.map((f) => String(f || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);
};

/* Step 5 — sizeStocks acceptance (the admin form ALWAYS sent this JSON but the
   controller ignored it — per-size availability never persisted from the UI) */
const sizeStocksFromPayload = (raw) => {
  const arr = arrFromPayload(raw);
  if (arr === undefined) return undefined;
  return arr
    .map((r) => ({ s: String((r && r.s) || '').trim().slice(0, 80), stock: Math.max(0, parseInt((r && r.stock), 10) || 0) }))
    .filter((r) => r.s)
    .slice(0, 60);
};

/* Step 5 — canonical specValues path. When the payload carries `specValues`,
   rows are coerced against the category's live specGroups schema and BOTH
   flat legacy arrays (specs + specsBn) are regenerated from them — the
   Product Model, MongoDB schema, PDP, compare and CSV all stay in lockstep
   with one write. Orphan rows (schema lost the field) survive untouched. */
async function specPackFromPayload(b, categorySlug, prev) {
  const rawValues = arrFromPayload(b.specValues);
  if (rawValues === undefined) return undefined;
  const cat = await Category.findOne({ slug: String(categorySlug || '').toLowerCase().trim() }).select('specGroups').lean();
  const schema = specsUtil.normalizeSpecGroups((cat && cat.specGroups) || []);
  const seen = new Set();
  const rows = [];
  for (const r of Array.isArray(rawValues) ? rawValues.slice(0, 120) : []) {
    const g = String((r && r.g) || specsUtil.AUTO_GROUP.key).trim().slice(0, 60);
    const k = String((r && r.k) || '').trim().slice(0, 60);
    if (!k || seen.has(g + '|' + k)) continue;
    seen.add(g + '|' + k);
    const field = specsUtil.findField(schema, g, k);
    /* Step 6 (XSS fixture) — UNKNOWN fields (schema lost / legacy rows) used to
       store values verbatim; cap them like coerceValue does (≤2000 chars). */
    let v = field ? specsUtil.coerceValue(field.field, r.v) : String(r.v == null ? '' : r.v).trim().slice(0, 2000) || null; // .field — findField returns {group, field}
    if (field && field.field.type === 'number' && v === null) continue;
    if (specsUtil.valueIsEmpty(v)) continue;
    rows.push({ g, k, v });
  }
  return {
    specValues: rows,
    specs: specsUtil.flatFromValues(schema, rows, false),
    specsBn: specsUtil.flatFromValues(schema, rows, true),
  };
}

/* audit fix — the Phase 4.5 controller split lost this helper: bulkProducts
   referenced an undefined isValidId and every admin bulk operation 500'd. */
const mongoose = require('mongoose');
const isValidId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

/* Phase 5 (5.4) — inline SEO fields (PDP meta override). Whitelisted subset;
   JSON string or object; empty result = untouched. */
function seoFromPayload(b) {
  if (b.seo === undefined) return undefined;
  let s = b.seo;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = {}; } }
  if (!s || typeof s !== 'object') return undefined;
  const clean = {};
  for (const k of ['metaTitle', 'metaDescription', 'metaKeywords', 'canonicalUrl', 'metaRobots']) {
    if (s[k] !== undefined) clean[k] = String(s[k]).trim().slice(0, 600);
  }
  return Object.keys(clean).length ? clean : undefined;
}

exports.createProduct = async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.name || b.price === undefined) return res.status(400).json({ message: 'name and price are required' });
    /* Phase 2 (v2 catalog) — cheap validations FIRST (SKU/refs) so a duplicate
       SKU answers 409 before the client uploads anything */
    let sku;
    try { sku = await skuFor(b.sku); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'At least one product image is required' });

    const images = [];
    for (const f of req.files) images.push(await saveImage(f, 'forged/products'));
    /* Step 5 — alt text for the freshly uploaded set (imageAlts = {"new:0": "..."}) */
    const createAlts = (() => { try { return JSON.parse(b.imageAlts || '{}') || {}; } catch { return {}; } })();
    images.forEach((img, i) => { const a = createAlts['new:' + i]; if (a) img.alt = String(a).trim().slice(0, 300); });

    const sgN = guideFromPayload(b);
    if (sgN.error) return res.status(sgN.status).json({ message: sgN.error });

    const catRefs = await resolveCatRefs(b.category);
    const brandId = await resolveBrand(b);
    const warranty = warrantyFromPayload(b);
    const seo = seoFromPayload(b);
    const specPack = await specPackFromPayload(b, b.category || 'accessories', null); // Step 5

    const product = await Product.create({
      name: b.name,
      nameBn: String(b.nameBn || '').trim(), // Task 58 — Bengali display name (optional)
      slug: b.slug ? slugify(b.slug) : slugify(b.name),
      category: b.category || 'accessories',
      categoryRef: catRefs.categoryRef,
      categoryPath: catRefs.categoryPath,
      brand: brandId,
      ...(sku ? { sku } : {}),
      ...(warranty ? { warranty } : {}),
      ...(seo ? { seo } : {}),
      variantLabel: String(b.variantLabel || '').trim(),
      variantLabelBn: String(b.variantLabelBn || '').trim(),
      price: Number(b.price),
      comparePrice: b.comparePrice ? Number(b.comparePrice) : null,
      images,
      badge: b.badge || 'none',
      stock: b.stock !== undefined ? Number(b.stock) : 25,
      colors: b.colors ? (typeof b.colors === 'string' ? JSON.parse(b.colors) : b.colors) : [],
      sizes: b.sizes ? (typeof b.sizes === 'string' ? JSON.parse(b.sizes) : b.sizes) : [],
      sizePrices: b.sizePrices ? (typeof b.sizePrices === 'string' ? JSON.parse(b.sizePrices) : b.sizePrices) : [],
      shortDesc: b.shortDesc || '',
      shortDescBn: String(b.shortDescBn || '').trim(),
      description: b.description || '',
      descriptionBn: String(b.descriptionBn || '').trim(),
      specs: b.specs ? (typeof b.specs === 'string' ? JSON.parse(b.specs) : b.specs) : [],
      specsBn: b.specsBn ? (typeof b.specsBn === 'string' ? JSON.parse(b.specsBn) : b.specsBn) : [],
      sizeStocks: sizeStocksFromPayload(b.sizeStocks) || [], // Step 5 — was silently dropped before
      features: featuresFromPayload(b.features) || [],       // Step 5 — key features
      featuresBn: featuresFromPayload(b.featuresBn) || [],
      hideEmptySpecs: b.hideEmptySpecs !== undefined ? (b.hideEmptySpecs === 'true' || b.hideEmptySpecs === true) : true,
      featured: b.featured === 'true' || b.featured === true,
      active: b.active !== 'false' && b.active !== false,
      sizeGuide: sgN.guide || undefined,
      /* Step 5 — canonical spec values + regenerated flat rows win over the
         legacy `specs` body field when the client sends specValues */
      ...(specPack ? specPack : {}),
      /* Task 57 — optional scheduled flash sale on creation */
      flash: (() => {
        let f = b.flash;
        try { f = f ? (typeof f === 'string' ? JSON.parse(f) : f) : null; } catch { f = null; }
        if (!f || !+f.price || +f.price <= 0 || !f.startsAt || !f.endsAt) return { price: null, startsAt: null, endsAt: null };
        const s = new Date(f.startsAt), e = new Date(f.endsAt);
        if (isNaN(+s) || isNaN(+e) || +e <= +s) return { price: null, startsAt: null, endsAt: null };
        return { price: Math.max(0, +f.price), startsAt: s, endsAt: e };
      })(),
    });
    autoNotifyProduct('created', product); // GSC automation — fire-and-forget
    cache.bump(); // catalog changed → drop cached list/filters
    res.status(201).json({ product });
  } catch (e) { next(e); }
};

// PUT /api/admin/products/:id (multipart: newImages[])

exports.updateProduct = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    const b = req.body;

    if (b.name) p.name = b.name;
    if (b.nameBn !== undefined) p.nameBn = String(b.nameBn || '').trim(); // Task 58 — Bengali name (empty string clears)
    if (b.slug) p.slug = slugify(b.slug);
    if (b.category) {
      p.category = b.category;
      const refs = await resolveCatRefs(b.category); // v2 — keep tree refs in lockstep
      p.categoryRef = refs.categoryRef;
      p.categoryPath = refs.categoryPath;
    }
    /* Phase 2 (v2 catalog) — brand / sku / warranty / variant-axis */
    if (b.brandId !== undefined || b.brandSlug !== undefined) {
      p.brand = await resolveBrand(b);
    }
    if (b.sku !== undefined) {
      try { p.sku = await skuFor(b.sku, p._id); } catch (e) { return res.status(e.status || 400).json({ message: e.message }); }
    }
    const wUpd = warrantyFromPayload(b);
    if (wUpd) p.warranty = wUpd;
    const seoUpd = seoFromPayload(b);
    if (seoUpd) p.seo = { ...(p.seo || {}), ...seoUpd };
    if (b.variantLabel !== undefined) p.variantLabel = String(b.variantLabel || '').trim();
    if (b.variantLabelBn !== undefined) p.variantLabelBn = String(b.variantLabelBn || '').trim();
    if (b.price !== undefined) p.price = Number(b.price);
    if (b.comparePrice !== undefined) p.comparePrice = b.comparePrice ? Number(b.comparePrice) : null;
    /* Task 57 — scheduled flash sale. JSON/string payload: {price, startsAt, endsAt};
       falsy price (or price<=0) clears the sale. endsAt must be after startsAt. */
    if (b.flash !== undefined) {
      let f = b.flash;
      try { f = typeof f === 'string' ? JSON.parse(f) : f; } catch { f = null; }
      if (!f || !+f.price || +f.price <= 0 || !f.startsAt || !f.endsAt) {
        p.flash = { price: null, startsAt: null, endsAt: null };
      } else {
        const s = new Date(f.startsAt), e = new Date(f.endsAt);
        if (isNaN(+s) || isNaN(+e) || +e <= +s) {
          return res.status(400).json({ message: 'Flash sale window is invalid — end must be after start' });
        }
        p.flash = { price: Math.max(0, +f.price), startsAt: s, endsAt: e };
      }
    }
    if (b.badge) p.badge = b.badge;
    if (b.stock !== undefined) p.stock = Number(b.stock);
    if (b.shortDesc !== undefined) p.shortDesc = b.shortDesc;
    if (b.shortDescBn !== undefined) p.shortDescBn = String(b.shortDescBn || '').trim();
    if (b.description !== undefined) p.description = b.description;
    if (b.descriptionBn !== undefined) p.descriptionBn = String(b.descriptionBn || '').trim();
    if (b.featured !== undefined) p.featured = b.featured === 'true' || b.featured === true;
    if (b.active !== undefined) p.active = b.active === 'true' || b.active === true;
    if (b.colors) p.colors = typeof b.colors === 'string' ? JSON.parse(b.colors) : b.colors;
    if (b.sizes) p.sizes = typeof b.sizes === 'string' ? JSON.parse(b.sizes) : b.sizes;
    if (b.sizePrices !== undefined) p.sizePrices = typeof b.sizePrices === 'string' ? JSON.parse(b.sizePrices) : b.sizePrices;
    if (b.specs) p.specs = typeof b.specs === 'string' ? JSON.parse(b.specs) : b.specs;
    if (b.specsBn !== undefined) p.specsBn = typeof b.specsBn === 'string' ? JSON.parse(b.specsBn) : b.specsBn; // Task 58

    /* Step 5 — dynamic spec values (canonical) + regenerated flat rows + key
       features + per-size stock + hide-empty switch. Category change re-runs
       the pack so values coerce against the NEW category's schema. */
    const specPack = await specPackFromPayload(b, b.category || p.category, p);
    if (specPack) {
      p.specValues = specPack.specValues;
      p.specs = specPack.specs;
      p.specsBn = specPack.specsBn;
    }
    const feats = featuresFromPayload(b.features);
    if (feats !== undefined) p.features = feats;
    const featsBn = featuresFromPayload(b.featuresBn);
    if (featsBn !== undefined) p.featuresBn = featsBn;
    const szStocks = sizeStocksFromPayload(b.sizeStocks); // Step 5 — was silently dropped before
    if (szStocks !== undefined) p.sizeStocks = szStocks;
    if (b.hideEmptySpecs !== undefined) p.hideEmptySpecs = b.hideEmptySpecs === 'true' || b.hideEmptySpecs === true;

    /* Task 32 — per-product size guide (inherit/custom) via the shared normalizer */
    const sgN = guideFromPayload(b, p.sizeGuide && p.sizeGuide.toObject ? p.sizeGuide.toObject() : p.sizeGuide);
    if (sgN.error) return res.status(sgN.status).json({ message: sgN.error });
    if (sgN.guide) p.sizeGuide = sgN.guide;

    const stockTouched = b.stock !== undefined;

    // image removals: removeImages = JSON array of publicIds
    if (b.removeImages) {
      const toRemove = typeof b.removeImages === 'string' ? JSON.parse(b.removeImages) : b.removeImages;
      for (const pid of toRemove) {
        const img = p.images.find((i) => i.publicId === pid);
        if (img) { await deleteImage(pid); p.images = p.images.filter((i) => i !== img); }
      }
    }
    /* Step 5 — DnD IMAGE MANAGEMENT. The admin image manager sends the FULL
       desired order as imageOrder tokens: existing publicIds (or urls) plus
       "new:<i>" slots for the freshly uploaded files — so uploads can be
       inserted at ANY position and images[0] is always the main shot.
       imageAlts = { token: "alt text" } edits alt on the same pass. */
    let imageOrder = null;
    let imageAlts = {};
    if (b.imageOrder !== undefined) {
      try { imageOrder = typeof b.imageOrder === 'string' ? JSON.parse(b.imageOrder) : b.imageOrder; } catch { imageOrder = null; }
      try { imageAlts = typeof b.imageAlts === 'string' ? JSON.parse(b.imageAlts || '{}') : b.imageAlts || {}; } catch { imageAlts = {}; }
      if (!Array.isArray(imageOrder)) imageOrder = null;
    }
    if (imageOrder) {
      const built = [];
      for (const token of imageOrder.slice(0, 24)) {
        const altRaw = imageAlts && imageAlts[token] !== undefined ? String(imageAlts[token]).trim().slice(0, 300) : null;
        if (/^new:\d+$/.test(String(token))) {
          const idx = parseInt(String(token).slice(4), 10);
          const f = req.files && req.files[idx];
          if (!f || built.some((x) => x.__fileIdx === idx)) continue;
          const saved = await saveImage(f, 'forged/products');
          built.push({ ...saved, alt: altRaw || saved.alt || '', __fileIdx: idx });
        } else {
          const key = String(token);
          const img = p.images.find((i) => (i.publicId && i.publicId === key) || i.url === key);
          if (!img || built.some((x) => x.url === img.url)) continue;
          /* Step 6 — the thumb rides through reorders too (derive when legacy rows lack it) */
          built.push({ url: img.url, publicId: img.publicId, alt: altRaw !== null ? altRaw : (img.alt || ''), thumb: img.thumb || thumbUrl(img.url) });
        }
      }
      /* files the client never referenced still land (legacy clients, curl) */
      if (req.files && req.files.length) {
        req.files.forEach((f, idx) => {
          if (!built.some((x) => x.__fileIdx === idx)) {
            /* saveImage is async — push a marker and resolve below */
            built.push({ __pendingFile: f, __fileIdx: idx });
          }
        });
      }
      const finalImages = [];
      for (const item of built) {
        if (item.__pendingFile) finalImages.push(await saveImage(item.__pendingFile, 'forged/products'));
        else finalImages.push({ url: item.url, publicId: item.publicId, alt: item.alt });
      }
      p.images = finalImages;
    } else if (req.files && req.files.length > 0) {
      for (const f of req.files) p.images.push(await saveImage(f, 'forged/products'));
    }
    if (p.images.length === 0) return res.status(400).json({ message: 'Product must keep at least one image' });

    await p.save();
    autoNotifyProduct('updated', p); // GSC automation — fire-and-forget
    cache.bump(); // catalog changed → drop cached list/filters
    /* Task 56-e — admin just touched the stock: fire the low-stock bell */
    if (stockTouched) loyaltyEngine.checkStockAlerts([p]).catch(() => {});
    res.json({ product: p });
  } catch (e) { next(e); }
};

// DELETE /api/admin/products/:id

exports.deleteProduct = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    for (const img of p.images) await deleteImage(img.publicId);
    autoNotifyProduct('deleted', p); // GSC automation — before the doc is gone
    await p.deleteOne();
    cache.bump(); // catalog changed → drop cached list/filters
    res.json({ message: 'Product deleted' });
  } catch (e) { next(e); }
};

/* ---- Task 27 bulk operations (checkbox multi-select in Admin → Products) ---- */

// POST /api/admin/products/bulk { ids[], action: active|inactive|price|stock|delete, value? }

exports.bulkProducts = async (req, res, next) => {
  try {
    const b = req.body || {};
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((i) => isValidId(i));
    if (!ids.length) return res.status(400).json({ message: 'ids[] must contain valid product ids' });
    if (ids.length > 200) return res.status(400).json({ message: 'Max 200 products per bulk operation' });
    const action = String(b.action || '');

    if (action === 'delete') {
      /* mirror single-delete semantics: Cloudinary cleanup + GSC ping per product */
      const prods = await Product.find({ _id: { $in: ids } });
      for (const p of prods) {
        for (const img of p.images) await deleteImage(img.publicId);
        autoNotifyProduct('deleted', p);
      }
      const r = await Product.deleteMany({ _id: { $in: ids } });
      cache.bump();
      return res.json({ action, deleted: r.deletedCount });
    }

    const upd = {};
    if (action === 'active') upd.active = true;
    else if (action === 'inactive') upd.active = false;
    else if (action === 'price') { const v = Number(b.value); if (!(v > 0)) return res.status(400).json({ message: 'value must be a positive number for price' }); upd.price = v; }
    else if (action === 'stock') { const v = Number(b.value); if (!(v >= 0)) return res.status(400).json({ message: 'value must be 0 or more for stock' }); upd.stock = v; }
    else return res.status(400).json({ message: 'action must be active | inactive | price | stock | delete' });

    const r = await Product.updateMany({ _id: { $in: ids } }, { $set: upd });
    autoNotifyProduct('updated', { slug: 'bulk:' + ids.length }); // best-effort sitemap ping — catalog touched
    cache.bump();
    /* Task 56-e — bulk stock set: alert for every product now at/below the line */
    if (action === 'stock') {
      Product.find({ _id: { $in: ids }, stock: { $lte: loyaltyEngine.LOW_STOCK_AT } })
        .then((docs) => loyaltyEngine.checkStockAlerts(docs))
        .catch(() => {});
    }
    res.json({ action, matched: r.matchedCount, modified: r.modifiedCount });
  } catch (e) { next(e); }
};

/* ---- Task 27 one-click duplicate (variant authoring shortcut) ---- */

// POST /api/admin/products/:id/duplicate — copy as an INACTIVE draft with a
// -copy slug; zeroed sold/views/rating + empty SEO override (the copy earns
// its own); images are reused by reference (no re-upload, no Cloudinary cost)

exports.duplicateProduct = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    let slug = slugify(p.slug + '-copy');
    if (await Product.exists({ slug })) slug = slugify(p.slug + '-copy-' + Date.now().toString(36));
    const doc = p.toObject();
    delete doc._id; delete doc.createdAt; delete doc.updatedAt; delete doc.__v;
    /* Step 5 audit fix — the copy used to inherit the ORIGINAL's SKU and the
       unique index answered 409 for every product that has one (all seed
       rows): duplicate was silently broken product-wide. A fresh unique SKU
       is minted instead (sparse index keeps sku-less docs legal). */
    doc.sku = await skuFor('').catch(() => null);
    doc.name = p.name + ' (Copy)';
    doc.slug = slug;
    doc.active = false; // stays hidden until deliberately published
    doc.sold = 0; doc.views = 0; doc.rating = 0; doc.reviews = 0;
    doc.seo = {};
    doc.flash = { price: null, startsAt: null, endsAt: null }; // Task 57 — copies never inherit a live sale
    const copy = await Product.create(doc);
    cache.bump();
    res.status(201).json({ product: copy });
  } catch (e) { next(e); }
};

/* ---- Task 27 CSV round-trip (catalog backup / Excel authoring) ---- */

/* Step 6 — CSV FORMULA-INJECTION GUARD. A cell that begins with = + - @ (or a
   tab/CR) is executed by Excel/LibreOffice/Sheets as a formula when the export
   is opened (=HYPERLINK, =cmd|'/c calc'!A0, DDE payloads…). User-controlled
   fields (name, specs, features…) can carry such prefixes, so exported cells
   are neutralized with a leading apostrophe — the standard OWASP mitigation.
   The apostrophe is stripped again on CSV import (importProductsCsv) so the
   round-trip stays lossless. */
const csvFormulaSafe = (s) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

const csvEsc = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v); // numeric columns stay numeric
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + csvFormulaSafe(s).replace(/"/g, '""') + '"' : csvFormulaSafe(s);
};

// GET /api/admin/products/export.csv — full catalog (BOM so Excel opens UTF-8)

exports.exportProductsCsv = async (_req, res, next) => {
  try {
    const prods = await Product.find().sort({ createdAt: 1 }).lean();
    const head = ['name', 'slug', 'category', 'price', 'comparePrice', 'stock', 'sold', 'badge', 'featured', 'active', 'shortDesc', 'description', 'sizes', 'sizePrices', 'colors', 'specs', 'features', 'imageUrl'];
    const rows = prods.map((p) => [
      p.name, p.slug, p.category, p.price, p.comparePrice == null ? '' : p.comparePrice, p.stock, p.sold, p.badge,
      p.featured ? 'true' : 'false', p.active ? 'true' : 'false',
      p.shortDesc || '', p.description || '',
      (p.sizes || []).join('|'),
      JSON.stringify(p.sizePrices || []),
      JSON.stringify((p.colors || []).map((c) => ({ name: c.name, hex: c.hex }))),
      JSON.stringify((p.specs || []).map((s) => ({ k: s.k, v: s.v }))),
      JSON.stringify(p.features || []), // Step 5 — key features ride the round-trip
      (p.images || [])[0] ? (p.images[0].url || '') : '',
    ].map(csvEsc).join(','));
    const csv = '\uFEFF' + head.join(',') + '\r\n' + rows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="forged-products.csv"');
    res.status(200).send(csv);
  } catch (e) { next(e); }
};

/* RFC-4180-ish CSV parser — quoted cells, "" escapes, CRLF safe (no new deps) */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
    else if (ch === '\r') { /* crlf */ }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const safeJson = (s, d) => { if (!s) return d; try { const v = JSON.parse(s); return v == null ? d : v; } catch (_) { return d; } };

/* rows without an imageUrl get a branded SVG placeholder so the images-required
   schema stays satisfied — update paths never touch images unless a URL is given */
const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#0d0d0f"/><text x="300" y="290" font-family="Arial" font-size="52" font-weight="bold" fill="#2F81F7" text-anchor="middle">ArixGear</text><text x="300" y="340" font-family="Arial" font-size="22" fill="#8a8f95" text-anchor="middle">IMAGE COMING SOON</text></svg>'
).toString('base64');

/* Step 5 — CSV round-trip carries the dynamic system too: features +
   specValues regenerate against the category schema on import. */
async function csvApplySpecs(doc, row) {
  const features = arrFromPayload(row.features);
  if (features && features.length) doc.features = features.map((f) => String(f).trim().slice(0, 300)).filter(Boolean).slice(0, 12);
  const pairs = safeJson(row.specs, []);
  if (Array.isArray(pairs) && pairs.length && doc.category) {
    const cat = await Category.findOne({ slug: String(doc.category).toLowerCase() }).select('specGroups').lean();
    const schema = specsUtil.normalizeSpecGroups((cat && cat.specGroups) || []);
    const vals = specsUtil.specValuesFromPairs(schema, pairs); // auto-creates missing fields
    if (vals.length) {
      doc.specValues = vals;
      doc.specs = specsUtil.flatFromValues(schema, vals, false);
      doc.specsBn = specsUtil.flatFromValues(schema, vals, true);
    }
  }
}

// POST /api/admin/products/import (multipart "csv") — upsert by slug
// (existing slug → update fields; new → create; max 500 rows per file)

exports.importProductsCsv = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'Attach a CSV file in the "csv" field' });
    let text = req.file.buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = parseCsv(text);
    if (!rows.length) return res.status(400).json({ message: 'CSV is empty' });
    const head = rows[0].map((h) => h.trim().toLowerCase());
    if (!head.includes('name') || !head.includes('price')) return res.status(400).json({ message: 'CSV must have at least "name" and "price" columns' });
    const col = (r, h) => { const i = head.indexOf(h); return i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : ''; };

    /* Step 6 — inverse of the export formula guard: exported cells that began
       with = + - @ carry a leading apostrophe; strip exactly one so the
       round-trip stays lossless (applied to text columns and JSON payloads). */
    const unGuard = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
    const unGuardDeep = (v) => Array.isArray(v) ? v.map(unGuardDeep)
      : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unGuardDeep(x)]))
      : typeof v === 'string' ? unGuard(v) : v;
    let created = 0, updated = 0;
    const errors = [];
    for (let i = 1; i < rows.length && i <= 500; i++) {
      const r = rows[i];
      const name = col(r, 'name');
      const price = Number(col(r, 'price'));
      if (!name || !Number.isFinite(price) || price <= 0) { errors.push({ row: i + 1, message: 'name or price missing/invalid' }); continue; }
      try {
        const doc = {
          name: unGuard(name),
          price,
          category: (col(r, 'category') || 'accessories').toLowerCase(),
          comparePrice: col(r, 'compareprice') ? Number(col(r, 'compareprice')) || null : null,
          stock: col(r, 'stock') !== '' ? Math.max(0, Number(col(r, 'stock')) || 0) : 25,
          badge: (col(r, 'badge') || 'none').toLowerCase(),
          shortDesc: unGuard(col(r, 'shortdesc')),
          description: unGuard(col(r, 'description')),
          featured: /^(true|1|yes)$/i.test(col(r, 'featured')),
          active: col(r, 'active') === '' ? true : /^(true|1|yes)$/i.test(col(r, 'active')),
          sizes: col(r, 'sizes') ? col(r, 'sizes').split('|').map((s) => s.trim()).filter(Boolean) : [],
          sizePrices: safeJson(col(r, 'sizeprices'), []),
          colors: unGuardDeep(safeJson(col(r, 'colors'), [])),
          specs: unGuardDeep(safeJson(col(r, 'specs'), [])),
          features: unGuardDeep(safeJson(col(r, 'features'), [])), // Step 5 — pipe/JSON column
        };
        await csvApplySpecs(doc, { specs: col(r, 'specs'), features: col(r, 'features') }); // Step 5 — schema-aligned import
        const imageUrl = col(r, 'imageurl') || col(r, 'image');
        const slugIn = col(r, 'slug') ? slugify(col(r, 'slug')) : slugify(name);
        if (!slugIn) { errors.push({ row: i + 1, message: 'could not derive a slug' }); continue; }
        const existing = await Product.findOne({ slug: slugIn });
        if (existing) {
          Object.assign(existing, doc); // slug never changes on update
          if (imageUrl) existing.images = [{ url: imageUrl, publicId: 'csv-import' }];
          await existing.save();
          updated++;
        } else {
          doc.slug = slugIn;
          doc.images = [imageUrl ? { url: imageUrl, publicId: 'csv-import' } : { url: PLACEHOLDER_IMG, publicId: 'csv-import' }];
          await Product.create(doc);
          created++;
        }
      } catch (er) { errors.push({ row: i + 1, message: er.message }); }
    }
    cache.bump();
    res.json({ created, updated, errors, rows: rows.length - 1 });
  } catch (e) { next(e); }
};

/* ================= CUSTOMERS ================= */

// GET /api/admin/customers

module.exports = {
  createProduct: exports.createProduct,
  updateProduct: exports.updateProduct,
  deleteProduct: exports.deleteProduct,
  bulkProducts: exports.bulkProducts,
  duplicateProduct: exports.duplicateProduct,
  exportProductsCsv: exports.exportProductsCsv,
  importProductsCsv: exports.importProductsCsv,
};
