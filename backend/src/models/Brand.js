const mongoose = require('mongoose');

/* Phase 2 (v2 catalog) — Brand.
   Products reference brands (Product.brand → Brand._id); the storefront gets
   brand facets (product counts) from the public list endpoint and admin CRUD
   lives under /api/admin/brands (module key: 'brands'). */
const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    nameBn: { type: String, default: '', trim: true, maxlength: 80 }, // bn label (falls back to name)
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    logo: { type: String, default: '' },        // tile/logo image URL (empty → wordmark tile)
    description: { type: String, default: '', maxlength: 2000 },
    descriptionBn: { type: String, default: '', maxlength: 2000 },
    website: { type: String, default: '', maxlength: 300 },
    featured: { type: Boolean, default: false }, // brands-strip / directory ordering
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* live product count — attached by the list endpoint (facet), never stored */
brandSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { delete ret.__v; return ret; },
});

module.exports = mongoose.model('Brand', brandSchema);
