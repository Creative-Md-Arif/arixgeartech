const mongoose = require('mongoose');
const crypto = require('crypto');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const cache = require('../services/cache');
const { saveImage, deleteImage } = require('../services/storageService');

/* ================================================================
   Review API — Task 29 (Layer 1+2+3)
   L1  verified-purchase badge · anti-spam + dup guard · rating
       distribution summary · admin list v2 (pagination/search)
   L2  one-review-per-account · owner edit/delete · admin reply ·
       helpful votes
   L3  photo reviews · bulk moderation · review analytics ·
       admin content edit
   ================================================================ */

/* Recompute products' public rating + review count from APPROVED reviews.
   Batch-aware so bulk moderation recalculates each affected product once. */
async function recalcProducts(productIds) {
  const ids = [...new Set((productIds || []).map((id) => String(id)))].filter(Boolean);
  for (const id of ids) {
    const agg = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(id), approved: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]);
    const rating = agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0;
    const reviews = agg[0] ? agg[0].n : 0;
    await Product.updateOne({ _id: id }, { rating, reviews });
  }
  if (ids.length) cache.bump(); // ratings render on catalog cards → drop cached list/filters
}

async function recalcProduct(productId) {
  return recalcProducts([productId]);
}

/* strip internal fields (voters) from a public/admin list item */
function view(r, mine) {
  return {
    _id: r._id,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    verified: !!r.verified,
    orderNumber: r.verified ? r.orderNumber : undefined,
    reply: r.reply && r.reply.text ? { text: r.reply.text, by: r.reply.by, at: r.reply.at } : null,
    helpfulCount: r.helpfulCount || 0,
    images: (r.images || []).filter((i) => i && i.url),
    createdAt: r.createdAt,
    ...(mine !== undefined ? { mine: !!mine } : {}),
  };
}

/* shared validation for create / owner-edit / admin-edit */
function validateReviewBody({ name, rating, comment }, { requireName = true } = {}) {
  const errors = [];
  if (requireName && (!name || String(name).trim().length < 2)) errors.push('Name must be at least 2 characters');
  if (rating !== undefined) {
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) errors.push('Rating must be 1–5');
  }
  if (comment !== undefined && String(comment).trim().length < 4) errors.push('Review must be at least 4 characters');
  return errors;
}

/* simple spam heuristic — reviews are text, not ad boards */
function looksLikeSpam(text) {
  const links = String(text || '').match(/(https?:\/\/|www\.)\S+/gi);
  return (links || []).length >= 3;
}

/* dedupe keys — accounts get 'u:<id>', guests a salted IP hash */
function voterKey(req) {
  if (req.user) return 'u:' + String(req.user._id || req.user.id);
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '0').toString().split(',')[0].trim();
  return 'i:' + crypto.createHash('sha256').update('forged-v1|' + ip).digest('hex').slice(0, 24);
}

/* ================= PUBLIC ================= */

// GET /api/products/:slug/reviews?sort=new|helpful
// → { items, summary:{avg,total,dist} } — approved only; `mine` flagged for JWT
exports.listByProduct = async (req, res, next) => {
  try {
    const p = await Product.findOne({ slug: String(req.params.slug || '').toLowerCase(), active: true }).select('_id');
    const empty = { items: [], summary: { avg: 0, total: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } };
    if (!p) return res.json(empty);

    const sort = req.query.sort === 'helpful' ? { helpfulCount: -1, createdAt: -1 } : { createdAt: -1 };
    const [docs, hist] = await Promise.all([
      Review.find({ product: p._id, approved: true }).sort(sort).limit(50),
      Review.aggregate([
        { $match: { product: p._id, approved: true } },
        { $group: { _id: '$rating', n: { $sum: 1 } } },
      ]),
    ]);

    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let weighted = 0;
    for (const row of hist) {
      const star = Math.min(5, Math.max(1, Number(row._id) || 0));
      dist[star] = row.n;
      total += row.n;
      weighted += star * row.n;
    }
    const summary = { avg: total ? Math.round((weighted / total) * 10) / 10 : 0, total, dist };

    const uid = req.user ? String(req.user._id || req.user.id) : null;
    res.json({ items: docs.map((r) => view(r, uid ? r.user && String(r.user) === uid : undefined)), summary });
  } catch (e) { next(e); }
};

