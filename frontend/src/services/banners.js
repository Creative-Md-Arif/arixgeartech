/* ArixGear services — banners (public: hero reel + CTA click ping) */
import { api } from './http.js';

/* GET /api/banners?position=hero — active + inside schedule window */
export const listBanners = (position, signal) => api('/banners' + (position ? '?position=' + encodeURIComponent(position) : ''), { auth: false, signal });

/* POST /api/banners/:id/click — CTA click ping (fire-and-forget, Task 30) */
export const bannerClick = (id) => api(`/banners/${id}/click`, { method: 'POST', auth: false }).catch(() => {});
