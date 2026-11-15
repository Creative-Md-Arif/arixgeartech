/* ArixGear services — product reviews (PDP: list + submit + owner edit/delete + helpful votes) */
import { api } from './http.js';

/* GET /api/products/:slug/reviews — approved only + summary {avg,total,dist}
   Auth is INCLUDED on purpose: logged-in callers get `mine` flags on their reviews */
export const listByProduct = (slug, opts = {}, signal) =>
  api(`/products/${encodeURIComponent(slug)}/reviews` + (opts.sort ? `?sort=${opts.sort}` : ''), { signal });

/* POST /api/products/:slug/reviews — { name, rating, comment } → pending approval */
export const create = (slug, body, signal) =>
  api(`/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body, signal });

/* POST with photos — FormData { name, rating, comment, images[] ≤3 } */
export const createWithPhotos = (slug, formData, signal) =>
  api(`/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', form: formData, signal });

/* PATCH /api/products/:slug/reviews/:revId — owner edit (re-enters moderation) */
export const updateMine = (slug, revId, body, signal) =>
  api(`/products/${encodeURIComponent(slug)}/reviews/${revId}`, { method: 'PATCH', body, signal });

/* DELETE /api/products/:slug/reviews/:revId — owner delete */
export const removeMine = (slug, revId, signal) =>
  api(`/products/${encodeURIComponent(slug)}/reviews/${revId}`, { method: 'DELETE', signal });

/* POST /api/reviews/:id/helpful — {vote: 1|-1} (one vote per visitor, toggleable) */
export const voteHelpful = (id, vote, signal) =>
  api(`/reviews/${id}/helpful`, { method: 'POST', body: { vote }, signal });

/* GET /api/reviews/mine — JWT: every review this account wrote, any approval
   state, with the product card (slug/name/image) — /account/reviews page */
export const listMine = (signal) => api('/reviews/mine', { signal });
