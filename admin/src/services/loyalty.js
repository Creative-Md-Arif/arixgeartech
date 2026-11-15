/* ArixGear ADMIN services — loyalty management (Task 56-a) */
import { api } from './http.js';

/* GET /api/admin/loyalty?q=&sort=&page= — customer points ledger + stats */
export const list = (params = {}) => {
  const q = new URLSearchParams();
  if (params.q) q.set('q', params.q);
  if (params.sort) q.set('sort', params.sort);
  if (params.page) q.set('page', params.page);
  const qs = q.toString();
  return api('/admin/loyalty' + (qs ? '?' + qs : ''));
};

/* GET /api/admin/loyalty/:userId — one customer + full ledger */
export const detail = (userId) => api('/admin/loyalty/' + userId);

/* POST /api/admin/loyalty/:userId/adjust — { points: ±n, note } */
export const adjust = (userId, points, note) =>
  api('/admin/loyalty/' + userId + '/adjust', { method: 'POST', body: { points, note } });

/* GET /api/admin/loyalty-settings — { enabled, earnPer100, pointValue, minRedeem, maxRedeemPct } */
export const getSettings = () => api('/admin/loyalty-settings');

/* PUT /api/admin/loyalty-settings — save the rules block */
export const saveSettings = (body) => api('/admin/loyalty-settings', { method: 'PUT', body });
