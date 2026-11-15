/* ArixGear ADMIN services — products (multipart create/update with images) */
import { api } from './http.js';

/* GET /api/admin/products?search=&page= — returns { items, total, ... } */
export const list = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api('/admin/products' + (q ? '?' + q : ''));
};

/* POST /api/admin/products — multipart images[] */
export const create = (form) => api('/admin/products', { method: 'POST', form });

/* PUT /api/admin/products/:id — multipart newImages[] + removeImages JSON + fields */
export const update = (id, form) => api('/admin/products/' + id, { method: 'PUT', form });

/* PUT /api/admin/products/:id — JSON partial (inline price/stock edits) */
export const patch = (id, body) => api('/admin/products/' + id, { method: 'PUT', body });

export const remove = (id) => api('/admin/products/' + id, { method: 'DELETE' });

/* ---- Task 27 — bulk ops · duplicate · CSV round-trip ---- */

/* POST /api/admin/products/bulk { ids[], action: active|inactive|price|stock|delete, value? } */
export const bulk = (ids, action, value) => api('/admin/products/bulk', { method: 'POST', body: { ids, action, value } });

/* POST /api/admin/products/:id/duplicate — inactive " (Copy)" draft */
export const duplicate = (id) => api('/admin/products/' + id + '/duplicate', { method: 'POST' });

/* GET /api/admin/products/export.csv — use http.download() for the blob */
export const exportCsvPath = '/admin/products/export.csv';

/* POST /api/admin/products/import (multipart csv) — upsert by slug */
export const importCsv = (file) => {
  const fd = new FormData();
  fd.append('csv', file);
  return api('/admin/products/import', { method: 'POST', form: fd });
};
