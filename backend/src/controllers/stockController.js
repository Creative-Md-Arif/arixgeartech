const StockLog = require('../models/StockLog');
const Product = require('../models/Product');
const realtime = require('../services/realtime');
const notifier = require('../services/notifier');

/* Phase 4 (4.4) — stock ledger + admin adjustment.
   Rows are written by orderOps (order / restore) and by adjust() below
   (restock, shrinkage, correction). GET is filterable + product-scoped. */

/* GET /api/admin/stock/logs?product=<id>&reason=order&limit=50 */
exports.logs = async (req, res, next) => {
  try {
    const { product, reason, orderNumber, limit } = req.query;
    /* audit fix — String()-coerce the product filter (extended query parser
       could otherwise splice an operator object into the ledger filter) */
    const q = {};
    if (product) q.product = String(product);
    if (reason && StockLog.REASONS.includes(String(reason))) q.reason = String(reason);
    if (orderNumber) q.orderNumber = String(orderNumber).toUpperCase().trim();
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const [items, total] = await Promise.all([
      StockLog.find(q).sort({ createdAt: -1 }).limit(cap).lean(),
      StockLog.countDocuments(q),
    ]);
    res.json({ items, total });
  } catch (e) { next(e); }
};

/* POST /api/admin/stock/adjust { productId, delta (±), note? } — race-safe:
   the delta only lands while `stock + delta >= 0`. */
exports.adjust = async (req, res, next) => {
  try {
    const { productId, delta, note } = req.body || {};
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) return res.status(400).json({ message: 'delta must be a non-zero integer' });
    if (Math.abs(d) > 10000) return res.status(400).json({ message: 'delta too large (max ±10000 per adjustment)' });

    const p = await Product.findById(productId).select('name slug stock');
    if (!p) return res.status(404).json({ message: 'Product not found' });

    const before = p.stock;
    const upd = await Product.updateOne(
      { _id: p._id, stock: { $gte: d < 0 ? -d : 0 } },
      { $inc: { stock: d } }
    );
    if (upd.modifiedCount !== 1) {
      return res.status(409).json({ message: `Adjustment would push stock negative (current: ${before})` });
    }

    const after = before + d;
    await StockLog.create({
      product: p._id, productSlug: p.slug, productName: p.name,
      delta: d, before, after,
      reason: 'adjust',
      note: String(note || '').slice(0, 300),
      actor: req.user?._id || null, actorName: req.user?.name || 'admin',
    });

    /* low-stock warning ride-along (bell, fire & forget) */
    if (after > 0 && after <= 5) {
      notifier.notifyAdmin('stock', `লো স্টক — ${p.name}`, `স্টক ${after} এ নেমেছে (adjust ${d > 0 ? '+' : ''}${d})`, '/admin/products');
      realtime.emitToAdmins('stock:alert', { slug: p.slug, name: p.name, stock: after });
    }

    res.json({ product: { id: String(p._id), slug: p.slug, name: p.name, stock: before }, stock: after, delta: d });
  } catch (e) { next(e); }
};
