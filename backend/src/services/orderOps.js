const mongoose = require('mongoose');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const StockLog = require('../models/StockLog'); // Phase 4 — stock ledger

/* ================= ArixGear orderOps — shared stock/transaction helpers =================
   Used by both the storefront orderController and the admin ERP controller so the
   stock rules can never drift apart:

   1. decrementStock() — RACE-SAFE atomic decrement. The old flow was "read stock,
      check in JS, $inc later" — two concurrent orders could both pass the check and
      oversell. Now every unit decrement is guarded by `stock: { $gte: qty }` inside
      the SAME update, so the DB refuses the write when stock is gone (modifiedCount
      stays 0). When a line fails mid-way, earlier lines are compensated immediately.

   2. restoreStock() — idempotent stock/coupon give-back used by customer
      cancellation, admin cancel, admin payment-reject. A `stockRestored` claim flag
      is flipped atomically FIRST, so double-cancel / cancel-then-delete can never
      restore twice.

   3. withTx() — MongoDB multi-document transaction when the deployment supports it
      (replica set / Atlas), transparent fallback to the compensation flow on
      standalone dev mongod. Callers never branch on session themselves.            */

class StockError extends Error {
  constructor(name) {
    super(`Insufficient stock for ${name} — it just sold out`);
    this.status = 409;
  }
}

/* Phase 4 — fire-and-forget ledger row for every movement. meta:
   { reason: 'order'|'restore'|'manual-order'|…, orderNumber, actor, actorName } */
function logStock(it, { delta, before, after }, meta = {}) {
  StockLog.create({
    product: it.product, productSlug: it.slug || '', productName: it.name || '',
    delta, before, after,
    reason: meta.reason || (delta < 0 ? 'order' : 'restore'),
    orderNumber: meta.orderNumber || null,
    actor: meta.actor || null, actorName: meta.actorName || 'system',
    note: meta.note || '',
  }).catch(() => {}); // the ledger must never break the order flow
}

/* Atomic decrement for every line; on the first failing line the previously
   decremented lines are given back (compensating action) and a 409 is thrown. */
async function decrementStock(items, session = null, meta = {}) {
  const done = [];
  for (const it of items) {
    const q = { _id: it.product, stock: { $gte: it.qty } };
    const upd = { $inc: { stock: -it.qty, sold: it.qty } };
    const r = session
      ? await Product.updateOne(q, upd, { session })
      : await Product.updateOne(q, upd);
    if (r.modifiedCount !== 1) {
      await giveBack(done, session, meta);
      throw new StockError(it.name || it.slug || 'item');
    }
    done.push(it);
    /* Phase 4 — ledger (read-back only when logging is meaningful) */
    if (!meta.silent) {
      const doc = await Product.findById(it.product).select('stock').lean().catch(() => null);
      if (doc) logStock(it, { delta: -it.qty, before: doc.stock + it.qty, after: doc.stock }, meta);
    }
  }
}

/* Inverse increments — used both for mid-order compensation and full restores. */
async function giveBack(items, session = null, meta = {}) {
  for (const it of items || []) {
    if (!it.product) continue;
    const upd = { $inc: { stock: it.qty, sold: -(it.qty) } };
    if (session) await Product.updateOne({ _id: it.product }, upd, { session });
    else await Product.updateOne({ _id: it.product }, upd);
    /* Phase 4 — ledger for the restore side too */
    if (!meta.silent) {
      const doc = await Product.findById(it.product).select('stock').lean().catch(() => null);
      if (doc) logStock(it, { delta: it.qty, before: doc.stock - it.qty, after: doc.stock }, { ...meta, reason: meta.reason || 'restore' });
    }
  }
}

/* Idempotent full restore: stock + sold + coupon usage. Returns true only when
   THIS call performed the restore (the claim flag was won). */
async function restoreStock(order) {
  if (!order || order.stockRestored) return false;
  const claim = await Order.updateOne(
    { _id: order._id, stockRestored: false },
    { $set: { stockRestored: true } }
  );
  if (!claim.modifiedCount) return false;
  await giveBack((order.items || []).filter((i) => i.product));
  if (order.totals && order.totals.couponCode) {
    /* audit fix — only decrement while usedCount > 0 (a re-seeded/recreated
       coupon row must not be driven negative) */
    await Coupon.updateOne({ code: order.totals.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
  return true;
}

/* Run `fn(session)` inside a MongoDB transaction when the topology supports
   sessions/transactions; otherwise call fn(null) directly. If the server rejects
   transactions (standalone mongod), the caller's own compensation logic still
   applies because fn receives null and behaves the legacy way. */
async function withTx(fn) {
  let session = null;
  try { session = await mongoose.startSession(); } catch (_e) { session = null; }
  if (!session) return fn(null);
  try {
    try {
      return await session.withTransaction(async () => fn(session));
    } catch (e) {
      /* standalone mongod: startSession succeeds but the first txn command fails */
      if (/transaction/i.test(String(e.message)) && /replica set|support/i.test(String(e.message))) {
        return fn(null);
      }
      throw e;
    }
  } finally {
    try { await session.endSession(); } catch (_e) { /* already closed */ }
  }
}

module.exports = { decrementStock, giveBack, restoreStock, withTx, StockError };
