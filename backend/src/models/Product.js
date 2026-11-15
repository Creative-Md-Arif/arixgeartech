const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: String, alt: String, thumb: String },
  { _id: false }
);

/* per-product SEO override — every field optional; empty = fall back to the
   auto template ({product.name} — ArixGear) from the 'product' page SEO doc */
const seoOverrideSchema = new mongoose.Schema(
  {
    metaTitle: { type: String, default: '', maxlength: 220, trim: true },
    metaDescription: { type: String, default: '', maxlength: 600, trim: true },
    metaKeywords: { type: String, default: '', maxlength: 600, trim: true },
    canonicalUrl: { type: String, default: '', maxlength: 600, trim: true },
    metaRobots: { type: String, default: '', maxlength: 80, trim: true },
    og: {
      title: { type: String, default: '', maxlength: 220, trim: true },
      description: { type: String, default: '', maxlength: 600, trim: true },
      image: { type: String, default: '', maxlength: 600, trim: true },
    },
    twitter: {
      title: { type: String, default: '', maxlength: 220, trim: true },
      description: { type: String, default: '', maxlength: 600, trim: true },
      image: { type: String, default: '', maxlength: 600, trim: true },
    },
    /* raw JSON-LD — replaces the page-level customSchema slot on this PDP */
    customSchema: { type: String, default: '', maxlength: 20000 },
  },
  { _id: false }
);

/* Task 32 — per-product Size Guide.
   mode 'inherit' → PDP resolves category table → global table → default.
   mode 'custom'  → this product ships its OWN table (belt waist chart,
   whey serving guide …). Empty headers/rows in custom mode are rejected
   server-side by the shared normalizer. */
const sizeGuideSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['inherit', 'custom'], default: 'inherit' },
    enabled: { type: Boolean, default: true }, // custom table visibility (custom mode only)
    title: { type: String, default: 'Size Guide', trim: true, maxlength: 80 },
    note: { type: String, default: '', trim: true, maxlength: 300 },
    /* Task 58 — Bengali twins (optional; empty = storefront falls back to English) */
    titleBn: { type: String, default: '', trim: true, maxlength: 80 },
    noteBn: { type: String, default: '', trim: true, maxlength: 300 },
    headers: { type: [String], default: [] },
    rows: { type: [[String]], default: [] },
  },
  { _id: false }
);

