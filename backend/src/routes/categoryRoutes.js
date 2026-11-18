const router = require('express').Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const cache = require('../services/cache');
const c = require('../controllers/categoryController');

// GET /api/categories (public) — flat active list + live branch product counts.
// Count = products whose categoryPath CONTAINS the slug (root counts include
// every subcategory under it — tiles/chips show honest branch totals).
router.get('/', async (_req, res, next) => {
  try {
    const cached = cache.get('catlist');
    if (cached) return res.json(cached);
    const [items, counts] = await Promise.all([
      Category.find({ active: true }).sort({ order: 1 }).lean(),
      Product.aggregate([
        { $match: { active: true } },
        { $project: { paths: { $cond: [
          { $gt: [{ $size: { $ifNull: ['$categoryPath', []] } }, 0] },
          '$categoryPath',
          ['$category'],
        ] } } },
        { $unwind: '$paths' },
        { $group: { _id: '$paths', n: { $sum: 1 } } },
      ]),
    ]);
    const bySlug = Object.fromEntries(counts.map((r) => [r._id, r.n]));
    const out = { items: items.map((c) => ({ ...c, productCount: bySlug[c.slug] || 0 })) };
    cache.set('catlist', out);
    res.json(out);
  } catch (e) { next(e); }
});

// GET /api/categories/tree (public) — nested tree for the mega-nav / directory
router.get('/tree', c.tree);

module.exports = router;
