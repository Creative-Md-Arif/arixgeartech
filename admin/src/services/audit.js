/* ArixGear ADMIN services — audit trail reader (Task 39, owner-only) */
import { api } from './http.js';

/* GET /api/admin/audit?entity=&action=&q=&limit= → { items, total, modules } */
export const list = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return api('/admin/audit' + (q ? '?' + q : ''));
};
