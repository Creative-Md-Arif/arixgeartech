import { api } from './http.js';

export const get = () => api('/admin/quick-services');
export const update = (body) => api('/admin/quick-services', { method: 'PUT', body });
