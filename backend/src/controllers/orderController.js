const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Setting = require('../models/Setting');
const User = require('../models/User');
const ReturnRequest = require('../models/ReturnRequest');
const ComboBundle = require('../models/ComboBundle'); // Phase 4 — real combo bundles
const realtime = require('../services/realtime');     // Phase 4 — Socket.IO order rooms
const loyaltyEngine = require('../services/loyalty'); // Task 56-a
const { saveImage } = require('../services/storageService');
const { sendOrderConfirmation, sendStatusUpdate } = require('../services/emailService');
const { orderPlacedSMS, statusSMS } = require('../services/smsService');
const { buildInvoicePdf } = require('../services/invoiceService');
const orderOps = require('../services/orderOps');
const notifier = require('../services/notifier'); // Task 36 — in-app bell
const dealSvc = require('../services/dealService'); // Phase 8 — centralized deals & promotions

const MOBILE_METHODS = ['bkash', 'nagad', 'rocket'];

/* Phase 4 — is the product's flash window live right now? (coupon stacking
   rule). Phase 8: unit pricing moved to dealSvc.linePriceFor — the deal
   engine joins flash in one min() rule, see services/dealService.js. */
const flashActive = (p, now = Date.now()) => {
  const f = p && p.flash;
  return !!(f && +f.price > 0 && f.startsAt && f.endsAt &&
    now >= +new Date(f.startsAt) && now <= +new Date(f.endsAt));
};

/* Phase 4 (4.1) — expand a `{ bundle: slug, qty }` cart line into REAL order
   lines: every component becomes an item at its ALLOCATED share of the
   bundle price (ComboBundle.allocate — largest-remainder so the allocation
   sums to bundlePrice exactly). Validation: bundle live, all components
   active + tracked. Returns { items:[…], save, bundle } or { error } */
async function expandBundle(line) {
  const slug = String(line.bundle || '').toLowerCase();
  const qty = Number(line.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    return { error: [400, `Invalid quantity for bundle ${slug} (must be 1–10)`] };
  }
  const bundle = await ComboBundle.findOne({ slug }).populate('items.product', 'name nameBn slug images price active category flash stock');
  if (!bundle || !bundle.isLive()) return { error: [400, `Bundle not available: ${slug}`] };

  const missing = (bundle.items || []).filter((i) => !i.product || i.product.active === false);
  if (missing.length) return { error: [409, `A component of ${bundle.title} just sold out / went inactive — bundle paused`] };
  const short = (bundle.items || []).find((i) => Number(i.product.stock) < (+i.qty || 1) * qty);
  if (short) return { error: [409, `Not enough stock for ${short.product.name} in ${bundle.title}`] };

  const pricingItems = bundle.items.map((item) => {
    const raw = typeof item.toObject === 'function' ? item.toObject() : item;
    return { ...raw, price: Number(item.product.price) || 0 };
  });
  const componentsTotal = Math.round(pricingItems.reduce((sum, item) => sum + item.price * (+item.qty || 1), 0) * 100) / 100;
  if (componentsTotal <= +bundle.bundlePrice) {
    return { error: [409, `${bundle.title} is no longer priced below its components total`] };
  }
  const pricingBundle = {
    items: pricingItems,
    bundlePrice: bundle.bundlePrice,
    componentsTotal: () => componentsTotal,
  };
  const alloc = ComboBundle.prototype.allocate.call(pricingBundle);
  const orderItems = bundle.items.map((i, idx) => {
    const componentQty = +i.qty || 1;
    const componentTotal = +alloc[idx].unit || 0;
    const unit = Math.round((componentTotal / componentQty) * 10000) / 10000;
    const lineTotal = Math.round(componentTotal * qty * 100) / 100;
    return {
      product: i.product._id,
      name: i.product.name,
      nameBn: i.product.nameBn || '',
      slug: i.product.slug,
      image: i.product.images?.[0]?.url || '',
      price: unit,
      qty: componentQty * qty,
      lineTotal,
      category: i.product.category,
      bundle: { slug: bundle.slug, title: bundle.title },
    };
  });
  const save = Math.max(Math.round((componentsTotal - +bundle.bundlePrice) * qty * 100) / 100, 0);
  return { items: orderItems, save, bundle, qty };
}

/* BD mobile validation — mirrors the manual-order rule: 01[3-9]XXXXXXXX
   (11 digits, operator prefix 013–019). 880/+880 prefixes normalized away. */
const validBDPhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  const local = digits.replace(/^880/, '0').slice(-11);
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
};

exports._expandBundle = expandBundle;

/* Resolve the shared order-lookup + phone check used by tracking / cancel /
   invoice / returns. Access is granted when:
     • a JWT accompanies the request and the order belongs to that account, or
     • the caller proves ownership with the checkout phone (6+ digit suffix).
   Returns { order, error: Response } — error is null on success.           */
