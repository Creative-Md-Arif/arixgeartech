/* ArixGear ADMIN services — product questions (answer + moderate + Task 30 stats/bulk) */
import { api } from './http.js';

export const list = (params = {}) => {
  const q = new URLSearchParams();
  if (params.filter && params.filter !== 'all') q.set('filter', params.filter);
  if (params.q) q.set('q', params.q);
  if (params.page) q.set('page', params.page);
  if (params.limit) q.set('limit', params.limit);
  const s = q.toString();
  return api('/admin/questions' + (s ? '?' + s : ''));
};
export const answer = (id, text) => api('/admin/questions/' + id, { method: 'PUT', body: { answer: text } });
export const unanswer = (id) => api('/admin/questions/' + id + '/unanswer', { method: 'PATCH' });
export const bulk = (ids, action) => api('/admin/questions/bulk', { method: 'PATCH', body: { ids, action } });
export const remove = (id) => api('/admin/questions/' + id, { method: 'DELETE' });
export const stats = () => api('/admin/questions/stats');
