/* ArixGear ADMIN services — contact messages inbox */
import { api } from './http.js';

/* GET /api/admin/messages?filter=all|unread|read — { items, unread } */
export const list = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api('/admin/messages' + (q ? '?' + q : ''));
};

/* PATCH /api/admin/messages/:id { read:boolean } — mark read/unread
   (added by 17-b: the inbox read-toggle needs it; backend markRead already exists) */
export const setRead = (id, body) => api('/admin/messages/' + id, { method: 'PATCH', body });

export const remove = (id) => api('/admin/messages/' + id, { method: 'DELETE' });

/* Task 37 — admin → customer composed message (bell + Account inbox instantly) */
export const compose = (body) => api('/admin/messages/compose', { method: 'POST', body });
