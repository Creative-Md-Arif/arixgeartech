/* ArixGear ADMIN services — HTTP client (JWT-authenticated fetch wrapper). */
const API_BASE = (function () {
  const s = localStorage.getItem('forged_api_base');
  if (s) return s;
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured.endsWith('/api') ? configured : configured + '/api';
  return location.origin + '/api';
})();

export const API = API_BASE;

export async function api(path, { method = 'GET', body, form, headers: extra } = {}) {
  const headers = { ...(extra || {}) };
  const token = localStorage.getItem('forged_admin_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, { method, headers, body: payload });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401 && token) {
    localStorage.removeItem('forged_admin_token');
    localStorage.removeItem('forged_admin_user');
    const { navTo } = await import('../lib/nav.js');
    navTo('/login');
    throw new Error('Session expired — login again');
  }
  if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
  return data;
}

/* Task 27 — authenticated file download (CSV export): fetch → blob → save */
export async function download(path, filename) {
  const token = localStorage.getItem('forged_admin_token');
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new Error('Download failed — HTTP ' + res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
