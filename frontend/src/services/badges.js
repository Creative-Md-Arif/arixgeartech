/* ArixGear services — product badges (admin-managed, resolved live) */
import { api } from './http.js';

export const list = (signal) => api('/badges', { auth: false, signal });
