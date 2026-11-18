const mongoose = require('mongoose');
const Banner = require('../models/Banner');
const { saveImage, deleteImage } = require('../services/storageService');

/* Task 38 — magic-byte sniffing: a renamed .exe claiming mimetype video/mp4
   is rejected here. Returns 'image' | 'video' | null. */
function sniffKind(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  const ascii = (s, o) => { for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false; return true; };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image';             // jpeg
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image'; // png
  if (ascii('RIFF', 0) && ascii('WEBP', 8)) return 'image';                        // webp
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video'; // webm/ebml
  if (ascii('ftyp', 4)) return 'video';                                            // mp4/mov (ftyp box)
  return null;
}

/* image slots: keep the 5MB rule the rest of the app uses (uploader cap is 40MB for video) */
function imageTooBig(file) { return file && file.size > 5 * 1024 * 1024; }

/* process the uploaded banner media for create/update.
   Reads req.files (uploadMedia .fields()) → returns { error, mediaType, image, video, poster, olds[] }
   `prev` = the existing banner doc (for update — old refs get snapshotted for release). */
async function buildMedia(req, prev) {
  const files = req.files || {};
  const body = req.body || {};
  const imgF = (files.image || [])[0];
  const vidF = (files.video || [])[0];
  const posF = (files.poster || [])[0];
  const bodyType = String(body.mediaType || '').toLowerCase();
  if (bodyType && bodyType !== 'image' && bodyType !== 'video') {
    return { error: 'mediaType must be image or video' };
  }
  const mediaType = bodyType || (vidF ? 'video' : imgF ? 'image' : (prev ? (prev.mediaType || 'image') : 'image'));
  const mediaTypeChanged = !!prev && (prev.mediaType || 'image') !== mediaType;
  const olds = [];
  let image, video, poster;

  if (imgF) {
    if (sniffKind(imgF.buffer) !== 'image') return { error: 'That image file is not a real JPG/PNG/WEBP' };
    if (imageTooBig(imgF)) return { error: 'Images must be 5MB or smaller' };
  }
  if (vidF) {
    if (mediaType !== 'video') return { error: 'A video upload requires video media type' };
    if (sniffKind(vidF.buffer) !== 'video') return { error: 'That video file is not a real MP4/WEBM/MOV' };
  }
  if (posF) {
    if (mediaType !== 'video') return { error: 'A poster can only be used with a video banner' };
    if (sniffKind(posF.buffer) !== 'image') return { error: 'That poster file is not a real JPG/PNG/WEBP' };
    if (imageTooBig(posF)) return { error: 'The poster must be 5MB or smaller' };
  }

  if (mediaType === 'image' && !imgF && !(prev && prev.image && prev.image.url)) {
    return { error: 'Banner image is required' };
  }
  if (mediaType === 'video' && !vidF && !(prev && prev.video && prev.video.url)) {
    return { error: 'A video file is required for a video banner' };
  }
  const removePoster = !posF && (
    body.removePoster === true
    || body.removePoster === 'true'
    || (mediaType === 'image' && prev && prev.mediaType === 'video')
  );
  const uploaded = [];
  try {
    if (imgF) {
      image = await saveImage(imgF, 'forged/banners', 'image');
      uploaded.push(image);
      if (prev && prev.image && prev.image.publicId) olds.push({ kind: 'image', ref: { publicId: prev.image.publicId } });
    }
    if (vidF) {
      video = await saveImage(vidF, 'forged/banners', 'video');
      uploaded.push(video);
      if (prev && prev.video && prev.video.publicId) olds.push({ kind: 'video', ref: { publicId: prev.video.publicId } });
    }
    if (posF) {
      poster = await saveImage(posF, 'forged/banners', 'image');
      uploaded.push(poster);
      if (prev && prev.poster && prev.poster.publicId) olds.push({ kind: 'poster', ref: { publicId: prev.poster.publicId } });
    } else if (removePoster) {
      poster = { url: '', publicId: null };
      if (prev && prev.poster && prev.poster.publicId) olds.push({ kind: 'poster', ref: { publicId: prev.poster.publicId } });
    }

    /* Release the previous type's asset only on a real type switch. */
    if (mediaTypeChanged && mediaType === 'video') {
      if (prev.image && prev.image.publicId) olds.push({ kind: 'image', ref: { publicId: prev.image.publicId } });
      if (!imgF) image = { url: '', publicId: null };
    }
    if (mediaTypeChanged && mediaType === 'image') {
      if (prev.video && prev.video.publicId) olds.push({ kind: 'video', ref: { publicId: prev.video.publicId } });
      video = { url: '', publicId: null };
    }
    if (removePoster && prev && prev.poster && prev.poster.publicId) {
      olds.push({ kind: 'poster', ref: { publicId: prev.poster.publicId } });
    }
    return { mediaType, image, video, poster, olds, uploaded };
  } catch (e) {
    await Promise.all(uploaded.map((file) => file && file.publicId ? deleteImage(file.publicId) : Promise.resolve()));
    throw e;
  }
}
const cache = require('../services/cache');

