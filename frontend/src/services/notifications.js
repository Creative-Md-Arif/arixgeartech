/* ArixGear storefront services — in-app notifications (Task 36, SSE) */
import { api, API_BASE } from './http.js';

export const list = () => api('/notifications');
export const markAllRead = () => api('/notifications/read-all', { method: 'POST' });
export const markRead = (id) => api('/notifications/' + id + '/read', { method: 'POST' });

/* EventSource cannot send Authorization headers — pass the JWT as ?token= */
export const streamUrl = () => {
  const s = (JSON.parse(localStorage.getItem('forged_session') || 'null') || {});
  return API_BASE + '/notifications/stream?token=' + encodeURIComponent(s.token || '');
};
