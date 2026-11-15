/* Step 2 (admin sync audit) — Payments module backend.
   The admin Payments page shipped against endpoints that never existed
   (404 on every visit). This controller implements the real ledger:
     GET  /api/admin/payments/transactions            — every payment across orders
     POST /api/admin/payments/gateway/:orderNumber/refund — ledger refund
   Money bookkeeping only: the SSLCOMMERZ gateway-side refund must be
   executed from the merchant panel; the order's refunds[] ledger keeps the
   books consistent (schema field already existed, never exposed before). */
const { Order, ADMIN_NAME } = require('./_shared');

const round2 = (n) => Math.round((+n || 0) * 100) / 100;
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* GET /api/admin/payments/transactions?method=&status=&q=&from=&to=&page=&limit= */
exports.transactions = async (req, res, next) => {
  try {
    const { method, status, q, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    /* method filter: the UI calls the gateway 'gateway' — the schema stores
       'sslcommerz'; everything else passes through verbatim */
    const qy = { 'payment.method': { $exists: true } };
    if (method === 'gateway') qy['payment.method'] = 'sslcommerz';
    else if (method) qy['payment.method'] = String(method);
    if (status) qy['payment.status'] = String(status);
    if (from || to) {
      qy.createdAt = {};
      if (from) qy.createdAt.$gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23, 59, 59, 999); qy.createdAt.$lte = d; }
    }
    if (q) {
      const rx = new RegExp(esc(q).trim(), 'i');
      qy.$or = [
        { orderNumber: rx },
        { 'customer.phone': rx },
        { 'customer.name': rx },
        { 'payment.trxId': rx },
        { 'payment.gateway.valId': rx },
        { 'payment.gateway.bankTrxId': rx },
      ];
    }

    const [rows, total, stats] = await Promise.all([
      Order.find(qy)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('orderNumber customer payment source createdAt')
        .lean(),
      Order.countDocuments(qy),
      Order.aggregate([
        { $match: qy },
        { $group: {
          _id: { method: '$payment.method', payStatus: '$payment.status' },
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ['$payment.expectedAmount', 0] } },
        } },
        { $sort: { '_id.method': 1, '_id.payStatus': 1 } },
      ]),
    ]);

    const items = rows.map((o) => {
      const p = o.payment || {};
      const gw = p.gateway || {};
      return {
        orderNumber: o.orderNumber,
        customer: { name: o.customer?.name || '', phone: o.customer?.phone || '' },
        source: o.source || 'online',
        method: p.method === 'sslcommerz' ? 'gateway' : p.method,
        payStatus: p.status || 'pending',
        amount: round2(p.expectedAmount || 0),
        trxId: p.trxId || null,
        gateway: {
          valId: gw.valId || null,
          bankTrxId: gw.bankTrxId || null,
          cardType: gw.cardType || null,
          ipnVerified: Boolean(gw.valId && p.status === 'paid'),
          refunded: (p.refunds || []).length > 0,
        },
        refunds: (p.refunds || []).map((r) => ({ amount: round2(r.amount || 0), note: r.note || '', by: r.by || '', at: r.at })),
        createdAt: o.createdAt,
      };
    });

    res.json({
      items,
      stats: stats.map((s) => ({
        method: s._id.method === 'sslcommerz' ? 'gateway' : s._id.method,
        payStatus: s._id.payStatus,
        count: s.count,
        amount: round2(s.amount),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) { next(e); }
};

/* POST /api/admin/payments/gateway/:orderNumber/refund { amount?, note? }
   Records a refund in the order ledger (idempotency guard: never more than
   the paid/expected amount; rejected/pending payments are refundable via the
   returns flow, not here). */
exports.gatewayRefund = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber || '').toUpperCase().trim() });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.payment.method !== 'sslcommerz') {
      return res.status(400).json({ message: 'Ledger refunds apply to online (SSLCOMMERZ) payments only — manual methods are edited on the order' });
    }
    if (!['paid', 'verified'].includes(order.payment.status)) {
      return res.status(409).json({ message: `Payment is ${order.payment.status} — only settled payments can be refunded here` });
    }
    const paid = round2(order.payment.expectedAmount || 0);
    const refunded = round2((order.payment.refunds || []).reduce((a, r) => a + (+r.amount || 0), 0));
    const remaining = round2(paid - refunded);
    if (remaining <= 0) return res.status(409).json({ message: 'This payment is already fully refunded' });

    const body = req.body || {};
    let amount = body.amount === undefined || body.amount === '' || body.amount === null ? remaining : round2(body.amount);
    if (!(amount > 0)) return res.status(400).json({ message: 'Refund amount must be a positive number' });
    if (amount > remaining) return res.status(400).json({ message: `Refund exceeds the refundable balance (৳${remaining.toFixed(2)} left)` });

    const refundRef = 'RFD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).toUpperCase().slice(2, 4);
    const entry = {
      amount,
      note: String(body.note || '').trim().slice(0, 200),
      by: ADMIN_NAME(req),
      at: new Date(),
    };
    order.payment.refunds = [...(order.payment.refunds || []), entry];
    /* NOTE — payment.status is intentionally NOT flipped: none of the enum
       values mean "refunded" and reusing 'rejected' would pollute the payment
       queues. Fully-refunded state is derived from the refunds ledger (the
       transactions projection exposes gateway.refunded from it). */
    order.statusHistory.push({
      status: order.status,
      note: `Ledger refund ${refundRef} — ৳${amount.toFixed(2)}${entry.note ? ' · ' + entry.note : ''} (by ${entry.by})`,
      at: new Date(),
      by: entry.by,
    });
    await order.save();
    res.json({
      order: { orderNumber: order.orderNumber, paymentStatus: order.payment.status },
      refund: { amount, refundRef, note: entry.note, by: entry.by, at: entry.at },
    });
  } catch (e) { next(e); }
};