/* ============ helpers ============ */

const POSITIONS = ['hero', 'promo', 'side'];

function oidOf(v) {
  return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null;
}

/* Task 30 security — reject dangerous link schemes (javascript:, data:, …).
   Allowed: internal paths (/shop, collections/x), http(s) URLs, mailto:, and
   plain relative files (shop.html). Anything else → null → 400. */
function safeLink(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 'shop.html';
  if (/^(javascript|data|vbscript|file)\s*:/i.test(s)) return null;
  if (s.startsWith('//')) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (!s.includes(':')) return s; // relative like "shop.html" or "collections/whey"
  return null;
}

function badDate(v) {
  if (v === undefined || v === null || v === '') return null; // field absent → keep null
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined → validation error
}

/* shared create/update validation — returns { fields } or { error } */
function bannerFields(b, existing = {}) {
  const title = String(b.title !== undefined ? b.title : existing.title || '').trim();
  if (!title) return { error: 'Title is required' };
  if (title.length > 80) return { error: 'Title must be 80 characters or fewer' };

  const subtitle = String(b.subtitle !== undefined ? b.subtitle : existing.subtitle || '').trim();
  if (subtitle.length > 200) return { error: 'Subtitle must be 200 characters or fewer' };

  /* Task 58 — Bengali twins (optional; trimmed, same caps) */
  const titleBn = String(b.titleBn !== undefined ? b.titleBn : existing.titleBn || '').trim();
  if (titleBn.length > 80) return { error: 'Bengali title must be 80 characters or fewer' };
  const subtitleBn = String(b.subtitleBn !== undefined ? b.subtitleBn : existing.subtitleBn || '').trim();
  if (subtitleBn.length > 200) return { error: 'Bengali subtitle must be 200 characters or fewer' };
  const ctaTextBn = String(b.ctaTextBn !== undefined ? b.ctaTextBn : existing.ctaTextBn || '').trim();
  if (ctaTextBn.length > 24) return { error: 'Bengali CTA text must be 24 characters or fewer' };

  const ctaText = String(b.ctaText !== undefined ? b.ctaText : existing.ctaText || 'SHOP NOW').trim() || 'SHOP NOW';
  if (ctaText.length > 24) return { error: 'CTA text must be 24 characters or fewer' };

  const link = safeLink(b.link !== undefined ? b.link : existing.link);
  if (!link) return { error: 'Link must be an internal path (e.g. /shop) or an http(s) URL' };

  const position = String(b.position !== undefined ? b.position : existing.position || 'hero');
  if (!POSITIONS.includes(position)) return { error: 'position must be hero | promo | side' };

  const rawOrder = b.order !== undefined ? b.order : existing.order;
  const order = rawOrder === undefined || rawOrder === '' ? 0 : Number(rawOrder);
  if (!Number.isInteger(order) || order < 0 || order > 999) return { error: 'Order must be a whole number between 0 and 999' };

  const startsAt = badDate(b.startsAt !== undefined ? b.startsAt : (existing.startsAt || null));
  if (startsAt === undefined) return { error: 'startsAt must be a valid date' };
  const endsAt = badDate(b.endsAt !== undefined ? b.endsAt : (existing.endsAt || null));
  if (endsAt === undefined) return { error: 'endsAt must be a valid date' };
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    return { error: 'endsAt must be after startsAt' };
  }

  return {
    fields: {
      title, subtitle, ctaText, link, position, order,
      titleBn, subtitleBn, ctaTextBn, // Task 58
      startsAt: startsAt || null, endsAt: endsAt || null,
    },
  };
}

