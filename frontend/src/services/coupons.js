import { api } from './http.js';

export const activeCoupons = (signal) => api('/coupons/active', { signal });
