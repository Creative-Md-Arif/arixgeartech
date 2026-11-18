require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./src/config/db");
require("./src/config/cloudinary");
const { notFound, errorHandler } = require("./src/middleware/error");

const isProd = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);
if (
  isProd &&
  (!process.env.JWT_SECRET ||
    /change-this|dev-secret|changeme/i.test(process.env.JWT_SECRET))
) {
  console.error(
    "FATAL: set a strong JWT_SECRET (32+ random chars) before running in production.",
  );
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

if (isVercel) {
  app.use(async (_req, res, next) => {
    try {
      await connectDB();
      next();
    } catch (e) {
      console.error("[db] connect failed:", e.message);
      res.status(500).json({ message: "Database unavailable" });
    }
  });
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(compression());

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      if (process.env.NODE_ENV !== "production" && ALLOWED_ORIGINS.length === 0)
        return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 800,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts — try again in 15 minutes." },
});
app.use("/api", apiLimiter);
const aiChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 40 : 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "AI assistant is busy right now — try again in a few minutes.",
  },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/verify-email", authLimiter);
app.use("/api/auth/resend-verification", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
if (!isProd) app.use(morgan("dev"));

app.use((req, _res, next) => {
  const raw = req.headers.cookie;
  req.cookies = {};
  if (raw) {
    for (const pair of String(raw).split(";")) {
      const i = pair.indexOf("=");
      if (i < 1) continue;
      const name = pair.slice(0, i).trim();
      if (!name || name in req.cookies) continue;
      try {
        req.cookies[name] = decodeURIComponent(pair.slice(i + 1).trim());
      } catch (_e) {
        req.cookies[name] = pair.slice(i + 1).trim();
      }
    }
  }
  next();
});

const { SESSION_COOKIE } = require("./src/middleware/auth");
app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (!(req.cookies && req.cookies[SESSION_COOKIE])) return next();
  const origin = String(req.headers.origin || req.headers.referer || "");
  if (!origin)
    return res
      .status(403)
      .json({
        message:
          "Cross-site request blocked — Origin required for cookie sessions",
      });
  try {
    const originUrl = new URL(origin);
    const sameHost = originUrl.host === req.headers.host;
    const localDevOrigin =
      process.env.NODE_ENV !== "production" &&
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(originUrl.hostname) &&
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(req.hostname);
    if (!sameHost && !localDevOrigin) {
      return res
        .status(403)
        .json({ message: "Cross-site request blocked — origin mismatch" });
    }
  } catch (_e) {
    return res
      .status(403)
      .json({ message: "Cross-site request blocked — malformed Origin" });
  }
  next();
});

const ROOT = path.join(__dirname, "..");

const crypto = require("crypto");
const FRONTEND_SHELL = path.join(
  process.env.FRONTEND_DIR || path.join(ROOT, "frontend", "dist"),
  "index.html",
);
const ADMIN_SHELL = path.join(
  process.env.ADMIN_DIR || path.join(ROOT, "admin", "dist"),
  "index.html",
);
const cspHashCache = new Map();
function shellScriptHashes(shell) {
  try {
    const st = fs.statSync(shell);
    const sig = st.size + ":" + st.mtimeMs;
    const hit = cspHashCache.get(shell);
    if (hit && hit.sig === sig) return hit.hashes;
    const html = fs.readFileSync(shell, "utf8");
    const hashes = [];
    const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      if (!m[1] || !m[1].trim()) continue;
      hashes.push(
        "'sha256-" +
          crypto.createHash("sha256").update(m[1]).digest("base64") +
          "'",
      );
    }
    cspHashCache.set(shell, { sig, hashes });
    return hashes;
  } catch (_e) {
    return [];
  }
}
function cspFor(req, shell) {
  const host = String(req.get("host") || "localhost").replace(
    /[^\w.\-:\[\]]/g,
    "",
  );
  const ws = (req.protocol === "https" ? "wss" : "ws") + "://" + host;
  const hashes = shellScriptHashes(shell);
  return [
    "default-src 'self'",
    "script-src 'self'" + (hashes.length ? " " + hashes.join(" ") : ""),
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
  ].join("; ");
}
app.use((req, res, next) => {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = function (name, value) {
    if (
      String(name).toLowerCase() === "content-type" &&
      String(value).toLowerCase().includes("text/html")
    ) {
      const isAdminPath = String(req.originalUrl || req.url || "/").startsWith(
        "/admin",
      );
      setHeader(
        "Content-Security-Policy",
        cspFor(req, isAdminPath ? ADMIN_SHELL : FRONTEND_SHELL),
      );
      setHeader("X-Frame-Options", "DENY");
      setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
      );
      setHeader("Cross-Origin-Opener-Policy", "same-origin");
    }
    return setHeader(name, value);
  };
  next();
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), { maxAge: "7d" }),
);

