/* ArixGear services — orders (guest checkout, public tracking, account history,
   Task 28: server preview, idempotent place, self-cancel, PDF invoice, RMA) */
import { api, API_BASE } from './http.js';

const sessionToken = () => {
  try { return (JSON.parse(localStorage.getItem('forged_session') || 'null') || {}).token || null; } catch (e) { return null; }
};

/* Task 40 — start an SSLCOMMERZ session for a placed order.
   The backend returns `redirect`: an absolute GatewayPageURL (real mode) or a
   relative /payment/sandbox URL (simulated mode). Relative targets are
   absolutized against the API origin so it works cross-origin in dev too. */
export async function initPayment(body, signal) {
  const d = await api('/payments/init', { method: 'POST', body, signal });
  let url = d.redirect || '';
  if (url.startsWith('/')) url = API_BASE.replace(/\/api\/?$/, '') + url;
  return { ...d, redirect: url };
}

/* POST /api/orders — multipart: payload (JSON string) + payment screenshot (optional file) */
export const createOrder = ({ payload, screenshot }, signal) => {
  const form = new FormData();
  form.append('payload', typeof payload === 'string' ? payload : JSON.stringify(payload));
  if (screenshot) form.append('screenshot', screenshot);
  return api('/orders', { method: 'POST', form, signal });
};

/* POST /api/orders/preview — server-side totals (price/coupon/division shipping)
   WITHOUT creating an order; the checkout totals box + coupon field use this so
   the customer always sees the real numbers before submitting.
   Task 56-a — token IS attached when present: logged-in customers get the
   loyalty redemption block in the same response. */
export const previewOrder = (body, signal) =>
  api('/orders/preview', { method: 'POST', body, signal });

/* GET /api/orders/track/:orderNo?phone= — public tracking */
export const trackOrder = (orderNo, { phone, last6 } = {}, signal) => {
  const q = new URLSearchParams();
  if (phone) q.set('phone', phone);
  if (last6) q.set('last6', last6);
  const qs = q.toString();
  return api('/orders/track/' + encodeURIComponent(orderNo) + (qs ? '?' + qs : ''), { auth: false, signal });
};

/* PATCH /api/orders/:orderNo/cancel — customer self-cancellation (pre-shipment) */
export const cancelOrder = (orderNo, phone, signal) =>
  api('/orders/' + encodeURIComponent(orderNo) + '/cancel', { method: 'PATCH', body: { phone }, signal });

/* POST /api/orders/:orderNo/returns — RMA request on a delivered order */
export const requestReturn = (orderNo, body, signal) =>
  api('/orders/' + encodeURIComponent(orderNo) + '/returns', { method: 'POST', body, signal });

/* GET /api/orders/:orderNo/invoice.pdf — PDF invoice.
   • with `phone` → public phone-proof (tracking page / guest)
   • without      → JWT owner/admin proof (account history) via blob download */
export async function downloadInvoice(orderNo, { phone } = {}) {
  const q = phone ? '?phone=' + encodeURIComponent(phone) : '';
  const headers = {};
  const tk = sessionToken();
  if (tk) headers.Authorization = 'Bearer ' + tk;
  const res = await fetch(API_BASE + '/orders/' + encodeURIComponent(orderNo) + '/invoice.pdf' + q, { headers });
  if (!res.ok) {
    let msg = 'Invoice failed (HTTP ' + res.status + ')';
    try { msg = (await res.json()).message || msg; } catch (e) {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  /* order numbers already carry the prefix (ARG-…) — do not double it */
  a.download = String(orderNo).toUpperCase().startsWith('ARG-') ? orderNo + '.pdf' : 'ARG-' + orderNo + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* GET /api/orders/my — JWT account order history */
export const myOrders = (signal) => api('/orders/my', { signal });

/* GET /api/orders/my/returns — JWT RMA list across the account's orders (Phase 6b) */
export const myReturns = (signal) => api('/orders/my/returns', { signal });

/* POST /api/coupons/validate — { code, subtotal, items?:[{slug,lineTotal}] }
   items are required for SCOPED coupons (category/product-limited discounts);
   logged-in callers get per-user limit checks via the auth header */
export const validateCoupon = (code, subtotal, items, signal) =>
  api('/coupons/validate', { method: 'POST', body: { code, subtotal, items }, signal });
