const mongoose = require('mongoose');

/* Phase 4 (4.1) — ComboBundle. Phase 3 rendered bundles from homepage-section
   config; this model makes them REAL commerce objects:

     • admin CRUD (Admin → Catalog → Bundles) with validation
     • public list endpoint with LIVE component cards + save badge
     • server-authoritative bundle pricing at checkout — placeOrder expands a
       `{ bundle: slug, qty }` line into its components, allocates the bundle
       price proportionally across the lines (so per-line history stays sane)
       and decrements stock per component atomically (orderOps unchanged).

   window (optional): bundle purchasable only inside [startsAt, endsAt] —
   same read-time rule as product flash sales, no cron needed. */

const bundleSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase letters/digits with hyphens'] },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    titleBn: { type: String, default: '', trim: true, maxlength: 80 },
    tagline: { type: String, default: '', trim: true, maxlength: 160 },
    taglineBn: { type: String, default: '', trim: true, maxlength: 160 },
    tag: { type: String, default: '', trim: true, maxlength: 24 }, // corner chip — BUILD KIT / WFH …
    image: { type: String, default: '' },

    /* Components — product ref + frozen snapshot for history; qty per component. */
    items: {
      type: [{
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        slug: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 }, // component price snapshot (refreshed on read)
        qty: { type: Number, default: 1, min: 1, max: 10 },
      }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 8,
        message: 'A bundle needs 2–8 distinct products',
      },
    },

    bundlePrice: { type: Number, required: true, min: 0 },

    window: {
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
    },

    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    sold: { type: Number, default: 0 }, // incremented per bundle unit purchased
  },
  { timestamps: true }
);

/* live = active AND (no window OR now inside it) */
bundleSchema.methods.isLive = function (now = new Date()) {
  if (!this.active) return false;
  const w = this.window || {};
  if (w.startsAt && now < w.startsAt) return false;
  if (w.endsAt && now > w.endsAt) return false;
  return true;
};

/* list price of the components at their CURRENT product prices */
bundleSchema.methods.componentsTotal = function () {
  return Math.round((this.items || []).reduce((s, i) => s + (+i.price || 0) * (+i.qty || 1), 0) * 100) / 100;
};

/* allocate bundlePrice across components proportionally to their share of the
   component total — the sum of allocations ALWAYS equals bundlePrice exactly
   (largest-remainder rounding on the last line). Returns [{ index, unit }] */
bundleSchema.methods.allocate = function () {
  const total = this.componentsTotal();
  const bp = +this.bundlePrice || 0;
  const lines = (this.items || []).map((i, index) => ({ index, share: (total > 0 ? ((+i.price || 0) * (+i.qty || 1)) / total : 0) }));
  const raw = lines.map((l) => l.share * bp);
  const units = raw.map((v) => Math.floor(v * 100) / 100);
  let diff = Math.round((bp - units.reduce((s, v) => s + v, 0)) * 100) / 100;
  if (units.length) units[units.length - 1] = Math.round((units[units.length - 1] + diff) * 100) / 100;
  return units.map((unit, i) => ({ index: i, unit: Math.max(unit, 0) }));
};

/* public projection — component cards are joined by the controller */
bundleSchema.methods.publicView = function () {
  return {
    id: String(this._id),
    slug: this.slug,
    title: this.title,
    titleBn: this.titleBn || '',
    tagline: this.tagline || '',
    taglineBn: this.taglineBn || '',
    tag: this.tag || '',
    image: this.image || '',
    items: (this.items || []).map((i) => ({ slug: i.slug, name: i.name, price: i.price, qty: i.qty })),
    bundlePrice: this.bundlePrice,
    componentsTotal: this.componentsTotal(),
    savePct: this.componentsTotal() > this.bundlePrice && this.componentsTotal() > 0
      ? Math.round((1 - this.bundlePrice / this.componentsTotal()) * 100)
      : 0,
    window: { startsAt: this.window?.startsAt || null, endsAt: this.window?.endsAt || null },
    live: this.isLive(),
    active: this.active,
    sortOrder: this.sortOrder,
    sold: this.sold,
  };
};

module.exports = mongoose.model('ComboBundle', bundleSchema);
