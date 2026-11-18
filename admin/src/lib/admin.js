/* ArixGear ADMIN — shared helpers (auth + formatting + pickers). All API calls live in src/services/* over services/http.js */
import { navTo } from './nav.js';
import { logout as serverLogout } from '../services/auth.js';

export const dt = (s) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const day = (s) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
export const DIVISIONS = ['dhaka', 'chattogram', 'rajshahi', 'khulna', 'barishal', 'sylhet', 'rangpur', 'mymensingh'];
export const PAY_LABELS = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', cod: 'Cash on Delivery' };

/* money — Bangladeshi Taka (৳ BDT) */
export const money = (n) => {
  n = +n || 0;
  return '৳' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};

/* ---------- auth ---------- */
export const auth = {
  get token() { return localStorage.getItem('forged_admin_token') || ''; },
  get user() { try { return JSON.parse(localStorage.getItem('forged_admin_user') || 'null'); } catch (_) { return null; } },
  set(t, u) { localStorage.setItem('forged_admin_token', t); localStorage.setItem('forged_admin_user', JSON.stringify(u)); },
  clear() { localStorage.removeItem('forged_admin_token'); localStorage.removeItem('forged_admin_user'); },
};
export async function logout() {
  try {
    await serverLogout();
  } finally {
    auth.clear();
    navTo('/login');
  }
}
/* no-throw: App.jsx's Guard already blocks unauthenticated renders — this just reroutes late logouts */
export function requireAuth() {
  if (!auth.token) navTo('/login');
}

/* ---------- image picker helper (File Upload System → Cloudinary/local) ---------- */
export function pickImages(cb, multiple = false) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.multiple = multiple;
  input.onchange = () => { const files = [...input.files]; if (files.length) cb(files); };
  input.click();
}

/* ---------- CSV download helper ----------
   Takes ready-made CSV TEXT (fetched by services/orders exportCsv) and triggers the browser download. */
export function downloadCsv(csvText = '', filename = 'arixgear-orders.csv') {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ---------- status chip palettes ---------- */
export const ST_CHIP = {
  pending: 'bg-yellow/15 text-yellow border-yellow/40',
  verifying: 'bg-yellow/15 text-yellow border-yellow/40',
  processing: 'bg-blue/15 text-blue border-blue/40',
  packed: 'bg-teal/15 text-teal border-teal/40',
  shipped: 'bg-purple/15 text-purple border-purple/40',
  delivered: 'bg-green/15 text-green border-green/40',
  cancelled: 'bg-red/15 text-red border-red/40',
  'payment-rejected': 'bg-red/15 text-red border-red/40',
};
export const PAY_CHIP = {
  pending: 'bg-yellow/15 text-yellow border-yellow/40',
  verified: 'bg-green/15 text-green border-green/40',
  rejected: 'bg-red/15 text-red border-red/40',
};
export const stChipCls = (s) => ST_CHIP[s] || 'bg-white/5 text-dim border-line2';
export const payChipCls = (p) => PAY_CHIP[p] || 'bg-white/5 text-dim border-line2';
