/* ArixGear ADMIN services — in-app notifications (Task 36, SSE) */
import { api, API } from './http.js';

export const list = () => api('/notifications');
export const markAllRead = () => api('/notifications/read-all', { method: 'POST' });
export const markRead = (id) => api('/notifications/' + id + '/read', { method: 'POST' });
/* Step 6 — mint a 60s single-use stream ticket (JWT-protected POST) */
export const streamTicket = () => api('/notifications/stream-ticket', { method: 'POST' });

/* EventSource cannot send Authorization headers — Step 6: open with a
   short-lived single-use TICKET instead of the long-lived JWT (URLs leak
   into logs/history). Falls back to the deprecated ?token= path if the
   ticket mint fails (e.g. very old backend). */
export const streamUrl = async () => {
  try {
    const { ticket } = await streamTicket();
    if (ticket) return API + '/notifications/stream?ticket=' + encodeURIComponent(ticket);
  } catch (_e) { /* legacy fallback below */ }
  const token = localStorage.getItem('forged_admin_token') || '';
  return API + '/notifications/stream?token=' + encodeURIComponent(token);
};
