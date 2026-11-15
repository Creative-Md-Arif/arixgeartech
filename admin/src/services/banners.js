/* ArixGear ADMIN services — banners (multipart create/update with image)
   Task 30: + reorder / duplicate / analytics */
import { api } from './http.js';

export const list = () => api('/admin/banners');
export const create = (form) => api('/admin/banners', { method: 'POST', form });
export const update = (id, form) => api('/admin/banners/' + id, { method: 'PUT', form });
export const patch = (id, body) => api('/admin/banners/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/banners/' + id, { method: 'DELETE' });
export const reorder = (items) => api('/admin/banners/reorder', { method: 'PATCH', body: { items } });
export const duplicate = (id) => api('/admin/banners/' + id + '/duplicate', { method: 'POST' });
export const analytics = () => api('/admin/banners/analytics');
