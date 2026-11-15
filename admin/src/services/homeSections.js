/* ArixGear ADMIN services — homepage sections */
import { api } from './http.js';

export const list = () => api('/admin/home-sections');
export const metadata = () => api('/admin/home-sections/metadata');
/* Task 34 bug fix — create/update/remove pointed at /home-sections (a public
   route that does not exist) so homepage section create/edit/delete NEVER
   worked from the admin UI. The real routes live under /admin/home-sections. */
export const create = (body) => api('/admin/home-sections', { method: 'POST', body });
export const update = (id, body) => api('/admin/home-sections/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/home-sections/' + id, { method: 'DELETE' });
