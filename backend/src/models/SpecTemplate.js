const mongoose = require('mongoose');

/* Step 5 — REUSABLE SPEC TEMPLATE. A saved set of spec groups/fields that can
   be applied to any category (merge or replace) — the "Reusable Templates"
   half of the dynamic specification system. Shape identical to
   Category.specGroups; normalized through utils/specs.normalizeSpecGroups(). */
const specTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, default: '', trim: true, maxlength: 80 },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    groups: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SpecTemplate', specTemplateSchema);
