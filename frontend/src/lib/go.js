/* Route legacy go() calls through React Router after its navigator is bound. */
let NAV = null;

export function bindNavigator(fn) {
  NAV = fn;
}

export function go(raw) {
  const t = String(raw || '');

  /* in-page anchor */
  if (t.startsWith('#')) {
    if (window.location.pathname === '/') {
      const el = document.getElementById(t.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(history.state, '', t);
      }
      return;
    }
    if (NAV) NAV('/' + t); /* renders home, RouteEffects scrolls to the hash */
    return;
  }

  let x = t.replace(/^\/+/, '').replace(/\.html$/i, '');
  const MAP = { '': '', home: '', blog: 'guides' };
  if (x in MAP) x = MAP[x];
  const [p, q] = x.split('?');
  const url = (p ? '/' + p : '/') + (q ? '?' + q : '');
  if (NAV) NAV(url);
  else window.location.href = '/#' + url; /* bridge not bound yet — hard fallback */
}
