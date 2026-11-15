/* ArixGear — SSLCOMMERZ payment gateway (Task 40).
 *
 * Lifecycle:
 *   1. storefront places an order with paymentMethod=sslcommerz (status pending)
 *   2. POST /api/payments/init  { orderNumber, phone } → gateway session
 *        • real mode  (Store ID + Store Password saved):
 *            session created on sandbox/securepay.sslcommerz.com →
 *            { redirect: GatewayPageURL }
 *        • simulated  (enabled but creds empty — dev/QA):
 *            local HMAC session → { redirect: /payment/sandbox?... }
 *   3. customer pays on the gateway → gateway redirects the browser to
 *        GET /api/payments/validate/:orderNumber   (success)
 *        GET /api/payments/fail/:orderNumber       (failure)
 *        GET /api/payments/cancel/:orderNumber     (user backed out)
 *      and server-to-server POST /api/payments/ipn (real mode only)
 *   4. validate/ipn verify val_id + amount + currency against the gateway
 *      validator API, then mark payment paid and push the order to processing.
 *
 * Security rules enforced here:
 *   - init requires the checkout phone (6+ digit suffix) or an owner/admin JWT
 *   - simulated sessions carry an HMAC tag the client cannot forge
 *   - real validation always re-verifies val_id server-side (never trusts
 *     the redirect query alone) and re-checks amount + currency + tran_id
 *   - marking paid is idempotent — double IPN/double redirect cannot re-charge
 */
const crypto = require('crypto');
const Order = require('../models/Order');
const Setting = require('../models/Setting');

const GW_BASE = { sandbox: 'https://sandbox.sslcommerz.com', live: 'https://securepay.sslcommerz.com' };
const SIM_VAL_PREFIX = 'SIM';

const appUrl = () => (process.env.APP_URL || 'http://localhost:5000').replace(/\/+$/, '');
const gwBase = (sandbox) => (sandbox ? GW_BASE.sandbox : GW_BASE.live);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* HMAC tag for simulated sessions — binds order number + checkout phone so a
   guessed URL cannot flip an order to paid. Server secret never leaves .env. */
function simTag(orderNumber, phone) {
  /* Task 57 (security audit) — centralised jwtSecret() so production fail-fast
     covers this HMAC too; the old standalone 'forged-dev-secret' fallback is gone */
  const { jwtSecret } = require('../middleware/auth');
  return crypto.createHmac('sha256', jwtSecret()).update(`${orderNumber}|${String(phone || '')}`).digest('hex').slice(0, 32);
}

/* Same ownership rules as the order phone-proof endpoints: admin JWT, owner
   JWT, or the checkout phone (6+ digit suffix). Returns { order, error }. */
async function proofOrder(req, { phoneOverride } = {}) {
  const num = String(req.params.orderNumber || req.body?.orderNumber || '').toUpperCase().trim();
  if (!num) return { error: [400, 'orderNumber is required'] };
  const order = await Order.findOne({ orderNumber: num });
  if (!order) return { error: [404, 'No order found with this number'] };

  const u = req.user;
  const isAdmin = u && u.role === 'admin';
  const isOwner = u && order.user && String(order.user) === String(u._id);
  if (!isAdmin && !isOwner) {
    const phone = String(phoneOverride || req.body?.phone || req.query.phone || '').replace(/\D/g, '');
    if (phone.length < 6) return { error: [400, 'Provide the phone number used at checkout'] };
    if (!(order.customer.phone || '').replace(/\D/g, '').endsWith(phone)) {
      return { error: [403, 'Phone number does not match this order'] };
    }
  }
  return { order };
}

const isSimSession = (order) => Boolean(order.payment.gateway && order.payment.gateway.sessionKey);
const redirects = (res, order, kind) => {
  const base = kind === 'success' ? `/success?order=${order.orderNumber}&paid=1` : `/checkout?payment=${kind}&order=${order.orderNumber}`;
  res.redirect(302, base);
};

/* Flip an order to paid once — every caller funnels through here so double
   IPN + browser redirect + admin verify can never double-mark or double-move
   the status. Returns true when this call actually transitioned the order. */
async function markPaid(order, v) {
  if (order.payment.status === 'paid') return false;
  const g = order.payment.gateway || {};
  order.payment.status = 'paid';
  order.payment.trxId = String(v.bankTrxId || v.valId || '').toUpperCase() || order.payment.trxId;
  order.payment.verifiedAt = new Date();
  order.payment.gateway = {
    ...g,
    valId: v.valId || g.valId,
    tranId: v.tranId || order.orderNumber,
    bankTrxId: v.bankTrxId || null,
    cardType: v.cardType || null,
    paidAt: new Date(),
    failedAt: null,
  };
  if (order.status === 'verifying') {
    order.pushHistory('processing', `Payment verified via SSLCOMMERZ — val_id ${v.valId || 'n/a'} (${v.via || 'validation'})`, 'sslcommerz');
  }
  await order.save();
  return true;
}

