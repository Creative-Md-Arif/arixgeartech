const Post = require('../models/Post');

/* ══════════════════════════════════════════════════════════════════
   Blog — public Journal reads + admin CRUD (Task 47 Content Hub)
   Admin body is plain text; the storefront splits paragraphs on blank
   lines (escape-safe). Slug is auto-derived + uniquified server-side.
   ══════════════════════════════════════════════════════════════════ */

const cleanTags = (t) =>
  Array.isArray(t)
    ? [...new Set(t.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 8))]
    : [];
const parseBoolean = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
};

/* ── PUBLIC ─────────────────────────────────────────────────────── */

/** GET /api/blog — published posts, newest first (?limit ?page ?tag) */
exports.list = async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q = { published: true };
    if (req.query.tag) q.tags = String(req.query.tag).toLowerCase();
    const [items, total] = await Promise.all([
      Post.find(q).sort({ publishedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
        .select('title titleBn slug excerpt excerptBn cover tags author publishedAt views readingMin'),
      Post.countDocuments(q),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (e) { next(e); }
};

/** GET /api/blog/:slug — one published post (+ fire-and-forget view bump) */
exports.get = async (req, res, next) => {
  try {
    const post = await Post.findOne({ slug: String(req.params.slug).toLowerCase(), published: true }).lean();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    Post.updateOne({ _id: post._id }, { $inc: { views: 1 } }).catch(() => {});
    /* related: same tag overlap, newest, never the post itself */
    const related = await Post.find({ published: true, _id: { $ne: post._id }, tags: { $in: post.tags && post.tags.length ? post.tags : [''] } })
      .sort({ publishedAt: -1 }).limit(3)
      .select('title titleBn slug excerpt excerptBn cover tags publishedAt');
    res.json({ post, related });
  } catch (e) { next(e); }
};

/* ── ADMIN ──────────────────────────────────────────────────────── */

/** GET /api/admin/blog — everything incl. drafts */
exports.adminList = async (_req, res, next) => {
  try {
    const items = await Post.find().sort({ createdAt: -1 }).limit(200);
    res.json({ items });
  } catch (e) { next(e); }
};

/** POST /api/admin/blog — create (optionally publish) */
exports.adminCreate = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (!b.body || !String(b.body).trim()) return res.status(400).json({ error: 'Body is required' });
    const base = Post.slugify(b.slug || b.title);
    let slug = base, n = 2;
    while (await Post.exists({ slug })) slug = `${base}-${n++}`;
    const published = parseBoolean(b.published ?? false);
    if (published === null) return res.status(400).json({ error: 'Published must be a boolean' });
    const post = await Post.create({
      title: String(b.title).trim(),
      titleBn: String(b.titleBn || '').trim().slice(0, 140), // Task 58 — Bengali headline
      slug,
      excerpt: String(b.excerpt || '').trim().slice(0, 320),
      excerptBn: String(b.excerptBn || '').trim().slice(0, 320),
      body: String(b.body).trim(),
      bodyBn: String(b.bodyBn || '').trim(),
      cover: String(b.cover || ''),
      tags: cleanTags(b.tags),
      author: String(b.author || 'ArixGear Editorial').trim().slice(0, 80),
      published,
      publishedAt: published ? (b.publishedAt ? new Date(b.publishedAt) : new Date()) : null,
      seoTitle: String(b.seoTitle || '').trim().slice(0, 140),
      seoDescription: String(b.seoDescription || '').trim().slice(0, 320),
    });
    res.status(201).json({ post });
  } catch (e) { next(e); }
};

/** PUT /api/admin/blog/:id — update (slug changes re-uniquified; publish stamps time once) */
exports.adminUpdate = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const b = req.body || {};
    if (b.title != null) {
      if (!String(b.title).trim()) return res.status(400).json({ error: 'Title cannot be empty' });
      post.title = String(b.title).trim();
    }
    if (b.titleBn != null) post.titleBn = String(b.titleBn).trim().slice(0, 140); // Task 58
    if (b.excerptBn != null) post.excerptBn = String(b.excerptBn).trim().slice(0, 320);
    if (b.bodyBn != null) post.bodyBn = String(b.bodyBn).trim();
    if (b.body != null) {
      if (!String(b.body).trim()) return res.status(400).json({ error: 'Body cannot be empty' });
      post.body = String(b.body).trim();
    }
    if (b.slug != null && String(b.slug).trim() && String(b.slug).trim() !== post.slug) {
      const base = Post.slugify(b.slug);
      let slug = base, n = 2;
      while (await Post.exists({ slug, _id: { $ne: post._id } })) slug = `${base}-${n++}`;
      post.slug = slug;
    } else if (b.title != null && !b.slug && b.reSlug) {
      const base = Post.slugify(post.title);
      let slug = base, n = 2;
      while (await Post.exists({ slug, _id: { $ne: post._id } })) slug = `${base}-${n++}`;
      post.slug = slug;
    }
    if (b.excerpt != null) post.excerpt = String(b.excerpt).trim().slice(0, 320);
    if (b.cover != null) post.cover = String(b.cover);
    if (b.tags != null) post.tags = cleanTags(b.tags);
    if (b.author != null) post.author = String(b.author).trim().slice(0, 80) || 'ArixGear Editorial';
    if (b.seoTitle != null) post.seoTitle = String(b.seoTitle).trim().slice(0, 140);
    if (b.seoDescription != null) post.seoDescription = String(b.seoDescription).trim().slice(0, 320);
    if (b.published != null) {
      const nextPublished = parseBoolean(b.published);
      if (nextPublished === null) return res.status(400).json({ error: 'Published must be a boolean' });
      const was = post.published;
      post.published = nextPublished;
      if (post.published && !was) post.publishedAt = post.publishedAt || new Date();
      if (!post.published) post.publishedAt = post.publishedAt; /* keep stamp for re-publish ordering */
    }
    await post.save();
    res.json({ post });
  } catch (e) { next(e); }
};

/** DELETE /api/admin/blog/:id */
exports.adminRemove = async (req, res, next) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ ok: true, deleted: post._id });
  } catch (e) { next(e); }
};
