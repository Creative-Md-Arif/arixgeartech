/* ArixGear services — categories */
import { api } from './http.js';

/* GET /api/categories — returns { items: [{ name, slug, parent, productCount, ... }] } */
export const listCategories = (signal) => api('/categories', { auth: false, signal });

/* GET /api/categories/tree — returns { items: [root{...children[]}], total, nodes } */
export const getCategoryTree = (signal) => api('/categories/tree', { auth: false, signal });