const warrantySchema = new mongoose.Schema(
  {
    months: { type: Number, default: 0, min: 0, max: 240 },   // 0 = no formal warranty
    type: { type: String, enum: ['manufacturer', 'seller', 'service', 'none'], default: 'manufacturer' },
    note: { type: String, default: '', trim: true, maxlength: 300 }, // free text shown beside the warranty chip
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true },
    /* Task 58 — Bengali display fields. English fields stay the source of truth;
       every *Bn field is optional and the storefront falls back to the English
       value whenever the Bengali one is empty (pick() helper in the SPA). */
    nameBn: { type: String, default: '', trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    /* free slug string — new categories are created from Admin → Catalog and
       stored in the Category collection; no enum so the list can grow.
       Phase 2 (v2 catalog): `categoryRef` mirrors this slug to the Category
       tree doc (resolved server-side on every admin write + migration);
       `categoryPath` is the denormalized ancestor slug chain for tree filters. */
    category: { type: String, default: 'accessories', lowercase: true, trim: true, index: true },
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    categoryPath: { type: [String], default: [] },
    /* Phase 2 (v2 catalog) — brand reference (Brand collection; admin CRUD).
       Populated as { name, slug, logo } on public list/detail responses. */
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    /* Phase 2 — stock-keeping unit (unique, sparse: legacy docs may lack it).
       Auto-generated as ARG-XXXXXXXX when omitted. */
    sku: { type: String, unique: true, sparse: true, uppercase: true, trim: true, maxlength: 32 },
    /* AI Product Import — provenance trail. Set on approve() from the staged
       AiImport doc; powers exact-URL duplicate detection on re-imports. */
    sourceUrl: { type: String, default: '', trim: true, maxlength: 1200 },
    /* Phase 2 — per-product warranty (shown on the PDP + order pages).
       months=0/type='none' → no warranty chip. */
    warranty: { type: warrantySchema, default: () => ({}) },
    /* Phase 2 — generalized variant axis label. Fitness-era "size" chips become
       Storage / Configuration / Capacity / Bundle … per product. The variant
       mechanics (sizes[] + sizeStocks + sizePrices) are unchanged — only the
       PDP label + facets read this. Empty → 'Size'. */
    variantLabel: { type: String, default: '', trim: true, maxlength: 40 },
    variantLabelBn: { type: String, default: '', trim: true, maxlength: 40 },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    comparePrice: { type: Number, min: 0, default: null }, // crossed-out "was" price
    /* Task 57 — scheduled flash sale: while now ∈ [startsAt, endsAt] the live
       price becomes flash.price (beats base AND size overrides, server-side in
       orderController too). startsAt in the future = scheduled; both null = off. */
    flash: {
      price: { type: Number, min: 0, default: null },
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
    },
    images: {
      type: [imageSchema],
      validate: [(v) => v.length > 0, 'At least one image is required'],
    },
    /* badge key string — resolved against the Badge collection (Admin → Catalog);
       'none' = no badge. Seeded keys: none · new · sale · best-seller */
    badge: { type: String, default: 'none', trim: true, lowercase: true },
    stock: { type: Number, default: 25, min: 0 },
    lowStockNotifiedAt: { type: Date, default: null }, // Task 56-e — 24h throttle for admin low-stock bell
    sold: { type: Number, default: 0 },
    views: { type: Number, default: 0 }, // PDP opens (fire-and-forget $inc) — trending sort + admin most-viewed
    colors: [{ name: String, nameBn: String, hex: String, image: String }], // nameBn = Bengali swatch label; image = per-color shot (PDP switches main image)
    sizes: [String],
    sizePrices: [{ s: String, price: { type: Number, min: 0 } }], // per-size price override (falls back to price)
    shortDesc: { type: String, default: '' },
    shortDescBn: { type: String, default: '', trim: true, maxlength: 400 },
    description: { type: String, default: '' },
    descriptionBn: { type: String, default: '', maxlength: 8000 },
    specs: [{ k: String, v: String }],
    specsBn: [{ k: String, v: String }], // Bengali spec rows — mirrors `specs` 1:1
    /* Step 5 — DYNAMIC SPEC VALUES (canonical form against the category's
       specGroups schema): [{ g: groupKey, k: fieldKey, v: scalar|[String] }].
       One row per (g,k). Every admin/AI write regenerates the flat legacy
       `specs`/`specsBn` arrays from these (utils/specs.flatFromValues) so
       compare/CSV/RAG consumers stay in sync — legacy rows remain readable
       for docs saved before this field existed. */
    specValues: [{ g: String, k: String, v: mongoose.Schema.Types.Mixed }],
    /* Step 5 — PDP display switch: hide spec fields whose value is empty
       (product-level override; category.hideEmptyFields is the default). */
    hideEmptySpecs: { type: Boolean, default: true },
    /* Step 5 — KEY FEATURES checklist (PDP card + AI import mapping).
       featuresBn mirrors features 1:1 (empty entries fall back to English). */
    features: { type: [String], default: [] },
    featuresBn: { type: [String], default: [] },
    /* catalog-render fields — the storefront renders straight from /api/products */
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    sizeStocks: [{ s: String, stock: Number }], // per-size stock for PDP urgency
    featured: { type: Boolean, default: false }, // shown in carousels / home picks
    active: { type: Boolean, default: true },
    /* per-product SEO override (Admin → SEO → Products); empty fields = auto template */
    seo: { type: seoOverrideSchema, default: () => ({}) },
    /* per-product Size Guide (Admin → Products → form block) — Task 32 */
    sizeGuide: { type: sizeGuideSchema, default: () => ({}) },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', shortDesc: 'text' });
productSchema.index({ 'specValues.k': 1 }); // Step 5 — dynamic spec facet queries
productSchema.index({ category: 1, price: 1 });
productSchema.index({ brand: 1, price: 1 });          // v2 — brand-filtered grids
productSchema.index({ categoryPath: 1, price: 1 });   // v2 — branch filters over the tree
productSchema.index({ sourceUrl: 1 });                 // AI import — exact-URL dedupe

module.exports = mongoose.model('Product', productSchema);
module.exports.imageSchema = imageSchema;
