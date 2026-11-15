/* ArixGear services — public SEO settings */
import { api } from './http.js';

/* GET /api/seo — { site: {...}, pages: { home: {...}, … } } */
export const getAll = (signal) => api('/seo', { signal });
