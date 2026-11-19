import { api } from './http.js';

/* GET /api/products/:slug/questions — answered only (+ ?sort=helpful)
   opts: { sort: 'helpful' | 'new' } */
export const listByProduct = (slug, opts = {}, signal) => {
  const qs = `?sort=${opts.sort === 'helpful' ? 'helpful' : 'new'}&page=${opts.page || 1}`;
  return api(`/products/${encodeURIComponent(slug)}/questions${qs}`, { signal });
};

/* POST /api/products/:slug/questions — { name?, question } → admin answers */
export const create = (slug, body, signal) => api(`/products/${encodeURIComponent(slug)}/questions`, { method: 'POST', body, signal });

/* POST /api/questions/:id/helpful — {vote: 1|-1} (one vote per visitor, toggleable) */
export const voteHelpful = (id, vote, signal) => api(`/questions/${id}/helpful`, { method: 'POST', body: { vote }, signal });
