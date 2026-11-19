import { api } from './http.js';

export const listBrands = (opts = {}, signal) => {
  const qs = opts.featured ? '?featured=true' : '';
  return api('/brands' + qs, { auth: false, signal });
};

/* GET /api/brands/:slug — one active brand + count (404 when unknown) */
export const getBrand = (slug, signal) =>
  api('/brands/' + encodeURIComponent(slug), { auth: false, signal });
