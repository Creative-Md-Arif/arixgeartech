const mongoose = require('mongoose');

/* ================= ReturnRequest — RMA workflow (Layer 3) =================
   Delivered order → customer opens a return request from the tracking page
   (order number + phone) or an account owner request. Admin resolves it:
     requested → approved  (return accepted, parcel expected back)
     requested → rejected  (return denied, with a note to the customer)
     approved  → refunded  (money back — amount is appended to the ORDER's
                            payment.refunds ledger so finance reports see it)

   One ACTIVE request per order. Items snapshot copied from the order so later
   product edits never rewrite return history.                                */

const RETURN_REASONS = ['damaged', 'wrong-item', 'size-issue', 'not-as-described', 'late', 'other'];
const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

const returnRequestSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, index: true },

    customer: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
    },

    /* snapshot of the requested lines: { slug, name, qty, price } */
    items: [
      {
        slug: String,
        name: String,
        qty: { type: Number, min: 1 },
        price: Number,
      },
    ],

    reason: { type: String, enum: RETURN_REASONS, default: 'other' },
    note: { type: String, default: '', trim: true, maxlength: 600 },

    status: { type: String, enum: RETURN_STATUSES, default: 'requested', index: true },
    refundAmount: { type: Number, default: 0 },
    resolveNote: { type: String, default: '' },
    resolvedBy: { type: String, default: null },
    resolvedAt: Date,
  },
  { timestamps: true }
);

returnRequestSchema.index({ orderNumber: 1, status: 1 });

returnRequestSchema.methods.publicView = function () {
  return {
    id: this._id,
    orderNumber: this.orderNumber,
    customer: this.customer,
    items: this.items,
    reason: this.reason,
    note: this.note,
    status: this.status,
    refundAmount: this.refundAmount,
    resolveNote: this.resolveNote,
    resolvedAt: this.resolvedAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
module.exports.RETURN_REASONS = RETURN_REASONS;
module.exports.RETURN_STATUSES = RETURN_STATUSES;
