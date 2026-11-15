/* ArixGear ADMIN services — warranty registrations (Phase 4) */
import { api } from './http.js';

export const list = (q = '') => api('/admin/warranty' + (q ? '?q=' + encodeURIComponent(q) : ''));
export const detail = (id) => api('/admin/warranty/' + id);
export const update = (id, body) => api('/admin/warranty/' + id, { method: 'PATCH', body });
export const remove = (id) => api('/admin/warranty/' + id, { method: 'DELETE' });
