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
    image: { type: String, default: '', trim: true, maxlength: 600 },

    /* Components — product ref + frozen snapshot for history; qty per component. */
    items: {
      type: [{
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        slug: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 }, // component price snapshot (refreshed on read)
        qty: {
          type: Number,
          default: 1,
          min: 1,
          max: 10,
          validate: { validator: Number.isInteger, message: 'Component quantity must be a whole number' },
        },
      }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 8 && new Set(v.map((item) => item && item.slug)).size === v.length,
        message: 'A bundle needs 2–8 distinct products',
      },
    },

    bundlePrice: { type: Number, required: true, min: 0 },

    window: {
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
    },

    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, min: 0, max: 999, validate: { validator: Number.isInteger, message: 'Sort order must be a whole number' } },
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

/* Allocate bundlePrice across component line totals, proportionally to their
   share of the component total. Largest-remainder cent allocation guarantees
   the sum exactly equals bundlePrice. `unit` is the amount for that component
   including its configured quantity. Returns [{ index, unit }]. */
bundleSchema.methods.allocate = function () {
  const bp = +this.bundlePrice || 0;
  const items = this.items || [];
  const bundleCents = Math.max(0, Math.round(bp * 100));
  const weights = items.map((item) => Math.max(0, (+item.price || 0) * (+item.qty || 1)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const centsByItem = weights.map((weight) => totalWeight > 0 ? (weight / totalWeight) * bundleCents : 0);
  const allocated = centsByItem.map(Math.floor);
  let remaining = bundleCents - allocated.reduce((sum, cents) => sum + cents, 0);
  const byRemainder = centsByItem.map((cents, index) => ({ index, remainder: cents - allocated[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; remaining > 0 && byRemainder.length; i = (i + 1) % byRemainder.length) {
    allocated[byRemainder[i].index] += 1;
    remaining -= 1;
  }
  return allocated.map((cents, index) => ({ index, unit: cents / 100 }));
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
