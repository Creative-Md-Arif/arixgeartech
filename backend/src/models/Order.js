const mongoose = require('mongoose');

const DIVISIONS = ['dhaka', 'chattogram', 'rajshahi', 'khulna', 'barishal', 'sylhet', 'rangpur', 'mymensingh'];
const ORDER_STATUSES = ['verifying', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'payment-rejected'];

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true }, // e.g. ARG-8FK2QA

    /* Idempotency guard — the storefront sends a UUID per checkout attempt; a
       double-click / network retry reusing the same key returns the ORIGINAL
       order instead of charging the customer twice. Sparse unique index — the
       field must stay ABSENT (not null) on orders without a key, because a
       null value IS indexed and every null would collide with the next. */
    idemKey: { type: String },

    /* One-shot flag: customer cancel / admin cancel / payment-reject all give
       stock back — this flag guarantees it can only ever happen once. */
    stockRestored: { type: Boolean, default: false },

    /**
     * Order source:
     *  - online: placed by the customer through the storefront checkout
     *  - manual: entered by an admin in the ERP (WhatsApp / phone / inbox orders)
     * Both live in the same collection so every dashboard metric (orders,
     * revenue, 7-day chart, top sellers) stays in sync automatically.
     */
    source: { type: String, enum: ['online', 'manual'], default: 'online', index: true },
    channel: { type: String, default: '', trim: true },   // WhatsApp / Phone / Facebook / Instagram / Walk-in
    entryBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // admin who entered a manual order

    // Guest orders allowed — user only linked when a valid token is present.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isGuest: { type: Boolean, default: true },

    customer: {
      name: { type: String, required: [true, 'Customer name is required'], trim: true },
      phone: { type: String, required: [true, 'Phone number is required'], trim: true },
      email: { type: String, lowercase: true, trim: true, default: '' },
    },

    shipping: {
      address: { type: String, required: [true, 'Address is required'], trim: true },
      city: { type: String, required: [true, 'City is required'], trim: true },
      division: { type: String, required: true, enum: DIVISIONS },
      postal: { type: String, default: '' },
      notes: { type: String, default: '' },
    },

    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        nameBn: String, // Task 58 — Bengali name snapshot at purchase time (falls back to `name`)
        slug: String,
        image: String,
        price: { type: Number, min: 0 }, // unit price snapshot at purchase time (audit fix — never negative)
        qty: { type: Number, min: 1 },
        color: String,
        size: String,
        lineTotal: { type: Number, min: 0 },
        /* Phase 4 (4.1) — combo-bundle provenance: this line was bought as part
           of a bundle, unit price = allocated share of bundlePrice (sums to the
           bundle price exactly). null for regular cart lines. */
        bundle: { type: { slug: String, title: String }, default: null },
        /* Phase 8 — centralized deals provenance: which promotion priced this
           line (slug/name/kind), and for BOGO freebies the price-0 line carries
           dealFree { deal, name, of } so invoices and admin rows stay honest.
           (field is `kind` — `type` is reserved inside mongoose subdoc literals) */
        deal: { type: { slug: String, name: String, kind: String }, default: null },
        dealFree: { type: { deal: String, name: String, of: String }, default: null },
      },
    ],

    totals: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      couponCode: { type: String, default: null },
      shipping: { type: Number, default: 0, min: 0 },
      grandTotal: { type: Number, required: true, min: 0 },
      /* Phase 4 (4.1) — combo-bundle savings: Σ(componentsTotal − bundlePrice)
         across every bundle line. Informational + analytics; the charged
         subtotal already carries the deal (allocated unit prices). */
      bundleSave: { type: Number, default: 0, min: 0 },
      /* Task 56-a — loyalty redemption: points burned + ৳ value credited
         against this order. pointsRefunded makes a cancellation refund
         exactly-once (customer cancel, admin delete, status→cancelled). */
      pointsRedeemed: { type: Number, default: 0, min: 0 },
      pointsDiscount: { type: Number, default: 0, min: 0 },
    },
    pointsRefunded: { type: Boolean, default: false },

    /**
     * Manual payment management:
     *  - mobile methods (bkash/nagad/rocket): customer sends money to the merchant
     *    number, submits TrxID + screenshot. Admin verifies against the real
     *    merchant statement, then marks verified/rejected.
     *  - cod: cash collected on delivery (status cod-pending → cod-collected).
     */
    payment: {
      // sslcommerz (Task 40): paid online via SSLCOMMERZ — card / net banking / mobile wallet.
      // cash/bank: manual orders only (walk-in cash or bank transfer recorded by admin)
      method: { type: String, enum: ['bkash', 'nagad', 'rocket', 'cod', 'cash', 'bank', 'sslcommerz'], required: true },
      trxId: { type: String, uppercase: true, default: null },
      senderNumber: { type: String, default: null },
      screenshot: {
        url: { type: String, default: null },
        publicId: { type: String, default: null },
        filename: { type: String, default: null },
      },
      expectedAmount: { type: Number, default: 0, min: 0 },
      status: {
        type: String,
        enum: ['pending', 'verified', 'rejected', 'cod-pending', 'cod-collected', 'paid', 'failed'],
        default: 'pending',
      },
      /* Gateway session/proof (Task 40) — sessionKey is the HMAC issued at
         /payments/init in simulated mode; valId/bankTrxId/cardType come from
         the SSLCOMMERZ validation response. sessionKey NEVER leaves the server. */
      gateway: {
        sessionKey: { type: String, default: null },
        valId: { type: String, default: null },
        tranId: { type: String, default: null },
        bankTrxId: { type: String, default: null },
        cardType: { type: String, default: null },
        paidAt: { type: Date, default: null },
        failedAt: { type: Date, default: null },
      },
      verifiedAt: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectReason: { type: String, default: null },
      /* RMA refund ledger — admin marks a return request as refunded */
      refunds: [{ amount: { type: Number, min: 0 }, note: String, by: String, at: { type: Date, default: Date.now } }],
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'verifying', index: true },
    /* Task 42 — loyalty points awarded exactly once, on first delivery */
    loyaltyAwarded: { type: Boolean, default: false },
    statusHistory: [
      {
        status: String,
        note: { type: String, default: '' },
        at: { type: Date, default: Date.now },
        by: { type: String, default: 'system' }, // admin name or 'system'
      },
    ],

    courier: {
      name: { type: String, default: null },     // Steadfast / Pathao / Sundarban ...
      consignmentNo: { type: String, default: null },
      trackingUrl: { type: String, default: null },
    },
  },
  { timestamps: true }
);