async function gatedOrder(req, { phone: phoneOverride } = {}) {
  const num = String(req.params.orderNumber || '').toUpperCase().trim();
  if (!num) return { error: [400, 'Order number is required'] };
  const order = await Order.findOne({ orderNumber: num });
  if (!order) return { error: [404, 'No order found with this number'] };

  const u = req.user;
  const isAdmin = u && u.role === 'admin';
  const isOwner = u && order.user && String(order.user) === String(u._id);
  if (!isAdmin && !isOwner) {
    const phone = String(phoneOverride || req.query.phone || req.body?.phone || '').replace(/\D/g, '');
    if (phone.length < 6) {
      return { error: [400, 'Provide the phone number (or last 6 digits) used at checkout'] };
    }
    const orderPhone = (order.customer.phone || '').replace(/\D/g, '');
    if (!orderPhone.endsWith(phone)) {
      return { error: [403, 'Phone number does not match this order'] };
    }
  }
  return { order };
}

/**
 * POST /api/orders  (multipart/form-data)
 * fields: payload = JSON string { customer, shipping{division,...}, items[{slug,qty,color,size}], couponCode, paymentMethod, trxId, senderNumber, idempotencyKey? }
 * file:   screenshot (required for bkash/nagad/rocket)
 *
 * GUEST ORDERS ALLOWED — no account needed. If a valid JWT is attached,
 * the order is linked to the account automatically.
 *
 * Server-authoritative totals: prices, coupon and division-wise shipping are
 * ALL recalculated here — client values are never trusted.
 *
 * Reliability (Task 28):
 *  • idempotencyKey — the same checkout attempt resubmitted (double-click /
 *    network retry) returns the ORIGINAL order with duplicate:true, never a
 *    second charge.
 *  • stock is decremented ATOMICALLY per line (`stock >= qty` inside the same
 *    update) — concurrent orders can no longer oversell.
 *  • when the deployment supports MongoDB transactions the whole create runs
 *    in one; on standalone dev mongod the code falls back to compensating
 *    actions (orderOps.withTx).
 */
