const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    alt: String,
    thumb: String,
  },
  { _id: false },
);

/* per-product SEO override — every field optional; empty = fall back to the
   auto template ({product.name} — ArixGear) from the 'product' page SEO doc */
const seoOverrideSchema = new mongoose.Schema(
  {
    metaTitle: { type: String, default: "", maxlength: 220, trim: true },
    metaDescription: { type: String, default: "", maxlength: 600, trim: true },
    metaKeywords: { type: String, default: "", maxlength: 600, trim: true },
    canonicalUrl: { type: String, default: "", maxlength: 600, trim: true },
    metaRobots: { type: String, default: "", maxlength: 80, trim: true },
    og: {
      title: { type: String, default: "", maxlength: 220, trim: true },
      description: { type: String, default: "", maxlength: 600, trim: true },
      image: { type: String, default: "", maxlength: 600, trim: true },
    },
    twitter: {
      title: { type: String, default: "", maxlength: 220, trim: true },
      description: { type: String, default: "", maxlength: 600, trim: true },
      image: { type: String, default: "", maxlength: 600, trim: true },
    },
    /* raw JSON-LD — replaces the page-level customSchema slot on this PDP */
    customSchema: { type: String, default: "", maxlength: 20000 },
  },
  { _id: false },
);

const sizeGuideSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["inherit", "custom"], default: "inherit" },
    enabled: { type: Boolean, default: true }, // custom table visibility (custom mode only)
    title: { type: String, default: "Size Guide", trim: true, maxlength: 80 },
    note: { type: String, default: "", trim: true, maxlength: 300 },
    /* Task 58 — Bengali twins (optional; empty = storefront falls back to English) */
    titleBn: { type: String, default: "", trim: true, maxlength: 80 },
    noteBn: { type: String, default: "", trim: true, maxlength: 300 },
    headers: { type: [String], default: [] },
    rows: { type: [[String]], default: [] },
  },
  { _id: false },
);

const warrantySchema = new mongoose.Schema(
  {
    months: { type: Number, default: 0, min: 0, max: 240 }, // 0 = no formal warranty
    type: {
      type: String,
      enum: ["manufacturer", "seller", "service", "none"],
      default: "manufacturer",
    },
    note: { type: String, default: "", trim: true, maxlength: 300 }, // free text shown beside the warranty chip
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },

    nameBn: { type: String, default: "", trim: true, maxlength: 160 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    category: {
      type: String,
      default: "accessories",
      lowercase: true,
      trim: true,
      index: true,
    },
    categoryRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    categoryPath: { type: [String], default: [] },

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      index: true,
    },

    sku: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      maxlength: 32,
    },

    sourceUrl: { type: String, default: "", trim: true, maxlength: 1200 },

    warranty: { type: warrantySchema, default: () => ({}) },

    variantLabel: { type: String, default: "", trim: true, maxlength: 40 },
    variantLabelBn: { type: String, default: "", trim: true, maxlength: 40 },
    price: { type: Number, required: [true, "Price is required"], min: 0 },
    comparePrice: { type: Number, min: 0, default: null }, // crossed-out "was" price

    flash: {
      price: { type: Number, min: 0, default: null },
      startsAt: { type: Date, default: null },
      endsAt: { type: Date, default: null },
    },
    images: {
      type: [imageSchema],
      validate: [(v) => v.length > 0, "At least one image is required"],
    },

    badge: { type: String, default: "none", trim: true, lowercase: true },
    stock: { type: Number, default: 25, min: 0 },
    lowStockNotifiedAt: { type: Date, default: null },
    sold: { type: Number, default: 0 },
    views: { type: Number, default: 0 }, 
    colors: [{ name: String, nameBn: String, hex: String, image: String }], // nameBn = Bengali swatch label; image = per-color shot (PDP switches main image)
    sizes: [String],
    sizePrices: [{ s: String, price: { type: Number, min: 0 } }], // per-size price override (falls back to price)
    shortDesc: { type: String, default: "" },
    shortDescBn: { type: String, default: "", trim: true, maxlength: 400 },
    description: { type: String, default: "" },
    descriptionBn: { type: String, default: "", maxlength: 8000 },
    specs: [{ k: String, v: String }],
    specsBn: [{ k: String, v: String }], // Bengali spec rows — mirrors `specs` 1:1

    specValues: [{ g: String, k: String, v: mongoose.Schema.Types.Mixed }],

    hideEmptySpecs: { type: Boolean, default: true },

    features: { type: [String], default: [] },
    featuresBn: { type: [String], default: [] },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    sizeStocks: [{ s: String, stock: Number }], // per-size stock for PDP urgency
    featured: { type: Boolean, default: false }, // shown in carousels / home picks
    active: { type: Boolean, default: true },

    seo: { type: seoOverrideSchema, default: () => ({}) },

    sizeGuide: { type: sizeGuideSchema, default: () => ({}) },
  },
  { timestamps: true },
);

productSchema.index({ name: "text", shortDesc: "text" });
productSchema.index({ "specValues.k": 1 }); // Step 5 — dynamic spec facet queries
productSchema.index({ category: 1, price: 1 });
productSchema.index({ brand: 1, price: 1 }); // v2 — brand-filtered grids
productSchema.index({ categoryPath: 1, price: 1 }); // v2 — branch filters over the tree
productSchema.index({ sourceUrl: 1 }); // AI import — exact-URL dedupe

module.exports = mongoose.model("Product", productSchema);
module.exports.imageSchema = imageSchema;
