/* ArixGear services — brands (Phase 2 Brand collection; Phase 6a storefront use) */
import { api } from './http.js';

/* GET /api/brands — active brands w/ live product counts (facet list).
   ?featured=true narrows to the featured strip. */
export const listBrands = (opts = {}, signal) => {
  const qs = opts.featured ? '?featured=true' : '';
  return api('/brands' + qs, { auth: false, signal });
};

/* GET /api/brands/:slug — one active brand + count (404 when unknown) */
export const getBrand = (slug, signal) =>
  api('/brands/' + encodeURIComponent(slug), { auth: false, signal });
