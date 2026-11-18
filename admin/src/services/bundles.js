/* ArixGear ADMIN services — combo bundles (Phase 4) */
import { api } from './http.js';

export const adminList = (q = '') => api('/admin/bundles' + (q ? '?q=' + encodeURIComponent(q) : ''));
export const create = (body) => api('/admin/bundles', { method: 'POST', body });
export const update = (id, body) => {
  if (!id || id === 'undefined' || id === 'null') throw new Error('Bundle ID is missing; reload the bundle list and try again.');
  return api('/admin/bundles/' + encodeURIComponent(id), { method: 'PUT', body });
};
export const remove = (id) => {
  if (!id || id === 'undefined' || id === 'null') throw new Error('Bundle ID is missing; reload the bundle list and try again.');
  return api('/admin/bundles/' + encodeURIComponent(id), { method: 'DELETE' });
};
export const products = async () => {
  const first = await api('/admin/bundles/products?limit=100&page=1');
  const items = [...(first.items || [])];
  for (let page = 2; page <= (first.pages || 1); page += 1) {
    const next = await api('/admin/bundles/products?limit=100&page=' + page);
    items.push(...(next.items || []));
  }
  return { ...first, items };
};
