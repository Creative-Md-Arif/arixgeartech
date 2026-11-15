const mongoose = require('mongoose');

/* ── per-page SEO document (one per storefront page) ─────────────────────── */
const seoPageSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, unique: true, index: true },
    metaTitle: { type: String, default: '', maxlength: 220, trim: true },
    metaDescription: { type: String, default: '', maxlength: 600, trim: true },
    metaKeywords: { type: String, default: '', maxlength: 600, trim: true },
    canonicalUrl: { type: String, default: '', maxlength: 600, trim: true },
    metaRobots: { type: String, default: 'index, follow', maxlength: 80, trim: true },
    og: {
      title: { type: String, default: '', maxlength: 220, trim: true },
      description: { type: String, default: '', maxlength: 600, trim: true },
      image: { type: String, default: '', maxlength: 600, trim: true },
      type: { type: String, default: 'website', maxlength: 40, trim: true },
    },
    twitter: {
      title: { type: String, default: '', maxlength: 220, trim: true },
      description: { type: String, default: '', maxlength: 600, trim: true },
      image: { type: String, default: '', maxlength: 600, trim: true },
      card: { type: String, default: 'summary_large_image', maxlength: 40, trim: true },
    },
    /* raw JSON-LD (admin-pasted) — validated as JSON in the controller */
    customSchema: { type: String, default: '', maxlength: 20000 },
  },
  { timestamps: true }
);

/* ── site-level SEO singleton ────────────────────────────────────────────── */
const seoSiteSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'seo', unique: true },
    siteUrl: { type: String, default: '', maxlength: 300, trim: true },
    titleTemplate: { type: String, default: '%s', maxlength: 160, trim: true },
    brandName: { type: String, default: 'ArixGear', maxlength: 80, trim: true },
    twitterHandle: { type: String, default: '', maxlength: 60, trim: true },
    defaultOgImage: { type: String, default: '', maxlength: 600, trim: true },
    gscVerification: { type: String, default: '', maxlength: 200, trim: true },
    /* Google Analytics 4 — storefront injects gtag.js when enabled + valid id */
    analytics: {
      enabled: { type: Boolean, default: false },
      ga4Id: { type: String, default: '', maxlength: 40, trim: true, uppercase: true },
    },
    /* ── Google integrations (Admin → SEO → Google Services) ───────────────
       googleService: one GCP service account shared by Indexing API (URL
       submission), Search Console API (sitemap submission) and the GA4 Data
       API (funnel report). privateKey is select:false — it NEVER leaves the
       backend; admin responses only carry hasKey/clientEmail.            */
    googleService: {
      clientEmail: { type: String, default: '', maxlength: 250, trim: true },
      privateKey: { type: String, default: '', maxlength: 4000, select: false },
    },
    /* Search Console property + submission automations */
    gsc: {
      siteUrl: { type: String, default: '', maxlength: 300, trim: true }, // https://arixgear.tech/ or sc-domain:arixgear.tech
      autoSubmitProducts: { type: Boolean, default: false }, // ping /shop on product create/update/delete
      autoSubmitSitemap: { type: Boolean, default: false },  // re-submit sitemap when sitemap settings saved
    },
    /* GA4 reporting (Data API) — numeric property id, e.g. 412345678 */
    ga4: {
      propertyId: { type: String, default: '', maxlength: 20, trim: true },
    },
    org: {
      enabled: { type: Boolean, default: true },
      name: { type: String, default: 'ArixGear', maxlength: 120, trim: true },
      logo: { type: String, default: '', maxlength: 600, trim: true },
      phone: { type: String, default: '', maxlength: 40, trim: true },
      address: { type: String, default: '', maxlength: 300, trim: true },
      sameAs: { type: String, default: '', maxlength: 2000, trim: true },
    },
    productSchema: { type: Boolean, default: true },
    breadcrumbSchema: { type: Boolean, default: true },
    sitemap: {
      includeStatic: { type: Boolean, default: true },
      includeCategories: { type: Boolean, default: false },
      extraUrls: [
        {
          _id: false,
          path: { type: String, required: true, maxlength: 400, trim: true },
          changefreq: { type: String, default: 'weekly', maxlength: 20 },
          priority: { type: String, default: '0.5', maxlength: 8 },
        },
      ],
    },
    robotsTxt: { type: String, default: '', maxlength: 8000 },
  },
  { timestamps: true }
);

seoSiteSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'seo' });
  if (!doc) {
    const { SITE_DEFAULTS } = require('../config/seoDefaults');
    doc = await this.create({ key: 'seo', ...SITE_DEFAULTS });
  }
  return doc;
};

module.exports = mongoose.model('Seo', seoPageSchema);
module.exports.SeoSite = mongoose.model('SeoSite', seoSiteSchema);
