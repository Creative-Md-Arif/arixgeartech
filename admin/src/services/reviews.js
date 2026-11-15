/* ArixGear ADMIN services — product reviews (Task 29: stats, bulk, edit, reply) */
import { api } from './http.js';

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, v); });
  const s = p.toString();
  return s ? '?' + s : '';
};

export const list = (params) => api('/admin/reviews' + qs(params));
export const stats = () => api('/admin/reviews/stats');
export const approve = (id) => api('/admin/reviews/' + id + '/approve', { method: 'PATCH', body: {} });
export const unapprove = (id) => api('/admin/reviews/' + id + '/unapprove', { method: 'PATCH', body: {} });
export const toggleHomepage = (id, featured) => api('/admin/reviews/' + id + '/homepage', { method: 'PATCH', body: { featured } });
export const edit = (id, body) => api('/admin/reviews/' + id, { method: 'PATCH', body });
export const reply = (id, text) => api('/admin/reviews/' + id + '/reply', { method: 'PATCH', body: { text } });
export const bulk = (ids, action) => api('/admin/reviews/bulk', { method: 'PATCH', body: { ids, action } });
export const remove = (id) => api('/admin/reviews/' + id, { method: 'DELETE' });