exports.placeOrder = async (req, res, next) => {
  try {
    let body;
    try { body = JSON.parse(req.body.payload || '{}'); } catch (_e) {
      return res.status(400).json({ message: 'payload must be valid JSON' });
    }

    const { customer = {}, shipping = {}, items = [], couponCode, paymentMethod, trxId, senderNumber, redeemPoints } = body;
    /* audit fix — cap the idempotency key: multi-KB keys used to be stored and
       indexed until they blew past MongoDB's ~1024-byte index-key limit */
    const idemKey = String(body.idempotencyKey || '').trim().slice(0, 64) || null;

    /* ---- 0. idempotency — replayed checkout attempt returns the original ---- */
    if (idemKey) {
      const dup = await Order.findOne({ idemKey });
      if (dup) {
        /* audit fix — the replay used to hand the FULL order (customer name,
           phone, address, TrxID, timeline) to anyone who obtained the client-
           generated idemKey. Bind the full view to the checkout phone; any
           other caller gets a PII-free receipt instead. */
        const replayPhone = validBDPhone(customer.phone);
        const samePhone = replayPhone && String(dup.customer?.phone || '') === replayPhone;
        if (samePhone) return res.status(200).json({ order: dup.publicView(), duplicate: true });
        return res.status(200).json({ duplicate: true, orderNumber: dup.orderNumber, status: dup.status, grandTotal: dup.totals?.grandTotal ?? 0 });
      }
    }

    /* ---- 1. customer & shipping validation ---- */
    if (!customer.name || !customer.phone) return res.status(400).json({ message: 'Name and phone are required' });
    const normPhone = validBDPhone(customer.phone);
    if (!normPhone) {
      return res.status(400).json({ message: 'Valid BD mobile number required (e.g. 01712345678, prefix 013–019)' });
    }
    if (!shipping.address || !shipping.city || !shipping.division) {
      return res.status(400).json({ message: 'Address, city and division are required' });
    }
    const settings = await Setting.get();

    /* ---- 1a. Task 52 — guest checkout kill-switch ----
       Admin off-switch: only requests carrying a valid account token may
       place orders while it is off. Admin manual orders (source:'manual')
       go through /api/admin/orders/manual and are never blocked. */
    if (!req.user && settings.checkout && settings.checkout.guestEnabled === false) {
      return res.status(403).json({
        code: 'GUEST_CHECKOUT_DISABLED',
        message: 'Guest checkout is currently disabled — log in or create an account to place your order.',
      });
    }

    /* ---- 1b. Task 57 — maintenance mode gate ----
       The store is closed: no new orders from anyone (the storefront shows a
       holding screen; admin manual orders go through a separate endpoint). */
    if (settings.maintenance && settings.maintenance.enabled) {
      return res.status(503).json({
        code: 'MAINTENANCE_MODE',
        message: settings.maintenance.message || 'Store is under maintenance — please try again soon.',
      });
    }

    const divisionKey = String(shipping.division).toLowerCase();
    if (!settings.shipping.divisions.has(divisionKey)) {
      return res.status(400).json({ message: `Unknown division: ${shipping.division}` });
    }

    /* ---- 2. items → server-side price calculation (Phase 4: bundles too) ---- */
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Cart is empty' });
    if (items.some((line) => !line || typeof line !== 'object' || Array.isArray(line))) return res.status(400).json({ message: 'Cart lines must be product or bundle objects' });
    /* audit fix — a crafted 2MB body with thousands of bundle lines used to
       trigger thousands of sequential DB round-trips (cheap DoS on a public
       endpoint). Real carts are nowhere near 50 lines. */
    if (items.length > 50) return res.status(400).json({ message: 'Too many cart lines (max 50)' });
    const productLines = items.filter((i) => !i.bundle);
    const bundleLines = items.filter((i) => i.bundle);
    const slugs = productLines.map((i) => String(i.slug || '').toLowerCase());
    const products = await Product.find({ slug: { $in: slugs }, active: true });
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));

    const orderItems = [];
    let subtotal = 0;
    let bundleSave = 0;
    const soldBundles = []; // [{ bundle, qty }] — sold counter bump after create
    const dealIdx = await dealSvc.activeIndex(); // Phase 8 — one index load per order
    const appliedDeals = new Set(); // attribution → usedCount

    /* bundle lines — expanded server-side at allocated bundle pricing */
    for (const line of bundleLines) {
      const ex = await expandBundle(line);
      if (ex.error) return res.status(ex.error[0]).json({ message: ex.error[1] });
      orderItems.push(...ex.items);
      subtotal += Math.round(+ex.bundle.bundlePrice * ex.qty * 100) / 100;
      bundleSave += ex.save;
      soldBundles.push({ bundle: ex.bundle, qty: ex.qty });
    }

    for (const line of productLines) {
      const p = bySlug[String(line.slug || '').toLowerCase()];
      if (!p) return res.status(400).json({ message: `Product not available: ${line.slug}` });
      const n = Number(line.qty);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        return res.status(400).json({ message: `Invalid quantity for ${p.name} (must be 1–99)` });
      }
      const qty = n;
      /* Phase 8 — the deal engine joins the order-time price rule:
         min(base/size, flash, deal) — exactly what the storefront showed. */
      const resolved = dealSvc.linePriceFor(p, line.size, dealIdx);
      const unit = resolved.unit;
      const lineTotal = Math.round(unit * qty * 100) / 100;
      subtotal += lineTotal;
      const item = {
        product: p._id, name: p.name, nameBn: p.nameBn || '', // Task 58 — Bengali name snapshot
        slug: p.slug,
        image: p.images[0]?.url || '', price: unit, qty,
        color: line.color || undefined, size: line.size || undefined, lineTotal,
      };
      if (resolved.winner && resolved.winner.deal) {
        const wd = resolved.winner.deal;
        item.deal = { slug: wd.slug, name: wd.name, kind: wd.type };
        appliedDeals.add(wd.slug);
      }
      orderItems.push(item);
      /* BOGO — free units ship as a price-0 line AFTER the paid line (they
         consume stock too; a 0-price item is a real unit, not decoration) */
      if (resolved.winner && resolved.winner.deal && resolved.winner.deal.type === 'bogo') {
        const wd = resolved.winner.deal;
        const free = dealSvc.bogoFreeQty(wd, qty);
        if (free > 0) {
          orderItems.push({
            product: p._id, name: p.name, nameBn: p.nameBn || '',
            slug: p.slug, image: item.image, price: 0, qty: free,
            color: line.color || undefined, size: line.size || undefined, lineTotal: 0,
            dealFree: { deal: wd.slug, name: wd.name, of: p.slug },
          });
        }
      }
    }
    subtotal = Math.round(subtotal * 100) / 100;
    bundleSave = Math.round(bundleSave * 100) / 100;

    /* ---- 3. coupon — scoped math + per-user / first-order rules ---- */
    let discount = 0;
    let appliedCode = null;
    let couponDoc = null;
    if (couponCode) {
      couponDoc = await Coupon.findOne({ code: String(couponCode).toUpperCase().trim() });
      if (!couponDoc) return res.status(400).json({ message: 'Invalid coupon code' });

      /* scoped coupons discount ONLY the eligible lines (server-side truth:
         categories come from the product docs we already fetched; Phase 4 —
         flashLive flags drive the coupon↔flash stacking rule) */
      const couponLines = orderItems.map((i) => ({
        slug: i.slug, category: i.category || bySlug[i.slug]?.category, lineTotal: i.lineTotal,
        flashLive: !i.bundle && flashActive(bySlug[i.slug]),
      }));
      const check = couponDoc.isValidFor(subtotal, couponLines);
      if (!check.ok) return res.status(400).json({ message: check.msg });

      /* per-user limit + first-order-only — identity = account OR checkout
         phone (covers guests and accounts adopted over guest orders) */
      const ident = req.user
        ? { $or: [{ user: req.user._id }, { 'customer.phone': normPhone }] }
        : { 'customer.phone': normPhone };
      if (couponDoc.perUser > 0) {
        const used = await Order.countDocuments({
          'totals.couponCode': couponDoc.code, status: { $ne: 'cancelled' },
          /* audit fix — payment-rejected orders already had their coupon use
             refunded (orderOps.restoreStock decrements usedCount); counting
             them blocked customers from re-using a per-user coupon */
          'payment.status': { $ne: 'rejected' }, ...ident,
        });
        if (used >= couponDoc.perUser) {
          return res.status(409).json({ message: `You have already used this coupon (${couponDoc.perUser}× max)` });
        }
      }
      if (couponDoc.firstOrderOnly) {
        const prior = await Order.countDocuments({ status: { $ne: 'cancelled' }, 'payment.status': { $ne: 'rejected' }, ...ident });
        if (prior > 0) return res.status(409).json({ message: 'This coupon is valid on your first order only' });
      }

      discount = couponDoc.discountFor(subtotal, couponLines);
      appliedCode = couponDoc.code;
    }

    /* ---- 3a. Task 56-a — loyalty redemption ----
       Validated against the FRESH balance, then debited ATOMICALLY before the
       order is created (a lost race responds 409, nothing half-applied). If
       the order creation fails below, the catch credits the points back. */
    let pointsRedeemed = 0;
    let pointsDiscount = 0;
    if (req.user && Number(redeemPoints) > 0) {
      const fresh = await User.findById(req.user._id);
      const v = await loyaltyEngine.validateRedemption(fresh, redeemPoints, subtotal);
      if (!v.ok) return res.status(400).json({ message: v.message });
      const debited = await loyaltyEngine.debitPoints(req.user._id, v.points, {
        note: 'Checkout redemption', by: 'customer',
      });
      if (!debited) return res.status(409).json({ message: 'Points balance changed — please refresh and try again' });
      pointsRedeemed = v.points;
      pointsDiscount = v.discount;
    }

    /* ---- 4. division-wise shipping ---- */
    const shipCharge = settings.shipping.divisions.get(divisionKey) || 0;
    const freeAt = settings.shipping.freeThreshold;
    const payable = Math.round((subtotal - discount - pointsDiscount) * 100) / 100;
    const shippingCost = payable >= freeAt ? 0 : shipCharge;
    const grandTotal = Math.round((payable + shippingCost) * 100) / 100;

    /* ---- 5. payment method + manual proof ---- */
    const method = String(paymentMethod || '').toLowerCase();
    if (!['bkash', 'nagad', 'rocket', 'cod', 'sslcommerz'].includes(method)) {
      return res.status(400).json({ message: 'paymentMethod must be bkash | nagad | rocket | cod | sslcommerz' });
    }

    /* sslcommerz (Task 40) — the gateway itself must be live, otherwise the
       storefront would create orders it can never collect money for. */
    if (method === 'sslcommerz') {
      const gw = await Setting.get();
      if (!gw.gateway || !gw.gateway.enabled) {
        return res.status(503).json({ message: 'Online payment is currently unavailable — pick bKash, Nagad, Rocket or Cash on Delivery.' });
      }
    }

    let paymentProof = { url: null, publicId: null, filename: null };
    let cleanTrx = null;

    if (MOBILE_METHODS.includes(method)) {
      cleanTrx = String(trxId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanTrx.length < 6 || cleanTrx.length > 12) {
        return res.status(400).json({ message: 'Transaction ID must be 6-12 letters/digits' });
      }
      // Anti-fraud: one TrxID can only ever be used once per method
      const dup = await Order.findOne({ 'payment.method': method, 'payment.trxId': cleanTrx });
      if (dup) return res.status(409).json({ message: `This ${method.toUpperCase()} TrxID was already used for order ${dup.orderNumber}` });
      if (!req.file) return res.status(400).json({ message: 'Payment screenshot is required' });
      const saved = await saveImage(req.file, 'forged/payment-proofs');
      paymentProof = { ...saved, filename: req.file.originalname };
    }

    /* ---- 6. create order (transactional when possible, race-safe always) ---- */
    const orderDoc = {
      orderNumber: Order.generateOrderNumber(settings.orders && settings.orders.prefix),
      ...(idemKey ? { idemKey } : {}), // absent when unused — null would break the sparse unique index
      user: req.user?._id || null,
      isGuest: !req.user,
      /* audit fix — String() coercions so a hostile JSON body (email: {},
         address: {}, senderNumber: [] …) answers 400 via validation instead
         of crashing into a CastError 500 */
      customer: { name: String(customer.name).trim().slice(0, 80), phone: normPhone, email: String(customer.email || '').toLowerCase().trim().slice(0, 120) },
      shipping: {
        address: String(shipping.address).trim().slice(0, 300), city: String(shipping.city).trim().slice(0, 80), division: divisionKey,
        postal: String(shipping.postal || '').trim().slice(0, 20), notes: String(shipping.notes || '').trim().slice(0, 300),
      },
      items: orderItems,
      totals: { subtotal, discount, couponCode: appliedCode, shipping: shippingCost, grandTotal, bundleSave, pointsRedeemed, pointsDiscount },
      payment: {
        method, trxId: cleanTrx, senderNumber: senderNumber ? String(senderNumber).trim().slice(0, 20) || null : null,
        screenshot: paymentProof, expectedAmount: grandTotal,
        status: method === 'cod' ? 'cod-pending' : 'pending',
      },
      status: method === 'cod' ? 'processing' : 'verifying',
      statusHistory: [{
        status: method === 'cod' ? 'processing' : 'verifying',
        note: method === 'cod'
          ? 'Cash on delivery order placed'
          : method === 'sslcommerz'
            ? 'Order placed — waiting for online payment (SSLCOMMERZ)'
            : 'Order placed — waiting for payment verification',
        at: new Date(), by: 'system',
      }],
    };

    let order;
    try {
      /* coupon consumption must be race-safe too: the $inc only lands while
         the coupon is active, unexpired and under its maxUses — a losing
         concurrent checkout modifies 0 docs and the whole order aborts */
      const consumeCoupon = (session) => Coupon.updateOne(
        {
          _id: couponDoc._id, active: true,
          $and: [
            { $or: [{ maxUses: 0 }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
          ],
        },
        { $inc: { usedCount: 1 } },
        ...(session ? [{ session }] : []),
      ).then((r) => {
        if (r.modifiedCount !== 1) {
          const err = new Error('Coupon usage limit reached — order not placed');
          err.status = 409;
          throw err;
        }
      });

      order = await orderOps.withTx(async (session) => {
        await orderOps.decrementStock(orderItems, session, {
          reason: 'order', orderNumber: orderDoc.orderNumber, // Phase 4 — stock ledger
        }); // atomic, compensates on shortfall
        if (session) {
          const [created] = await Order.create([orderDoc], { session });
          if (couponDoc) await consumeCoupon(session);
          return created;
        }
        /* standalone fallback — a re-submit racing us here loses the idemKey
           race after stock was taken, so hand the stock back and rethrow; a
           coupon losing the maxUses race AFTER create leaves an orphan order
           which is removed before the stock goes back */
        let created = null;
        try {
          const [doc] = await Order.create([orderDoc]);
          created = doc;
          if (couponDoc) await consumeCoupon(null);
          return created;
        } catch (e) {
          if (created) await Order.deleteOne({ _id: created._id }).catch(() => {});
          await orderOps.giveBack(orderItems, null, { reason: 'order', orderNumber: orderDoc.orderNumber });
          throw e;
        }
      });
    } catch (e) {
      /* Task 56-a — order did not land: give the redeemed points back */
      if (pointsRedeemed > 0 && req.user) {
        loyaltyEngine.creditPoints(req.user._id, pointsRedeemed, {
          type: 'refund', note: 'Checkout failed — redemption returned', by: 'system',
        }).catch(() => {});
      }
      /* E11000 on the sparse idemKey index = the exact same checkout attempt
         won the race — respond with the winning order instead of an error */
      if (e.code === 11000 || /E11000|duplicate key/i.test(String(e.message))) {
        if (idemKey) {
          const dup = await Order.findOne({ idemKey });
          if (dup) {
            const replayPhone = validBDPhone(customer.phone);
            const samePhone = replayPhone && String(dup.customer?.phone || '') === replayPhone;
            if (samePhone) return res.status(200).json({ order: dup.publicView(), duplicate: true });
            return res.status(200).json({ duplicate: true, orderNumber: dup.orderNumber, status: dup.status, grandTotal: dup.totals?.grandTotal ?? 0 });
          }
        }
        /* audit fix — an E11000 from the new unique TrxID index (concurrent
           reuse of the same mobile-money transaction) must answer 409, not 500 */
        if (cleanTrx) {
          const dupTrx = await Order.findOne({ 'payment.method': method, 'payment.trxId': cleanTrx }).select('orderNumber');
          if (dupTrx) return res.status(409).json({ message: `This ${method.toUpperCase()} TrxID was already used for order ${dupTrx.orderNumber}` });
        }
      }
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }

    /* ---- 7. side effects (email / SMS) — fire & forget, never block ---- */
    sendOrderConfirmation(order).catch(() => {}); // never block the response on email
    orderPlacedSMS(order).catch(() => {});        // SMS hook — dry-run until SMS_PROVIDER is switched on

    /* Phase 4 — bundle sold counters + realtime order rooms (fire & forget) */
    for (const sb of soldBundles) {
      ComboBundle.updateOne({ _id: sb.bundle._id }, { $inc: { sold: sb.qty } }).catch(() => {});
    }
    /* Phase 8 — deal usage attribution (guarded $inc, fire & forget) */
    if (appliedDeals.size) dealSvc.attributeUsage([...appliedDeals]);
    realtime.emitToAdmins('order:updated', {
      orderNumber: order.orderNumber, status: order.status,
      total: order.totals.grandTotal, kind: 'created',
    });
    realtime.emitToOrder(order.orderNumber, 'order:updated', {
      orderNumber: order.orderNumber, status: order.status, kind: 'created',
    });

    /* Task 56-e — low-stock admin bell (fire & forget, 24h throttle) */
    Product.find({ slug: { $in: orderItems.map((i) => i.slug) } })
      .then((docs) => loyaltyEngine.checkStockAlerts(docs))
      .catch(() => {});

    /* Task 36 — admin bell: new order landed */
    notifier.notifyAdmin('order', 'নতুন অর্ডার — ' + order.orderNumber,
      order.customer.name + ' · ' + '৳' + (+order.totals.grandTotal).toLocaleString('en-IN') + ' · ' + order.payment.method.toUpperCase(),
      '/admin/orders');
    res.status(201).json({ order: order.publicView() });
  } catch (e) { next(e); }
};

