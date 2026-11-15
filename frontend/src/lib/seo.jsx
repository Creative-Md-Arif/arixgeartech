/* ArixGear — SEO head manager (no external helmet lib).
   One public fetch of /api/seo is cached module-level; every page calls
   useSEO(pageKey) which applies: title (template), meta description/keywords,
   robots, canonical, Open Graph, Twitter Card and JSON-LD structured data.
   PDP applies dynamic Product schema through the same engine.            */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getAll } from '../services/seo.js';

let CACHE = null;
let PENDING = null;

/* exported — lib/analytics.js reuses the same one-fetch-per-session cache */
export function loadSEO() {
  if (CACHE) return CACHE;
  if (!PENDING) {
    PENDING = getAll()
      .then((d) => { CACHE = d; PENDING = null; return d; })
      .catch(() => { PENDING = null; return null; });
  }
  return PENDING;
}

/* re-read settings after an admin saves (cheap — 1 small JSON) */
export function refreshSEO() { CACHE = null; }

/* ---------- <head> primitives ---------- */
function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/* branded 404 SEO — used by pages/not-found.jsx (Task 47 orphan activation) */
export const NF_SEO = { title: 'Page Not Found — ArixGear', robots: 'noindex,follow' };

function upsertCanonical(href) {
  if (!href) return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(id, data) {
  const found = document.getElementById('seo-ld-' + id);
  if (!data) { if (found) found.remove(); return; }
  const text = JSON.stringify(data);
  if (found) { found.textContent = text; return; }
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = 'seo-ld-' + id;
  s.textContent = text;
  document.head.appendChild(s);
}

const absolute = (url, base) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return (base || window.location.origin).replace(/\/+$/, '') + (url.startsWith('/') ? url : '/' + url);
};

/* fill {product.x} placeholders from the dynamic product object */
const interpolate = (str, product) => String(str || '').replace(/\{product\.(\w+)\}/g, (_, k) => (product && product[k] != null ? String(product[k]) : '')).replace(/\s{2,}/g, ' ').trim();

