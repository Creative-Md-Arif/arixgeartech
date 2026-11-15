const Badge = require('../models/Badge');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* ============ PUBLIC ============ */

// GET /api/badges — active badges for the storefront (label + color resolution)
exports.publicList = async (_req, res, next) => {
  try {
    const items = await Badge.find({ active: true }).sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (e) { next(e); }
};

/* ============ ADMIN (mounted under /api/admin) ============ */

// POST /api/admin/badges
exports.create = async (req, res, next) => {
  try {
    const label = String((req.body || {}).label || '').trim();
    if (!label) return res.status(400).json({ message: 'Badge label is required' });
    const key = slugify(req.body.key || label);
    if (!key) return res.status(400).json({ message: 'Badge key is required' });
    const dupe = await Badge.findOne({ key });
    if (dupe) return res.status(409).json({ message: `Badge "${dupe.key}" already exists` });
    const doc = await Badge.create({
      key,
      label: label.slice(0, 24),
      labelBn: String(req.body.labelBn || '').trim().slice(0, 24), // Task 58
      color: String(req.body.color || '#2F81F7').trim(),
      order: Number(req.body.order) || 0,
      active: req.body.active !== 'false' && req.body.active !== false,
    });
    res.status(201).json({ badge: doc });
  } catch (e) { next(e); }
};

// PUT /api/admin/badges/:id
exports.update = async (req, res, next) => {
  try {
    const b = await Badge.findById(req.params.id);
    if (!b) return res.status(404).json({ message: 'Badge not found' });
    const body = req.body || {};
    const oldKey = b.key;
    if (body.key !== undefined) {
      const nextKey = slugify(body.key);
      if (!nextKey) return res.status(400).json({ message: 'Badge key is required' });
      const duplicate = await Badge.findOne({ key: nextKey, _id: { $ne: b._id } });
      if (duplicate) return res.status(409).json({ message: `Badge "${duplicate.key}" already exists` });
      b.key = nextKey;
    }
    if (body.label !== undefined) b.label = String(body.label).trim().slice(0, 24) || b.label;
    if (body.labelBn !== undefined) b.labelBn = String(body.labelBn || '').trim().slice(0, 24); // Task 58
    if (body.color !== undefined) b.color = String(body.color).trim() || b.color;
    if (body.order !== undefined) b.order = Number(body.order) || 0;
    if (body.active !== undefined) b.active = body.active === 'true' || body.active === true;
    await b.save();
    if (oldKey !== b.key) {
      const Product = require('../models/Product');
      await Product.updateMany({ badge: oldKey }, { $set: { badge: b.key } });
    }
    res.json({ badge: b });
  } catch (e) { next(e); }
};

// DELETE /api/admin/badges/:id — products keep the key; storefront renders no chip
exports.remove = async (req, res, next) => {
  try {
    const b = await Badge.findByIdAndDelete(req.params.id);
    if (!b) return res.status(404).json({ message: 'Badge not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
};