/**
 * POST /api/orders/preview  { items:[{slug,qty,size}], couponCode?, division }
 * Checkout summary WITHOUT creating an order — the storefront totals box and
 * coupon field call this so the customer sees the REAL server-side numbers
 * (price, discount, division shipping, free-shipping gap) before submitting.
 */
exports.preview = async (req, res, next) => {
  try {
    const { items = [], couponCode, division, redeemPoints } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Cart is empty' });
    if (items.some((line) => !line || typeof line !== 'object' || Array.isArray(line))) return res.status(400).json({ message: 'Cart lines must be product or bundle objects' });
    /* audit fix — same line cap as placeOrder (sequential bundle expansions) */
    if (items.length > 50) return res.status(400).json({ message: 'Too many cart lines (max 50)' });

    const settings = await Setting.get();
    /* Task 57 — maintenance: the totals preview refuses too, so the checkout
       page's very first calc surfaces the closure instead of a surprise 503
       at place-order time */
    if (settings.maintenance && settings.maintenance.enabled) {
      return res.status(503).json({
        code: 'MAINTENANCE_MODE',
        message: settings.maintenance.message || 'Store is under maintenance — please try again soon.',
      });
    }
    const divisionKey = String(division || 'dhaka').toLowerCase();
    if (!settings.shipping.divisions.has(divisionKey)) {
      return res.status(400).json({ message: `Unknown division: ${division}` });
    }

    const productLines = items.filter((i) => !i.bundle);
    const bundleLines = items.filter((i) => i.bundle);
    const slugs = productLines.map((i) => String(i.slug || '').toLowerCase());
    const products = await Product.find({ slug: { $in: slugs }, active: true });
    const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));

    let subtotal = 0;
    let bundleSave = 0;
    const previewLines = []; // scoped coupons need per-line category + total
    const dealIdx = await dealSvc.activeIndex(); // Phase 8 — the preview shows the REAL deal prices

    /* Phase 4 — bundle lines preview (same expansion/alloc as placeOrder) */
    for (const line of bundleLines) {
      const ex = await expandBundle(line);
      if (ex.error) return res.status(ex.error[0]).json({ message: ex.error[1] });
      const bundleSubtotal = Math.round(+ex.bundle.bundlePrice * ex.qty * 100) / 100;
      subtotal += bundleSubtotal;
      bundleSave += ex.save;
      for (const bi of ex.items) {
        previewLines.push({ slug: bi.slug, category: bi.category, lineTotal: bi.lineTotal, flashLive: false });
      }
    }

    for (const line of productLines) {
      const p = bySlug[String(line.slug || '').toLowerCase()];
      if (!p) return res.status(400).json({ message: `Product not available: ${line.slug}` });
      const n = Number(line.qty);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        return res.status(400).json({ message: `Invalid quantity for ${p.name} (must be 1–99)` });
      }
      /* Phase 8 — deal-aware line pricing + BOGO free units in the preview,
         so the checkout totals box is the order's twin, not an estimate */
      const resolved = dealSvc.linePriceFor(p, line.size, dealIdx);
      let lineTotal = Math.round(resolved.unit * n * 100) / 100;
      subtotal += lineTotal;
      previewLines.push({ slug: p.slug, category: p.category, lineTotal, flashLive: resolved.winner?.flash === true });
      if (resolved.winner && resolved.winner.deal && resolved.winner.deal.type === 'bogo') {
        const free = dealSvc.bogoFreeQty(resolved.winner.deal, n);
        if (free > 0) previewLines.push({ slug: p.slug, category: p.category, lineTotal: 0, flashLive: false, bogoFree: free });
      }
    }
    subtotal = Math.round(subtotal * 100) / 100;
    bundleSave = Math.round(bundleSave * 100) / 100;

    let discount = 0;
    let appliedCode = null;
    let couponMessage = null;
    let couponInfo = null;
    if (couponCode) {
      const c = await Coupon.findOne({ code: String(couponCode).toUpperCase().trim() });
      if (!c) { couponMessage = 'Invalid coupon code'; }
      else {
        const check = c.isValidFor(subtotal, previewLines);
        if (!check.ok) { couponMessage = check.msg; }
        else {
          discount = c.discountFor(subtotal, previewLines);
          appliedCode = c.code;
          couponInfo = {
            scoped: !!(c.appliesTo && c.appliesTo.mode !== 'all'),
            usageLeft: c.maxUses > 0 ? Math.max(0, c.maxUses - c.usedCount) : null,
            expiresAt: c.expiresAt,
          };
        }
      }
    }

    const freeAt = settings.shipping.freeThreshold;
    const payable = subtotal - discount;
    const shippingCost = payable >= freeAt ? 0 : (settings.shipping.divisions.get(divisionKey) || 0);
    let grandTotal = Math.round((payable + shippingCost) * 100) / 100;

    /* Task 56-a — loyalty redemption preview (non-fatal: invalid asks simply
       return no redemption so the checkout box keeps painting real totals) */
    let redemption = null;
    if (req.user && Number(redeemPoints) > 0) {
      const fresh = await User.findById(req.user._id);
      const v = await loyaltyEngine.validateRedemption(fresh, redeemPoints, subtotal);
      if (v.ok) {
        const pointsShipping = (subtotal - discount - v.discount) >= freeAt
          ? 0 : (settings.shipping.divisions.get(divisionKey) || 0);
        grandTotal = Math.round((subtotal - discount - v.discount + pointsShipping) * 100) / 100;
        redemption = {
          points: v.points, discount: v.discount, balance: v.balance,
          pointsAfter: Math.max(0, v.balance - v.points),
          pointValue: v.rules.pointValue, minRedeem: v.rules.minRedeem,
        };
      }
    }

    res.json({
      subtotal: Math.round(subtotal * 100) / 100,
      discount,
      couponCode: appliedCode,
      couponMessage,
      couponInfo,
      bundleSave, // Phase 4 — combined combo-bundle savings on this cart
      shipping: shippingCost,
      grandTotal,
      redemption, // Task 56-a — null when nothing valid is being redeemed
      freeShippingRemaining: Math.max(0, Math.round((freeAt - payable) * 100) / 100),
      currency: settings.currency,
    });
  } catch (e) { next(e); }
};

