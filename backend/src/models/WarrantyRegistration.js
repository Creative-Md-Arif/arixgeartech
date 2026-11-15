const mongoose = require('mongoose');

/* Phase 4 (4.2) — WarrantyRegistration. The tech catalog sells warranty-eligible
   gear (Product.warranty { months, type, note } from Phase 2); this model is the
   registry the customer activates after delivery ("register my warranty") and
   the admin/service desk checks when a claim walks in.

   Identity: regNumber ARG-W-XXXXXX (public lookup key). A registration always
   binds to a real order + product line (price of honesty: no floating claims),
   verified by the checkout phone. */

const warrantySchema = new mongoose.Schema(
  {
    regNumber: { type: String, unique: true, index: true }, // ARG-W-XXXXXX

    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productName: { type: String, required: true, trim: true, maxlength: 160 },
    productSlug: { type: String, default: '', trim: true },
    sku: { type: String, default: '', trim: true },

    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, uppercase: true, trim: true },

    customer: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 16 },
      email: { type: String, default: '', lowercase: true, trim: true, maxlength: 160 },
    },

    serial: { type: String, default: '', trim: true, uppercase: true, maxlength: 40 }, // optional device serial
    purchaseDate: { type: Date, required: true },
    warrantyMonths: { type: Number, required: true, min: 0, max: 240 }, // audit fix — aligned with Product.warranty (was 120; a 240-month product could never fully register)
    expiresAt: { type: Date, required: true },

    /* active → claimed (a ServiceTicket linked via ticketNumber) → expired (computed on read) */
    status: { type: String, enum: ['active', 'claimed'], default: 'active', index: true },
    ticketNumber: { type: String, default: null }, // latest linked ServiceTicket

    notes: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

/* virtual freshness — status stays 'active'/'claimed', isExpired() is the truth */
warrantySchema.methods.isExpired = function (now = new Date()) {
  return Boolean(this.expiresAt && now > this.expiresAt);
};

warrantySchema.methods.publicView = function () {
  return {
    regNumber: this.regNumber,
    productName: this.productName,
    sku: this.sku || '',
    orderNumber: this.orderNumber,
    customerName: this.customer.name,
    phoneMasked: (this.customer.phone || '').replace(/^(\d{5})\d+(\d{2})$/, '$1****$2'),
    serial: this.serial || '',
    purchaseDate: this.purchaseDate,
    warrantyMonths: this.warrantyMonths,
    expiresAt: this.expiresAt,
    expired: this.isExpired(),
    status: this.status,
    createdAt: this.createdAt,
  };
};

warrantySchema.statics.generateRegNumber = function () {
  const r = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(2, 8);
  return `ARG-W-${r}`;
};

module.exports = mongoose.model('WarrantyRegistration', warrantySchema);
