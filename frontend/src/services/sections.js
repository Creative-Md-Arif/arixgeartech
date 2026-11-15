/* ArixGear services — homepage sections (admin-ordered + admin-configured) */
import { api } from './http.js';

/* GET /api/home-sections — returns { items: [...], hidden: [keys] } */
export const listHomeSections = (signal) => api('/home-sections', { auth: false, signal });