// GET /api/my/orders (auth) — account order history
exports.myOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ items: orders.map((o) => o.publicView()) });
  } catch (e) { next(e); }
};

// GET /api/orders/my/returns (auth) — RMA requests across the account's orders.
// ReturnRequest snapshots carry orderNumber (no user ref), so the account's
// order numbers are resolved first, then the RMA rows are matched on them.
exports.myReturns = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).select('orderNumber').lean();
    const nums = orders.map((o) => o.orderNumber).filter(Boolean);
    const rows = nums.length
      ? await ReturnRequest.find({ orderNumber: { $in: nums } }).sort({ createdAt: -1 }).lean()
      : [];
    res.json({
      items: rows.map((r) => ({
        id: r._id,
        orderNumber: r.orderNumber,
        items: r.items || [],
        reason: r.reason,
        note: r.note,
        status: r.status,
        refundAmount: r.refundAmount || 0,
        resolveNote: r.resolveNote || '',
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt || null,
      })),
    });
  } catch (e) { next(e); }
};

/**
 * GET /api/orders/track/:orderNumber?phone=01XXXXXXXXX
 * Public order tracking — needs the order number + the phone used at checkout
 * (any suffix of the phone with >= 6 digits works, e.g. last 6 digits).
 */
exports.track = async (req, res, next) => {
  try {
    const { order, error } = await gatedOrder(req);
    if (error) return res.status(error[0]).json({ message: error[1] });
    res.json({ order: order.publicView() });
  } catch (e) { next(e); }
};

