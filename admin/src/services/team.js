/* ArixGear ADMIN services — sub-admin team management (Task 39, owner-only) */
import { api } from './http.js';

/* GET /api/admin/team → { items, modules } */
export const list = () => api('/admin/team');

/* POST /api/admin/team { name, email, password, permissions[] } → 201 { subadmin } */
export const create = (body) => api('/admin/team', { method: 'POST', body });

/* PUT /api/admin/team/:id { name?, password?, permissions?, active? } → { subadmin } */
export const update = (id, body) => api('/admin/team/' + id, { method: 'PUT', body });

/* DELETE /api/admin/team/:id → { ok } */
export const remove = (id) => api('/admin/team/' + id, { method: 'DELETE' });
