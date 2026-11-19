import { api } from './http.js';

export const listCategories = (signal) => api('/categories', { auth: false, signal });

/* GET /api/categories/tree — returns { items: [root{...children[]}], total, nodes } */
export const getCategoryTree = (signal) => api('/categories/tree', { auth: false, signal });
