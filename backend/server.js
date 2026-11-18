require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
require('./src/config/cloudinary');
const { notFound, errorHandler } = require('./src/middleware/error');

/* ---------- production guards ---------- */
const isProd = process.env.NODE_ENV === 'production';
if (isProd && (!process.env.JWT_SECRET || /change-this|dev-secret|changeme/i.test(process.env.JWT_SECRET))) {
  console.error('FATAL: set a strong JWT_SECRET (32+ random chars) before running in production.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind reverse proxies (nginx/Render/Railway)

/* ---------- security & perf ---------- */
app.use(helmet({
  contentSecurityPolicy: false, // Step 4 — a REAL CSP is applied per-response by the HTML-headers middleware below (hash-locked script-src)
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // assets/images loadable by the storefront
}));
app.use(compression());

/* ---------- CORS allowlist ---------- */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    /* Task 57 (security audit) — in production an empty allowlist must NOT
       silently open the API to every site (dev convenience stays as-is) */
    if (process.env.NODE_ENV !== 'production' && ALLOWED_ORIGINS.length === 0) return cb(null, true);
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
}));

/* ---------- rate limiting ---------- */
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 800, standardHeaders: 'draft-7', legacyHeaders: false });
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 300, // Task 57 — QA batteries fire many logins in one pass (dev only)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts — try again in 15 minutes.' },
});
app.use('/api', apiLimiter);
const aiChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 40 : 300, // AI calls cost money in prod — keep the tap narrow
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'AI assistant is busy right now — try again in a few minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify-email', authLimiter); // Task 51 — OTP brute-force guard
app.use('/api/auth/resend-verification', authLimiter); // Task 51 — mail-bomb guard
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

/* ---------- core middleware ---------- */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (!isProd) app.use(morgan('dev'));

/* ── Step 4 (4.2b) — cookie parsing (dependency-free) ────────────────────
   login/verify-email set the HttpOnly `arix_session` cookie; without this
   middleware `req.cookies` is undefined and the cookie is never read back —
   the whole cookie-auth path would be dead code. Parses RFC6265 header
   pairs (name=value; …), URL-decodes values, ignores malformed pairs. */
app.use((req, _res, next) => {
  const raw = req.headers.cookie;
  req.cookies = {};
  if (raw) {
    for (const pair of String(raw).split(';')) {
      const i = pair.indexOf('=');
      if (i < 1) continue;
      const name = pair.slice(0, i).trim();
      if (!name || name in req.cookies) continue;
      try { req.cookies[name] = decodeURIComponent(pair.slice(i + 1).trim()); }
      catch (_e) { req.cookies[name] = pair.slice(i + 1).trim(); }
    }
  }
  next();
});

/* ── Step 4 (4.2c) — CSRF layer #2: Origin check for cookie-carried writes ──
   SameSite=Lax already keeps cross-site POSTs from carrying the session
   cookie (layer #1); this pins layer #2 for defense-in-depth: a mutating
   request that authenticates via the session cookie must be same-origin
   (the SPAs are served by this same server, so Origin host === Host).
   Bearer-header callers (API clients, QA suites, mobile) are unaffected. */
const { SESSION_COOKIE } = require('./src/middleware/auth');
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!(req.cookies && req.cookies[SESSION_COOKIE])) return next(); // not cookie-authed
  const origin = String(req.headers.origin || req.headers.referer || '');
  if (!origin) return res.status(403).json({ message: 'Cross-site request blocked — Origin required for cookie sessions' });
  try {
    const originUrl = new URL(origin);
    const sameHost = originUrl.host === req.headers.host;
    const localDevOrigin = process.env.NODE_ENV !== 'production'
      && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(originUrl.hostname)
      && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(req.hostname);
    if (!sameHost && !localDevOrigin) {
      return res.status(403).json({ message: 'Cross-site request blocked — origin mismatch' });
    }
  } catch (_e) {
    return res.status(403).json({ message: 'Cross-site request blocked — malformed Origin' });
  }
  next();
});

/* ---------- static: uploads / admin / frontend (SPA builds with history fallback) ---------- */
const ROOT = path.join(__dirname, '..'); // arixgear/

