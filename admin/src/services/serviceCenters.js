/* ArixGear ADMIN services — service centers (Phase 4) */
import { api } from './http.js';

export const adminList = () => api('/admin/service-centers');
export const create = (body) => api('/admin/service-centers', { method: 'POST', body });
export const update = (id, body) => api('/admin/service-centers/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/service-centers/' + id, { method: 'DELETE' });
