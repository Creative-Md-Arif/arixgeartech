/* ArixGear ADMIN services — customers */
import { api } from './http.js';

export const list = () => api('/admin/customers');

/* DELETE /api/admin/customers/:id — remove a customer account */
export const deleteCustomer = (id) => api('/admin/customers/' + id, { method: 'DELETE' });

/* POST /api/admin/customers/:id/reset-password — ERP-assisted reset link
   (admin copies it and sends to the customer via WhatsApp / Messenger / SMS) */
export const resetPasswordLink = (id) => api('/admin/customers/' + id + '/reset-password', { method: 'POST' });

/* PUT /api/admin/customers/:id/tags — private CRM tags + note (Task 57) */
export const saveTags = (id, tags, note) => api('/admin/customers/' + id + '/tags', { method: 'PUT', body: { tags, note } });