// POST /api/products/:slug/reviews  (multipart: name, rating, comment + images[] ≤3)
// Guest OK (moderation queue). Logged-in buyers get the VERIFIED badge when a
// DELIVERED order contains this product. Landed unapproved either way.
exports.create = async (req, res, next) => {
  let uploaded = [];
  try {
    const p = await Product.findOne({ slug: String(req.params.slug || '').toLowerCase(), active: true }).select('_id name');
    if (!p) return res.status(404).json({ message: 'Product not found' });

    const body = req.body || {};
    /* accounts sign automatically — an absent name falls back to the profile
       name BEFORE validation so members can post nameless reviews */
    if (req.user && (!body.name || !String(body.name).trim())) body.name = req.user.name;
    const errors = validateReviewBody(body);
    if (errors.length) return res.status(400).json({ message: errors[0] });
    const comment = String(body.comment).trim().slice(0, 1500);
    if (looksLikeSpam(comment)) return res.status(400).json({ message: 'Links are not allowed in reviews' });

    const name = (body.name && String(body.name).trim() ? String(body.name).trim() : (req.user ? req.user.name : ''))
      .slice(0, 80);
    if (!name) return res.status(400).json({ message: 'Name is required' });

    /* duplicate-submit guard — same product+name+comment inside 10 minutes */
    const dup = await Review.findOne({
      product: p._id, name, comment,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    }).select('_id');
    if (dup) return res.status(409).json({ message: 'This review was just submitted — it is already in our queue' });

    /* one review per ACCOUNT per product (guests exempt) */
    if (req.user) {
      const mine = await Review.findOne({ user: req.user._id, product: p._id }).select('_id');
      if (mine) return res.status(409).json({ message: 'You already reviewed this product — edit your existing review instead' });
    }

    /* verified purchase — a DELIVERED order of this product owned by the caller */
    let verified = false;
    let orderNumber = '';
    if (req.user) {
      const o = await Order.findOne({ user: req.user._id, status: 'delivered', 'items.product': p._id })
        .sort({ createdAt: -1 }).select('orderNumber');
      if (o) { verified = true; orderNumber = o.orderNumber; }
    }

    /* customer photos (≤3) — validated by multer, stored via storageService */
    const files = (req.files || []).slice(0, 3);
    for (const f of files) {
      const saved = await saveImage(f, 'forged/review-photos');
      uploaded.push(saved);
    }

    const doc = await Review.create({
      product: p._id,
      ...(req.user ? { user: req.user._id } : {}), // absent for guests — keeps sparse index happy
      name,
      rating: Number(body.rating),
      comment,
      verified,
      ...(verified ? { orderNumber } : {}),
      ...(uploaded.length ? { images: uploaded } : {}),
    });
    res.status(201).json({
      ok: true, id: doc._id, verified,
      message: 'Review received — it goes live once our team verifies it.' + (verified ? ' (Verified buyer badge will be shown)' : ''),
    });
  } catch (e) {
    for (const img of uploaded) deleteImage(img.publicId).catch(() => {}); // orphan cleanup
    if (e.code === 11000) return res.status(409).json({ message: 'You already reviewed this product — edit your existing review instead' });
    next(e);
  }
};

// PATCH /api/products/:slug/reviews/:revId — owner (or admin) edit → back to pending
exports.updateMine = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.revId);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    const isOwner = r.user && String(r.user) === String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not your review' });

    const errors = validateReviewBody(req.body || {}, { requireName: false });
    if (errors.length) return res.status(400).json({ message: errors[0] });
    const b = req.body;
    if (b.name !== undefined && String(b.name).trim()) r.name = String(b.name).trim().slice(0, 80);
    if (b.rating !== undefined) r.rating = Number(b.rating);
    if (b.comment !== undefined) {
      const comment = String(b.comment).trim().slice(0, 1500);
      if (looksLikeSpam(comment)) return res.status(400).json({ message: 'Links are not allowed in reviews' });
      r.comment = comment;
    }
    /* owners re-enter the moderation queue; admins are trusted and edit in
       place (they have PATCH /api/admin/reviews/:id for moderation-aware edits) */
    if (!isAdmin) r.approved = false;
    await r.save();
    await recalcProduct(r.product); // an owner edit just moved the public set
    res.json({ item: view(r), message: isAdmin ? 'Review updated' : 'Review updated — pending re-approval' });
  } catch (e) { next(e); }
};

// DELETE /api/products/:slug/reviews/:revId — owner (or admin) delete
exports.removeMine = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.revId);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    const isOwner = r.user && String(r.user) === String(req.user._id || req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Not your review' });
    for (const img of r.images || []) deleteImage(img.publicId).catch(() => {});
    await r.deleteOne();
    await recalcProduct(r.product);
    res.json({ ok: true, message: 'Review deleted' });
  } catch (e) { next(e); }
};

