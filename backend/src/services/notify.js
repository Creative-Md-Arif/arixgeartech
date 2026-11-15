/* Phase 4 — merged into the unified notifier hub (services/notifier.js).
   This module keeps its public surface for existing callers (loyalty.js,
   authController, adminController) but no longer owns an SSE registry of its
   own — the ONE hub (notifier) persists + fans out over SSE, Socket.IO and
   FCM. The old copy also wrote `kind`/`data` fields that the Notification
   schema never had (mongoose silently dropped them) — the merge fixes that
   drift by mapping kind→type and data.link→link. */

const notifier = require('./notifier');

/** notifyUser(userId, { title, body, kind, data }) — compat wrapper.
    Delegates to the unified hub (persist + SSE + Socket.IO + FCM). */
async function notifyUser(userId, { title, body = '', kind = 'order', data = {} } = {}) {
  if (!userId) return null;
  const payload = await notifier.emit({
    forAdmin: false,
    user: userId,
    type: kind || 'order',
    title: String(title || '').slice(0, 120),
    body: String(body || '').slice(0, 400),
    link: (data && data.link) || '',
  });
  if (!payload) return null;
  /* legacy shape for old callers (id/kind/data) */
  return { id: payload._id, title: payload.title, body: payload.body, kind: kind || 'order', data: data || {}, read: false, at: payload.createdAt };
}

/* ── loyalty helpers (account pack 4c) ───────────────────────────────────────
   awardDeliveryPoints(order) — 1 pt per full ৳100 of grandTotal, awarded ONCE
   per order (loyaltyAwarded claim flag). Fire-and-forget by contract. */
const User = require('../models/User');

function referralCodeFor(u) {
  if (u.loyalty && u.loyalty.referralCode) return u.loyalty.referralCode;
  const code = 'ARG-R-' + Math.random().toString(36).toUpperCase().slice(2, 7);
  u.loyalty = u.loyalty || {};
  u.loyalty.referralCode = code;
  return code;
}

async function awardDeliveryPoints(order) {
  try {
    if (!order || !order.user || order.loyaltyAwarded) return;
    const pts = Math.floor((+order.totals.grandTotal || 0) / 100);
    if (pts <= 0) return;
    /* audit fix — atomic claim: two concurrent "delivered" transitions both
       passed the JS check before; the conditional update lets exactly one win */
    const claim = await Order.updateOne(
      { _id: order._id, loyaltyAwarded: false },
      { $set: { loyaltyAwarded: true } }
    );
    if (!claim.modifiedCount) return;
    await User.updateOne({ _id: order.user }, { $inc: { 'loyalty.points': pts } });
    order.loyaltyAwarded = true;
    notifyUser(order.user, {
      title: `+${pts} loyalty points earned`,
      body: `অর্ডার ${order.orderNumber} ডেলিভারি সম্পন্ন — পয়েন্ট যোগ হয়েছে। পরের কেনাকাটায় কাজে লাগবে!`,
      kind: 'promo',
      data: { orderNumber: order.orderNumber, points: pts },
    }).catch(() => {});
  } catch (_e) { /* loyalty must never break the order flow */ }
}

module.exports = { notifyUser, awardDeliveryPoints, referralCodeFor };
