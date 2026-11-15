/* ArixGear ADMIN services — stock ledger + adjustment (Phase 4) */
import { api } from './http.js';

export const logs = (params = '') => api('/admin/stock/logs' + (params ? '?' + params : ''));
export const adjust = (body) => api('/admin/stock/adjust', { method: 'POST', body });