/* GET /api/reviews/mine — JWT: every review the account has written, newest
   first, with the linked product card (slug/name/image). All approval states
   are returned — pending reviews render a "awaiting moderation" chip so the
   customer knows the text is in the queue, not lost. */
exports.listMine = async (req, res, next) => {
  try {
    const rows = await Review.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('product', 'slug name images')
      .lean();
    res.json({
      items: rows.map((r) => ({
        id: r._id,
        rating: r.rating,
        comment: r.comment,
        approved: !!r.approved,
        verified: !!r.verified,
        helpfulCount: r.helpfulCount || 0,
        reply: r.reply && r.reply.text ? { text: r.reply.text, by: r.reply.by, at: r.reply.at } : null,
        images: (r.images || []).map((i) => i && i.url).filter(Boolean),
        createdAt: r.createdAt,
        product: r.product
          ? {
              slug: r.product.slug,
              name: r.product.name,
              image: (r.product.images && r.product.images[0] && r.product.images[0].url) || '',
            }
          : null,
      })),
    });
  } catch (e) { next(e); }
};

/* helpful votes — approved reviews only, one vote per visitor (toggle out with -1) */
exports.voteHelpful = async (req, res, next) => {
  try {
    const r = await Review.findOne({ _id: req.params.id, approved: true });
    if (!r) return res.status(404).json({ message: 'Review not found' });
    const key = voterKey(req);
    const vote = Number((req.body || {}).vote);
    if (vote !== 1 && vote !== -1) return res.status(400).json({ message: 'vote must be 1 or -1' });

    const has = r.voters.includes(key);
    if (vote === 1 && !has) {
      if (r.voters.length >= 1000) return res.status(400).json({ message: 'Vote limit reached for this review' });
      r.voters.push(key);
      r.helpfulCount = (r.helpfulCount || 0) + 1;
    } else if (vote === -1 && has) {
      r.voters.pull(key);
      r.helpfulCount = Math.max(0, (r.helpfulCount || 0) - 1);
    }
    await r.save();
    res.json({ helpfulCount: r.helpfulCount, voted: r.voters.includes(key) });
  } catch (e) { next(e); }
};

/* ================= ADMIN ================= */

// GET /api/admin/reviews?filter=pending|approved|all&product=<slug>&rating=1..5&q=..&page=1&limit=50
exports.adminList = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.filter === 'pending') q.approved = false;
    if (req.query.filter === 'approved') q.approved = true;
    if (req.query.product) {
      const p = await Product.findOne({ slug: String(req.query.product).toLowerCase() }).select('_id');
      q.product = p ? p._id : null;
    }
    const rating = Number(req.query.rating);
    if (rating >= 1 && rating <= 5) q.rating = rating;
    if (req.query.q) {
      const esc = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (esc) q.$or = [{ name: new RegExp(esc, 'i') }, { comment: new RegExp(esc, 'i') }];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const [items, total, pending, approved] = await Promise.all([
      Review.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('product', 'name slug'),
      Review.countDocuments(q),
      Review.countDocuments({ approved: false }),
      Review.countDocuments({ approved: true }),
    ]);
    res.json({
      items, pending,
      counts: { pending, approved, all: pending + approved },
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) { next(e); }
};

// PATCH /api/admin/reviews/:id/approve
exports.approve = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    r.approved = true;
    await r.save();
    await recalcProduct(r.product);
    res.json({ item: view(r) });
  } catch (e) { next(e); }
};

// PATCH /api/admin/reviews/:id/unapprove  (back to pending)
exports.unapprove = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    r.approved = false;
    await r.save();
    await recalcProduct(r.product);
    res.json({ item: view(r) });
  } catch (e) { next(e); }
};

// PATCH /api/admin/reviews/:id/homepage — include/exclude from community sections
exports.toggleHomepage = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    r.homepageFeatured = req.body?.featured !== undefined ? Boolean(req.body.featured) : !r.homepageFeatured;
    await r.save();
    res.json({ item: { _id: r._id, homepageFeatured: r.homepageFeatured } });
  } catch (e) { next(e); }
};

// PATCH /api/admin/reviews/:id — content edit (typos / profanity) without touching approval state
exports.adminEdit = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    const errors = validateReviewBody(req.body || {}, { requireName: false });
    if (errors.length) return res.status(400).json({ message: errors[0] });
    const b = req.body || {};
    if (b.name !== undefined && String(b.name).trim()) r.name = String(b.name).trim().slice(0, 80);
    if (b.rating !== undefined) r.rating = Number(b.rating);
    if (b.comment !== undefined) {
      const comment = String(b.comment).trim().slice(0, 1500);
      if (looksLikeSpam(comment)) return res.status(400).json({ message: 'Links are not allowed in reviews' });
      r.comment = comment;
    }
    await r.save();
    await recalcProduct(r.product); // a rating edit moves the public average
    res.json({ item: view(r) });
  } catch (e) { next(e); }
};

