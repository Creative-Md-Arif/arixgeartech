/* ArixGear ADMIN services — product badges (admin CRUD) */
import { api } from './http.js';

export const list = () => api('/admin/badges');
export const create = (body) => api('/admin/badges', { method: 'POST', body });
export const update = (id, body) => api('/admin/badges/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/badges/' + id, { method: 'DELETE' });
