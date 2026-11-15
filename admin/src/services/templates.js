/* ArixGear ADMIN services — notification templates + broadcast (Phase 4) */
import { api } from './http.js';

export const list = () => api('/admin/notification-templates');
export const catalog = () => api('/admin/notification-templates/catalog');
export const create = (body) => api('/admin/notification-templates', { method: 'POST', body });
export const update = (id, body) => api('/admin/notification-templates/' + id, { method: 'PUT', body });
export const remove = (id) => api('/admin/notification-templates/' + id, { method: 'DELETE' });
export const preview = (id, body) => api('/admin/notification-templates/' + id + '/preview', { method: 'POST', body });
export const test = (id, body) => api('/admin/notification-templates/' + id + '/test', { method: 'POST', body });
export const broadcast = (body) => api('/admin/notifications/broadcast', { method: 'POST', body });
