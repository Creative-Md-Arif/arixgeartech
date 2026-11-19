/* Admin-configured GA4 integration; SPA page views follow router navigation. */
import { loadSEO } from './seo.jsx';

window.arixGA = { enabled: false, ga4Id: '' };
window.arixgearGA = window.arixGA;
window.__gaEvents = [];

const QUEUE = []; /* events fired before the config landed — flushed after boot */

/* GA4 accepts free-form params; keep the recommended commerce fields tidy */
const clean = (p) => {
  const out = {};
  if (!p) return out;
  if (p.value != null && !Number.isNaN(+p.value)) out.value = +p.value;
  if (p.currency) out.currency = String(p.currency).slice(0, 8);
  if (p.search_string) out.search_string = String(p.search_string).slice(0, 200);
  if (p.transaction_id) out.transaction_id = String(p.transaction_id).slice(0, 80);
  if (Array.isArray(p.items) && p.items.length) {
    out.items = p.items.slice(0, 25).map((i) => ({
      item_id: i.item_id != null ? String(i.item_id) : undefined,
      item_name: i.item_name || undefined,
      item_category: i.item_category || undefined,
      price: i.price != null && !Number.isNaN(+i.price) ? +i.price : undefined,
      quantity: i.quantity != null ? +i.quantity : undefined,
    }));
  }
  return out;
};

export function gaTrack(name, params) {
  const ev = { event: name, params: clean(params), ts: Date.now(), page: document.body.dataset.page || '' };
  window.__gaEvents.push(ev);
  if (window.__gaEvents.length > 50) window.__gaEvents.shift();
  try {
    if (window.arixGA.enabled && window.gtag) window.gtag('event', name, ev.params);
    else if (QUEUE.length < 50) QUEUE.push([name, ev.params]);
  } catch (e) { /* GA never blocks the page */ }
}

export function gaPageView(path, title) {
  gaTrack('page_view', {
    page_path: path || (window.location && window.location.pathname) || '/',
    page_title: title || document.title,
  });
}
export async function initAnalytics() {
  if (initAnalytics._booted) return;
  initAnalytics._booted = true;
  try {
    const d = await loadSEO(); /* same cached /api/seo fetch the head engine uses */
    const a = d && d.site && d.site.analytics;
    if (!a || !a.enabled || !/^G-[A-Z0-9]{4,12}$/i.test(a.ga4Id || '')) return; /* OFF — stay dark */
    const id = String(a.ga4Id).toUpperCase();
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', id, { send_page_view: false }); /* SPA fires page_view manually */
    window.arixGA = { enabled: true, ga4Id: id };
    window.arixgearGA = window.arixGA;
    /* replay anything that fired while the config was still loading */
    while (QUEUE.length) {
      const [n, p] = QUEUE.shift();
      try { window.gtag('event', n, p); } catch (e) { /* keep flushing */ }
    }
    /* the SPA's first page_view — with the Meta Pixel off, nobody else fires
       the initial one (later navigations forward through pixel.js)          */
    gaPageView();
  } catch (e) { /* /api/seo unreachable — GA stays dark */ }
}
