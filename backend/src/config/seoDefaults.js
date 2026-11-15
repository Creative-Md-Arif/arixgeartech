/* ArixGear — SEO defaults (shared by lazy controller seeding + npm run seed)
   Every storefront page gets a meta document; site-level doc '_site' holds
   global schema / sitemap / robots configuration.                        */

const PAGES = [
  { key: 'home',      path: '/',          label: 'Home' },
  { key: 'shop',      path: '/shop',      label: 'Shop' },
  { key: 'product',   path: '/product/:slug', label: 'Product detail (PDP)' }, /* routed PDP — one doc, dynamic params */
  { key: 'about',     path: '/about',     label: 'About' },
  { key: 'guides',    path: '/guides',    label: 'Guides' },
  { key: 'contact',   path: '/contact',   label: 'Contact' },
  { key: 'account',   path: '/account',   label: 'Account' },
  { key: 'checkout',  path: '/checkout',  label: 'Checkout' },
  { key: 'success',   path: '/success',   label: 'Order success' },
];

const ROBOTS_CHOICES = [
  'index, follow',
  'noindex, follow',
  'index, nofollow',
  'noindex, nofollow',
  'noarchive',
  'nosnippet',
];

const DEFAULTS = {
  home: {
    metaTitle: 'ArixGear — Tech & Gadgets | Laptops, Components, Monitors & More',
    metaDescription: 'ArixGear — premium tech & gadget store. Shop laptops, desktops, components, monitors, appliances, phones and power gear with official warranty — delivery across Bangladesh.',
    metaKeywords: 'tech shop bangladesh, laptop price bd, pc components bd, gaming gear bd, arixgear.tech',
    og: { type: 'website' },
  },
  shop: {
    metaTitle: 'Shop All — Tech & Gadgets | ArixGear',
    metaDescription: 'Browse the full ArixGear catalog: laptops, desktops, components, monitors, appliances and gadgets. ৳ prices, cash on delivery, nationwide shipping.',
    metaKeywords: 'buy laptops bd, gaming monitor price bd, pc build bangladesh',
  },
  product: {
    metaTitle: '{product.name} — ArixGear',
    metaDescription: '{product.name} — {product.shortDescription}',
    metaKeywords: '{product.category}, buy online bd',
  },
  about: {
    metaTitle: 'About ArixGear — Tech Built for Bangladesh',
    metaDescription: 'The arixgear.tech story — premium tech & gadgets from Dhaka, Bangladesh. Our mission, our standards, our service.',
    metaKeywords: 'about arixgear.tech, tech store bangladesh',
  },
  guides: {
    metaTitle: 'Buying Guides — ArixGear',
    metaDescription: 'Free buying guides from the arixgear.tech team — choose the right laptop, monitor, component or gadget with confidence.',
    metaKeywords: 'tech buying guides bd, laptop buying guide bangladesh',
  },
  contact: {
    metaTitle: 'Contact ArixGear — We Reply Fast',
    metaDescription: 'Questions about gear, orders or warranty? Reach the ArixGear team — phone, WhatsApp, Telegram or the contact form.',
    metaKeywords: 'contact arixgear.tech, tech support bd',
  },
  account: { metaRobots: 'noindex, nofollow' },
  checkout: { metaRobots: 'noindex, nofollow' },
  success: { metaRobots: 'noindex, nofollow' },
};

/* page-level default doc */
function pageDefaults(key) {
  const d = DEFAULTS[key] || {};
  return {
    metaTitle: d.metaTitle || '',
    metaDescription: d.metaDescription || '',
    metaKeywords: d.metaKeywords || '',
    canonicalUrl: '',
    metaRobots: d.metaRobots || 'index, follow',
    og: { title: '', description: '', image: '', type: d.og?.type || 'website' },
    twitter: { title: '', description: '', image: '', card: 'summary_large_image' },
    customSchema: '',
  };
}

/* site-level singleton (pageKey '_site' in the SeoSite collection) */
const SITE_DEFAULTS = {
  siteUrl: '',                 // e.g. https://arixgear.tech — empty = auto from request
  titleTemplate: '%s',         // {title} → page title; may include site brand
  brandName: 'ArixGear',
  twitterHandle: '',           // @handle
  defaultOgImage: '',
  gscVerification: '',         // Google Search Console verification code
  analytics: { enabled: false, ga4Id: '' }, // GA4 — G-XXXXXXXXXX, admin → SEO → Site & Schema
  googleService: { clientEmail: '', privateKey: '' }, // GCP SA — Indexing + Search Console + GA4 Data APIs
  gsc: { siteUrl: '', autoSubmitProducts: false, autoSubmitSitemap: false }, // GSC property + automations
  ga4: { propertyId: '' }, // numeric GA4 property id — dashboard funnel report
  org: {
    enabled: true,
    name: 'ArixGear',
    logo: '',
    phone: '',
    address: '',
    sameAs: '',                // one social URL per line
  },
  productSchema: true,         // auto Product JSON-LD on PDP
  breadcrumbSchema: true,      // auto BreadcrumbList on home/shop
  sitemap: {
    includeStatic: true,
    includeCategories: true,   /* Phase 7 — canonical /category/:slug pages
                                  (real indexable pages since Phase 6a) */
    extraUrls: [],             // { path, changefreq, priority }
  },
  robotsTxt: '',               // empty → generated default
};

/* default robots.txt (base = site URL or request origin) */
function defaultRobots(base) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /success',
    'Disallow: /account',
    'Disallow: /reset-password',
    '',
    'Sitemap: ' + base + '/sitemap.xml',
    '',
  ].join('\n');
}

module.exports = { PAGES, ROBOTS_CHOICES, pageDefaults, SITE_DEFAULTS, defaultRobots };
