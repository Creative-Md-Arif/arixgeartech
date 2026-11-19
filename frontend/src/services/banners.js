import { api } from './http.js';

export const listBanners = (position, signal) => api('/banners' + (position ? '?position=' + encodeURIComponent(position) : ''), { auth: false, signal });

export const bannerClick = (id) => api(`/banners/${id}/click`, { method: 'POST', auth: false }).catch(() => {});
