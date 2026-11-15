const mongoose = require('mongoose');

/* Phase 4 (4.4) — StockLog. Every stock movement gets an append-only ledger row
   so "why is stock 3?" has an answer. Written fire-and-forget by orderOps
   (order / restore / compensation paths), the admin adjust endpoint and the
   courier-free manual flows. Capped-ish: queries are always time-boxed. */

const REASONS = ['order', 'restore', 'adjust', 'manual-order', 'return', 'import', 'correction'];

const stockLogSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productSlug: { type: String, default: '', index: true },
    productName: { type: String, default: '' },

    delta: { type: Number, required: true }, // ± units (sold-side convention: order → negative)
    before: { type: Number, required: true },
    after: { type: Number, required: true },

    reason: { type: String, enum: REASONS, required: true, index: true },
    orderNumber: { type: String, default: null }, // ARG-… when movement came from an order
    note: { type: String, default: '', trim: true, maxlength: 300 },

    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'system' },
  },
  { timestamps: true }
);

stockLogSchema.index({ product: 1, createdAt: -1 });
stockLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockLog', stockLogSchema);
module.exports.REASONS = REASONS;
