/* ArixGear ADMIN services — settings (payments, shipping, store, pixel, content) */
import { api } from './http.js';

export const get = () => api('/admin/settings');
export const update = (body) => api('/admin/settings', { method: 'PUT', body });
/* Task 32 — public guide sources (global + per-category) for the product form's copy buttons */
export const getPublicSizeGuide = () => api('/settings/size-guide');

/* Task 56-d — send a test email built from the CURRENT saved template overrides */
export const sendTestEmail = (key, to) =>
  api('/admin/email-templates/test', { method: 'POST', body: { key, to } });
