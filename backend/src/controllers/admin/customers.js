/* Phase 4 (4.5) — adminController split: customers. Customers + loyalty: list, tags, password reset, loyalty list/adjust/settings. */
const {
  notifier,
  User,
  Order,
  loyaltyEngine,
  LoyaltyLog,
  Setting,
  cache,
} = require('./_shared');

exports.customers = async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'customer' }).sort({ createdAt: -1 }).limit(200);
    const counts = await Order.aggregate([{ $group: { _id: '$user', n: { $sum: 1 }, spent: { $sum: '$totals.grandTotal' } } }]);
    const byUser = Object.fromEntries(counts.filter((c) => c._id).map((c) => [String(c._id), c]));
    res.json({
      items: users.map((u) => ({
        id: u._id, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt,
        emailVerified: Boolean(u.emailVerified), /* Task 51 — OTP-activation badge */
        adminTags: u.adminTags || [], adminNote: u.adminNote || '', /* Task 57 — CRM layer */
        orders: byUser[String(u._id)]?.n || 0, spent: byUser[String(u._id)]?.spent || 0,
      })),
    });
  } catch (e) { next(e); }
};

/* ================= CUSTOMER CRM TAGS & NOTES (Task 57) ================= */

// PUT /api/admin/customers/:id/tags — private tag list + freeform note.
// Body: { tags: ['vip', …], note: '…' } — both optional; tags replace the set.

exports.customerTags = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Customer not found' });
    const b = req.body || {};
    if (b.tags !== undefined) {
      let tags = Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',');
      tags = [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
      if (tags.length > 8) return res.status(400).json({ message: 'Max 8 tags per customer' });
      if (tags.some((t) => t.length > 24)) return res.status(400).json({ message: 'Each tag must be ≤24 characters' });
      user.adminTags = tags;
    }
    if (b.note !== undefined) user.adminNote = String(b.note).slice(0, 2000);
    await user.save();
    res.json({ customer: { id: user._id, adminTags: user.adminTags, adminNote: user.adminNote } });
  } catch (e) { next(e); }
};

/* ================= CUSTOMER PASSWORD RESET (ERP-assisted) ================= */

// POST /api/admin/customers/:id/reset-password — issue a single-use reset link
// the admin copies and sends to the customer via WhatsApp / Messenger / SMS.
// Zero email infrastructure needed; link expires in 15 min, works once.

exports.resetCustomerPassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Customer not found' });
    const { resetUrl } = require('./authController')._issueResetToken(user, req);
    res.json({
      resetUrl,
      expiresIn: 15,
      customer: { id: user._id, name: user.name, email: user.email, phone: user.phone || '' },
    });
  } catch (e) { next(e); }
};

/* ================= DATABASE BACKUP (Task 57) ================= */

// GET /api/admin/system/backup (owner-only) — one-click JSON export of every
// collection. Hot logs are capped (audit/gsc/notifications) so the download
// stays a few MB even after months of traffic; everything else is full.

exports.loyaltyList = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const sort = req.query.sort === 'recent' ? { createdAt: -1 } : { 'loyalty.points': -1 };
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 20;

    const filter = { role: { $ne: 'admin' } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { 'loyalty.referralCode': rx }];
    }

    const [total, agg, redeemed30, holders, users] = await Promise.all([
      User.countDocuments(filter),
      User.aggregate([{ $match: { role: { $ne: 'admin' } } }, { $group: { _id: null, pts: { $sum: '$loyalty.points' }, n: { $sum: { $cond: [{ $gt: ['$loyalty.points', 0] }, 1, 0] } } } }]),
      LoyaltyLog.aggregate([
        { $match: { type: 'redeem', createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } } },
        { $group: { _id: null, pts: { $sum: { $abs: '$points' } } } },
      ]),
      LoyaltyLog.aggregate([
        { $match: { type: 'earn', createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } } },
        { $group: { _id: null, pts: { $sum: '$points' } } },
      ]),
      User.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)
        .select('name email phone active loyalty.createdAt loyalty.points loyalty.referralCode')
        .lean(),
    ]);

    const rules = await loyaltyEngine.getRules();
    const outPts = agg[0]?.pts || 0;
    res.json({
      stats: {
        outstanding: outPts,
        value: loyaltyEngine.pointsToDiscount(outPts, rules),
        holders: agg[0]?.n || 0,
        redeemed30: redeemed30[0]?.pts || 0,
        earned30: holders[0]?.pts || 0,
      },
      rules,
      page, total, pages: Math.max(1, Math.ceil(total / limit)),
      items: users.map((u) => ({
        id: u._id, name: u.name, email: u.email, phone: u.phone, active: u.active,
        points: u.loyalty?.points || 0,
        referralCode: u.loyalty?.referralCode || null,
        memberSince: u.createdAt,
      })),
    });
  } catch (e) { next(e); }
};

