/* ArixGear ADMIN services — combo bundles (Phase 4) */
import { api } from './http.js';

export const adminList = (q = '') => api('/admin/bundles' + (q ? '?q=' + encodeURIComponent(q) : ''));
export const create = (body) => api('/admin/bundles', { method: 'POST', body });
export const update = (id, body) => {
  if (!id || id === 'undefined' || id === 'null') throw new Error('Bundle ID is missing; reload the bundle list and try again.');
  return api('/admin/bundles/' + encodeURIComponent(id), { method: 'PUT', body });
};
export const remove = (id) => api('/admin/bundles/' + id, { method: 'DELETE' });
export const products = () => api('/admin/products?limit=60');