/* ── Step 4 (4.1) — HTML security headers with a REAL Content-Security-Policy ──
   Old state: helmet.contentSecurityPolicy=false justified by "pages use inline
   scripts + inline event attrs". Step-4 audit found that justification stale:
   the React shells contain NO inline event attributes (React events are
   synthetic; admin-authored HTML is sanitized server-side since Steps 2–3) —
   only a handful of inline bootstrap <script> blocks (theme/lang pre-paint,
   QA error collector). So the SPAs can run under an enforced CSP:
     script-src  'self' + sha256 hashes OF THE ACTUAL BUILT SHELLS
                 (recomputed lazily on file mtime/size change — rebuild-safe),
     style-src   'self' 'unsafe-inline' (React style ATTRIBUTES),
     connect-src 'self' + the per-request ws(s)://<host> the Socket.IO gateway
                 rides (locked to the serving host, no wildcard).
   Applied ONLY to text/html responses (SPA shells); API JSON, uploads,
   robots/sitemap are untouched — curl QA expectations keep holding. */
const crypto = require('crypto');
const FRONTEND_SHELL = path.join(process.env.FRONTEND_DIR || path.join(ROOT, 'frontend', 'dist'), 'index.html');
const ADMIN_SHELL = path.join(process.env.ADMIN_DIR || path.join(ROOT, 'admin', 'dist'), 'index.html');
const cspHashCache = new Map(); // shell path → { sig, hashes }
function shellScriptHashes(shell) {
  try {
    const st = fs.statSync(shell);
    const sig = st.size + ':' + st.mtimeMs;
    const hit = cspHashCache.get(shell);
    if (hit && hit.sig === sig) return hit.hashes;
    const html = fs.readFileSync(shell, 'utf8');
    const hashes = [];
    const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      if (!m[1] || !m[1].trim()) continue;
      hashes.push("'sha256-" + crypto.createHash('sha256').update(m[1]).digest('base64') + "'");
    }
    cspHashCache.set(shell, { sig, hashes });
    return hashes;
  } catch (_e) { return []; } /* no built shell → SPA not served anyway */
}
function cspFor(req, shell) {
  const host = String(req.get('host') || 'localhost').replace(/[^\w.\-:\[\]]/g, '');
  const ws = (req.protocol === 'https' ? 'wss' : 'ws') + '://' + host;
  const hashes = shellScriptHashes(shell);
  return [
    "default-src 'self'",
    "script-src 'self'" + (hashes.length ? ' ' + hashes.join(' ') : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' " + ws,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
app.use((req, res, next) => {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = function (name, value) {
    if (String(name).toLowerCase() === 'content-type' && String(value).toLowerCase().includes('text/html')) {
      const isAdminPath = String(req.originalUrl || req.url || '/').startsWith('/admin');
      setHeader('Content-Security-Policy', cspFor(req, isAdminPath ? ADMIN_SHELL : FRONTEND_SHELL));
      setHeader('X-Frame-Options', 'DENY'); // clickjacking belt-and-suspenders next to frame-ancestors
      setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
      setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    return setHeader(name, value);
  };
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
/* Dev fallback for seeded /assets/... URLs when the storefront is running
   through Vite instead of the production frontend/dist static server. */
app.use('/assets', express.static(path.join(ROOT, 'frontend', 'public', 'assets'), { maxAge: 0 }));

/* ---------- SEO: robots.txt + sitemap.xml (dynamic, admin-managed) ----------
   Registered BEFORE the SPA fallback so crawlers get real files, not the
   storefront shell. Content lives in the Seo models (Admin → SEO).          */
app.get('/robots.txt', require('./src/controllers/seoController').robots);
app.get('/sitemap.xml', require('./src/controllers/seoController').sitemap);

/* admin SPA — source: admin/ (React + Vite), build output: admin/dist, served at /admin */
const ADMIN_DIR = process.env.ADMIN_DIR || path.join(ROOT, 'admin', 'dist');
if (fs.existsSync(path.join(ADMIN_DIR, 'index.html'))) {
  app.use('/admin', express.static(ADMIN_DIR));
  /* SPA history fallback — never serve the shell for dotfiles (.env, .git, …) */
  app.get(/^\/admin\/(?!.*\/\.).*$|^\/admin$/, (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
  console.log('[static] admin panel (React SPA) → /admin');
}

/* storefront SPA — source: frontend/ (React + Vite), build output: frontend/dist, served at / */
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(ROOT, 'frontend', 'dist');
if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
  app.use(express.static(FRONTEND_DIR, { maxAge: 0, etag: true })); // always revalidate — edits show up on refresh
  /* SPA history fallback — excludes /api, /admin, /uploads and any dotfile path (.env, .git, …) */
  app.get(/^\/(?!api\/|admin(?:\/|$)|uploads)(?!\.|.*\/\.).*/, (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
  console.log('[static] storefront (React SPA) → /');
}

/* ---------- API routes ---------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'ArixGear API', time: new Date().toISOString() }));

app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/products', require('./src/routes/productRoutes'));
app.use('/api/categories', require('./src/routes/categoryRoutes'));
app.use('/api/badges', require('./src/routes/badgeRoutes'));
app.use('/api/banners', require('./src/routes/bannerRoutes'));
app.use('/api/home-sections', require('./src/routes/homeSectionRoutes'));
app.use('/api/community', require('./src/routes/communityRoutes'));
app.use('/api/orders', require('./src/routes/orderRoutes'));
app.use('/api/payments', require('./src/routes/paymentRoutes')); // SSLCOMMERZ gateway (Task 40)
app.use('/api/coupons', require('./src/routes/couponRoutes'));
app.use('/api/reviews', require('./src/routes/reviewRoutes')); // helpful votes (Task 29)
app.use('/api/questions', require('./src/routes/questionRoutes')); // Q&A helpful votes (Task 30)
app.use('/api/messages', require('./src/routes/messageRoutes'));
app.use('/api/newsletter', require('./src/routes/newsletterRoutes')); // signup → welcome coupon ARIX10 (Task 49) · unsubscribe (Phase 4)
app.use('/api/blog', require('./src/routes/blogRoutes')); // Journal — public reads (Task 47)
app.use('/api/brands', require('./src/routes/brandRoutes')); // Phase 2 — v2 catalog brands
app.use('/api/bundles', require('./src/routes/bundleRoutes')); // Phase 4 — combo bundles (4.1)
app.use('/api/flash-campaigns', require('./src/routes/flashCampaignRoutes')); // Phase 4 — flash campaign windows (4.1)
app.use('/api/deals', require('./src/routes/dealRoutes')); // Phase 8 — centralized deals & promotions
app.use('/api/ai', aiChatLimiter, require('./src/routes/aiRoutes')); // Phase 9 — AI system (chat is rate-limited above)
app.use('/api/service', require('./src/routes/serviceRoutes')); // Phase 4 — after-sales: warranty/tickets/centers (4.2)
app.use('/api/devices', require('./src/routes/deviceRoutes')); // Phase 4 — FCM device tokens (4.3)
app.use('/api/settings', require('./src/routes/settingRoutes'));
app.use('/api/seo', require('./src/routes/seoRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes')); // Task 36 — SSE + bell list
app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/admin/quick-services', require('./src/routes/quickServiceRoutes'));

/* ---------- errors ---------- */
app.use(notFound);
app.use(errorHandler);

/* ---------- boot ---------- */
const PORT = process.env.PORT || 5000;

/* Task 30 — production readiness report, printed once at boot (prod only).
   Every line is either ✓ (ready) or ⚠ (works, but fix before launch). */
function prodChecklist(rs) {
  const lines = [];
  const jwt = process.env.JWT_SECRET && !/change-this|dev-secret|changeme/i.test(process.env.JWT_SECRET);
  const corsN = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).length;
  const cloudinary = Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));
  const smsLive = String(process.env.SMS_DRY_RUN ?? 'true') === 'false' && process.env.SSLWIRELESS_API_TOKEN && process.env.SSLWIRELESS_SID;
  const smsOff = String(process.env.SMS_PROVIDER || '').toLowerCase() === 'off';

  lines.push(`${jwt ? '✓' : '✗'} JWT_SECRET ${jwt ? 'set' : 'MISSING/weak — server already refused to boot if we got here'}`);
  lines.push(`${corsN ? '✓' : '⚠'} CORS_ORIGINS ${corsN ? `(${corsN} domain${corsN > 1 ? 's' : ''})` : 'empty — ALL origins allowed in production'}`);
  lines.push(`${rs ? '✓' : '⚠'} MongoDB ${rs ? 'replica set — transactions ON' : 'NOT a replica set — multi-doc transactions disabled (fallback mode)'}`);
  lines.push(`${cloudinary ? '✓' : '⚠'} Images ${cloudinary ? 'on Cloudinary' : 'on LOCAL disk — lost on redeploy; set CLOUDINARY_*'}`);
  lines.push(`${process.env.RESEND_API_KEY ? '✓' : '⚠'} Email ${process.env.RESEND_API_KEY ? 'live (Resend)' : 'DRY-RUN — customers get no real emails; set RESEND_API_KEY'}`);
  lines.push(`${smsOff ? '⚠' : smsLive ? '✓' : '⚠'} SMS ${smsOff ? 'OFF' : smsLive ? 'LIVE (SSLWireless)' : 'DRY-RUN — set SMS_DRY_RUN=false + SSLWIRELESS_* for real SMS'}`);
  lines.push(`${process.env.ADMIN_NOTIFY_EMAIL ? '✓' : '⚠'} Question alerts ${process.env.ADMIN_NOTIFY_EMAIL ? '→ ' + process.env.ADMIN_NOTIFY_EMAIL : 'disabled — set ADMIN_NOTIFY_EMAIL'}`);
  /* Phase 9 — AI stack: informational (rules mode is a valid zero-cost end state) */
  const aiLlm = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_BASE_URL);
  lines.push(`${aiLlm ? '✓' : 'ℹ'} AI ${aiLlm ? 'LLM provider available (Gemini / OpenAI-compatible)' : 'grounded-rules mode — zero cost, zero hallucination; set GEMINI_API_KEY (or Admin → AI Console) for conversational answers'}`);
  console.log('\n ── PRODUCTION READINESS ─────────────────────────────');
  lines.forEach((l) => console.log('  ' + l));
  console.log(' ─────────────────────────────────────────────────────\n');
}

let server;
let aiImportRecoveryTimer;
connectDB()
  .then(async (rs) => {
    if (isProd) prodChecklist(rs);
    /* Step 6 — SPEC-SYSTEM MIGRATION AUTO-RUN. The migrate-specs-v3 pass is
       idempotent; a cheap probe checks for legacy-flat products that never
       grew canonical specValues (CSV import, restore from an old backup) and
       bootstraps them so the PDP/filters/compare never meet a schema-less
       doc. Never blocks or fails the boot. */
    try {
      const specMigration = require('./src/services/specMigration');
      if (await specMigration.needsMigration()) {
        const r = await specMigration.runMigration();
        console.log(`[boot] spec migration auto-ran — ${r.migrated} products, ${r.schemasGrown} category schemas grown`);
      }
    } catch (e) { console.warn('[boot] spec migration skipped:', e.message); }
    const aiImporter = require('./src/services/ai/importer');
    const recoverAiImports = async () => {
      try {
        const result = await aiImporter.recoverStuckImports();
        if (result.failed || result.resumed) {
          console.warn(`[ai-import] recovery: ${result.failed} stalled, ${result.resumed} pending resumed`);
        }
      } catch (e) {
        console.error('[ai-import] recovery check failed:', e.message);
      }
    };
    await recoverAiImports();
    aiImportRecoveryTimer = setInterval(recoverAiImports, 60_000);
    const httpServer = require('http').createServer(app);
    /* Phase 4 (4.3) — Socket.IO gateway (JWT handshake, user/admin/order rooms).
       SSE stays for the existing bells; this is the additive realtime channel. */
    require('./src/services/realtime').init(httpServer);
    server = httpServer.listen(PORT, () => {
      console.log(`\n ArixGear API ready → http://localhost:${PORT}`);
      console.log(`   storefront  http://localhost:${PORT}/`);
      console.log(`   admin panel http://localhost:${PORT}/admin/`);
      console.log(`   realtime    ws://localhost:${PORT}/socket.io (JWT auth)\n`);
    });
  })
  .catch((e) => {
    console.error('MongoDB connection failed:', e.message);
    console.error('Tip: run `npm run mongo` in another terminal (local dev DB), or set MONGODB_URI to Atlas.');
    process.exit(1);
  });

/* ---------- graceful shutdown ---------- */
function shutdown(signal) {
  console.log(`\n[${signal}] shutting down…`);
  if (aiImportRecoveryTimer) clearInterval(aiImportRecoveryTimer);
  if (server) {
    server.close(() => {
      const mongoose = require('mongoose');
      mongoose.connection.close().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 8000).unref(); // force-exit if connections hang
  } else process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
