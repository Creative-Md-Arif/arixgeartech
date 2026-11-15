/* ArixGear services — product questions (PDP: list answered + ask + helpful votes)
   Task 30: auth is INCLUDED on purpose (same as reviews) — logged-in callers get
   `mine` flags on their questions and can vote "helpful". */
import { api } from './http.js';

/* GET /api/products/:slug/questions — answered only (+ ?sort=helpful)
   opts: { sort: 'helpful' | 'new' } */
export const listByProduct = (slug, opts = {}, signal) => {
  const qs = opts.sort === 'helpful' ? '?sort=helpful' : '';
  return api(`/products/${encodeURIComponent(slug)}/questions${qs}`, { signal });
};

/* POST /api/products/:slug/questions — { name?, question } → admin answers */
export const create = (slug, body, signal) => api(`/products/${encodeURIComponent(slug)}/questions`, { method: 'POST', body, signal });

/* POST /api/questions/:id/helpful — {vote: 1|-1} (one vote per visitor, toggleable) */
export const voteHelpful = (id, vote, signal) => api(`/questions/${id}/helpful`, { method: 'POST', body: { vote }, signal });
