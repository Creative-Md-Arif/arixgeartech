/* ArixGear ADMIN services — payments ledger + gateway refund (Task 40) */
import { api } from './http.js';

/* GET /api/admin/payments/transactions — every payment across all orders
   (gateway + manual + cod), filterable: { method, status, q, from, to, page, limit } */
export const listTransactions = (params = {}, signal) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
  const qs = q.toString();
  return api('/admin/payments/transactions' + (qs ? '?' + qs : ''), { signal });
};

/* POST /api/admin/payments/gateway/:orderNumber/refund { amount?, note? } */
export const refundGateway = (orderNumber, body) =>
  api('/admin/payments/gateway/' + encodeURIComponent(orderNumber) + '/refund', { method: 'POST', body });
