const Subscriber = require('../models/Subscriber');

/* Phase 4 (4.4) — subscriber list backend (canonical newsletter list lives in
   the Subscriber model; the public signup still lands a ContactMessage row
   for the Messages inbox). Admin: list/filter + CSV export. */

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* GET /api/admin/subscribers?status=active&q=… */
exports.list = async (req, res, next) => {
  try {
    const { status, q, limit } = req.query;
    const qy = {};
    if (status === 'active' || status === 'unsubscribed') qy.status = status;
    if (q) qy.email = new RegExp(String(q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const cap = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    const [items, total, activeCount] = await Promise.all([
      Subscriber.find(qy).sort({ createdAt: -1 }).limit(cap).lean(),
      Subscriber.countDocuments(qy),
      Subscriber.countDocuments({ status: 'active' }),
    ]);
    res.json({ items, total, activeCount });
  } catch (e) { next(e); }
};

/* GET /api/admin/subscribers/export.csv */
exports.exportCsv = async (req, res, next) => {
  try {
    const qy = {};
    if (req.query.status === 'active' || req.query.status === 'unsubscribed') qy.status = req.query.status;
    const rows = await Subscriber.find(qy).sort({ createdAt: -1 }).limit(5000).lean();
    const lines = ['email,status,source,subscribedAt,unsubscribedAt'];
    for (const r of rows) {
      lines.push([
        csvEscape(r.email), r.status, r.source || 'footer',
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
        r.unsubscribedAt ? new Date(r.unsubscribedAt).toISOString() : '',
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="arixgear-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (e) { next(e); }
};

/* PATCH /api/admin/subscribers/:id — flip status (resubscribe / opt out) */
exports.update = async (req, res, next) => {
  try {
    const s = await Subscriber.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Subscriber not found' });
    if (req.body.status !== undefined) {
      const status = String(req.body.status);
      if (!['active', 'unsubscribed'].includes(status)) return res.status(400).json({ message: 'status must be active | unsubscribed' });
      s.status = status;
      s.unsubscribedAt = status === 'unsubscribed' ? new Date() : null;
    }
    if (req.body.source !== undefined && ['footer', 'checkout', 'popup', 'admin'].includes(req.body.source)) s.source = req.body.source;
    await s.save();
    res.json({ subscriber: s });
  } catch (e) { next(e); }
};

/* DELETE /api/admin/subscribers/:id — GDPR erase */
exports.remove = async (req, res, next) => {
  try {
    const r = await Subscriber.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Subscriber not found' });
    res.json({ message: 'Subscriber deleted' });
  } catch (e) { next(e); }
};