app.use(
  "/assets",
  express.static(path.join(ROOT, "frontend", "public", "assets"), {
    maxAge: 0,
  }),
);

app.get("/robots.txt", require("./src/controllers/seoController").robots);
app.get("/sitemap.xml", require("./src/controllers/seoController").sitemap);

const ADMIN_DIR = process.env.ADMIN_DIR || path.join(ROOT, "admin", "dist");
if (fs.existsSync(path.join(ADMIN_DIR, "index.html"))) {
  app.use("/admin", express.static(ADMIN_DIR));

  app.get(/^\/admin\/(?!.*\/\.).*$|^\/admin$/, (_req, res) =>
    res.sendFile(path.join(ADMIN_DIR, "index.html")),
  );
  console.log("[static] admin panel (React SPA) → /admin");
}

const FRONTEND_DIR =
  process.env.FRONTEND_DIR || path.join(ROOT, "frontend", "dist");
if (fs.existsSync(path.join(FRONTEND_DIR, "index.html"))) {
  app.use(express.static(FRONTEND_DIR, { maxAge: 0, etag: true }));

  app.get(/^\/(?!api\/|admin(?:\/|$)|uploads)(?!\.|.*\/\.).*/, (_req, res) =>
    res.sendFile(path.join(FRONTEND_DIR, "index.html")),
  );
  console.log("[static] storefront (React SPA) → /");
}

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, name: "ArixGear API", time: new Date().toISOString() }),
);

app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/products", require("./src/routes/productRoutes"));
app.use("/api/categories", require("./src/routes/categoryRoutes"));
app.use("/api/badges", require("./src/routes/badgeRoutes"));
app.use("/api/banners", require("./src/routes/bannerRoutes"));
app.use("/api/home-sections", require("./src/routes/homeSectionRoutes"));
app.use("/api/community", require("./src/routes/communityRoutes"));
app.use("/api/orders", require("./src/routes/orderRoutes"));
app.use("/api/payments", require("./src/routes/paymentRoutes"));
app.use("/api/coupons", require("./src/routes/couponRoutes"));
app.use("/api/reviews", require("./src/routes/reviewRoutes"));
app.use("/api/questions", require("./src/routes/questionRoutes"));
app.use("/api/messages", require("./src/routes/messageRoutes"));
app.use("/api/newsletter", require("./src/routes/newsletterRoutes"));
app.use("/api/blog", require("./src/routes/blogRoutes"));
app.use("/api/brands", require("./src/routes/brandRoutes"));
app.use("/api/bundles", require("./src/routes/bundleRoutes"));
app.use("/api/flash-campaigns", require("./src/routes/flashCampaignRoutes"));
app.use("/api/deals", require("./src/routes/dealRoutes"));
app.use("/api/ai", aiChatLimiter, require("./src/routes/aiRoutes"));
app.use("/api/service", require("./src/routes/serviceRoutes"));
app.use("/api/devices", require("./src/routes/deviceRoutes"));
app.use("/api/settings", require("./src/routes/settingRoutes"));
app.use("/api/seo", require("./src/routes/seoRoutes"));
app.use("/api/notifications", require("./src/routes/notificationRoutes"));
app.use("/api/admin", require("./src/routes/adminRoutes"));
app.use(
  "/api/admin/quick-services",
  require("./src/routes/quickServiceRoutes"),
);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
