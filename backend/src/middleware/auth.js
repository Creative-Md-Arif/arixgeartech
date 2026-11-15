const jwt = require('jsonwebtoken');
const User = require('../models/User');

/* Task 57 (security audit) — production must never silently run on a public
   fallback secret. Dev keeps the convenience fallback with a loud warning. */
function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production — refusing to sign with the dev fallback');
  }
  console.warn('[auth] JWT_SECRET not set — using the DEV fallback secret (never do this in production)');
  return 'arixgear-dev-secret-change-me'; // audit fix — brand-neutral fallback (prod guard regex still matches 'dev-secret')
}

const SECRET = jwtSecret;

/* Step 4 (4.2) — dual-mode auth token extraction. API clients and the QA
   suites keep the classic `Authorization: Bearer` header; same-origin browser
   flows (storefront + admin SPAs) now ride the HttpOnly `arix_session` cookie
   set by login/verify-email — the JWT is no longer reachable from JS, closing
   the XSS-token-theft class end-to-end (the localStorage copy is gone from
   both SPAs since this step). */
const SESSION_COOKIE = 'arix_session';

function parseBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function extractToken(req) {
  const bearer = parseBearer(req);
  if (bearer) return bearer;
  const c = req.cookies && req.cookies[SESSION_COOKIE];
  return c ? String(c) : null;
}

/** Hard auth — 401 when missing/invalid token (Bearer header or session cookie). */
async function protect(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: 'Not authenticated — token missing' });
    const decoded = jwt.verify(token, SECRET());
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'Account no longer exists' });
    /* Task 39 — a staff account disabled AFTER login loses API access on its
       very next request (JWTs are stateless; this per-request re-read is what
       makes the Team page "Disable" switch instant). */
    if ((user.role === 'admin' || user.role === 'subadmin') && user.active === false) {
      return res.status(403).json({ message: 'This staff account has been disabled — contact the store owner' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/** Soft auth — attaches req.user when a valid token is present, never blocks. */
async function protectOptional(req, _res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = jwt.verify(token, SECRET());
      req.user = await User.findById(decoded.id);
    }
  } catch (_e) { /* anonymous */ }
  next();
}

/** Role gate — use after protect. Accepts staff (admin + sub-admin, Task 39).
 *  Module-level limits are enforced separately by requirePermission(). */
function adminOnly(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'subadmin')) return next();
  return res.status(403).json({ message: 'Admin access required' });
}

/** Strict owner gate — team/audit management stays with full admins only. */
function ownerOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Owner access required' });
}

/* Task 39 — module keys a sub-admin can be granted (mirrors the sidebar).
   Phase 2: gym 'membership' vertical archived → replaced by 'brands' (v2 catalog).
   Phase 8: 'deals' — centralized promotions manager. */
const MODULES = [
  'dashboard', 'orders', 'returns', 'reports', 'products', 'catalog', 'reviews',
  'questions', 'banners', 'homepage', 'coupons', 'customers', 'brands',
  'messages', 'content', 'seo', 'settings', 'deals', 'ai',
];

/** Permission gate — use after protect+adminOnly. Full admins bypass; sub-admins
 *  must carry the module in User.permissions. `any` accepts several keys (OR). */
function requirePermission(...mods) {
  const allowed = mods;
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated — token missing' });
    if (req.user.role === 'admin') return next();
    if (req.user.role === 'subadmin' && (req.user.permissions || []).some((p) => allowed.includes(p))) return next();
    return res.status(403).json({ message: `Permission denied — needs: ${allowed.join(' or ')}` });
  };
}

module.exports = { protect, protectOptional, adminOnly, ownerOnly, requirePermission, jwtSecret, MODULES, SESSION_COOKIE, parseBearer };