/* ---------- core applier ---------- */
export function applySEO(pageKey, dyn = {}, data = CACHE) {
  if (!data) return;
  const { site = {}, pages = {} } = data;
  const doc = pages[pageKey] || {};
  const product = dyn.product || null;
  /* per-product override (Admin → SEO → Products) — non-empty fields beat the
     page template and the dynamic product resolution; empty = auto fallback  */
  const ovr = (pageKey === 'product' && product && product.seo) || null;
  /* template placeholders speak the RAW API shape ({product.category},
     {product.shortDescription}) while the adapted PDP object uses cat/desc —
     bridge both so {product.*} always fills */
  const interpSrc = product
    ? {
        ...product,
        category: product.category || product.cat || '',
        shortDescription: product.shortDescription || (product.desc ? String(product.desc).replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 160) : ''),
      }
    : null;
  const base = (site.siteUrl || window.location.origin).replace(/\/+$/, '');

  /* title */
  let title = dyn.title != null ? dyn.title
    : (interpolate(ovr?.metaTitle, interpSrc) || interpolate(doc.metaTitle, interpSrc));
  if (!title && pageKey === 'product') title = product ? `${product.name}` : '';
  if (title && site.titleTemplate && site.titleTemplate.includes('%s')) {
    title = site.titleTemplate.replace('%s', title);
  }
  if (title) document.title = title;

  /* description / keywords / robots */
  const description = dyn.description != null ? dyn.description
    : (interpolate(ovr?.metaDescription, interpSrc) || interpolate(doc.metaDescription, interpSrc));
  if (description) upsertMeta('name', 'description', description);
  const keywords = interpolate(ovr?.metaKeywords, interpSrc) || interpolate(doc.metaKeywords, interpSrc);
  if (keywords) upsertMeta('name', 'keywords', keywords);
  if (ovr?.metaRobots || doc.metaRobots) upsertMeta('name', 'robots', ovr?.metaRobots || doc.metaRobots);
  else if (dyn && dyn.robots) upsertMeta('name', 'robots', dyn.robots);
  else if (document.head.querySelector('meta[name="robots"]')) {
    /* page without a robots directive after a noindexed one (404/compare) — clear it */
    document.head.querySelector('meta[name="robots"]').remove();
  }

  /* canonical */
  const canonical = ovr?.canonicalUrl || doc.canonicalUrl || base + (window.location.pathname === '/' ? '/' : window.location.pathname);
  upsertCanonical(canonical);

  /* Open Graph (product override → page fields → resolved title/description) */
  const ogImage = absolute(
    ovr?.og?.image || dyn.image || doc.og?.image || (pageKey === 'product' && product && product.img) || site.defaultOgImage,
    base
  );
  upsertMeta('property', 'og:title', ovr?.og?.title || doc.og?.title || title);
  upsertMeta('property', 'og:description', ovr?.og?.description || doc.og?.description || description);
  if (ogImage) upsertMeta('property', 'og:image', ogImage);
  upsertMeta('property', 'og:type', (pageKey === 'product' ? 'product' : doc.og?.type) || 'website');
  upsertMeta('property', 'og:url', canonical);
  upsertMeta('property', 'og:site_name', site.brandName || 'ArixGear');

  /* Twitter Card */
  upsertMeta('name', 'twitter:card', ovr?.twitter?.card || doc.twitter?.card || 'summary_large_image');
  upsertMeta('name', 'twitter:title', ovr?.twitter?.title || doc.twitter?.title || ovr?.og?.title || doc.og?.title || title);
  upsertMeta('name', 'twitter:description', ovr?.twitter?.description || doc.twitter?.description || ovr?.og?.description || doc.og?.description || description);
  const twImage = absolute(
    ovr?.twitter?.image || doc.twitter?.image || ovr?.og?.image || doc.og?.image || (pageKey === 'product' && product && product.img) || site.defaultOgImage,
    base
  );
  if (twImage) upsertMeta('name', 'twitter:image', twImage);
  if (site.twitterHandle) upsertMeta('name', 'twitter:site', '@' + String(site.twitterHandle).replace('@', ''));

  /* Google Search Console verification */
  if (site.gscVerification) upsertMeta('name', 'google-site-verification', site.gscVerification);

  /* ---------- JSON-LD structured data ---------- */

  /* Organization — injected once, every page */
  if (site.org?.enabled) {
    const sameAs = String(site.org.sameAs || '').split('\n').map((s) => s.trim()).filter(Boolean);
    setJsonLd('org', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: site.org.name || site.brandName || 'ArixGear',
      url: base + '/',
      ...(site.org.logo ? { logo: absolute(site.org.logo, base) } : {}),
      ...(site.org.phone ? { telephone: site.org.phone } : {}),
      ...(site.org.address ? { address: { '@type': 'PostalAddress', streetAddress: site.org.address } } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    });
  } else setJsonLd('org', null);

  /* BreadcrumbList — home / shop */
  if (site.breadcrumbSchema && (pageKey === 'home' || pageKey === 'shop')) {
    setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: base + '/' },
        ...(pageKey === 'shop' ? [{ '@type': 'ListItem', position: 2, name: 'Shop', item: base + '/shop' }] : []),
      ],
    });
  } else setJsonLd('breadcrumb', null);

  /* page-level custom JSON-LD — a product override replaces the page slot on its PDP */
  let custom = null;
  const schemaSrc = (ovr && ovr.customSchema) ? ovr.customSchema : doc.customSchema;
  if (schemaSrc) { try { custom = JSON.parse(schemaSrc); } catch (_) { custom = null; } }
  setJsonLd('page', custom);

  /* Product schema — PDP only (adapted product shape from store/catalog) */
  if (site.productSchema && product) {
    const stock = (product.sizes || []).reduce((a, s) => a + (+s.stock || 0), 0);
    const price = +product.price || 0;
    setJsonLd('product', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      ...(product.img ? { image: [absolute(product.img, base)] } : {}),
      ...(product.desc ? { description: String(product.desc).slice(0, 300) } : {}),
      sku: String(product.sku || product.id || ''),
      brand: { '@type': 'Brand', name: site.brandName || 'ArixGear' },
      ...(product.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: Math.max(1, product.reviews || 1) } } : {}),
      ...(price > 0 ? {
        offers: {
          '@type': 'Offer',
          url: canonical,
          priceCurrency: 'BDT',
          price: String(price),
          availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
        },
      } : {}),
    });
  } else setJsonLd('product', null);
}

/* ---------- React hook (page-level) ---------- */
export function useSEO(pageKey, dyn) {
  const deps = dyn ? [pageKey, dyn.title, dyn.description, dyn.image, dyn.product && dyn.product.id] : [pageKey, null, null, null, null];
  useEffect(() => {
    let dead = false;
    (async () => {
      const data = await loadSEO();
      if (!dead && data) applySEO(pageKey, dyn || {}, data);
    })();
    return () => { dead = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, deps);
}

/* fallback pageKey from a path (used to restore head when the PDP closes) */
export function pageKeyForPath(pathname) {
  if (pathname === '/' || !pathname) return 'home';
  const seg = pathname.split('/')[1];
  /* Task 47 — added track-order/compare/blog/payment; UNKNOWN paths now
     return null so the PDP-close restore skips them instead of slapping
     the HOME head over pages that manage their own (404 noindex, Journal,
     compare noindex — a long-standing clobber bug). */
  const known = ['shop', 'about', 'guides', 'contact', 'account', 'checkout', 'success', 'track-order', 'compare', 'blog', 'payment', 'flash-sale'];
  return known.includes(seg) ? seg : null;
}

/* hook used by the PDP overlay — dynamic product head + restore on close */
export function usePdpSEO(product, open) {
  const location = useLocation();
  useEffect(() => {
    let dead = false;
    (async () => {
      const data = await loadSEO();
      if (dead || !data) return;
      if (open && product) applySEO('product', { product }, data);
      else if (!open) {
        /* null = page owns its own head (404 /blog /compare…) — hands off */
        const k = pageKeyForPath(location.pathname);
        if (k) applySEO(k, {}, data);
      }
    })();
    return () => { dead = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, product && product.id, location.pathname]);
}
