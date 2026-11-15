const mongoose = require('mongoose');

/**
 * Homepage Section Management model.
 * The homepage is a stack of sections; admins control which are visible,
 * in what order, and what each section contains (via config).
 *
 * type (Phase 3 — the 13-section homepage):
 *  - slider          : hero reel (reads Banners position=hero; side promos = position=side)
 *  - ticker          : marquee announcement strip
 *  - quick-services  : Laptop Finder · AC Ton Calculator · Raise-a-Complaint · Servicing Center
 *  - categories      : category tiles (config.categories = root slugs)
 *  - flash-deals     : live flash-sale grid + countdown (reads /api/products/flash)
 *  - product-carousel: config.source = newest | best-selling | trending | featured (+ config.limit)
 *  - best-sellers    : dedicated best-selling carousel (config.limit)
 *  - combo-bundles   : content is managed by ComboBundle; HomeSection controls visibility only
 *  - product-grid    : config.title + product slugs (config.products)
 *  - goal-panels     : (legacy fitness — kept for old configs; renders null without goals)
 *  - custom-banner   : single promo banner (config.bannerId)
 *  - html            : free-form section (config.html)
 */
const homeSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    /* Task 58 — Bengali twins (optional; storefront falls back to English when empty) */
    titleBn: { type: String, default: '' },
    subtitleBn: { type: String, default: '' },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

homeSectionSchema.index({ order: 1 });

module.exports = mongoose.model('HomeSection', homeSectionSchema);
