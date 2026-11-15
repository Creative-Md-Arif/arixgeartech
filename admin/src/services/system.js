/* ArixGear ADMIN services — production readiness checklist (Task 30) */
import { api } from './http.js';

export const status = () => api('/admin/system/status');
