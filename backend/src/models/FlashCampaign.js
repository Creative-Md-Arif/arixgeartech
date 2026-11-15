const mongoose = require('mongoose');

/* Phase 4 (4.1) — FlashCampaign. Phase 3's flash engine lives per-product
   (product.flash = { price, startsAt, endsAt }, read-time evaluation in
   services/flash.js — the storefront, cards and server totals all obey it).

   A campaign is the ADMIN-SIDE authoring object: pick products, give each a
   deal price, set one shared window. `apply` syncs the engine fields onto the
   products (so the rest of the system keeps running on the proven read-time
   rule); `end` clears them. No cron — campaigns start/stop by the clock. */

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    titleBn: { type: String, default: '', trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase letters/digits with hyphens'] },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    banner: { type: String, default: '' },

    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

    products: {
      type: [{
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        slug: { type: String, required: true },
        name: { type: String, required: true },
        basePrice: { type: Number, required: true, min: 0 }, // regular price at authoring time
        dealPrice: { type: Number, required: true, min: 1 },
      }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 30,
        message: 'A campaign carries 1–30 products',
      },
    },

    active: { type: Boolean, default: true, index: true },
    appliedAt: { type: Date, default: null },   // last successful apply()
    endedAt: { type: Date, default: null },     // last successful end()
  },
  { timestamps: true }
);

campaignSchema.methods.isLive = function (now = new Date()) {
  return Boolean(this.active && this.startsAt && this.endsAt && now >= this.startsAt && now <= this.endsAt);
};

module.exports = mongoose.model('FlashCampaign', campaignSchema);
