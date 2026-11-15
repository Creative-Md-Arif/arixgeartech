/* ArixGear ADMIN services — newsletter subscribers (Phase 4) */
import { api } from './http.js';

export const list = (params = '') => api('/admin/subscribers' + (params ? '?' + params : ''));
export const update = (id, body) => api('/admin/subscribers/' + id, { method: 'PATCH', body });
export const remove = (id) => api('/admin/subscribers/' + id, { method: 'DELETE' });
export const csvPath = () => '/admin/subscribers/export.csv'; // Step 2 audit fix — double /api prefix 404'd
