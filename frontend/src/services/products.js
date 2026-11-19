import { api } from './http.js';

export const listProducts = ({ category, brand, search, sort, limit, badge, size, inStock, rating, discounted, minPrice, maxPrice, featured, page, specParams, signal } = {}) => {
  const q = new URLSearchParams();
  if (category) q.set('category', category);
  /* — brand slugs now ride the query (backend resolves slugs → ids);
     was silently dropped before, which dead-ended the shop's brand chips */
  if (brand) q.set('brand', brand);
  if (search) q.set('search', search);
  if (sort) q.set('sort', sort);
  if (limit) q.set('limit', limit);
  if (badge) q.set('badge', badge);
  if (size) q.set('size', size);
  if (inStock) q.set('inStock', 'true');
  if (rating) q.set('rating', rating);
  if (discounted) q.set('discounted', 'true');
  if (minPrice !== undefined && minPrice !== null && minPrice !== '') q.set('minPrice', minPrice);
  if (maxPrice !== undefined && maxPrice !== null && maxPrice !== '') q.set('maxPrice', maxPrice);
  if (featured) q.set('featured', 'true');
  if (page) q.set('page', page);
  /* — DYNAMIC SPEC FILTERS: specParams = { 'spec_ram': '16GB,32GB',
     'spec_screen-size_min': '14', ... } — keys ride verbatim; the backend
     resolves them against the category's filterable fields. */
  for (const [k, v] of Object.entries(specParams || {})) {
    if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const qs = q.toString();
  return api('/products' + (qs ? '?' + qs : ''), { auth: false, signal });
};

/* GET /api/products/:slug — full product detail (+ related, +1 view) */
export const getProduct = (slug, signal) => api('/products/' + encodeURIComponent(slug), { auth: false, signal });

/* — GET /api/products/search/suggest?q=&limit= — whole-catalog typeahead */
export const suggestProducts = (q, { limit = 8, signal } = {}) =>
  api('/products/search/suggest?q=' + encodeURIComponent(q) + '&limit=' + limit, { auth: false, signal });

/* — GET /api/products/flash — live flash-sale items (prices pre-swapped) */
export const flashList = (signal) => api('/products/flash', { auth: false, signal });

/* — GET /api/products/filters — facet metadata (categories/sizes/badges/colors/price).
   — ?category=<slugs> scopes the call and adds `specs` facets (dynamic,
   schema-driven) + `specSchema`; the shop re-queries when categories change. */
export const getFilters = (category, signal) =>
  api('/products/filters' + (category ? '?category=' + encodeURIComponent(category) : ''), { auth: false, signal });

/* — GET /api/products/:slug/stock?size= — live availability check */
export const getStock = (slug, size, signal) =>
  api('/products/' + encodeURIComponent(slug) + '/stock' + (size ? '?size=' + encodeURIComponent(size) : ''), { auth: false, signal });
