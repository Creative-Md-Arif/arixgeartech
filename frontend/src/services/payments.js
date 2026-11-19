import { api, API_BASE } from './http.js';

/* Which payment methods the admin has switched ON right now — public store
   configuration lives on GET /api/settings/payment (the same call checkout.jsx
   uses): { gateway: {enabled, provider, sandbox}, methods: {bkash, nagad,
   rocket, cod}, checkout: {guestEnabled} }. */
export const getMethods = (signal) => api('/settings/payment', { auth: false, signal });

/* POST /api/payments/init — open an SSLCOMMERZ session.
   Fresh checkout: body = the same payload shape as POST /api/orders (the order
   is created server-side first). Retry: { orderNumber, phone } for an unpaid
   order. Returns { orderNumber, redirect } — redirect is an absolute
   GatewayPageURL (real mode) or a relative /payment/sandbox URL (simulated
   mode); relative targets are absolutized against the API origin so it works
   cross-origin in dev too. (Same endpoint as orders.js initPayment.) */
export async function initGateway(body, signal) {
  const d = await api('/payments/init', { method: 'POST', body, signal });
  let url = d.redirect || '';
  if (url.startsWith('/')) url = API_BASE.replace(/\/api\/?$/, '') + url;
  return { ...d, redirect: url };
}

/* Payment state poll — there is no dedicated gateway/status endpoint; the
   public tracking endpoint (phone suffix proof, rate-limited) already carries
   payment.status + courier info, so that IS the status API. */
export const gatewayStatus = (orderNo, { phone, last6 } = {}, signal) => {
  const q = new URLSearchParams();
  if (phone) q.set('phone', phone);
  if (last6) q.set('last6', last6);
  const qs = q.toString();
  return api('/orders/track/' + encodeURIComponent(orderNo) + (qs ? '?' + qs : ''), { auth: false, signal });
};
