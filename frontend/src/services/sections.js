import { api } from './http.js';

export const listHomeSections = (signal) => api('/home-sections', { auth: false, signal });
