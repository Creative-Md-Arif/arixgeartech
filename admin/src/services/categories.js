/* ArixGear ADMIN services — categories (public list + admin CRUD) */
import { api } from './http.js';

export const list = () => api('/categories', { auth: false });
export const adminList = () => api('/admin/categories');
export const create = (form) => api('/admin/categories', { method: 'POST', form });
export const update = (id, form) => api('/admin/categories/' + id, { method: 'PUT', form });
export const remove = (id) => api('/admin/categories/' + id, { method: 'DELETE' });
