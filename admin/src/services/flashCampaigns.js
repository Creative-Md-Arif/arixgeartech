/* ArixGear ADMIN services — flash campaigns (Phase 4) */
import { api } from './http.js';

export const adminList = () => api('/admin/flash-campaigns');
export const create = (body) => api('/admin/flash-campaigns', { method: 'POST', body });
export const update = (id, body) => api('/admin/flash-campaigns/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/flash-campaigns/' + id, { method: 'DELETE' });
export const apply = (id) => api('/admin/flash-campaigns/' + id + '/apply', { method: 'POST' });
export const end = (id) => api('/admin/flash-campaigns/' + id + '/end', { method: 'POST' });
