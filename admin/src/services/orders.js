/* ArixGear ADMIN services — orders (list, detail, payment verify/reject, status, courier, CSV) */
import { api } from './http.js';

export const list = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api('/admin/orders' + (q ? '?' + q : ''));
};

export const detail = (id) => api('/admin/orders/' + id);

/* POST /api/admin/orders/manual — manual entry (WhatsApp / phone orders) */
export const createManual = (body) => api('/admin/orders/manual', { method: 'POST', body });

/* PUT /api/admin/orders/:id — edit a manual order (wrong-entry correction) */
export const updateManual = (id, body) => api('/admin/orders/' + id, { method: 'PUT', body });

/* DELETE /api/admin/orders/:id — remove a wrong entry (stock restored) */
export const remove = (id) => api('/admin/orders/' + id, { method: 'DELETE' });

export const verify = (id, body) => api('/admin/orders/' + id + '/verify', { method: 'PATCH', body });
export const reject = (id, body) => api('/admin/orders/' + id + '/reject', { method: 'PATCH', body });
export const setStatus = (id, body) => api('/admin/orders/' + id + '/status', { method: 'PATCH', body });
export const setCourier = (id, body) => api('/admin/orders/' + id + '/courier', { method: 'PATCH', body });

/* GET /api/admin/orders/export.csv?status=&method=&search= — raw CSV text (admin downloads) */
export const exportCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const base = localStorage.getItem('forged_api_base') || location.origin + '/api';
  const res = await fetch(base + '/admin/orders/export.csv' + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'Bearer ' + (localStorage.getItem('forged_admin_token') || '') },
  });
  if (!res.ok) throw new Error('Export failed (' + res.status + ')');
  return res.text();
};

/* ===== Task 28 — courier push, returns/RMA, order funnel ===== */

/* POST /api/admin/orders/:id/courier/push — one-click dispatch to Steadfast/Pathao */
export const pushCourier = (id, body = {}) => api('/admin/orders/' + id + '/courier/push', { method: 'POST', body });

/* GET /api/admin/returns?status= — RMA requests */
export const listReturns = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api('/admin/returns' + (q ? '?' + q : ''));
};

/* PATCH /api/admin/returns/:id — { status: approved|rejected|refunded, note?, refundAmount? } */
export const resolveReturn = (id, body) => api('/admin/returns/' + id, { method: 'PATCH', body });
