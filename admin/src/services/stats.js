/* ArixGear ADMIN services — dashboard stats */
import { api } from './http.js';

/* GET /api/admin/stats — today orders/revenue, verifying, processing, delivered, week, lowStock, topProducts */
export const getStats = () => api('/admin/stats');