/* live-window condition for the PUBLIC list (schedule support) */
function liveWindow() {
  const now = new Date();
  return {
    $or: [
      { startsAt: null },
      { startsAt: { $lte: now } },
    ],
    $and: [
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
}

function bumpCache() {
  cache.bump(); // shared namespace with the product catalog — 15s TTL self-heals anyway
}

async function releaseUnusedMedia(refs) {
  const fields = { image: 'image.publicId', video: 'video.publicId', poster: 'poster.publicId' };
  const seen = new Set();
  for (const item of refs) {
    const publicId = item && item.ref && item.ref.publicId;
    const field = item && fields[item.kind];
    const key = publicId && field ? field + ':' + publicId : '';
    if (!publicId || !field || seen.has(key)) continue;
    seen.add(key);
    const remaining = await Banner.countDocuments({ [field]: publicId });
    if (remaining === 0) await deleteImage(publicId);
  }
}

async function discardUploadedMedia(media) {
  const files = media && Array.isArray(media.uploaded) ? media.uploaded : [];
  await Promise.all(files.map((file) => file && file.publicId ? deleteImage(file.publicId) : Promise.resolve()));
}

/* ============ PUBLIC ============ */

// GET /api/banners?position=hero (public — active + inside schedule window).
// Task 30: short-TTL cache — banners are read on EVERY page load; admin writes
// bump the cache so edits still appear instantly.
exports.publicList = async (req, res, next) => {
  try {
    const pos = String((req.query || {}).position || '');
    const key = 'banners:' + (pos || 'all');
    const hit = cache.get(key);
    if (hit) return res.json(hit);

    const q = { active: true, ...liveWindow() };
    if (pos) q.position = pos;
    const banners = await Banner.find(q).sort({ order: 1 }).lean();
    /* inactive keys (same scope) so the storefront knows what to hide */
    const qi = { active: false };
    if (pos) qi.position = pos;
    const hidden = await Banner.find(qi).select('_id').lean();

    const payload = {
      items: banners.map((b) => ({
        id: b._id,
        title: b.title,
        titleBn: b.titleBn || '', // Task 58
        subtitle: b.subtitle,
        subtitleBn: b.subtitleBn || '',
        ctaText: b.ctaText,
        ctaTextBn: b.ctaTextBn || '',
        link: b.link,
        position: b.position,
        order: b.order,
        image: b.image,
        mediaType: b.mediaType || 'image',
        video: b.mediaType === 'video' ? (b.video || null) : null,
        poster: b.poster || null,
      })),
      hidden: hidden.map((b) => String(b._id)),
    };
    cache.set(key, payload);
    res.json(payload);
  } catch (e) { next(e); }
};

// POST /api/banners/:id/click — CTA click ping from the storefront (fire-and-forget)
exports.click = async (req, res, next) => {
  try {
    const oid = oidOf(req.params.id);
    if (!oid) return res.status(400).json({ ok: false });
    const result = await Banner.updateOne({ _id: oid, active: true }, { $inc: { clicks: 1 } });
    if (!(result.matchedCount || result.n)) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

/* ============ ADMIN ============ */

// GET /api/admin/banners — all banners + summary counts
exports.adminList = async (_req, res, next) => {
  try {
    const [items, agg] = await Promise.all([
      Banner.find().sort({ position: 1, order: 1 }),
      Banner.aggregate([{ $group: { _id: null, clicks: { $sum: '$clicks' }, active: { $sum: { $cond: ['$active', 1, 0] } } } }]),
    ]);
    const byPosition = {};
    POSITIONS.forEach((p) => { byPosition[p] = 0; });
    items.forEach((b) => { byPosition[b.position] = (byPosition[b.position] || 0) + 1; });
    res.json({
      items,
      counts: {
        all: items.length,
        active: agg[0] ? agg[0].active : 0,
        clicks: agg[0] ? agg[0].clicks : 0,
        byPosition,
      },
    });
  } catch (e) { next(e); }
};

// POST /api/admin/banners (multipart: image + fields)
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const v = bannerFields(body);
    if (v.error) return res.status(400).json({ message: v.error });
    const m = await buildMedia(req, null);
    if (m.error) return res.status(400).json({ message: m.error });
    let banner;
    try {
      banner = await Banner.create({
        ...v.fields,
        mediaType: m.mediaType,
        active: (body.active === undefined ? true : body.active === 'true' || body.active === true),
        image: m.image || { url: '', publicId: null },
        video: m.video || { url: '', publicId: null },
        poster: m.poster || { url: '', publicId: null },
      });
    } catch (e) {
      await discardUploadedMedia(m);
      throw e;
    }
    bumpCache();
    res.status(201).json({ banner });
  } catch (e) { next(e); }
};

// PUT /api/admin/banners/:id (multipart optional new image)
exports.update = async (req, res, next) => {
  try {
    const oid = oidOf(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid banner id' });
    const body = req.body || {};
    const banner = await Banner.findById(oid);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    const v = bannerFields(body, banner.toObject());
    if (v.error) return res.status(400).json({ message: v.error });

    /* Task 38 — media replacement for image / video / poster.
       CRITICAL: snapshot the old refs as PLAIN values BEFORE assigning —
       `oldImage = banner.image` kept a live subdocument reference and mongoose
       mutated it on reassignment, so deleteImage() deleted the NEWLY uploaded
       file (Task 30-era bug, caught by the video QA). */
    const m = await buildMedia(req, banner);
    if (m.error) return res.status(400).json({ message: m.error });
    const olds = m.olds || [];
    if (m.image) banner.image = m.image;
    if (m.video) banner.video = m.video;
    if (m.poster) banner.poster = m.poster;
    Object.assign(banner, v.fields);
    if (m.mediaType) banner.mediaType = m.mediaType;
    if (body.active !== undefined) banner.active = body.active === 'true' || body.active === true;
    try {
      await banner.save();
    } catch (e) {
      await discardUploadedMedia(m);
      throw e;
    }
    bumpCache();
    await releaseUnusedMedia(olds);
    res.json({ banner });
  } catch (e) {
    next(e);
  }
};

// PATCH /api/admin/banners/reorder {items:[{id, order}]} — bulk sort-order save
exports.reorder = async (req, res, next) => {
  try {
    const items = (req.body || {}).items;
    if (!Array.isArray(items) || !items.length || items.length > 60) {
      return res.status(400).json({ message: 'items must be an array of 1-60 {id, order}' });
    }
    for (const it of items) {
      if (!it || typeof it !== 'object' || !oidOf(it.id) || !Number.isInteger(Number(it.order)) || Number(it.order) < 0 || Number(it.order) > 999) {
        return res.status(400).json({ message: 'each item needs a valid id and order (0-999)' });
      }
    }
    /* eslint-disable no-await-in-loop */
    for (const it of items) {
      await Banner.findByIdAndUpdate(it.id, { order: Number(it.order) });
    }
    bumpCache();
    const itemsOut = await Banner.find().sort({ position: 1, order: 1 });
    res.json({ items: itemsOut });
  } catch (e) { next(e); }
};

// POST /api/admin/banners/:id/duplicate — clone fields, share the image, start hidden
exports.duplicate = async (req, res, next) => {
  try {
    const oid = oidOf(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid banner id' });
    const src = await Banner.findById(oid);
    if (!src) return res.status(404).json({ message: 'Banner not found' });
    const maxOrder = await Banner.findOne({ position: src.position }).sort({ order: -1 }).select('order');
    const dup = await Banner.create({
      title: (src.title + ' (copy)').slice(0, 80),
      subtitle: src.subtitle,
      ctaText: src.ctaText,
      titleBn: src.titleBn,
      subtitleBn: src.subtitleBn,
      ctaTextBn: src.ctaTextBn,
      link: src.link,
      position: src.position,
      order: Math.min(999, ((maxOrder && maxOrder.order) || 0) + 1),
      active: false, // safety — go live via the toggle after editing
      startsAt: null,
      endsAt: null,
      image: src.image, // shared reference — deleteImage is reference-counted in remove()
      mediaType: src.mediaType || 'image',
      video: src.video, // shared reference (video banners)
      poster: src.poster,
      clicks: 0,
    });
    bumpCache();
    res.status(201).json({ banner: dup });
  } catch (e) { next(e); }
};

// GET /api/admin/banners/analytics — click leaderboard (Task 30)
exports.analytics = async (_req, res, next) => {
  try {
    const [top, byPositionAgg] = await Promise.all([
      Banner.find({}, 'title position clicks active').sort({ clicks: -1 }).limit(5).lean(),
      Banner.aggregate([
        { $group: { _id: '$position', clicks: { $sum: '$clicks' }, banners: { $sum: 1 } } },
      ]),
    ]);
    const totalsAgg = await Banner.aggregate([
      { $group: { _id: null, clicks: { $sum: '$clicks' }, active: { $sum: { $cond: ['$active', 1, 0] } }, all: { $sum: 1 } } },
    ]);
    const zeroClick = await Banner.countDocuments({ active: true, clicks: 0 });
    const byPosition = {};
    byPositionAgg.forEach((r) => { byPosition[r._id] = { clicks: r.clicks, banners: r.banners }; });
    res.json({
      totals: {
        clicks: totalsAgg[0] ? totalsAgg[0].clicks : 0,
        active: totalsAgg[0] ? totalsAgg[0].active : 0,
        all: totalsAgg[0] ? totalsAgg[0].all : 0,
        zeroClickActive: zeroClick,
      },
      byPosition,
      top: top.map((b) => ({ id: b._id, title: b.title, position: b.position, clicks: b.clicks, active: b.active })),
    });
  } catch (e) { next(e); }
};

// DELETE /api/admin/banners/:id — delete the doc first, release the image only if
// no OTHER banner shares the same publicId (duplicate() shares references).
exports.remove = async (req, res, next) => {
  try {
    const oid = oidOf(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid banner id' });
    const banner = await Banner.findById(oid);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    const refs = [
      { kind: 'image', ref: banner.image },
      { kind: 'video', ref: banner.video },
      { kind: 'poster', ref: banner.poster },
    ];
    await banner.deleteOne();
    bumpCache();
    await releaseUnusedMedia(refs);
    res.json({ message: 'Banner deleted' });
  } catch (e) { next(e); }
};
