/* ArixGear ADMIN services — Journal / blog posts (admin CRUD, Task 47) */
import { api } from './http.js';

export const list = () => api('/admin/blog');
export const create = (body) => api('/admin/blog', { method: 'POST', body });
export const update = (id, body) => api('/admin/blog/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/blog/' + id, { method: 'DELETE' });
