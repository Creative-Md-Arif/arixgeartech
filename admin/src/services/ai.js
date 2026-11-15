/* ArixGear ADMIN services — AI System console (settings · imports · knowledge · chats · analytics) */
import { api } from './http.js';

/* settings */
export const getSettings = () => api('/admin/ai/settings');
export const saveSettings = (body) => api('/admin/ai/settings', { method: 'PUT', body });

/* AI product import */
export const importCreate = (urls) => api('/admin/ai/imports', { method: 'POST', body: { urls } });
export const importList = (params = '') => api('/admin/ai/imports' + (params ? '?' + params : ''));
export const importGet = (id) => api('/admin/ai/imports/' + id);
export const importEdit = (id, body) => api('/admin/ai/imports/' + id, { method: 'PUT', body });
export const importApprove = (id, body) => api('/admin/ai/imports/' + id + '/approve', { method: 'POST', body });
export const importReject = (id) => api('/admin/ai/imports/' + id + '/reject', { method: 'POST', body: {} });
export const importRetry = (id) => api('/admin/ai/imports/' + id + '/retry', { method: 'POST', body: {} });
export const importDelete = (id) => api('/admin/ai/imports/' + id, { method: 'DELETE' });

/* knowledge sources */
export const faqList = () => api('/admin/ai/faqs');
export const faqCreate = (body) => api('/admin/ai/faqs', { method: 'POST', body });
export const faqUpdate = (id, body) => api('/admin/ai/faqs/' + id, { method: 'PUT', body });
export const faqDelete = (id) => api('/admin/ai/faqs/' + id, { method: 'DELETE' });
export const knowledgeStats = () => api('/admin/ai/knowledge/stats');

/* chat history + admin test console */
export const chatList = (params = '') => api('/admin/ai/chats' + (params ? '?' + params : ''));
export const chatGet = (id) => api('/admin/ai/chats/' + id);
export const chatDelete = (id) => api('/admin/ai/chats/' + id, { method: 'DELETE' });
export const chatTest = (body) => api('/admin/ai/chat/test', { method: 'POST', body });

/* analytics */
export const analytics = () => api('/admin/ai/analytics');

/* reference data (category / brand pickers for import approval) */
export const categories = () => api('/admin/categories');
export const brands = () => api('/brands');

/* Step 6 — queue bulk approve. Step 7 — accepts EITHER legacy ids[] + shared
   fields OR items[{id, category?, brandId?}] for per-row category override. */
export const importBulkApprove = (ids, shared = {}) => api('/admin/ai/imports/bulk-approve', { method: 'POST', body: { ids, ...shared } });
export const importBulkApproveItems = (items, shared = {}) => api('/admin/ai/imports/bulk-approve', { method: 'POST', body: { items, ...shared } });
/* Step 6 — AI-assisted schema mapping suggestions for an import draft */
export const importSuggestMapping = (id) => api('/admin/ai/imports/' + id + '/suggest-mapping', { method: 'POST' });
/* Step 7 — update-mode diff preview (staged vs current product, side-by-side) */
export const importDiff = (id, targetId) => api('/admin/ai/imports/' + id + '/diff?target=' + encodeURIComponent(targetId));
