const mongoose = require('mongoose');

/**
 * Singleton settings document (key = 'store').
 * Admin can change payment merchant numbers and every shipping charge
 * from the admin panel — no code deploy needed.
 */
const DIVISIONS = ['dhaka', 'chattogram', 'rajshahi', 'khulna', 'barishal', 'sylhet', 'rangpur', 'mymensingh'];

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'store', unique: true },

    currency: { type: String, default: '৳' },
    currencyCode: { type: String, default: 'BDT' },

    payments: {
      bkash: { label: { type: String, default: 'bKash' }, number: { type: String, default: '01712-345678' }, ussd: { type: String, default: '*247#' }, type: { type: String, default: 'Send Money' } },
      nagad: { label: { type: String, default: 'Nagad' }, number: { type: String, default: '01812-345678' }, ussd: { type: String, default: '*167#' }, type: { type: String, default: 'Send Money' } },
      rocket: { label: { type: String, default: 'Rocket' }, number: { type: String, default: '01912-3456787' }, ussd: { type: String, default: '*322#' }, type: { type: String, default: 'Send Money' } },
    },

    /* Online payment gateway (Task 40) — SSLCOMMERZ. Credentials are stored
       server-side only; every admin GET returns storePasswd masked as
       '••••••••' and a save carrying the mask keeps the stored value.
       sandbox=true hits sandbox.sslcommerz.com, false → securepay.sslcommerz.com.
       When enabled but storeId/storePasswd are EMPTY the backend runs a
       local simulated session (init returns /payment/sandbox URL) so the full
       pay → validate → paid lifecycle stays testable without real creds. */
    gateway: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, default: 'sslcommerz', enum: ['sslcommerz'] },
      storeId: { type: String, default: '', trim: true },
      storePasswd: { type: String, default: '', trim: true },
      sandbox: { type: Boolean, default: true },
    },

    shipping: {
      freeThreshold: { type: Number, default: 15000, min: 0 }, // free shipping at/above this subtotal in ৳ (after discount) — audit fix: negative would make EVERY order free
      divisions: {
        type: Map,
        of: Number,
        default: () => new Map([
          ['dhaka', 60],        // inside Dhaka
          ['chattogram', 100],
          ['rajshahi', 100],
          ['khulna', 100],
          ['barishal', 120],
          ['sylhet', 120],
          ['rangpur', 120],
          ['mymensingh', 100],
        ]),
      },
    },

    store: {
      name: { type: String, default: 'ArixGear' },
      email: { type: String, default: 'support@arixgear.tech' },
      phone: { type: String, default: '01712-345678' },
      address: { type: String, default: 'Banani, Dhaka 1213, Bangladesh' },
    },

    /* Live chat + WhatsApp / Telegram — configured from Admin → Settings.
       whatsapp: BD number in any format (01712345678 / +8801712345678) —
       the storefront normalizes it into a wa.me link. telegram: username
       (with or without @) or a full t.me link. */
    chat: {
      enabled: { type: Boolean, default: true },
      whatsapp: { type: String, default: '01712-345678', trim: true },
      telegram: { type: String, default: 'forgedfit', trim: true },
      greeting: { type: String, default: 'Assalamu alaikum! Drop your question here — we usually reply within an hour (9am–10pm).', trim: true },
      greetingBn: { type: String, default: '', trim: true }, // Task 58 — Bengali chat greeting (falls back to greeting)
    },

    /* Facebook (Meta) Pixel — configured from the admin panel, no code deploy.
       When enabled, the storefront injects the Pixel base code at runtime and
       fires the standard e-commerce events for Ads conversion tracking. */
    pixel: {
      enabled: { type: Boolean, default: false },
      pixelId: { type: String, default: '', trim: true },
    },

    /* Flash sale banner (Task 42 pack) — one admin-managed promo banner.
       enabled flips the banner on; endsAt in the past auto-disables the
       effective flag exposed by GET /api/settings/flash-sale. */
    flashSale: {
      enabled: { type: Boolean, default: false },
      label: { type: String, default: '', trim: true, maxlength: 60 },
      sublabel: { type: String, default: '', trim: true, maxlength: 120 },
      labelBn: { type: String, default: '', trim: true, maxlength: 60 }, // Task 58 — Bengali banner label
      sublabelBn: { type: String, default: '', trim: true, maxlength: 120 }, // Task 58 — Bengali banner sublabel
      link: { type: String, default: '/shop', trim: true, maxlength: 200 },
      endsAt: { type: Date, default: null },
    },

    /* Task 52 — checkout rules. guestEnabled=false flips the storefront into
       "account required" mode: the checkout form is replaced by a login card
       and POST /api/orders refuses no-account (guest) requests with 403
       GUEST_CHECKOUT_DISABLED. Logged-in customers and admin manual orders
       (source:'manual') are never affected. */
    checkout: {
      guestEnabled: { type: Boolean, default: true },
    },

    /* Task 57 — maintenance kill-switch. ON → the storefront shows
       a branded holding screen and POST /api/orders refuses with 503
       MAINTENANCE_MODE. Admin panel + manual orders keep working. */
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: '', maxlength: 500 },
      messageBn: { type: String, default: '', maxlength: 500 }, // Task 58 — Bengali maintenance message
    },

    /* Phase 4 (4.4) — order number prefix (Settings → Order prefix).
       Default keeps the brand prefix 'ARG-…'. Admin may re-skin it (2–8
       chars, A-Z 0-9, inner hyphens, no leading hyphen); the suffix stays
       base36-time + 2 random chars. */
    orders: {
      prefix: { type: String, default: 'ARG', uppercase: true, trim: true, match: [/^(?!-)[A-Z0-9-]{2,8}$/, 'Prefix: 2–8 chars A-Z/0-9, inner hyphens allowed'] },
    },

    /* Task 57 — admin web-push (PWA). VAPID pair is generated once and kept
       here; subscriptions[] holds every admin device that enabled push. */
    push: {
      vapidPublic: { type: String, default: '' },
      vapidPrivate: { type: String, default: '' },
      subscriptions: {
        type: [{
          endpoint: { type: String, required: true },
          keys: { p256dh: String, auth: String },
          agent: { type: String, default: '' },
          createdAt: { type: Date, default: Date.now },
        }],
        default: [],
      },
    },

    /* Task 56-a — loyalty program rules. earnPer100 = points per full ৳100
       of grand total (credited on delivery, matches awardDeliveryPoints).
       pointValue = ৳ value of 1 point at checkout redemption. minRedeem =
       smallest redeemable balance. maxRedeemPct = cap as % of order subtotal
       so points can never swallow the whole order. */
    loyalty: {
      enabled: { type: Boolean, default: true },
      earnPer100: { type: Number, default: 1, min: 0, max: 100 },
      pointValue: { type: Number, default: 1, min: 0.1, max: 100 },
      minRedeem: { type: Number, default: 100, min: 0 },
      maxRedeemPct: { type: Number, default: 50, min: 5, max: 100 },
    },

    /* Courier API integration (Layer 3) — Steadfast / Pathao.
       provider 'none' = manual dispatch (dry-run). Credentials are entered
       once in Admin → Settings → Courier; autoPushOnShipped fires the push
       the moment an admin flips an order to "shipped". */
    courier: {
      provider: { type: String, enum: ['none', 'steadfast', 'pathao'], default: 'none' },
      autoPushOnShipped: { type: Boolean, default: false },
      steadfast: {
        apiKey: { type: String, default: '', trim: true },
        secretKey: { type: String, default: '', trim: true },
      },
      pathao: {
        baseUrl: { type: String, default: 'https://api-hermes.pathao.com', trim: true },
        storeId: { type: String, default: '', trim: true },
        clientId: { type: String, default: '', trim: true },
        clientSecret: { type: String, default: '', trim: true },
        username: { type: String, default: '', trim: true },
        password: { type: String, default: '', trim: true },
      },
    },

    /* Size Guide (PDP accordion + "Size guide" link) — fully admin-managed.
       headers/rows render as a plain table; enabled=false hides the whole
       block from the storefront. Defaults mirror the legacy hardcoded table. */
    sizeGuide: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: 'Size Guide', trim: true, maxlength: 80 },
      note: { type: String, default: 'Measurements are body measurements in centimetres (cm). Between two sizes? Size up for a relaxed fit.', trim: true, maxlength: 300 },
      titleBn: { type: String, default: '', trim: true, maxlength: 80 }, // Task 58 — Bengali guide title
      noteBn: { type: String, default: '', trim: true, maxlength: 300 }, // Task 58 — Bengali guide note
      headers: { type: [String], default: ['Size', 'Chest (cm)', 'Waist (cm)'] },
      rows: {
        type: [[String]],
        default: [
          ['S', '88–94', '72–78'],
          ['M', '95–101', '79–85'],
          ['L', '102–108', '86–92'],
          ['XL', '109–115', '93–99'],
          ['XXL', '116–124', '100–108'],
        ],
      },
    },

    /* Task 32 — per-category Size Guide tables. PDP resolution order:
       product custom → THIS category table → global sizeGuide → default.
       Each entry carries its own visibility switch (enabled=false hides the
       guide + the “Size guide” link for that whole category). Entries are
       admin-managed from Settings → 🗂 Category-specific Tables; partial
       {category, enabled} saves toggle the switch without touching the table. */
    categoryGuides: {
      type: [{
        _id: false,
        category: { type: String, required: true, lowercase: true, trim: true },
        enabled: { type: Boolean, default: true },
        title: { type: String, default: 'Size Guide', trim: true, maxlength: 80 },
        note: { type: String, default: '', trim: true, maxlength: 300 },
        titleBn: { type: String, default: '', trim: true, maxlength: 80 }, // Task 58 — Bengali guide title
        noteBn: { type: String, default: '', trim: true, maxlength: 300 }, // Task 58 — Bengali guide note
        headers: { type: [String], default: [] },
        rows: { type: [[String]], default: [] },
      }],
      default: [],
    },

    /* Editable site content (footer / about / contact / faqs / journal posts).
       Merged over src/config/contentDefaults.js — partial saves are safe. */
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    /* Centralized visual theme configuration and preset history. */
    theme: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

settingSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'store' });
  if (!doc) doc = await this.create({ key: 'store' });
  return doc;
};

/** Stored content merged over defaults — one level deep per top block. */
settingSchema.statics.publicContent = async function () {
  const defaults = require('../config/contentDefaults');
  const s = await this.get();
  const stored = s.content || {};
  const merged = JSON.parse(JSON.stringify(defaults)); // deep clone
  for (const k of Object.keys(stored)) {
    const v = stored[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object' && !Array.isArray(merged[k])) {
      merged[k] = { ...merged[k], ...v };
    } else {
      merged[k] = v;
    }
  }
  return merged;
};

settingSchema.statics.publicView = async function () {
  const s = await this.get();
  return {
    currency: s.currency,
    currencyCode: s.currencyCode,
    payments: {
      bkash: s.payments.bkash,
      nagad: s.payments.nagad,
      rocket: s.payments.rocket,
    },
    /* Task 40 — credential-free gateway block for the storefront checkout */
    gateway: {
      enabled: Boolean(s.gateway && s.gateway.enabled),
      sandbox: Boolean(s.gateway && s.gateway.sandbox),
      provider: (s.gateway && s.gateway.provider) || 'sslcommerz',
    },
    shipping: {
      freeThreshold: s.shipping.freeThreshold,
      divisions: Object.fromEntries(s.shipping.divisions),
    },
    /* Task 52 — guest checkout policy (legacy docs without the block read as ON) */
    checkout: {
      guestEnabled: !(s.checkout && s.checkout.guestEnabled === false),
    },
    /* Task 57 — maintenance kill-switch (rides /settings/payment + /settings/public) */
    maintenance: {
      enabled: Boolean(s.maintenance && s.maintenance.enabled),
      message: (s.maintenance && s.maintenance.message) || '',
      messageBn: (s.maintenance && s.maintenance.messageBn) || '', // Task 58
    },
    store: s.store,
  };
};

module.exports = mongoose.model('Setting', settingSchema);
module.exports.DIVISIONS = DIVISIONS;
