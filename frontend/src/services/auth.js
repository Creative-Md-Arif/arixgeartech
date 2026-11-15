/* ArixGear services — customer auth (JWT) */
import { api } from './http.js';

/* POST /api/auth/login — { identifier, password } → { token, user }
   identifier = email OR BD phone (backend normalizes + routes). Legacy
   { email, password } bodies still work server-side. */
export const login = (identifier, password, signal) =>
  api('/auth/login', { method: 'POST', body: { identifier, password }, signal });

/* POST /api/auth/register — { name, email, phone?, password }
   → 201 { needsVerification: true, email, devOtp? } — account is UNVERIFIED
   until POST /verify-email confirms the emailed 6-digit code (Task 51). */
export const register = (name, email, password, phone, signal) =>
  api('/auth/register', { method: 'POST', body: phone ? { name, email, phone, password } : { name, email, password }, signal });

/* POST /api/auth/verify-email — { email, code } → { token, user } (logs you in) */
export const verifyEmail = (email, code, signal) =>
  api('/auth/verify-email', { method: 'POST', body: { email, code }, signal });

/* POST /api/auth/resend-verification — { email } → always 200 (generic) */
export const resendVerification = (email, signal) =>
  api('/auth/resend-verification', { method: 'POST', body: { email }, signal });

/* GET /api/auth/me — current user */
export const me = (signal) => api('/auth/me', { signal });

/* POST /api/auth/forgot-password — { email } → { message, delivery, resetUrl? } */
export const forgotPassword = (email, signal) =>
  api('/auth/forgot-password', { method: 'POST', body: { email }, signal });

/* GET /api/auth/reset-password/verify?token=… → { valid, email } */
export const verifyResetToken = (token, signal) =>
  api('/auth/reset-password/verify?token=' + encodeURIComponent(token), { signal });

/* POST /api/auth/reset-password — { token, password } → { message } */
export const resetPassword = (token, password, signal) =>
  api('/auth/reset-password', { method: 'POST', body: { token, password }, signal });

/* GET /api/auth/loyalty — Task 56-a: points balance + spend rules + history
   { referralCode, points, rules:{enabled,pointValue,minRedeem,maxRedeemPct}, history:[…] } */
export const loyalty = (signal) => api('/auth/loyalty', { signal });

/* ── Phase 6b — account pack (profile / password / address book) ─────────── */

/* PATCH /api/auth/profile — { name?, phone? } → { user } (BD phone normalized server-side) */
export const updateProfile = (body, signal) =>
  api('/auth/profile', { method: 'PATCH', body, signal });

/* POST /api/auth/change-password — { current, next } */
export const changePassword = (current, next, signal) =>
  api('/auth/change-password', { method: 'POST', body: { current, next }, signal });

/* Address book — GET/POST/PUT/DELETE; :id is the 0-based index (backend contract) */
export const listAddresses = (signal) => api('/auth/addresses', { signal });
export const addAddress = (body, signal) =>
  api('/auth/addresses', { method: 'POST', body, signal });
export const updateAddress = (id, body, signal) =>
  api('/auth/addresses/' + encodeURIComponent(id), { method: 'PUT', body, signal });
export const deleteAddress = (id, signal) =>
  api('/auth/addresses/' + encodeURIComponent(id), { method: 'DELETE', signal });
