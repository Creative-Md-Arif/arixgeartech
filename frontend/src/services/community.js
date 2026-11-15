import { api } from './http.js';

export const getCommunity = (signal) => api('/community', { auth: false, signal });
