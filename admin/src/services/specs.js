/* Step 5 — dynamic spec schema + reusable templates (Admin → Catalog → Specs) */
import { api } from './http.js';

export const saveSchema = (categoryId, body) => api('/admin/categories/' + categoryId + '/spec-schema', { method: 'PUT', body });
export const applyTemplate = (categoryId, templateId, mode) => api('/admin/categories/' + categoryId + '/apply-template', { method: 'POST', body: { templateId, mode } });
export const listTemplates = () => api('/admin/spec-templates');
export const createTemplate = (body) => api('/admin/spec-templates', { method: 'POST', body });
export const updateTemplate = (id, body) => api('/admin/spec-templates/' + id, { method: 'PUT', body });
export const removeTemplate = (id) => api('/admin/spec-templates/' + id, { method: 'DELETE' });

/* Step 6 — bulk spec fill: apply the schema's defaultValue(s) to every
   product of the category (server-side pass; flat arrays regenerate). */
export const applyDefaults = (categoryId, body = {}) => api('/admin/categories/' + categoryId + '/apply-defaults', { method: 'POST', body });

/* Step 7 — facet alias auto-suggest (#1): mine the category's own product
   values and propose raw=canonical alias pairs (read-only; the editor applies
   what the admin picks). */
export const aliasSuggestions = (categoryId) => api('/admin/categories/' + categoryId + '/alias-suggestions');
