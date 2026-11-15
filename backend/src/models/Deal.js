const mongoose = require('mongoose');

/* Phase 8 — Centralized Deals & Promotions (the reusable pricing layer).

   ONE model for every promotion arixgear.tech will ever run — 11.11, 12.12,
   Flash Deals, Mega Sale, Daily Deals, Seasonal Offers, Brand Deals, Combo
   Offers, BOGO, Clearance and whatever comes next. The `type` enum is open
   for extension via services/dealService.js TYPES registry: adding a new
   campaign kind is ONE entry there — no new controller, no new route, no
   new model (that is the whole point of the centralization).

   Pricing rule (one truth everywhere — cards, PDP, search, order totals):
     effective unit price = min( base/size price, live flash price, live deal price )
   Ties go to flash (the pre-existing "flash is the one true order price"
   rule from Task 57 is preserved when prices are equal).

   No cron anywhere: scheduled → active → expired is computed from the clock
   at read time (statusOf), exactly like the flash engine. `published` and
   `active` are the two human switches — draft and pause. */

const DEAL_TYPES = [
  'campaign',   // 11.11 / 12.12 / Black Friday style date-driven campaigns
  'flash',      // short high-urgency windows
  'mega',       // store-wide mega sale events
  'daily',      // deals-of-the-day (short daily windows)
  'seasonal',   // winter / summer / Eid / Pohela Boishakh offers
  'brand',      // brand-focused promotions (typically brands scope)
  'combo',      // combo offers — wraps an existing ComboBundle (slug link)
  'bogo',       // buy X get Y free (same product, per line)
  'clearance',  // stock-clearing deep discounts
  'custom',     // anything else the marketing team invents
];

/* audit fix — the discount/window validators must live on explicit
   sub-schemas: a plain nested object treats `validate` as a PATH, not an
   option (boot crashed with "Validator is not a valid type"). */
const discountSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    value: { type: Number, default: 0, min: 0 },   // % (0–100) or BDT amount
    maxOff: { type: Number, default: 0, min: 0 },  // per-unit discount cap (BDT); 0 = uncapped
  },
  {
    /* unitPriceFor returns null for value>100, so an invalid deal would save
       fine and then silently never price — catch it at authoring time */
    validate: { validator(d) { return d.kind !== 'percentage' || d.value <= 100; }, message: 'Percentage discount must be 0–100' },
  }
);
const windowSchema = new mongoose.Schema(
  {
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  {
    /* inverted windows save fine then report 'expired' forever — validate at authoring */
    validate: { validator(w) { return !w.startsAt || !w.endsAt || +new Date(w.endsAt) > +new Date(w.startsAt); }, message: 'Deal window: endsAt must be after startsAt' },
  }
);

const dealSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameBn: { type: String, default: '', trim: true, maxlength: 120 },
    slug: {
      type: String, required: true, unique: true, lowercase: true, trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase letters/digits with hyphens'],
    },
    type: { type: String, enum: DEAL_TYPES, required: true, index: true },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    badge: { type: String, default: '', trim: true, maxlength: 24 },   // card chip text e.g. "11.11 SALE"
    banner: { type: String, default: '' },                             // hero/strip image (optional)
    accent: { type: String, default: '#7C5CFF', trim: true, maxlength: 9 }, // Voltage accent hint

    /* money math — percentage/fixed drive unit pricing; bogo/combo ignore it */
    discount: discountSchema,

    /* BOGO config — buy X get Y free of the SAME product, applied per order
       line at order time (free units ship + consume stock as a price-0 line) */
    bogo: {
      buyQty: { type: Number, default: 1, min: 1 },
      getQty: { type: Number, default: 1, min: 1 },
    },

    /* combo offers link to the proven ComboBundle engine (order-time
       allocation pricing) — the deal is the promotional wrapper */
    bundleSlug: { type: String, default: '', lowercase: true, trim: true },

    /* who does this deal cover? slugs are stable and human-authorable */
    scope: {
      kind: { type: String, enum: ['all', 'categories', 'brands', 'products'], default: 'all', index: true },
      categories: { type: [String], default: [] },  // branch-aware: subtree covered via categoryPath
      brands: { type: [String], default: [] },
      products: { type: [String], default: [] },
    },

    /* scheduling — start/stop by the clock, no cron */
    window: windowSchema,

    /* the two human switches — everything else is computed */
    published: { type: Boolean, default: false, index: true }, // false = draft
    active: { type: Boolean, default: true, index: true },     // false = paused

    priority: { type: Number, default: 100, min: 0 },          // lower = shown first / wins ties
    featured: { type: Boolean, default: false, index: true },  // homepage/deals hero slot
    channels: { type: [String], enum: ['home', 'deals', 'pdp', 'cart'], default: ['deals'] },

    usageLimit: { type: Number, default: 0, min: 0 },          // 0 = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },            // per-order subtotal floor (BDT)
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

dealSchema.index({ type: 1, 'window.startsAt': -1 });
dealSchema.index({ 'scope.categories': 1 });
dealSchema.index({ 'scope.brands': 1 });
dealSchema.index({ 'scope.products': 1 });
dealSchema.index({ priority: 1, 'window.endsAt': 1 });

/* computed state — draft | paused | scheduled | active | expired */
dealSchema.methods.statusOf = function (now = new Date()) {
  if (!this.published) return 'draft';
  if (!this.active) return 'paused';
  if (now < this.window.startsAt) return 'scheduled';
  if (now > this.window.endsAt) return 'expired';
  return 'active';
};

/* live = a customer-facing, price-affecting deal right now (usage not exhausted) */
dealSchema.methods.isLive = function (now = new Date()) {
  if (this.statusOf(now) !== 'active') return false;
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return false;
  return true;
};

/* unit price for percentage/fixed deals off `base` — null when the math
   would not produce a real discount (never price at or above base; floor 1) */
dealSchema.methods.unitPriceFor = function (base) {
  const b = +base;
  if (!b || b <= 0) return null;
  const d = this.discount || {};
  let price = null;
  if (d.kind === 'percentage' && d.value > 0 && d.value <= 100) {
    let off = Math.round(((b * d.value) / 100) * 100) / 100;
    if (d.maxOff > 0 && off > d.maxOff) off = d.maxOff;
    price = b - off;
  } else if (d.kind === 'fixed' && d.value > 0) {
    price = b - d.value;
  }
  if (price == null || price < 1 || price >= b) return null;
  return Math.round(price * 100) / 100;
};

/* compact shape for public listings (deals page, home strip, admin table) */
dealSchema.methods.summary = function (now = new Date()) {
  const status = this.statusOf(now);
  return {
    id: String(this._id),
    name: this.name, nameBn: this.nameBn, slug: this.slug, type: this.type,
    description: this.description, badge: this.badge, banner: this.banner,
    accent: this.accent,
    discount: {
      kind: this.discount.kind, value: this.discount.value, maxOff: this.discount.maxOff,
      label: this.discountLabel(),
    },
    bogo: { buyQty: this.bogo.buyQty, getQty: this.bogo.getQty, label: this.bogoLabel() },
    bundleSlug: this.bundleSlug,
    scope: { kind: this.scope.kind, categories: this.scope.categories, brands: this.scope.brands, products: this.scope.products },
    startsAt: this.window.startsAt, endsAt: this.window.endsAt,
    priority: this.priority, featured: this.featured, channels: this.channels,
    usageLimit: this.usageLimit, usedCount: this.usedCount, minOrder: this.minOrder,
    published: this.published, active: this.active, status,
  };
};

/* human discount summary for cards/badges */
dealSchema.methods.discountLabel = function () {
  if (this.type === 'bogo') return this.bogoLabel();
  if (this.type === 'combo') return 'Combo price';
  const d = this.discount || {};
  if (d.kind === 'percentage') return `${d.value}% OFF`;
  return `৳${d.value} OFF`;
};

dealSchema.methods.bogoLabel = function () {
  return `Buy ${this.bogo.buyQty} Get ${this.bogo.getQty} Free`;
};

/* static mirror for lean docs (service layer works on .lean() payloads) */
dealSchema.statics.statusOf = function (doc, now = new Date()) {
  if (!doc.published) return 'draft';
  if (!doc.active) return 'paused';
  if (now < doc.window.startsAt) return 'scheduled';
  if (now > doc.window.endsAt) return 'expired';
  return 'active';
};

module.exports = mongoose.model('Deal', dealSchema);
module.exports.DEAL_TYPES = DEAL_TYPES;
