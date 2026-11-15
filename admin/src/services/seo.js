/* ArixGear ADMIN services — SEO management */
import { api } from './http.js';

/* GET /api/admin/seo — { pages: [...], site: {...} } */
export const list = () => api('/admin/seo');

/* PUT /api/admin/seo/pages/:pageKey — upsert one page's meta */
export const savePage = (pageKey, body) => api('/admin/seo/pages/' + pageKey, { method: 'PUT', body });

/* GET /api/admin/seo/products — product list + per-product override state */
export const productList = () => api('/admin/seo/products');

/* PUT /api/admin/seo/product/:id — save one product's SEO override (empty = auto) */
export const saveProductSeo = (id, body) => api('/admin/seo/product/' + id, { method: 'PUT', body });

/* PUT /api/admin/seo/site — global SEO settings (schema, sitemap, robots, GA4) */
export const saveSite = (body) => api('/admin/seo/site', { method: 'PUT', body });

/* GET /api/admin/seo/robots/preview — effective robots.txt */
export const robotsPreview = () => api('/admin/seo/robots/preview');

/* POST /api/admin/seo/robots/reset — restore generated default */
export const robotsReset = () => api('/admin/seo/robots/reset', { method: 'POST' });

/* ── Google services (Task 26): GSC submission automation + GA4 reporting ── */

/* GET /api/admin/seo/gsc — connection state + sitemaps Google knows */
export const gscStatus = () => api('/admin/seo/gsc');

/* PUT /api/admin/seo/gsc/settings — service account + GSC property + automations */
export const gscSave = (body) => api('/admin/seo/gsc/settings', { method: 'PUT', body });

/* POST /api/admin/seo/gsc/submit-url — Indexing API URL submission */
export const gscSubmitUrl = (body) => api('/admin/seo/gsc/submit-url', { method: 'POST', body });

/* POST /api/admin/seo/gsc/submit-sitemap — Search Console sitemaps.submit */
export const gscSubmitSitemap = () => api('/admin/seo/gsc/submit-sitemap', { method: 'POST' });

/* POST /api/admin/seo/gsc/index-sitemap — batch-index every sitemap URL */
export const gscIndexSitemap = () => api('/admin/seo/gsc/index-sitemap', { method: 'POST' });

/* GET /api/admin/seo/gsc/log — latest 50 submission attempts */
export const gscLog = () => api('/admin/seo/gsc/log');