/**
 * PATCH /api/orders/:orderNumber/cancel  { phone }
 * Customer self-cancellation (Layer 2 #7) — allowed while the order is still
 * verifying / processing / packed. Restores stock + coupon usage exactly once
 * (orderOps.restoreStock is claim-flagged). Admin gets the same treatment via
 * the ERP status endpoint, so both paths are consistent.
 */
exports.cancelByCustomer = async (req, res, next) => {
  try {
    const { order, error } = await gatedOrder(req, { phone: req.body?.phone || req.query.phone });
    if (error) return res.status(error[0]).json({ message: error[1] });

    const cancellable = ['verifying', 'processing', 'packed'];
    if (!cancellable.includes(order.status) || order.stockRestored) {
      return res.status(409).json({ message: `This order can no longer be cancelled — current status: ${order.status}` });
    }

    order.pushHistory('cancelled', 'Cancelled by customer from order tracking', 'customer');
    await order.save();
    await orderOps.restoreStock(order);

    /* Task 56-a — redeemed points come back (exactly once, flag-guarded) */
    if (order.user && order.totals.pointsRedeemed > 0 && !order.pointsRefunded) {
      order.pointsRefunded = true;
      await order.save();
      loyaltyEngine.creditPoints(order.user, order.totals.pointsRedeemed, {
        type: 'refund', note: `Order ${order.orderNumber} cancelled`, orderNumber: order.orderNumber, by: 'system',
      }).catch(() => {});
    }

    sendStatusUpdate(order).catch(() => {});
    statusSMS(order).catch(() => {});
    /* Task 36 — admin bell: customer cancelled */
    notifier.notifyAdmin('cancel', 'কাস্টমার ক্যান্সেল — ' + order.orderNumber,
      order.customer.name + ' · ' + '৳' + (+order.totals.grandTotal).toLocaleString('en-IN') + ' · stock released',
      '/admin/orders');
    res.json({ message: 'Order cancelled — reserved stock released', order: order.publicView() });
  } catch (e) { next(e); }
};

