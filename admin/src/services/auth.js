/* ArixGear ADMIN services — auth */
import { api } from './http.js';

/* POST /api/auth/login — { email, password } → { token, user } */
export const login = (email, password) => api('/auth/login', { method: 'POST', body: { email, password } });

/* POST /api/auth/forgot-password — { email } → { message, delivery, resetUrl? } */
export const forgotPassword = (email) => api('/auth/forgot-password', { method: 'POST', body: { email } });

/* GET /api/auth/reset-password/verify?token=… → { valid, email } */
export const verifyResetToken = (token) => api('/auth/reset-password/verify?token=' + encodeURIComponent(token));

/* POST /api/auth/reset-password — { token, password } → { message } */
export const resetPassword = (token, password) => api('/auth/reset-password', { method: 'POST', body: { token, password } });