/* POST /api/payments/init  { orderNumber, phone } */
exports.init = async (req, res, next) => {
  try {
    const { order, error } = await proofOrder(req);
    if (error) return res.status(error[0]).json({ message: error[1] });

    if (order.payment.method !== 'sslcommerz') {
      return res.status(400).json({ message: 'This order is not an online-payment order' });
    }
    if (order.payment.status === 'paid') {
      return res.status(409).json({ message: 'This order is already paid' });
    }
    if (['cancelled', 'payment-rejected'].includes(order.status)) {
      return res.status(409).json({ message: 'This order is cancelled — place a new order' });
    }
    if (!['pending', 'failed'].includes(order.payment.status)) {
      return res.status(409).json({ message: `Payment is ${order.payment.status} — a new session cannot start` });
    }

    const s = await Setting.get();
    const gw = s.gateway || {};
    if (!gw.enabled || gw.provider !== 'sslcommerz') {
      return res.status(503).json({ message: 'Online payment is currently disabled' });
    }

    const configured = Boolean(gw.storeId && gw.storePasswd);

    /* ---- REAL gateway session ---- */
    if (configured) {
      const body = {
        store_id: gw.storeId,
        store_passwd: gw.storePasswd,
        total_amount: round2(order.totals.grandTotal),
        currency: 'BDT',
        tran_id: order.orderNumber,
        success_url: `${appUrl()}/api/payments/validate/${order.orderNumber}`,
        fail_url: `${appUrl()}/api/payments/fail/${order.orderNumber}`,
        cancel_url: `${appUrl()}/api/payments/cancel/${order.orderNumber}`,
        ipn_url: `${appUrl()}/api/payments/ipn`,
        cus_name: order.customer.name,
        cus_email: order.customer.email || 'guest@arixgear.tech',
        cus_phone: order.customer.phone,
        cus_add1: order.shipping.address,
        cus_add2: order.shipping.city,
        cus_city: order.shipping.city,
        cus_country: 'Bangladesh',
        shipping_method: 'Courier',
        num_of_item: order.items.reduce((n, i) => n + (i.qty || 1), 0),
        product_name: order.items.map((i) => i.name).join(', ').slice(0, 250) || 'Tech & gadgets',
        product_category: 'Electronics',
        product_profile: 'physical-goods',
      };
      let data;
      try {
        const r = await fetch(`${gwBase(gw.sandbox)}/checkout/session/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        data = await r.json();
      } catch (e) {
        return res.status(502).json({ message: 'Payment gateway is unreachable — try again shortly' });
      }
      const redirect = data.GatewayPageURL || data.gatewayPageURL;
      if (data.status !== 'SUCCESS' || !redirect) {
        return res.status(502).json({ message: data.failedreason || 'Gateway refused the session — verify store credentials' });
      }
      order.payment.status = 'pending';
      order.payment.gateway = { ...(order.payment.gateway || {}), sessionKey: data.sessionkey || null, valId: null, tranId: order.orderNumber, bankTrxId: null, cardType: null, paidAt: null, failedAt: null };
      await order.save();
      return res.json({ redirect, simulated: false });
    }

    /* ---- SIMULATED session (enabled, no creds — dev/QA sandbox) ---- */
    const tag = simTag(order.orderNumber, order.customer.phone);
    order.payment.status = 'pending';
    order.payment.gateway = { ...(order.payment.gateway || {}), sessionKey: tag, valId: null, tranId: order.orderNumber, bankTrxId: null, cardType: null, paidAt: null, failedAt: null };
    await order.save();
    return res.json({ redirect: `/payment/sandbox?order=${order.orderNumber}&sim=${tag}`, simulated: true });
  } catch (e) { next(e); }
};

/* Verify a real val_id against the SSLCOMMERZ validator API. Returns
   { ok, reason, val } — ok=true only when EVERY check passes. */
async function validateReal(order, valId, gw) {
  const url = `${gwBase(gw.sandbox)}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(gw.storeId)}&store_passwd=${encodeURIComponent(gw.storePasswd)}&format=json`;
  let v;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    v = await r.json();
  } catch (e) {
    return { ok: false, reason: 'validator-unreachable' };
  }
  if (!v || !['VALID', 'VALIDATED'].includes(v.status)) return { ok: false, reason: v ? `status-${v.status || 'missing'}` : 'empty' };
  if (String(v.tran_id || '').toUpperCase() !== order.orderNumber) return { ok: false, reason: 'tran-id-mismatch' };
  if (round2(v.amount) !== round2(order.totals.grandTotal)) return { ok: false, reason: 'amount-mismatch' };
  if (String(v.currency || '').toUpperCase() !== 'BDT') return { ok: false, reason: 'currency-mismatch' };
  return {
    ok: true,
    val: { valId: v.val_id, tranId: v.tran_id, bankTrxId: v.bank_tran_id, cardType: v.card_type, via: 'validation-api' },
  };
}

/* GET /api/payments/validate/:orderNumber — gateway success redirect target */
exports.validate = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber || '').toUpperCase().trim() });
    if (!order || order.payment.method !== 'sslcommerz') return redirects(res, { orderNumber: req.params.orderNumber || '' }, 'failed');
    if (order.payment.status === 'paid') return redirects(res, order, 'success'); // idempotent re-hit
    if (['cancelled', 'payment-rejected'].includes(order.status)) return redirects(res, order, 'cancelled');

    const s = await Setting.get();
    const gw = s.gateway || {};

    /* REAL mode — server-side re-verification of val_id */
    if (gw.storeId && gw.storePasswd) {
      const out = await validateReal(order, String(req.query.val_id || ''), gw);
      if (!out.ok) return redirects(res, order, 'failed');
      await markPaid(order, out.val);
      return redirects(res, order, 'success');
    }

    /* SIM mode — HMAC tag proves the session was issued by this server */
    const g = order.payment.gateway || {};
    if (!g.sessionKey || String(req.query.sim || '') !== g.sessionKey) {
      return redirects(res, order, 'failed');
    }
    const valId = String(req.query.val_id || '').trim();
    if (!valId.startsWith(SIM_VAL_PREFIX) || valId.length < 6 || valId.length > 40) {
      return redirects(res, order, 'failed');
    }
    await markPaid(order, { valId, cardType: String(req.query.card_type || 'VISA'), via: 'sim' });
    return redirects(res, order, 'success');
  } catch (e) { next(e); }
};

/* audit fix — statusHistory appends on the gateway redirects are deduped
   (same status+note within 10 minutes → skip) and capped; the unauthenticated
   fail/cancel endpoints used to allow unbounded history growth toward the
   16MB document ceiling. */
function pushHistory(order, status, note, by) {
  const last = order.statusHistory[order.statusHistory.length - 1];
  if (last && last.status === status && last.note === note && (Date.now() - new Date(last.at).getTime()) < 10 * 60 * 1000) return;
  if (order.statusHistory.length >= 60) return;
  order.statusHistory.push({ status, note, at: new Date(), by });
}

/* GET /api/payments/fail/:orderNumber — gateway failure redirect */
exports.fail = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber || '').toUpperCase().trim() });
    if (!order || order.payment.method !== 'sslcommerz') return redirects(res, { orderNumber: req.params.orderNumber || '' }, 'failed');
    /* audit fix — in simulated mode the server-issued sim tag must accompany
       the redirect (the sandbox page already sends it); real-mode redirects
       come signed-in from the gateway itself. The status flip only lands on a
       genuinely pending payment, so a guessing attacker cannot flip an order
       that is being paid, and repeated hits cannot grow the history. */
    const s = await Setting.get();
    const realMode = Boolean(s.gateway?.storeId && s.gateway?.storePasswd);
    if (!realMode && String(req.query.sim || '') !== String(order.payment.gateway?.sessionKey || '')) {
      return redirects(res, order, 'failed');
    }
    if (order.payment.status === 'pending') {
      order.payment.status = 'failed';
      order.payment.gateway = { ...(order.payment.gateway || {}), failedAt: new Date() };
      pushHistory(order, order.status, 'SSLCOMMERZ payment failed — customer can retry', 'sslcommerz');
      await order.save();
    }
    return redirects(res, order, 'failed');
  } catch (e) { next(e); }
};

/* GET /api/payments/cancel/:orderNumber — customer backed out on gateway */
exports.cancel = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: String(req.params.orderNumber || '').toUpperCase().trim() });
    if (!order || order.payment.method !== 'sslcommerz') return redirects(res, { orderNumber: req.params.orderNumber || '' }, 'cancelled');
    /* audit fix — same sim-tag rule as /fail; the history append is deduped
       and capped so the endpoint can no longer be looped for doc growth */
    const s = await Setting.get();
    const realMode = Boolean(s.gateway?.storeId && s.gateway?.storePasswd);
    if (!realMode && String(req.query.sim || '') !== String(order.payment.gateway?.sessionKey || '')) {
      return redirects(res, order, 'cancelled');
    }
    if (order.payment.status === 'pending') {
      pushHistory(order, order.status, 'Gateway checkout cancelled by customer — payment still pending', 'sslcommerz');
      await order.save();
    }
    return redirects(res, order, 'cancelled');
  } catch (e) { next(e); }
};

/* POST /api/payments/ipn — SSLCOMMERZ server-to-server callback (real mode).
   Re-verifies val_id through the validator API; the raw IPN body alone is
   NEVER trusted. Idempotent: a repeated IPN for a paid order is a no-op. */
exports.ipn = async (req, res, next) => {
  try {
    const num = String(req.body?.tran_id || '').toUpperCase().trim();
    if (!num) return res.status(400).send('tran_id missing');
    const order = await Order.findOne({ orderNumber: num });
    if (!order || order.payment.method !== 'sslcommerz') return res.status(404).send('unknown order');

    const s = await Setting.get();
    const gw = s.gateway || {};
    if (!(gw.storeId && gw.storePasswd)) return res.status(400).send('IPN not available in simulated mode');
    if (order.payment.status === 'paid') return res.status(200).send('already paid');

    const out = await validateReal(order, String(req.body.val_id || ''), gw);
    if (!out.ok) return res.status(409).send(`validation failed: ${out.reason}`);
    await markPaid(order, out.val);
    return res.status(200).send('IPN OK');
  } catch (e) { next(e); }
};
