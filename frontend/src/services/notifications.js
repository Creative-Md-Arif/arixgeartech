import { api, API_BASE } from './http.js';

export const list = () => api('/notifications');
export const markAllRead = () => api('/notifications/read-all', { method: 'POST' });
export const markRead = (id) => api('/notifications/' + id + '/read', { method: 'POST' });

export const streamUrl = async () => {
  const { ticket } = await api('/notifications/stream-ticket', { method: 'POST' });
  return API_BASE + '/notifications/stream?ticket=' + encodeURIComponent(ticket);
};