orderSchema.index({ 'customer.phone': 1 });
/* Audit fix — a TrxID may be used for ONE order per payment method. The old
   non-unique index only sped up lookups; two concurrent checkouts with the
   same TrxID could both pass the check-then-create findOne. The partial
   unique index makes MongoDB itself the guard (E11000 → 409 in the API).
   partialFilterExpression keeps null/absent TrxIDs (COD, SSLCOMMERZ, cash)
   out of the uniqueness game — only real string TrxIDs compete. */
orderSchema.index(
  { 'payment.method': 1, 'payment.trxId': 1 },
  { unique: true, partialFilterExpression: { 'payment.trxId': { $type: 'string' } } }
);
orderSchema.index({ createdAt: -1 });
orderSchema.index({ idemKey: 1 }, { unique: true, sparse: true });

/* Phase 4 (4.4) — admin-configurable order prefix (Settings → Order prefix,
    default 'ARG'). `^(?!-)[A-Z0-9-]{2,8}$` — no leading hyphen, keeps the
    legacy ARG- shape by default. */
orderSchema.statics.generateOrderNumber = function (prefix) {
  const t = Date.now().toString(36).toUpperCase().slice(-5);
  const r = Math.random().toString(36).toUpperCase().slice(2, 4);
  const p = String(prefix || 'ARG').toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'ARG';
  return `${p.replace(/-+$/, '')}-${t}${r}`;
};

orderSchema.methods.pushHistory = function (status, note = '', by = 'system') {
  this.statusHistory.push({ status, note, at: new Date(), by });
  this.status = status;
};

orderSchema.methods.publicView = function () {
  return {
    orderNumber: this.orderNumber,
    isGuest: this.isGuest,
    canCancel: ['verifying', 'processing', 'packed'].includes(this.status) && !this.stockRestored,
    customer: this.customer,
    shipping: this.shipping,
    items: this.items,
    totals: this.totals,
    payment: {
      method: this.payment.method,
      trxId: this.payment.trxId,
      status: this.payment.status,
      expectedAmount: this.payment.expectedAmount,
      rejectReason: this.payment.rejectReason,
      gateway: this.payment.gateway && this.payment.gateway.valId
        ? { valId: this.payment.gateway.valId, cardType: this.payment.gateway.cardType, paidAt: this.payment.gateway.paidAt }
        : null,
      refunds: (this.payment.refunds || []).map((r) => ({ amount: r.amount, note: r.note, by: r.by, at: r.at })),
    },
    status: this.status,
    statusHistory: this.statusHistory,
    courier: this.courier,
    createdAt: this.createdAt,
    eta: new Date(new Date(this.createdAt).getTime() + 3 * 24 * 3600 * 1000),
  };
};

module.exports = mongoose.model('Order', orderSchema);
module.exports.DIVISIONS = DIVISIONS;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
