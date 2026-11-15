/* ArixGear ADMIN — SPA navigation bridge (see storefront lib/go.js for the pattern).
   navTo('/orders') drives react-router; every legacy location.* call goes through here. */
let NAV = null;

export function bindNavigator(fn) {
  NAV = fn;
}

export function navTo(path) {
  if (NAV) NAV(path);
  else window.location.href = '/admin' + path; /* bridge not bound yet — hard fallback */
}
