/* ArixGear services — Journal / blog (public endpoints, Task 47) */
import { api } from './http.js';

/* GET /api/blog — published posts { items, total, page, pages } */
export const listPosts = ({ limit, page, tag, signal } = {}) => {
  const q = new URLSearchParams();
  if (limit) q.set('limit', limit);
  if (page) q.set('page', page);
  if (tag) q.set('tag', tag);
  return api(`/blog?${q.toString()}`, { signal });
};

/* GET /api/blog/:slug — one post + related */
export const getPost = (slug, signal) => api(`/blog/${encodeURIComponent(slug)}`, { signal });
