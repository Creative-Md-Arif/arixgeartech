import { api } from './http.js';

export const getContent = (signal) => api('/settings/content', { auth: false, signal });
export const getPayment = (signal) => api('/settings/payment', { auth: false, signal });
export const getShipping = (signal) => api('/settings/shipping', { auth: false, signal });
export const getPixel = (signal) => api('/settings/pixel', { auth: false, signal });
export const getChat = (signal) => api('/settings/chat', { auth: false, signal });
export const getSizeGuide = (signal) => api('/settings/size-guide', { auth: false, signal });