// PATCH /api/admin/reviews/:id/reply  {text} — empty text clears the reply
exports.reply = async (req, res, next) => {
  try {
    const r = await Review.findById(req.params.id);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    const text = String((req.body || {}).text || '').trim().slice(0, 600);
    if (text) {
      r.reply = { text, by: req.user.name || 'ArixGear team', at: new Date() };
    } else {
      r.reply = { text: '', by: '', at: null };
    }
    await r.save();
    res.json({ item: view(r) }); // replies don't move ratings → no recalc
  } catch (e) { next(e); }
};

// PATCH /api/admin/reviews/bulk  {ids:[..≤100], action: approve|unapprove|delete}
exports.adminBulk = async (req, res, next) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids[] is required' });
    if (ids.length > 100) return res.status(400).json({ message: 'Max 100 reviews per batch' });
    if (!['approve', 'unapprove', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'action must be approve | unapprove | delete' });
    }
    const valid = ids.filter((i) => mongoose.Types.ObjectId.isValid(i));
    const docs = await Review.find({ _id: { $in: valid } }).select('_id product images');
    if (!docs.length) return res.status(404).json({ message: 'No matching reviews' });
    const productIds = docs.map((d) => d.product);

    if (action === 'delete') {
      for (const d of docs) for (const img of d.images || []) deleteImage(img.publicId).catch(() => {});
      await Review.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
      await recalcProducts(productIds);
      return res.json({ ok: true, deleted: docs.length, productsRecalculated: new Set(productIds.map(String)).size });
    }
    await Review.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { approved: action === 'approve' });
    await recalcProducts(productIds);
    res.json({ ok: true, modified: docs.length, productsRecalculated: new Set(productIds.map(String)).size });
  } catch (e) { next(e); }
};

// GET /api/admin/reviews/stats — moderation queue health + catalog insight
exports.adminStats = async (_req, res, next) => {
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [status, hist, trend, top, watch, age] = await Promise.all([
      Review.aggregate([{ $group: { _id: '$approved', n: { $sum: 1 } } }]),
      Review.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$rating', n: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
      Review.aggregate([
        { $match: { createdAt: { $gte: since30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Review.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$product', n: { $sum: 1 }, avg: { $avg: '$rating' } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
        { $project: { n: 1, avg: { $round: ['$avg', 1] }, name: { $first: '$p.name' }, slug: { $first: '$p.slug' } } },
      ]),
      Review.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$product', n: { $sum: 1 }, avg: { $avg: '$rating' } } },
        { $match: { n: { $gte: 3 }, avg: { $lt: 3.5 } } },
        { $sort: { avg: 1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
        { $project: { n: 1, avg: { $round: ['$avg', 1] }, name: { $first: '$p.name' }, slug: { $first: '$p.slug' } } },
      ]),
      Review.aggregate([
        { $match: { approved: true, updatedAt: { $gte: since30 } } },
        { $project: { took: { $subtract: ['$updatedAt', '$createdAt'] } } },
        { $group: { _id: null, ms: { $avg: '$took' } } },
      ]),
    ]);

    const all = status.reduce((s, r) => s + r.n, 0);
    const approvedN = status.find((r) => r._id === true)?.n || 0;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of hist) dist[Math.min(5, Math.max(1, Number(row._id) || 0))] = row.n;

    res.json({
      totals: {
        all, approved: approvedN, pending: all - approvedN,
        approvalRate: all ? Math.round((approvedN / all) * 100) : 0,
      },
      histogram: dist,
      avgApprovalHours: age[0]?.ms ? Math.round((age[0].ms / 3600000) * 10) / 10 : null,
      trend, // [{_id:'YYYY-MM-DD', n}]
      topProducts: top,
      watchlist: watch, // approved ≥3 reviews and avg < 3.5 → product-quality radar
    });
  } catch (e) { next(e); }
};

// DELETE /api/admin/reviews/:id
exports.remove = async (req, res, next) => {
  try {
    const r = await Review.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ message: 'Review not found' });
    for (const img of r.images || []) deleteImage(img.publicId).catch(() => {});
    await recalcProduct(r.product);
    res.json({ ok: true });
  } catch (e) { next(e); }
};
