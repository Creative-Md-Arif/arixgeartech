const mongoose = require('mongoose');

/**
 * Product badge — fully admin-managed (Admin → Catalog → Badges).
 * Products store the badge `key`; the storefront resolves label + color live.
 * Deleting a badge does not touch products — they simply render no badge.
 */
const badgeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 24 },
    labelBn: { type: String, default: '', trim: true, maxlength: 24 }, // Task 58 — Bengali chip label (falls back to label)
    color: { type: String, default: '#2F81F7', trim: true }, // chip background (any CSS color)
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Badge', badgeSchema);
