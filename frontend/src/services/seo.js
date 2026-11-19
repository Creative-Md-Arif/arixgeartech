import { api } from './http.js';

export const getAll = (signal) => api('/seo', { signal });
