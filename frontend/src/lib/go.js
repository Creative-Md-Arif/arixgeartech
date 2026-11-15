/* ArixGear core — SPA navigation bridge.
   go(target) keeps the legacy helper signature so page/component code keeps
   working, but instead of full page loads it drives react-router:
     go('shop')            → /shop            go('success.html')   → /success
     go('blog?post=x')     → /guides?post=x   go('')               → /
     go('#goals')          → in-page anchor (scrolls if home, else goes home first)
   App.jsx binds the router navigator once on boot via bindNavigator(). */
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
