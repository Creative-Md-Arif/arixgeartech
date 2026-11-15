/* Task 56-a — loyalty engine: settings reader, atomic redemption, refunds,
   admin adjustments + low-stock alert helper. Fire-and-forget by contract —
   loyalty must never break checkout, exactly like awardDeliveryPoints. */
const Setting = require('../models/Setting');
const LoyaltyLog = require('../models/LoyaltyLog');
const User = require('../models/User');
const { notifyUser } = require('./notify');        // storefront bell
const { notifyAdmin } = require('./notifier');     // admin bell (Task 36 SSE)

const DEFAULTS = { enabled: true, earnPer100: 1, pointValue: 1, minRedeem: 100, maxRedeemPct: 50 };

/* rules merged over defaults — legacy docs without the block read as defaults */
async function getRules() {
  const s = await Setting.get();
  const l = s.loyalty || {};
  return {
    enabled: l.enabled !== false,
    earnPer100: Number(l.earnPer100) > 0 ? Number(l.earnPer100) : DEFAULTS.earnPer100,
    pointValue: Number(l.pointValue) > 0 ? Number(l.pointValue) : DEFAULTS.pointValue,
    minRedeem: Number(l.minRedeem) >= 0 ? Number(l.minRedeem) : DEFAULTS.minRedeem,
    maxRedeemPct: Number(l.maxRedeemPct) > 0 ? Number(l.maxRedeemPct) : DEFAULTS.maxRedeemPct,
  };
}

/* how much ৳ discount do N points buy under the current rules? */
function pointsToDiscount(points, rules) {
  return Math.round(points * rules.pointValue * 100) / 100;
}

/* validate a redemption request against balance + rules →
   { ok, points, discount, message } — clamps to the maxRedeemPct cap so the
   storefront can show the customer the REAL usable amount. */
async function validateRedemption(user, requested, subtotal) {
  const rules = await getRules();
  if (!rules.enabled) return { ok: false, message: 'Loyalty redemption is currently off' };
  const balance = Math.floor(user.loyalty && user.loyalty.points || 0);
  if (balance < rules.minRedeem) {
    return { ok: false, message: `Minimum ${rules.minRedeem} points needed to redeem`, rules, balance };
  }
  let n = Math.floor(Number(requested) || 0);
  if (n <= 0) return { ok: false, message: 'Enter the points you want to use', rules, balance };
  if (n > balance) n = balance;
  if (n < rules.minRedeem) return { ok: false, message: `Minimum ${rules.minRedeem} points needed to redeem`, rules, balance };
  const capPct = rules.maxRedeemPct / 100;
  const maxDiscount = Math.round(subtotal * capPct * 100) / 100;
  let discount = pointsToDiscount(n, rules);
  if (discount > maxDiscount) {
    discount = maxDiscount;
    n = Math.floor(discount / rules.pointValue);
    if (n < 1 || discount <= 0) return { ok: false, message: 'Order too small for redemption', rules, balance };
  }
  return { ok: true, points: n, discount, rules, balance };
}

/* atomic debit — the $inc only lands while the balance still covers the ask;
   a losing concurrent checkout modifies 0 docs and the caller aborts. */
async function debitPoints(userId, points, { note = '', orderNumber = null, by = 'customer' } = {}) {
  const r = await User.updateOne(
    { _id: userId, 'loyalty.points': { $gte: points } },
    { $inc: { 'loyalty.points': -points } }
  );
  if (r.modifiedCount !== 1) return false;
  await LoyaltyLog.log({ user: userId, type: 'redeem', points: -points, note, orderNumber, by });
  return true;
}

/* credit + ledger row (earn/refund/adjust/referral) */
async function creditPoints(userId, points, { type = 'earn', note = '', orderNumber = null, by = 'system' } = {}) {
  if (!points || points <= 0) return false;
  await User.updateOne({ _id: userId }, { $inc: { 'loyalty.points': points } });
  await LoyaltyLog.log({ user: userId, type, points, note, orderNumber, by });
  try {
    await notifyUser(userId, {
      title: type === 'refund' ? 'Points refunded' : `+${points} loyalty points`,
      body: note || `Your balance was credited ${points} points.`,
      kind: 'promo',
      data: { points, type },
    });
  } catch (_e) { /* notification is best-effort */ }
  return true;
}

/* ── low-stock admin alert (Task 56-e) ──────────────────────────────────────
   Called after any stock-mutating write. Emits an admin bell notification
   per product crossing the ≤5 line, throttled by lowStockNotifiedAt so a
   busy day cannot flood the bell (re-notify at most every 24h per product). */
const LOW_STOCK_AT = 5;

async function checkStockAlerts(products) {
  try {
    const Product = require('../models/Product');
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const p of products) {
      if (!p || typeof p.stock !== 'number') continue;
      if (p.stock > LOW_STOCK_AT) continue;
      if (p.lowStockNotifiedAt && p.lowStockNotifiedAt > cutoff) continue;
      await Product.updateOne({ _id: p._id }, { lowStockNotifiedAt: new Date() });
      await notifyAdmin(
        'stock',
        `Low stock: ${p.name}`,
        `${p.stock} left (alert at ≤${LOW_STOCK_AT}). Restock before it sells out.`,
        '/admin/products'
      );
    }
  } catch (_e) { /* alerts are best-effort */ }
}

module.exports = {
  getRules, pointsToDiscount, validateRedemption,
  debitPoints, creditPoints, checkStockAlerts, LOW_STOCK_AT, DEFAULTS,
};
