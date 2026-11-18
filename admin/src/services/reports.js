/* ArixGear ADMIN services — sales reports (manual vs online, day/month buckets) */
import { api, API } from './http.js';

/* GET /api/admin/reports/sales?granularity=day|month&from=&to= (Dhaka dates, inclusive) */
export const sales = (params = {}) => api('/admin/reports/sales?' + new URLSearchParams(params).toString());

/* GET /api/admin/reports/sales.csv — raw CSV text for the browser download */
export const salesCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + '/admin/reports/sales.csv' + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'Bearer ' + (localStorage.getItem('forged_admin_token') || '') },
  });
  if (!res.ok) {
    let msg = 'Export failed (' + res.status + ')';
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.text();
};