/**
 * GET /api/orders/:orderNumber/invoice.pdf?phone=…
 * PDF invoice (pdfkit). Opened by: tracking page (phone proof), account order
 * history (JWT owner), admin order detail (JWT admin). Streams inline.
 */
exports.invoice = async (req, res, next) => {
  try {
    const { order, error } = await gatedOrder(req);
    if (error) return res.status(error[0]).json({ message: error[1] });
    const pdf = await buildInvoicePdf(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${order.orderNumber}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(pdf);
  } catch (e) { next(e); }
};

/**
 * POST /api/orders/:orderNumber/returns  { phone, items:[{slug,qty}], reason, note }
 * Customer return request (RMA, Layer 3 #12) — delivered orders only, within
 * 7 days of the delivered timestamp, one active request per order.
 */
exports.requestReturn = async (req, res, next) => {
  try {
    const { order, error } = await gatedOrder(req, { phone: req.body?.phone || req.query.phone });
    if (error) return res.status(error[0]).json({ message: error[1] });

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be returned' });
    }
    const deliveredEntry = [...(order.statusHistory || [])].reverse().find((h) => h.status === 'delivered');
    const deliveredAt = deliveredEntry ? deliveredEntry.at : order.createdAt;
    const WINDOW_DAYS = 7;
    if (Date.now() - new Date(deliveredAt).getTime() > WINDOW_DAYS * 864e5) {
      return res.status(400).json({ message: `Return window closed — requests are open for ${WINDOW_DAYS} days after delivery` });
    }
    const active = await ReturnRequest.findOne({ orderNumber: order.orderNumber, status: 'requested' });
    if (active) {
      return res.status(409).json({ message: 'A return request is already open for this order — we will contact you shortly' });
    }

    const REASONS = ReturnRequest.RETURN_REASONS;
    const reason = REASONS.includes(req.body?.reason) ? req.body.reason : 'other';
    const note = String(req.body?.note || '').trim().slice(0, 600);

    /* resolve requested lines against the order snapshot */
    const requested = Array.isArray(req.body?.items) ? req.body.items : [];
    const bySlug = Object.fromEntries((order.items || []).map((i) => [i.slug, i]));
    const lines = [];
    for (const r of requested) {
      const o = bySlug[String(r?.slug || '').toLowerCase()];
      if (!o) return res.status(400).json({ message: `Item not in this order: ${r?.slug}` });
      const q = Number(r.qty) || o.qty;
      if (!Number.isInteger(q) || q < 1 || q > o.qty) {
        return res.status(400).json({ message: `Invalid return quantity for ${o.name} (1–${o.qty})` });
      }
      lines.push({ slug: o.slug, name: o.name, qty: q, price: o.price });
    }
    if (!lines.length) {
      (order.items || []).forEach((o) => lines.push({ slug: o.slug, name: o.name, qty: o.qty, price: o.price }));
    }

    const rr = await ReturnRequest.create({
      order: order._id,
      orderNumber: order.orderNumber,
      customer: { name: order.customer.name, phone: order.customer.phone },
      items: lines,
      reason,
      note,
    });
    /* Task 36 — admin bell: return request */
    notifier.notifyAdmin('return', 'রিটার্ন রিকোয়েস্ট — ' + (order.orderNumber || ''),
      (rr.phone || order.customer?.phone || '') + ' · pickup arranged soon',
      '/admin/returns');
    res.status(201).json({ message: 'Return request submitted — we will call you to arrange pickup', request: rr.publicView() });
  } catch (e) { next(e); }
};
