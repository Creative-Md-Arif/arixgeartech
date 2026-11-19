import { api } from './http.js';

export const list = (signal) => api('/badges', { auth: false, signal });
