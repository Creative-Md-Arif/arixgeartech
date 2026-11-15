/* ArixGear ADMIN services — coupons (Task 29: search, bulk-generate, analytics) */
import { api } from './http.js';

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, v); });
  const s = p.toString();
  return s ? '?' + s : '';
};

export const list = (params) => api('/admin/coupons' + qs(params));
export const create = (body) => api('/admin/coupons', { method: 'POST', body });
export const update = (id, body) => api('/admin/coupons/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/coupons/' + id, { method: 'DELETE' });
export const bulkGenerate = (body) => api('/admin/coupons/bulk-generate', { method: 'POST', body });
export const analytics = () => api('/admin/coupons/analytics');
export const couponAnalytics = (id) => api('/admin/coupons/' + id + '/analytics');
