/* ArixGear services — AI assistant (storefront widget) */
import { api } from './http.js';

export const getConfig = () => api('/ai/config');
export const ask = ({ message, sessionKey }) => api('/ai/chat', { method: 'POST', body: { message, sessionKey } });
export const faqs = () => api('/ai/faqs');
