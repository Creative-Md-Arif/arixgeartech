/* ArixGear — production readiness checklist (Task 30).
   GET /api/admin/system/status — one JSON the admin can eyeball (or the QA
   suite can assert) before going live: database, transactions, image storage,
   email, SMS, notifications, CORS, builds. No secrets — everything masked. */
const fs = require('fs');
const path = require('path');
const { detectReplicaSet, maskedUri } = require('../config/db');

const ROOT = path.join(__dirname, '..', '..', '..'); // forged-full-project/

function buildPresent(dir) {
  try {
    return fs.existsSync(path.join(ROOT, dir, 'index.html'));
  } catch (_e) {
    return false;
  }
}

function smsMode() {
  const provider = String(process.env.SMS_PROVIDER || 'sslwireless').toLowerCase();
  if (provider === 'off') return 'off';
  const dryRun = String(process.env.SMS_DRY_RUN ?? 'true') !== 'false';
  if (dryRun) return 'dry-run';
  if (!process.env.SSLWIRELESS_API_TOKEN || !process.env.SSLWIRELESS_SID) return 'dry-run'; // creds missing
  return 'live';
}

exports.status = async (_req, res, next) => {
  try {
    const replicaSet = await detectReplicaSet();
    const cloudinary = Boolean(
      process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    );
    const corsOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const isProd = process.env.NODE_ENV === 'production';

    res.json({
      env: isProd ? 'production' : 'development',
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      checks: {
        database: {
          uri: maskedUri(),
          replicaSet,
          transactions: replicaSet,
          ok: true,
        },
        images: {
          mode: cloudinary ? 'cloudinary' : 'local-uploads',
          ok: true, // local works, just not redeploy-safe
          warning: cloudinary ? null : 'local uploads are lost on redeploy — set CLOUDINARY_* for production',
        },
        email: {
          mode: process.env.RESEND_API_KEY ? 'resend' : 'dry-run',
          ok: Boolean(process.env.RESEND_API_KEY),
        },
        sms: {
          mode: smsMode(),
          ok: smsMode() === 'live',
          warning: smsMode() === 'live' ? null : 'set SMS_DRY_RUN=false + SSLWIRELESS_* for real customer SMS',
        },
        notify: {
          adminEmail: process.env.ADMIN_NOTIFY_EMAIL || null,
          ok: Boolean(process.env.ADMIN_NOTIFY_EMAIL),
        },
        cors: {
          origins: corsOrigins.length,
          ok: !isProd || corsOrigins.length > 0,
          warning: isProd && corsOrigins.length === 0 ? 'CORS_ORIGINS empty — all origins allowed in production' : null,
        },
        jwt: { ok: Boolean(process.env.JWT_SECRET) && !/change-this|dev-secret|changeme/i.test(process.env.JWT_SECRET || '') },
        builds: {
          frontend: buildPresent(path.join('frontend', 'dist')),
          admin: buildPresent(path.join('admin', 'dist')),
        },
      },
    });
  } catch (e) { next(e); }
};

/* ============ Step 7 — THUMBNAIL BACKFILL (#6) + PREFETCH QUEUE (#11) ============ */

/* POST /api/admin/system/backfill-thumbs?wait=1&limit=200
   Step 6 gave every NEW upload a grid thumbnail; products uploaded before it
   (and any image row that lost its thumb) still serve full-size sources into
   grids. One idempotent pass over Product.images:
     · Cloudinary rows  → thumbUrl() transform (pure string, patched in bulk)
     · local /uploads/… → sharp derivation enqueued on the prefetch queue
       (off the request path); ?wait=1 drains inline for QA determinism.
   Safe to re-run: rows that already carry a real thumb are skipped. */
exports.backfillThumbs = async (req, res, next) => {
  try {
    const Product = require('../models/Product');
    const { thumbUrl, UPLOAD_DIR } = require('../services/storageService');
    const thumbQueue = require('../services/thumbQueue');

    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const wait = req.query.wait === '1' || req.query.wait === 'true';

    const docs = await Product.find({ images: { $exists: true, $ne: [] } })
      .select('images')
      .limit(limit)
      .lean();
    let scanned = 0, already = 0, cloudinaryDerived = 0, queued = 0, failed = 0, skipped = 0;
    const bulkCloudinary = [];

    for (const p of docs) {
      scanned++;
      for (const img of p.images || []) {
        const url = String(img.url || '');
        if (!url) continue;
        const hasRealThumb = img.thumb && img.thumb !== url;
        if (hasRealThumb) { already++; continue; }
        if (/^https:\/\/res\.cloudinary\.com\//.test(url)) {
          const t = thumbUrl(url);
          if (t && t !== url) {
            bulkCloudinary.push({ filter: { _id: p._id, 'images.url': url }, patch: { 'images.$.thumb': t } });
            cloudinaryDerived++;
            continue;
          }
        }
        if (url.startsWith('/uploads/')) {
          const name = path.basename(url);
          const src = path.join(UPLOAD_DIR, name);
          if (!fs.existsSync(src)) { failed++; continue; }
          if (/\.(mp4|webm|mov)$/i.test(name)) { failed++; continue; } // videos get no thumb
          if (wait) {
            const { makeLocalThumbFromPath } = require('../services/storageService');
            const thumb = await makeLocalThumbFromPath(src, name);
            if (thumb) {
              await Product.updateOne({ _id: p._id, 'images.url': url }, { $set: { 'images.$.thumb': thumb } });
              queued++; // counted as handled
            } else failed++;
          } else {
            thumbQueue.enqueue({ srcPath: src, name, url, productId: p._id });
            queued++;
          }
        } else {
          skipped++; // /assets/ build art, data-URIs, third-party hosts — nothing to derive here
        }
      }
    }
    for (const b of bulkCloudinary) {
      await Product.updateOne(b.filter, { $set: b.patch });
    }
    const queueStats = thumbQueue.stats();
    res.json({
      ok: true,
      scanned,
      alreadyThumbed: already,
      cloudinaryDerived,
      queued,
      failed,
      skipped,
      mode: wait ? 'inline' : 'queue',
      queue: queueStats,
      note: wait ? 'done' : 'thumbs land as the queue drains — poll GET /api/admin/system/thumb-queue',
    });
  } catch (e) { next(e); }
};

/* GET /api/admin/system/thumb-queue — live prefetch-queue stats for the admin */
exports.thumbQueueStatus = async (_req, res, next) => {
  try {
    res.json({ ok: true, ...require('../services/thumbQueue').stats() });
  } catch (e) { next(e); }
};
