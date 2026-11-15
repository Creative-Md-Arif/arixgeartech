const mongoose = require('mongoose');

/* Phase 2 (v2 catalog) — Category is now a TREE:
   parent=null → root category · parent=<Category _id> → subcategory.
   `path` is the denormalized ancestor slug chain (root first, self last) so
   breadcrumb + "shop by branch" filters never need recursion. */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, default: '', trim: true, maxlength: 80 }, // Bengali tile/nav label (falls back to name)
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    path: { type: [String], default: [] },     // ancestor slugs incl. self: ['laptops', 'gaming-laptops']
    icon: { type: String, default: '' },       // optional icon key for the nav grid
    image: { type: String, default: '' },      // tile image URL
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    /* Step 5 — DYNAMIC SPECIFICATION SYSTEM. Per-category unlimited spec
       groups + custom fields. Shape is owned by utils/specs.js (single source
       of truth; every write normalizes through normalizeSpecGroups()):
         specGroups: [{ key, label, labelBn, collapsed, order,
                        fields: [{ key, label, labelBn,
                                   type: text|number|select|multiselect|boolean|textarea,
                                   options[], unit, defaultValue,
                                   repeatable, filterable, showInDetails,
                                   required, order }] }]
       Products store {g,k,v} rows against this schema; new fields are added
       from the Admin UI (or auto-created by the AI importer) — no code change. */
    specGroups: { type: [mongoose.Schema.Types.Mixed], default: [] },
    /* default for the PDP "hide empty fields" behaviour (product may override) */
    hideEmptyFields: { type: Boolean, default: true },
    /* Step 6 — SCHEMA VERSIONING + AUDIT TRAIL. schemaVersion increments on
       every schema mutation (editor save / template apply / AI auto-create);
       schemaAudit keeps the last 20 entries (who · when · what changed) so
       "which edit added this field" is always answerable. */
    schemaVersion: { type: Number, default: 0 },
    schemaAudit: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
