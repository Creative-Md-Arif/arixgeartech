import { api } from './http.js';

/* POST /api/service/warranty — { orderNumber, phone, productSlug?, serial?, email?, notes?, purchaseDate? }
   → 201 { registration } (ARG-W…, expiry pre-calculated) · 409 { regNumber } on dupe */
export const registerWarranty = (body, signal) =>
  api('/service/warranty', { method: 'POST', body, signal });

/* GET /api/service/warranty/:regNumber?phone=… — phone suffix (≥6 digits) proof */
export const lookupWarranty = (regNumber, phone, signal) =>
  api('/service/warranty/' + encodeURIComponent(regNumber) + '?phone=' + encodeURIComponent(phone || ''), { signal });

/* POST /api/service/tickets — { name, phone, subject, description, category?, orderNumber?, warrantyRegNumber?, email?, productSlug?, priority? } */
export const createTicket = (body, signal) =>
  api('/service/tickets', { method: 'POST', body, signal });

/* GET /api/service/tickets/:ticketNumber — live workflow timeline */
export const trackTicket = (ticketNumber, signal) =>
  api('/service/tickets/' + encodeURIComponent(ticketNumber), { signal });

/* GET /api/service/centers — active walk-in points, sorted by sortOrder/city */
export const listCenters = (signal) => api('/service/centers', { auth: false, signal });
