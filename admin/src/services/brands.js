/* ArixGear ADMIN services — v2 catalog brands (Phase 2 backend) */
import { api } from './http.js';

export const list = () => api('/brands');
export const adminList = ({ q = '', page = 1, limit = 9 } = {}) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q.trim()) params.set('q', q.trim());
  return api('/admin/brands?' + params.toString());
};
export const create = (body) => api('/admin/brands', { method: 'POST', body });
export const update = (id, body) => api('/admin/brands/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/brands/' + id, { method: 'DELETE' });
