const mongoose = require('mongoose');

/* ════════════════════════════════════════════════════════════════════
   AI PRODUCT IMPORT — staging queue.

   Paste-URL pipeline: admin submits source URL(s) → importer fetches
   (SSRF-guarded), extracts (JSON-LD → OpenGraph → DOM heuristics),
   detects duplicates, lets the AI rewrite unique SEO content (with a
   grounded template fallback), re-hosts images (Cloudinary when
   configured) → everything parks HERE as status 'ready' for explicit
   admin APPROVAL. Only approve() creates a real Product.

   Status flow:  pending → processing → ready → imported
                                    ↘ rejected        ↘ failed
   ════════════════════════════════════════════════════════════════════ */

const specSchema = new mongoose.Schema({ k: { type: String, default: '' }, v: { type: String, default: '' } }, { _id: false });

const aiImportSchema = new mongoose.Schema(
  {
    sourceUrl: { type: String, required: true, trim: true, maxlength: 1200 },
    host: { type: String, default: '', trim: true, maxlength: 200 },
    status: {
      type: String, enum: ['pending', 'processing', 'ready', 'imported', 'rejected', 'failed'],
      default: 'pending', index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 }, // 0 queued · 30 fetched · 55 extracted · 80 rewritten · 100 staged
    error: { type: String, default: '', maxlength: 600 },

    /* raw extraction from the source page (ground truth for the rewrite) */
    extracted: {
      name: { type: String, default: '', maxlength: 300 },
      brandGuess: { type: String, default: '', maxlength: 80 },
      price: { type: Number, default: null, min: 0 },
      currency: { type: String, default: 'BDT', maxlength: 8 },
      availability: { type: String, default: '', maxlength: 40 },
      sku: { type: String, default: '', maxlength: 60 },
      shortDesc: { type: String, default: '', maxlength: 2000 },
      specs: { type: [specSchema], default: [] },
      images: { type: [String], default: [] }, // absolute URLs (pre re-host)
      /* Step 5 — key-feature bullets lifted from the source page's <ul>/<ol> */
      features: { type: [String], default: [] },
    },

    /* AI-rewritten unique SEO content — admin-editable before approval */
    aiContent: {
      name: { type: String, default: '', maxlength: 220 },
      nameBn: { type: String, default: '', maxlength: 220 },
      shortDesc: { type: String, default: '', maxlength: 500 },
      shortDescBn: { type: String, default: '', maxlength: 500 },
      description: { type: String, default: '', maxlength: 8000 },
      descriptionBn: { type: String, default: '', maxlength: 8000 },
      specs: { type: [specSchema], default: [] },
      specsBn: { type: [specSchema], default: [] },
      /* Step 5 — key features (checklist on the PDP); BN twin optional */
      features: { type: [String], default: [] },
      featuresBn: { type: [String], default: [] },
      seo: {
        metaTitle: { type: String, default: '', maxlength: 220 },
        metaDescription: { type: String, default: '', maxlength: 600 },
        metaKeywords: { type: String, default: '', maxlength: 600 },
      },
      source: { type: String, enum: ['ai', 'template', 'admin'], default: 'template' },
    },

    /* admin resolution targets (defaults guessed, editable pre-approval) */
    price: { type: Number, default: null, min: 0 },
    comparePrice: { type: Number, default: null, min: 0 },
    category: { type: String, default: '', lowercase: true, trim: true, maxlength: 80 },
    categoryGuess: { type: String, default: '', lowercase: true, trim: true, maxlength: 80 },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
    brandGuessSlug: { type: String, default: '', maxlength: 80 },
    warrantyMonths: { type: Number, default: 0, min: 0, max: 240 },

    /* re-hosted images (Cloudinary) or the kept remote URLs */
    images: [{ url: { type: String, default: '' }, publicId: { type: String, default: '' } }],

    /* duplicate detection result — info for the admin, not a blocker */
    duplicates: [{ _id: false, productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, name: { type: String, default: '' }, slug: { type: String, default: '' }, score: { type: Number, default: 0 }, reason: { type: String, default: '' } }],
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, // strongest match, if any

    result: { productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, slug: { type: String, default: '' } },
    meta: {
      provider: { type: String, default: '' },     // which LLM rewrote it (or 'template')
      durationMs: { type: Number, default: 0 },
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiImportSchema.index({ sourceUrl: 1 });
aiImportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AiImport', aiImportSchema);
