/* Admin-configured Meta Pixel; events are also forwarded to GA4. */
import { getPixel } from '../services/settings.js';
import { gaTrack, gaPageView } from './analytics.js';

window.arixPixel = { enabled: false, pixelId: '' };
window.arixgearPixel = window.arixPixel;
window.__fbEvents = [];

/* Meta → GA4 event name map (GA4 recommended commerce events) */
const GA_EVENT = {
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase',
  Search: 'search',
  CompleteRegistration: 'sign_up',
};

/* translate the Meta-style params into GA4 shape (value/currency/items/…) */
function gaForward(name, params) {
  if (name === 'PageView') { gaPageView(); return; }
  const g = GA_EVENT[name];
  if (!g) return;
  const p = params || {};
  const out = {};
  if (p.value != null) out.value = p.value;
  if (p.currency) out.currency = p.currency;
  if (p.search_string) out.search_string = p.search_string;
  if (g === 'purchase' && p.order_id) out.transaction_id = p.order_id;
  const items = [];
  if (Array.isArray(p.contents) && p.contents.length) {
    p.contents.forEach((c) => items.push({ item_id: c.id, quantity: c.quantity, price: c.item_price }));
  } else if (Array.isArray(p.content_ids) && p.content_ids.length) {
    p.content_ids.forEach((id, i) => items.push({
      item_id: String(id),
      item_name: i === 0 ? p.content_name : undefined,
      item_category: p.content_category,
      quantity: p.content_ids.length === 1 && p.num_items ? p.num_items : undefined,
    }));
  }
  if (items.length) out.items = items;
  gaTrack(g, out);
}

const _pxPage = () => document.body.dataset.page || '';

export function fbTrack(name, params) {
  const ev = { event: name, params: params || {}, ts: Date.now(), page: _pxPage() };
  window.__fbEvents.push(ev);
  if (window.__fbEvents.length > 50) window.__fbEvents.shift();
  try { if (window.fbq && window.arixPixel.enabled) window.fbq('track', name, params || {}); } catch (e) {}
  try { gaForward(name, params); } catch (e) { /* GA never blocks the pixel */ }
}

export function fbTrackCtx(name, params, eventId) {
  window.__fbEvents.push({ event: name, params: params || {}, ts: Date.now(), page: _pxPage(), eventId: eventId || '' });
  try { if (window.fbq && window.arixPixel.enabled) window.fbq('track', name, params || {}, eventId ? { eventID: eventId } : undefined); } catch (e) {}
  try { gaForward(name, params); } catch (e) { /* GA never blocks the pixel */ }
}

/* initPixel — call once per page load (usePixel in the layout). Safe to race: idempotent. */
export async function initPixel() {
  try {
    const d = await getPixel();
    const px = d && d.pixel;
    if (!px || !px.enabled || !px.pixelId) return; /* OFF — stay dark */
    window.arixPixel = { enabled: true, pixelId: px.pixelId };
    window.arixgearPixel = window.arixPixel;
    if (!window.fbq) {
      const n = (window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
      if (!window._fbq) window._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      const s = document.createElement('script'); s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(s);
    }
    window.fbq('init', px.pixelId);
    fbTrack('PageView');
  } catch (e) { /* API unreachable — pixel stays dark */ }
}
