/* ArixGear controller — SEO management (pages meta, site/schema, sitemap, robots) */
const SeoModel = require('../models/Seo');
const { SeoSite } = SeoModel;
const { PAGES, pageDefaults, defaultRobots, SITE_DEFAULTS } = require('../config/seoDefaults');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { autoSubmitSitemap } = require('../services/googleApi');

/* meta fields are injected into <head> — strip angle brackets/quotes to keep
   them harmless; URLs are checked separately                              */
const clean = (v, max = 600) =>
  String(v == null ? '' : v).replace(/[<>"'`]/g, '').trim().slice(0, max);

const cleanUrl = (v, max = 600) => {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^\/[^/]/.test(s) || s === '/') return s.replace(/[<>"'`]/g, '');
  return ''; /* not a URL — drop */
};

/* validate admin-pasted JSON-LD: must parse to a plain object/array */
function parseSchema(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, value: '' };
  try {
    const j = JSON.parse(s);
    if (!j || typeof j !== 'object') return { ok: false, error: 'Schema must be a JSON object or array' };
    return { ok: true, value: JSON.stringify(j) };
  } catch (e) {
    return { ok: false, error: 'Schema is not valid JSON — ' + e.message };
  }
}

/* lazy defaults — every missing page doc / the site doc is created on read */
async function ensureSeeded() {
  const have = await SeoModel.find().select('pageKey').lean();
  const keys = new Set(have.map((h) => h.pageKey));
  const missing = PAGES.filter((p) => !keys.has(p.key))
    .map((p) => ({ pageKey: p.key, ...pageDefaults(p.key) }));
  if (missing.length) await SeoModel.insertMany(missing, { ordered: false }).catch(() => {});
  await SeoSite.get(); // creates singleton with defaults
}

const pub = (d) => ({
  pageKey: d.pageKey,
  metaTitle: d.metaTitle, metaDescription: d.metaDescription, metaKeywords: d.metaKeywords,
  canonicalUrl: d.canonicalUrl, metaRobots: d.metaRobots,
  og: d.og, twitter: d.twitter, customSchema: d.customSchema,
  updatedAt: d.updatedAt,
});

/* =============== PUBLIC =============== */

// GET /api/seo — everything the storefront head needs (one fetch per session)
exports.publicAll = async (_req, res, next) => {
  try {
    await ensureSeeded();
    const [pages, siteDoc] = await Promise.all([SeoModel.find().lean(), SeoSite.get()]);
    const site = siteDoc.toObject();
    const byKey = Object.fromEntries(pages.map((p) => [p.pageKey, pub(p)]));
    res.json({
      site: {
        siteUrl: site.siteUrl, titleTemplate: site.titleTemplate, brandName: site.brandName,
        twitterHandle: site.twitterHandle, defaultOgImage: site.defaultOgImage,
        gscVerification: site.gscVerification, org: site.org,
        productSchema: site.productSchema, breadcrumbSchema: site.breadcrumbSchema,
        analytics: {
          enabled: !!(site.analytics && site.analytics.enabled && site.analytics.ga4Id),
          ga4Id: (site.analytics && site.analytics.ga4Id) || '',
        },
      },
      pages: byKey,
    });
  } catch (e) { next(e); }
};

// GET /robots.txt — admin-managed content or sensible default
exports.robots = async (req, res, next) => {
  try {
    const site = await SeoSite.get();
    const base = site.siteUrl || `${req.protocol}://${req.get('host')}`;
    const body = (site.robotsTxt || '').trim() || defaultRobots(base);
    res.type('text/plain').send(body.endsWith('\n') ? body : body + '\n');
  } catch (e) { next(e); }
};

/* shared URL list for /sitemap.xml AND the GSC "index sitemap URLs" action
   (Task 26) — single source of truth for what is indexable                 */
exports.sitemapUrls = async (site, base) => {
  const urls = [];
  const push = (loc, lastmod, changefreq, priority) => urls.push({
    loc,
    lastmod: lastmod ? new Date(lastmod).toISOString().slice(0, 10) : '',
    changefreq: changefreq || '',
    priority: priority || '',
  });

  if (site.sitemap.includeStatic !== false) {
    const docs = await SeoModel.find().lean();
    const byKey = Object.fromEntries(docs.map((d) => [d.pageKey, d]));
    for (const p of PAGES) {
      if (!p.path) continue; // PDP modal has no static URL
      if (p.path.includes(':')) continue; /* Phase 7 fix — param templates
        (/product/:slug) are NOT indexable URLs; real PDPs are appended below */
      const d = byKey[p.key];
      if (d && /noindex/i.test(d.metaRobots)) continue; // respect robots
      push(base + p.path, d ? d.updatedAt : undefined, p.key === 'home' ? 'daily' : 'weekly', p.key === 'home' ? '1.0' : '0.8');
    }
    /* Phase 7 fix — emit REAL product URLs, capped so the sitemap stays lean;
       GSC rejects URLs containing ':' path params as invalid */
    const prods = await Product.find({ active: { $ne: false } })
      .sort({ updatedAt: -1 }).limit(500).select('slug updatedAt').lean();
    for (const pr of prods) {
      if (!pr.slug) continue;
      push(`${base}/product/${encodeURIComponent(pr.slug)}`, pr.updatedAt, 'weekly', '0.7');
    }
  }
  if (site.sitemap.includeCategories) {
    const cats = await Category.find().sort({ order: 1 }).lean();
    for (const c of cats) {
      if (!c.slug) continue;
      /* Phase 7 fix — the canonical category page is /category/:slug (Phase 6a);
         the old /shop?category= URL loads the shop without applying the filter */
      push(`${base}/category/${encodeURIComponent(c.slug)}`, c.updatedAt, 'weekly', '0.6');
    }
  }
  for (const u of site.sitemap.extraUrls || []) {
    if (!u.path) continue;
    push(base + (u.path.startsWith('/') ? u.path : '/' + u.path), undefined, u.changefreq || 'weekly', u.priority || '0.5');
  }
  return urls;
};

// GET /sitemap.xml — static pages + optional category links + custom URLs
exports.sitemap = async (req, res, next) => {
  try {
    const site = await SeoSite.get();
    const base = (site.siteUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const urls = await exports.sitemapUrls(site, base);

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => {
        const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '';
        const cf = u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : '';
        const pr = u.priority ? `<priority>${u.priority}</priority>` : '';
        return `  <url><loc>${esc(u.loc)}</loc>${lastmod}${cf}${pr}</url>`;
      }).join('\n') +
      `\n</urlset>\n`;
    res.type('application/xml').send(xml);
  } catch (e) { next(e); }
};

/* =============== ADMIN =============== */

// GET /api/admin/seo — all page docs + site doc
exports.adminList = async (_req, res, next) => {
  try {
    await ensureSeeded();
    const [pages, siteDoc] = await Promise.all([SeoModel.find().sort('pageKey').lean(), SeoSite.get()]);
    res.json({ pages, site: siteDoc.toObject() });
  } catch (e) { next(e); }
};

// PUT /api/admin/seo/pages/:pageKey — upsert one page's meta
exports.upsertPage = async (req, res, next) => {
  try {
    const { pageKey } = req.params;
    if (!PAGES.some((p) => p.key === pageKey)) return res.status(400).json({ message: 'Unknown pageKey: ' + pageKey });
    const b = req.body || {};
    const schema = parseSchema(b.customSchema);
    if (!schema.ok) return res.status(400).json({ message: schema.error });
    if (b.metaRobots && !/^[\w\s,.-]+$/.test(b.metaRobots)) return res.status(400).json({ message: 'Invalid robots directive' });

    const update = {
      metaTitle: clean(b.metaTitle, 220),
      metaDescription: clean(b.metaDescription, 600),
      metaKeywords: clean(b.metaKeywords, 600),
      canonicalUrl: cleanUrl(b.canonicalUrl),
      metaRobots: clean(b.metaRobots, 80) || 'index, follow',
      og: {
        title: clean(b.og?.title, 220),
        description: clean(b.og?.description, 600),
        image: cleanUrl(b.og?.image),
        type: clean(b.og?.type, 40) || 'website',
      },
      twitter: {
        title: clean(b.twitter?.title, 220),
        description: clean(b.twitter?.description, 600),
        image: cleanUrl(b.twitter?.image),
        card: clean(b.twitter?.card, 40) || 'summary_large_image',
      },
      customSchema: schema.value,
    };
    const doc = await SeoModel.findOneAndUpdate(
      { pageKey }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ page: doc });
  } catch (e) { next(e); }
};

// PUT /api/admin/seo/site — global settings (schema, sitemap config, robots)
exports.updateSite = async (req, res, next) => {
  try {
    const site = await SeoSite.get();
    const b = req.body || {};
    const schema = parseSchema(''); // noop — keeps validator import symmetry
    const sitemapBefore = JSON.stringify(site.sitemap || {});
    const robotsBefore = site.robotsTxt;

    /* Phase 7 fix — MERGE semantics. The admin SPA is a routed, sectioned form
       (Phase 5): each save often posts ONE group (analytics / sitemap / org…).
       The old full-replace handler silently reset org.enabled,
       productSchema, breadcrumbSchema, ga4Id and extraUrls to empty on every
       partial save, wiping structured data site-wide. Every group is now
       updated only when its key is present in the body; untouched groups are
       preserved verbatim. The admin full-form save still behaves identically
       (it sends every field, so clears still clear). */
    if (b.siteUrl !== undefined) site.siteUrl = cleanUrl(b.siteUrl, 300);
    if (b.titleTemplate !== undefined) site.titleTemplate = clean(b.titleTemplate, 160) || '%s';
    if (b.brandName !== undefined) site.brandName = clean(b.brandName, 80) || 'ArixGear';
    if (b.twitterHandle !== undefined) site.twitterHandle = clean(b.twitterHandle, 60).replace('@', '');
    if (b.defaultOgImage !== undefined) site.defaultOgImage = cleanUrl(b.defaultOgImage);
    if (b.gscVerification !== undefined) site.gscVerification = clean(b.gscVerification, 200);

    /* GA4 — strict: enabling without a valid Measurement ID is rejected so the
       storefront never boots a broken tracker silently */
    if (b.analytics !== undefined) {
      const ga4Id = String(b.analytics.ga4Id !== undefined ? b.analytics.ga4Id : site.analytics?.ga4Id || '').trim().toUpperCase();
      if (ga4Id && !/^G-[A-Z0-9]{4,12}$/.test(ga4Id)) {
        return res.status(400).json({ message: 'GA4 Measurement ID must look like G-XXXXXXXXXX' });
      }
      const enabled = b.analytics.enabled !== undefined ? !!b.analytics.enabled : !!site.analytics?.enabled;
      if (enabled && !ga4Id) {
        return res.status(400).json({ message: 'Enter a GA4 Measurement ID (G-XXXXXXXXXX) before enabling' });
      }
      site.analytics = { enabled, ga4Id };
    }

    if (b.productSchema !== undefined) site.productSchema = !!b.productSchema;
    if (b.breadcrumbSchema !== undefined) site.breadcrumbSchema = !!b.breadcrumbSchema;

    if (b.org !== undefined) {
      site.org = {
        enabled: b.org.enabled !== undefined ? !!b.org.enabled : !!site.org?.enabled,
        name: b.org.name !== undefined ? (clean(b.org.name, 120) || 'ArixGear') : (site.org?.name || 'ArixGear'),
        logo: b.org.logo !== undefined ? cleanUrl(b.org.logo) : (site.org?.logo || ''),
        phone: b.org.phone !== undefined ? clean(b.org.phone, 40) : (site.org?.phone || ''),
        address: b.org.address !== undefined ? clean(b.org.address, 300) : (site.org?.address || ''),
        sameAs: b.org.sameAs !== undefined ? clean(b.org.sameAs, 2000) : (site.org?.sameAs || ''),
      };
    }

    if (b.sitemap !== undefined) {
      site.sitemap = {
        includeStatic: b.sitemap.includeStatic !== undefined ? b.sitemap.includeStatic !== false : site.sitemap?.includeStatic !== false,
        includeCategories: b.sitemap.includeCategories !== undefined ? !!b.sitemap.includeCategories : !!site.sitemap?.includeCategories,
        extraUrls: Array.isArray(b.sitemap.extraUrls)
          ? b.sitemap.extraUrls.slice(0, 100)
              .map((u) => ({
                path: cleanUrl(u.path, 400) || '',
                changefreq: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(u.changefreq) ? u.changefreq : 'weekly',
                priority: String(u.priority || '0.5').replace(/[^\d.]/g, '').slice(0, 8) || '0.5',
              }))
              .filter((u) => u.path)
          : (site.sitemap?.extraUrls || []),
      };
    }
    site.robotsTxt = String(b.robotsTxt == null ? site.robotsTxt : b.robotsTxt).slice(0, 8000);
    void schema;
    await site.save();
    /* GSC automation — sitemap content changed + auto-submit enabled →
       re-submit to Search Console in the background (never blocks) */
    const sitemapChanged =
      JSON.stringify(site.sitemap) !== sitemapBefore ||
      (site.robotsTxt || '') !== (robotsBefore || '');
    if (sitemapChanged && site.gsc && site.gsc.autoSubmitSitemap) {
      autoSubmitSitemap().catch(() => {});
    }
    res.json({ site });
  } catch (e) { next(e); }
};

// GET /api/admin/seo/robots/preview — what /robots.txt will serve right now
exports.robotsPreview = async (req, res, next) => {
  try {
    const site = await SeoSite.get();
    const base = site.siteUrl || `${req.protocol}://${req.get('host')}`;
    res.json({ robotsTxt: (site.robotsTxt || '').trim() || defaultRobots(base), isDefault: !(site.robotsTxt || '').trim() });
  } catch (e) { next(e); }
};

// POST /api/admin/seo/robots/reset — restore the generated default
exports.robotsReset = async (_req, res, next) => {
  try {
    const site = await SeoSite.get();
    const base = site.siteUrl || `${_req.protocol}://${_req.get('host')}`;
    site.robotsTxt = defaultRobots(base);
    await site.save();
    res.json({ site });
  } catch (e) { next(e); }
};

// GET /api/admin/seo/sitemap/preview — live XML as text (for the admin viewer)
exports.sitemapPreview = async (req, res, next) => {
  try {
    await exports.sitemap(req, res, next);
  } catch (e) { next(e); }
};

/* =============== PER-PRODUCT SEO OVERRIDE =============== */

const hasOverride = (seo) => !!seo && !!(
  (seo.metaTitle || '').trim() || (seo.metaDescription || '').trim() || (seo.metaKeywords || '').trim() ||
  (seo.canonicalUrl || '').trim() || (seo.metaRobots || '').trim() ||
  (seo.customSchema || '').trim() ||
  [seo.og?.title, seo.og?.description, seo.og?.image,
   seo.twitter?.title, seo.twitter?.description, seo.twitter?.image].some((v) => (v || '').trim())
);

// GET /api/admin/seo/products — product list + current override state
exports.productList = async (_req, res, next) => {
  try {
    const items = await Product.find()
      .select('name slug category active price images seo updatedAt')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    res.json({
      items: items.map((p) => ({
        _id: p._id, name: p.name, slug: p.slug, category: p.category, active: p.active,
        price: p.price, img: (p.images && p.images[0] && p.images[0].url) || '',
        updatedAt: p.updatedAt, seo: p.seo || {}, hasOverride: hasOverride(p.seo),
      })),
    });
  } catch (e) { next(e); }
};

// PUT /api/admin/seo/product/:id — save one product's override (empty fields = auto)
exports.saveProductSeo = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: 'Invalid product id' });
    const b = req.body || {};
    const schema = parseSchema(b.customSchema);
    if (!schema.ok) return res.status(400).json({ message: schema.error });
    if (b.metaRobots && !/^[\w\s,.-]+$/.test(b.metaRobots)) return res.status(400).json({ message: 'Invalid robots directive' });

    const seo = {
      metaTitle: clean(b.metaTitle, 220),
      metaDescription: clean(b.metaDescription, 600),
      metaKeywords: clean(b.metaKeywords, 600),
      canonicalUrl: cleanUrl(b.canonicalUrl),
      metaRobots: clean(b.metaRobots, 80),
      og: {
        title: clean(b.og?.title, 220),
        description: clean(b.og?.description, 600),
        image: cleanUrl(b.og?.image),
      },
      twitter: {
        title: clean(b.twitter?.title, 220),
        description: clean(b.twitter?.description, 600),
        image: cleanUrl(b.twitter?.image),
      },
      customSchema: schema.value,
    };
    const product = await Product.findByIdAndUpdate(
      id, { $set: { seo } }, { new: true, runValidators: true }
    ).select('name slug category active seo');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product, hasOverride: hasOverride(product.seo) });
  } catch (e) { next(e); }
};

void SITE_DEFAULTS;
