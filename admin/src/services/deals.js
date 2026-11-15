/* ArixGear ADMIN services — Centralized Deals & Promotions (Phase 8) */
import { api } from './http.js';

export const list = (params = '') => api('/admin/deals' + (params ? '?' + params : ''));
export const meta = () => api('/admin/deals/meta');
export const stats = () => api('/admin/deals/stats');
export const get = (id) => api('/admin/deals/' + id);
export const create = (body) => api('/admin/deals', { method: 'POST', body });
export const update = (id, body) => api('/admin/deals/' + id, { method: 'PUT', body });
export const setState = (id, body) => api('/admin/deals/' + id + '/state', { method: 'PATCH', body });
export const remove = (id) => api('/admin/deals/' + id, { method: 'DELETE' });
