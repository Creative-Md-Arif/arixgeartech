/* ArixGear services — public coupons (checkout picker) */
import { api } from './http.js';

/* GET /api/coupons/active — public, active, non-exhausted coupons for the picker */
export const activeCoupons = (signal) => api('/coupons/active', { signal });
