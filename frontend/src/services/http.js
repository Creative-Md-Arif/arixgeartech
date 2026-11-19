/* Local API overrides are restricted to local origins to protect production auth tokens. */
const LOCAL_ORIGIN = (typeof location !== 'undefined')
  && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
const API_BASE = (function () {
  const s = localStorage.getItem('forged_api_base');
  if (s && LOCAL_ORIGIN) return s;
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured.endsWith('/api') ? configured : configured + '/api';
  return location.protocol === 'file:' ? 'http://localhost:5000/api' : location.origin + '/api';
})();

const sessionToken = () => {
  try { return (JSON.parse(localStorage.getItem('forged_session') || 'null') || {}).token || null; } catch (e) { return null; }
};

async function api(path, opt = {}) {
  const headers = opt.headers || {};
  if (opt.body && !opt.form) headers['Content-Type'] = 'application/json';
  const tk = opt.auth === false ? null : sessionToken();
  if (tk) headers['Authorization'] = 'Bearer ' + tk;
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: opt.method || 'GET', headers,
      body: opt.form || (opt.body ? JSON.stringify(opt.body) : undefined),
      signal: opt.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    const err = new Error('ArixGear API unreachable at ' + API_BASE + ' — start the backend with `npm start` (backend folder).');
    err.offline = true; throw err;
  }
  let data = {}; try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    /* audit — a 401 with an attached token means the session is dead
       (expired/revoked/signed-out-elsewhere). Clear it ONCE centrally so no
       page gets stuck in a zombie "logged-in" shell where every call fails:
       the account Gate re-renders to the Members-Only panel and ?next= brings
       the customer back after re-login. Login failures carry NO token (opt
       out via auth:false) so wrong-password 401s still surface normally. */
    if (res.status === 401 && tk) {
      try {
        localStorage.removeItem('forged_session');
        window.dispatchEvent(new CustomEvent('arixgear:session-expired'));
      } catch (e) {}
    }
    const err = new Error(data.message || 'Request failed (' + res.status + ')'); err.status = res.status; err.data = data; throw err;
  }
  return data;
}

export { api, API_BASE };