/** GET /api/admin/loyalty/:userId — one customer + full ledger (last 100) */

exports.loyaltyDetail = async (req, res, next) => {
  try {
    const u = await User.findById(req.params.userId).select('name email phone active loyalty createdAt').lean();
    if (!u) return res.status(404).json({ message: 'Customer not found' });
    const logs = await LoyaltyLog.historyFor(u._id, 100);
    const orders = await Order.find({ user: u._id, 'totals.pointsRedeemed': { $gt: 0 } })
      .sort({ createdAt: -1 }).limit(10)
      .select('orderNumber totals.pointsRedeemed totals.pointsDiscount status createdAt').lean();
    res.json({
      customer: {
        id: u._id, name: u.name, email: u.email, phone: u.phone, active: u.active,
        points: u.loyalty?.points || 0, referralCode: u.loyalty?.referralCode || null,
        memberSince: u.createdAt,
      },
      logs: logs.map((h) => ({ id: h._id, type: h.type, points: h.points, note: h.note, orderNumber: h.orderNumber, by: h.by, at: h.createdAt })),
      redemptions: orders,
    });
  } catch (e) { next(e); }
};

/**
 * POST /api/admin/loyalty/:userId/adjust — { points: ±n, note }
 * Signed delta: +50 credits, -30 debits (floored at 0). Writes the ledger
 * row by:'admin' + pings the customer bell. Audit middleware logs the call.
 */

exports.loyaltyAdjust = async (req, res, next) => {
  try {
    const n = Math.trunc(Number(req.body?.points));
    if (!Number.isFinite(n) || n === 0) return res.status(400).json({ message: 'points must be a non-zero integer (+credit / −debit)' });
    if (Math.abs(n) > 100000) return res.status(400).json({ message: 'Single adjustment capped at ±100,000' });
    const note = String(req.body?.note || '').trim().slice(0, 200) || (n > 0 ? 'Admin credit' : 'Admin debit');
    const u = await User.findById(req.params.userId);
    if (!u) return res.status(404).json({ message: 'Customer not found' });
    if (n < 0 && (u.loyalty?.points || 0) + n < 0) {
      return res.status(400).json({ message: `Balance is only ${u.loyalty?.points || 0} points — cannot debit ${Math.abs(n)}` });
    }
    u.loyalty.points = (u.loyalty?.points || 0) + n;
    await u.save();
    await LoyaltyLog.log({ user: u._id, type: 'adjust', points: n, note, by: 'admin' });
    loyaltyEngine.creditPoints(u._id, 0).catch(() => {}); // no-op guard (never blocks)
    notifier.notifyUser(u._id, 'loyalty', `Loyalty points ${n > 0 ? '+' : ''}${n}`,
      note, '/account');
    res.json({ message: `Balance updated: ${u.loyalty.points} points`, points: u.loyalty.points });
  } catch (e) { next(e); }
};

/** GET /api/admin/loyalty-settings — rules for the settings card */

exports.loyaltySettingsGet = async (_req, res, next) => {
  try { res.json(await loyaltyEngine.getRules()); } catch (e) { next(e); }
};

/** PUT /api/admin/loyalty-settings — { enabled, earnPer100, pointValue, minRedeem, maxRedeemPct } */

exports.loyaltySettingsPut = async (req, res, next) => {
  try {
    const s = await Setting.get();
    const b = req.body || {};
    const num = (v, d, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
    };
    s.loyalty = {
      enabled: b.enabled === undefined ? (s.loyalty?.enabled !== false) : Boolean(b.enabled),
      earnPer100: num(b.earnPer100, s.loyalty?.earnPer100 ?? 1, 0, 100),
      pointValue: num(b.pointValue, s.loyalty?.pointValue ?? 1, 0.1, 100),
      minRedeem: num(b.minRedeem, s.loyalty?.minRedeem ?? 100, 0, 1000000),
      maxRedeemPct: num(b.maxRedeemPct, s.loyalty?.maxRedeemPct ?? 50, 5, 100),
    };
    await s.save();
    res.json(s.loyalty);
  } catch (e) { next(e); }
};

/* ================= SALES TREND (Task 56-c — dashboard line chart) ================= */

/**
 * GET /api/admin/analytics/trend?days=30 — daily revenue + order count for the
 * sales trend chart. Excludes cancelled / payment-rejected so the curve matches
 * the dashboard revenue definition. Buckets are UTC calendar days (consistent
 * with the existing 7-day widget).
 */

module.exports = {
  customers: exports.customers,
  customerTags: exports.customerTags,
  resetCustomerPassword: exports.resetCustomerPassword,
  loyaltyList: exports.loyaltyList,
  loyaltyDetail: exports.loyaltyDetail,
  loyaltyAdjust: exports.loyaltyAdjust,
  loyaltySettingsGet: exports.loyaltySettingsGet,
  loyaltySettingsPut: exports.loyaltySettingsPut,
};
