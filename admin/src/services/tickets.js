/* ArixGear ADMIN services — service tickets / complaints (Phase 4) */
import { api } from './http.js';

export const list = (params = '') => api('/admin/tickets' + (params ? '?' + params : ''));
export const detail = (id) => api('/admin/tickets/' + id);
export const update = (id, body) => api('/admin/tickets/' + id, { method: 'PATCH', body });
export const remove = (id) => api('/admin/tickets/' + id, { method: 'DELETE' });
export const staff = () => api('/admin/team');
