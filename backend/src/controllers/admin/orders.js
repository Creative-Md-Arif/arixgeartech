/* Phase 4 (4.5) — adminController split: orders. Order management: list/detail/export, payment verify/reject, status, courier, manual orders, returns, analytics. */
const {
  priceFor,
  Order,
  Setting,
  ReturnRequest,
  User,
  sendStatusUpdate,
  statusSMS,
  orderOps,
  courierService,
  notifier,
  realtime,
  loyaltyEngine,
  ADMIN_NAME,
  autoPushIfNeeded,
  cache,
  Product,
} = require('./_shared');

exports.orderList = async (req, res, next) => {
  try {
    const { status, method, payStatus, source, search } = req.query;
    /* audit fix — String()-coerce every query filter (the extended parser
       turns "?status[$ne]=x" into an object; staff-only, but keep the same
       discipline everywhere) */
    const q = {};
    if (status) q.status = String(status);
    if (method) q['payment.method'] = String(method);
    if (payStatus) q['payment.status'] = String(payStatus);
    if (source) q.source = String(source);
    if (search) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ orderNumber: rx }, { 'customer.name': rx }, { 'customer.phone': rx }, { 'payment.trxId': rx }];
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const [items, total] = await Promise.all([
      Order.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email'),
      Order.countDocuments(q),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
};

// GET /api/admin/orders/:id

exports.orderDetail = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ order });
  } catch (e) { next(e); }
};



// GET /api/admin/orders/export.csv — business export (Excel-friendly, ৳ BDT)
// Same filters as orderList; the admin panel passes its current filter string along.

exports.exportOrders = async (req, res, next) => {
  try {
    const { status, method, payStatus, source, search } = req.query;
    const q = {};
    if (status) q.status = String(status);
    if (method) q['payment.method'] = String(method);
    if (payStatus) q['payment.status'] = String(payStatus);
    if (source) q.source = String(source);
    if (search) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ orderNumber: rx }, { 'customer.name': rx }, { 'customer.phone': rx }, { 'payment.trxId': rx }];
    }
    const orders = await Order.find(q).sort({ createdAt: -1 }).limit(5000).populate('user', 'name email');

    const cell = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US');
    const when = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const rows = [[
      'Order No', 'Date (BD)', 'Source', 'Channel', 'Status', 'Payment Method', 'Payment Status', 'TrxID', 'Sender',
      'Customer', 'Phone', 'Email', 'Account', 'Division', 'City', 'Address',
      'Items', 'Qty', 'Subtotal (BDT)', 'Discount (BDT)', 'Coupon', 'Shipping (BDT)', 'Grand Total (BDT)',
      'Courier', 'Consignment', 'Tracking',
    ]];
    for (const o of orders) {
      rows.push([
        o.orderNumber, when(o.createdAt), o.source || 'online', o.channel || '', o.status, o.payment.method, o.payment.status,
        o.payment.trxId || '', o.payment.senderNumber || '',
        o.customer.name, o.customer.phone, o.customer.email || '',
        o.isGuest ? 'Guest' : (o.user && o.user.email ? 'Registered (' + o.user.email + ')' : 'Registered'),
        o.shipping.division, o.shipping.city, o.shipping.address + (o.shipping.postal ? ' - ' + o.shipping.postal : ''),
        o.items.map((i) => `${i.name}${i.size ? ' · ' + i.size : ''}${i.color ? ' · ' + i.color : ''} x${i.qty} @${bdt(i.price)}`).join('; '),
        o.items.reduce((a, i) => a + i.qty, 0),
        o.totals.subtotal, o.totals.discount, o.totals.couponCode || '', o.totals.shipping, o.totals.grandTotal,
        o.courier?.name || '', o.courier?.consignmentNo || '', o.courier?.trackingUrl || '',
      ]);
    }
    // \uFEFF BOM so Excel renders ৳/Bangla correctly; CRLF row endings
    const csv = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forged-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (e) { next(e); }
};

// PATCH /api/admin/orders/:id/verify — mobile payment verified against real statement

exports.verifyPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.payment.method === 'cod') return res.status(400).json({ message: 'COD orders have no online payment to verify' });
    if (order.payment.status === 'verified') return res.status(409).json({ message: 'Already verified' });
    if (order.payment.status === 'rejected') return res.status(409).json({ message: 'Payment was rejected — customer must place a new submission' });

    order.payment.status = 'verified';
    order.payment.verifiedAt = new Date();
    order.payment.verifiedBy = req.user._id;
    order.pushHistory('processing', `Payment verified (${order.payment.method.toUpperCase()} TrxID ${order.payment.trxId})`, ADMIN_NAME(req));
    await order.save();
    sendStatusUpdate(order).catch(() => {});
    statusSMS(order).catch(() => {});
    /* Task 36 — customer bell: payment verified (guests skipped inside notifier) */
    notifier.notifyUser(order.user, 'payment', 'পেমেন্ট ভেরিফাইড ✓ — ' + order.orderNumber,
      order.payment.method.toUpperCase() + ' ' + '৳' + (+order.totals.grandTotal).toLocaleString('en-IN') + ' — অর্ডার এখন processing',
      '/account');
    res.json({ order });
  } catch (e) { next(e); }
};

// PATCH /api/admin/orders/:id/reject  {reason}

exports.rejectPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.payment.method === 'cod') return res.status(400).json({ message: 'COD orders cannot be payment-rejected — cancel instead' });
    if (order.payment.status === 'verified') return res.status(409).json({ message: 'Already verified — cancel the order instead' });
    const reason = (req.body.reason || '').trim() || 'Transaction not found in merchant statement';
    order.payment.status = 'rejected';
    order.payment.rejectReason = reason;
    order.pushHistory('payment-rejected', `Payment rejected: ${reason}`, ADMIN_NAME(req));
    await order.save();
    /* Task 28 — a rejected payment kills the order: give the reserved stock
       (and coupon usage) back exactly once (claim-flagged in orderOps). */
    orderOps.restoreStock(order).catch(() => {});
    sendStatusUpdate(order).catch(() => {});
    statusSMS(order).catch(() => {});
    /* Task 36 — customer bell: payment rejected */
    notifier.notifyUser(order.user, 'payment', 'পেমেন্ট রিজেক্টেড — ' + order.orderNumber,
      reason + ' · নতুন করে পেমেন্ট করতে অর্ডার পেজে যান',
      '/account');
    res.json({ order });
  } catch (e) { next(e); }
};

// PATCH /api/admin/orders/:id/status  {status, note}

exports.updateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const allowed = ['verifying', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'payment-rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const wasAlive = !['cancelled', 'payment-rejected'].includes(order.status);

    // COD cash collection side-effect
    if (status === 'delivered' && order.payment.method === 'cod' && order.payment.status === 'cod-pending') {
      order.payment.status = 'cod-collected';
    }
    order.pushHistory(status, note || '', ADMIN_NAME(req));
    await order.save();

    /* Task 28 — cancel / payment-reject now releases the reserved stock and
       coupon usage exactly once (customer self-cancel shares the same flag). */
    if ((status === 'cancelled' || status === 'payment-rejected') && wasAlive) {
      orderOps.restoreStock(order).catch(() => {});
      /* Task 56-a — redeemed points come back exactly once (flag-guarded) */
      if (order.user && order.totals.pointsRedeemed > 0 && !order.pointsRefunded) {
        order.pointsRefunded = true;
        await order.save();
        loyaltyEngine.creditPoints(order.user, order.totals.pointsRedeemed, {
          type: 'refund', note: `Order ${order.orderNumber} ${status}`, orderNumber: order.orderNumber, by: 'system',
        }).catch(() => {});
      }
    }

    /* Task 28 — optional auto-dispatch: when the courier provider is set with
       autoPushOnShipped, flipping an order to shipped pushes it automatically. */
    if (status === 'shipped') {
      autoPushIfNeeded(order).catch(() => {});
    }

    sendStatusUpdate(order).catch(() => {});
    statusSMS(order).catch(() => {});
    /* Task 36 — customer bell: order status changed (guests skipped inside notifier).
       Task 42 — the title carries the English status word + order number so the
       customer inbox is scannable ("Order ARG-8FK2QA — SHIPPED"). */
    notifier.notifyUser(order.user, 'status', 'Order ' + order.orderNumber + ' — ' + status.toUpperCase(),
      'স্ট্যাটাস এখন ' + status.toUpperCase() + (note ? ' · ' + note : ''),
      '/account');
    /* Phase 4 — Socket.IO order room + admin room live update */
    realtime.emitToOrder(order.orderNumber, 'order:updated', {
      orderNumber: order.orderNumber, status, note: note || '', kind: 'status',
    });
    realtime.emitToAdmins('order:updated', {
      orderNumber: order.orderNumber, status, kind: 'status',
    });
    /* Task 42 — loyalty: delivery awards points exactly once (notify.js guard) */
    if (status === 'delivered') {
      const { awardDeliveryPoints } = require('../services/notify');
      awardDeliveryPoints(order).catch(() => {});
    }
    res.json({ order });
  } catch (e) { next(e); }
};

// PATCH /api/admin/orders/:id/courier  {name, consignmentNo, trackingUrl}

exports.setCourier = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.courier = {
      name: req.body.name || order.courier.name,
      consignmentNo: req.body.consignmentNo || order.courier.consignmentNo,
      trackingUrl: req.body.trackingUrl || order.courier.trackingUrl,
    };
    await order.save();
    res.json({ order });
  } catch (e) { next(e); }
};

/* ================= MANUAL ORDER ENTRY (WhatsApp / phone / inbox) ================= */

const MANUAL_METHODS = ['bkash', 'nagad', 'rocket', 'cod', 'cash', 'bank'];
const MANUAL_CHANNELS = ['WhatsApp', 'Phone', 'Facebook', 'Instagram', 'Walk-in', 'Other'];
const isValidId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));

/**
 * POST /api/admin/orders/manual  (JSON)
 * { customer{name,phone,email?}, shipping{address,city,division,postal?,notes?},
 *   items[{productId, qty, price?, size?, color?}], discount?, shippingCost?,
 *   paymentMethod, paid?, trxId?, senderNumber?, channel?, note? }
 *
 * WhatsApp-এ আসা অর্ডার ERP-তে ম্যানুয়ালি এন্ট্রি — একই Order collection-এ
 * source:'manual' হিসেবে সেভ হয়, তাই ড্যাশবোর্ডের অর্ডার/রেভিনিউ/চার্ট অটো আপডেট হয়।
 *
 * Server-authoritative হিসাব: unit price ডিফল্টে sizePrices/base থেকে নেয়,
 * admin চাইলে per-line override করতে পারে; discount/shipping override সহ।
 */

exports.createManualOrder = async (req, res, next) => {
  try {
    const b = req.body || {};
    const customer = b.customer || {};
    const shipping = b.shipping || {};

    /* ---- 1. customer & shipping validation ---- */
    if (!String(customer.name || '').trim()) return res.status(400).json({ message: 'Customer name is required' });
    const phone = String(customer.phone || '').trim();
    if (!/^01[3-9]\d{8}$/.test(phone.replace(/\D/g, '').replace(/^880/, '0').slice(-11))) {
      return res.status(400).json({ message: 'Valid BD phone required (e.g. 01712345678)' });
    }
    if (!String(shipping.address || '').trim() || !String(shipping.city || '').trim()) {
      return res.status(400).json({ message: 'Address and city are required' });
    }
    const settings = await Setting.get();
    const divisionKey = String(shipping.division || '').toLowerCase();
    if (!settings.shipping.divisions.has(divisionKey)) {
      return res.status(400).json({ message: `Unknown division: ${shipping.division}` });
    }

    /* ---- 2. items → price calculation (admin price override allowed) ---- */
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ message: 'At least one item is required' });
    const products = await Product.find({ _id: { $in: items.map((i) => i.productId).filter(isValidId) } });
    const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let subtotal = 0;
    for (const line of items) {
      const p = byId[String(line.productId || '')];
      if (!p) return res.status(400).json({ message: 'Product not found — refresh the picker and try again' });
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        return res.status(400).json({ message: `Invalid quantity for ${p.name} (1–999)` });
      }
      if (p.stock < qty) return res.status(409).json({ message: `Insufficient stock for ${p.name} (${p.stock} left)` });
      let unit = Number(line.price);
      if (!Number.isFinite(unit) || unit < 0) unit = priceFor(p, line.size); // fallback = size price | base price
      unit = Math.round(unit * 100) / 100;
      const lineTotal = Math.round(unit * qty * 100) / 100;
      subtotal += lineTotal;
      orderItems.push({
        product: p._id, name: p.name, slug: p.slug,
        image: p.images[0]?.url || '', price: unit, qty,
        color: line.color || undefined, size: line.size || undefined, lineTotal,
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    /* ---- 3. discount (manual amount, capped at subtotal) ---- */
    let discount = Number(b.discount);
    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    if (discount > subtotal) discount = subtotal;

    /* ---- 4. shipping: manual override, else division charge + free threshold ---- */
    let shippingCost;
    if (b.shippingCost !== undefined && b.shippingCost !== null && b.shippingCost !== '') {
      shippingCost = Math.max(0, Number(b.shippingCost) || 0);
    } else {
      shippingCost = subtotal - discount >= settings.shipping.freeThreshold
        ? 0
        : (settings.shipping.divisions.get(divisionKey) || 0);
    }
    const grandTotal = Math.round((subtotal - discount + shippingCost) * 100) / 100;

    /* ---- 5. payment method + paid state ---- */
    const method = String(b.paymentMethod || 'cod').toLowerCase();
    if (!MANUAL_METHODS.includes(method)) {
      return res.status(400).json({ message: `paymentMethod must be one of: ${MANUAL_METHODS.join(', ')}` });
    }
    const paid = b.paid === true || b.paid === 'true';
    let cleanTrx = null;
    if (b.trxId) {
      cleanTrx = String(b.trxId).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanTrx.length < 6 || cleanTrx.length > 12) {
        return res.status(400).json({ message: 'TrxID must be 6-12 letters/digits (leave empty for COD/cash)' });
      }
      const dup = await Order.findOne({ 'payment.method': method, 'payment.trxId': cleanTrx });
      if (dup) return res.status(409).json({ message: `This TrxID was already used for order ${dup.orderNumber}` });
    }
    const isCashLike = method === 'cod' || method === 'cash';
    const payStatus = isCashLike ? (paid ? 'cod-collected' : 'cod-pending') : (paid ? 'verified' : 'pending');
    const channel = MANUAL_CHANNELS.includes(b.channel) ? b.channel : 'WhatsApp';

    const initialStatus = paid || isCashLike ? 'processing' : 'verifying';
    const order = await Order.create({
      orderNumber: Order.generateOrderNumber(),
      source: 'manual',
      channel,
      entryBy: req.user._id,
      user: null,
      isGuest: true,
      customer: {
        name: String(customer.name).trim(),
        phone,
        email: String(customer.email || '').toLowerCase().trim(),
      },
      shipping: {
        address: String(shipping.address).trim(),
        city: String(shipping.city).trim(),
        division: divisionKey,
        postal: String(shipping.postal || '').trim(),
        notes: String(shipping.notes || '').trim(),
      },
      items: orderItems,
      totals: { subtotal, discount, couponCode: null, shipping: shippingCost, grandTotal },
      payment: {
        method, trxId: cleanTrx,
        senderNumber: String(b.senderNumber || '').trim() || null,
        screenshot: { url: null, publicId: null, filename: null },
        expectedAmount: grandTotal,
        status: payStatus,
        ...(paid ? { verifiedAt: new Date(), verifiedBy: req.user._id } : {}),
      },
      status: initialStatus,
      statusHistory: [{
        status: initialStatus,
        note: `Manual order — received via ${channel}${paid ? ' · payment marked PAID by ' + ADMIN_NAME(req) : ''}${b.note ? ' · ' + String(b.note).trim() : ''}`,
        at: new Date(),
        by: ADMIN_NAME(req),
      }],
    });

    /* ---- 6. stock side-effect — atomic, same rule as online orders ----
       audit fix — the pre-check + unconditional $inc was check-then-act: two
       concurrent manual entries (or one racing an online checkout) oversold
       and could push stock negative (updateOne bypasses the schema min:0).
       The $gte condition makes each decrement atomic; on a shortfall every
       taken line is given back and the created order is removed. */
    const taken = [];
    let outOfStock = null;
    for (const i of orderItems) {
      const r = await Product.updateOne(
        { _id: i.product, stock: { $gte: i.qty } },
        { $inc: { stock: -i.qty, sold: i.qty } }
      );
      if (r.modifiedCount === 1) taken.push(i);
      else { outOfStock = i; break; }
    }
    if (outOfStock) {
      for (const i of taken) {
        await Product.updateOne({ _id: i.product }, { $inc: { stock: i.qty, sold: -i.qty } }).catch(() => {});
      }
      await order.deleteOne();
      return res.status(409).json({ message: `Insufficient stock for ${outOfStock.name}` });
    }

    res.status(201).json({ order });
  } catch (e) { next(e); }
};

/**
 * PUT /api/admin/orders/:id  (JSON) — edit a MANUAL order (ভুল এন্ট্রি সংশোধন)
 * Same payload shape as POST /orders/manual. Server-authoritative recalc:
 *  - items fully replaced, totals recomputed (size-price fallback + admin override)
 *  - stock/sold reconciled by DELTA vs the original lines (no double-count)
 *  - payment status kept as-is unless method/paid state actually changed
 *    (so fixing an address never downgrades a verified payment)
 *  - while the order is still in verifying/processing the status follows the
 *    new payment state; packed/shipped/etc. are left untouched
 *  - an "Order edited (correction)" entry is appended to statusHistory
 */

exports.updateManualOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.source !== 'manual') {
      return res.status(400).json({ message: 'Only manual orders can be edited — online orders are customer records' });
    }
    if (order.status === 'delivered') {
      return res.status(400).json({ message: 'Delivered orders are final — they cannot be edited' });
    }

    const b = req.body || {};
    const customer = b.customer || {};
    const shipping = b.shipping || {};

    /* ---- 1. customer & shipping validation (same rules as create) ---- */
    if (!String(customer.name || '').trim()) return res.status(400).json({ message: 'Customer name is required' });
    const phone = String(customer.phone || '').trim();
    if (!/^01[3-9]\d{8}$/.test(phone.replace(/\D/g, '').replace(/^880/, '0').slice(-11))) {
      return res.status(400).json({ message: 'Valid BD phone required (e.g. 01712345678)' });
    }
    if (!String(shipping.address || '').trim() || !String(shipping.city || '').trim()) {
      return res.status(400).json({ message: 'Address and city are required' });
    }
    const settings = await Setting.get();
    const divisionKey = String(shipping.division || '').toLowerCase();
    if (!settings.shipping.divisions.has(divisionKey)) {
      return res.status(400).json({ message: `Unknown division: ${shipping.division}` });
    }

    /* ---- 2. items → recalculated totals ---- */
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ message: 'At least one item is required' });
    const products = await Product.find({ _id: { $in: items.map((i) => i.productId).filter(isValidId) } });
    const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));

    const newItems = [];
    let subtotal = 0;
    for (const line of items) {
      const p = byId[String(line.productId || '')];
      if (!p) return res.status(400).json({ message: 'Product not found — refresh the picker and try again' });
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        return res.status(400).json({ message: `Invalid quantity for ${p.name} (1–999)` });
      }
      let unit = Number(line.price);
      if (!Number.isFinite(unit) || unit < 0) unit = priceFor(p, line.size);
      unit = Math.round(unit * 100) / 100;
      const lineTotal = Math.round(unit * qty * 100) / 100;
      subtotal += lineTotal;
      newItems.push({
        product: p._id, name: p.name, slug: p.slug,
        image: p.images[0]?.url || '', price: unit, qty,
        color: line.color || undefined, size: line.size || undefined, lineTotal,
      });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    /* ---- 3. discount ---- */
    let discount = Number(b.discount);
    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    if (discount > subtotal) discount = subtotal;

    /* ---- 4. shipping: explicit value wins, else auto from division + free threshold ---- */
    let shippingCost;
    if (b.shippingCost !== undefined && b.shippingCost !== null && b.shippingCost !== '') {
      shippingCost = Math.max(0, Number(b.shippingCost) || 0);
    } else {
      shippingCost = subtotal - discount >= settings.shipping.freeThreshold
        ? 0
        : (settings.shipping.divisions.get(divisionKey) || 0);
    }
    const grandTotal = Math.round((subtotal - discount + shippingCost) * 100) / 100;

    /* ---- 5. stock reconciliation (delta per product vs original lines) ---- */
    const qtyByProduct = (list) => {
      const m = {};
      for (const i of list) m[String(i.product)] = (m[String(i.product)] || 0) + (i.qty || 0);
      return m;
    };
    const oldQty = qtyByProduct(order.items || []);
    const newQty = qtyByProduct(newItems);
    const delta = {};
    for (const k of new Set([...Object.keys(oldQty), ...Object.keys(newQty)])) {
      const d = (newQty[k] || 0) - (oldQty[k] || 0);
      if (d) delta[k] = d;
    }
    if (Object.keys(delta).length) {
      const deltaIds = Object.keys(delta).filter(isValidId);
      if (deltaIds.length) {
        /* audit fix — same atomic rule as creation: give-backs run first,
           each take is guarded by stock >= delta, and a shortfall rolls back
           every applied delta (no negative stock, no partial edit) */
        const applied = [];
        let short = null;
        for (const k of deltaIds.sort((a, b2) => delta[a] - delta[b2])) {
          const d = delta[k];
          if (d > 0) {
            const r = await Product.updateOne({ _id: k, stock: { $gte: d } }, { $inc: { stock: -d, sold: d } });
            if (r.modifiedCount === 1) applied.push({ k, d });
            else { short = k; break; }
          } else {
            await Product.updateOne({ _id: k }, { $inc: { stock: -d, sold: d } });
            applied.push({ k, d });
          }
        }
        if (short) {
          for (const { k, d } of applied) {
            await Product.updateOne({ _id: k }, { $inc: { stock: d, sold: -d } }).catch(() => {});
          }
          const p = await Product.findById(short).select('name stock');
          return res.status(409).json({ message: `Insufficient stock for ${p ? p.name : 'an item'} (${p ? p.stock : 0} left)` });
        }
      }
    }

    /* ---- 6. payment: keep existing state unless method/paid actually changed ---- */
    const method = String(b.paymentMethod || order.payment.method).toLowerCase();
    if (!MANUAL_METHODS.includes(method)) {
      return res.status(400).json({ message: `paymentMethod must be one of: ${MANUAL_METHODS.join(', ')}` });
    }
    const isCashLike = method === 'cod' || method === 'cash';
    const wasPaid = ['verified', 'cod-collected'].includes(order.payment.status);
    const paid = b.paid === undefined ? wasPaid : (b.paid === true || b.paid === 'true');
    const stateChanged = method !== order.payment.method || paid !== wasPaid;

    let trx = order.payment.trxId;
    if (b.trxId !== undefined) {
      const raw = String(b.trxId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (raw) {
        if (raw.length < 6 || raw.length > 12) {
          return res.status(400).json({ message: 'TrxID must be 6-12 letters/digits (leave empty for COD/cash)' });
        }
        const dup = await Order.findOne({ 'payment.method': method, 'payment.trxId': raw, _id: { $ne: order._id } });
        if (dup) return res.status(409).json({ message: `This TrxID was already used for order ${dup.orderNumber}` });
        trx = raw;
      } else {
        trx = null;
      }
    }

    let payStatus = order.payment.status;
    if (stateChanged) {
      payStatus = isCashLike ? (paid ? 'cod-collected' : 'cod-pending') : (paid ? 'verified' : 'pending');
    }

    const channel = b.channel === undefined ? order.channel
      : (MANUAL_CHANNELS.includes(b.channel) ? b.channel : order.channel);

    /* ---- 7. apply edits ---- */
    order.customer = {
      name: String(customer.name).trim(),
      phone,
      email: String(customer.email || '').toLowerCase().trim(),
    };
    order.shipping = {
      address: String(shipping.address).trim(),
      city: String(shipping.city).trim(),
      division: divisionKey,
      postal: String(shipping.postal || '').trim(),
      notes: String(shipping.notes || '').trim(),
    };
    order.items = newItems;
    order.totals = { subtotal, discount, couponCode: order.totals.couponCode || null, shipping: shippingCost, grandTotal };
    order.channel = channel;
    order.payment.method = method;
    order.payment.trxId = trx;
    if (b.senderNumber !== undefined) order.payment.senderNumber = String(b.senderNumber || '').trim() || null;
    order.payment.status = payStatus;
    order.payment.expectedAmount = grandTotal;
    if (payStatus === 'verified' && !order.payment.verifiedAt) {
      order.payment.verifiedAt = new Date();
      order.payment.verifiedBy = req.user._id;
    } else if (payStatus !== 'verified') {
      order.payment.verifiedAt = undefined;
      order.payment.verifiedBy = undefined;
    }

    /* status follows payment state only while still in the payment-entry stage */
    if (['verifying', 'processing'].includes(order.status)) {
      order.status = (paid || isCashLike) ? 'processing' : 'verifying';
    }

    order.statusHistory.push({
      status: order.status,
      note: `Order edited (correction)${b.note ? ' · ' + String(b.note).trim() : ''}`,
      at: new Date(),
      by: ADMIN_NAME(req),
    });
    await order.save();
    res.json({ order });
  } catch (e) { next(e); }
};

/**
 * DELETE /api/admin/orders/:id — remove a wrong/duplicate entry (any source).
 * Stock + sold are rolled back exactly as they were deducted on creation, so
 * inventory stays correct. Delivered orders are final and cannot be deleted.
 * Dashboard metrics drop automatically (same collection).
 */

exports.deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status === 'delivered') {
      return res.status(400).json({ message: 'Delivered orders are final — they cannot be deleted' });
    }
    /* Task 36 bug fix — cancelled / payment-rejected orders ALREADY had their
       stock restored (orderOps claim flag). Restoring again on delete
       double-counted the stock (whey went 15→16 during QA). */
    if (!order.stockRestored) {
      await Promise.all((order.items || [])
        .filter((i) => i.product && isValidId(i.product))
        .map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.qty, sold: -i.qty } })));
    }
    /* Task 56-a — a deleted order refunds its redeemed points exactly once */
    if (order.user && order.totals.pointsRedeemed > 0 && !order.pointsRefunded) {
      loyaltyEngine.creditPoints(order.user, order.totals.pointsRedeemed, {
        type: 'refund', note: `Order ${order.orderNumber} deleted by admin`, orderNumber: order.orderNumber, by: 'system',
      }).catch(() => {});
    }
    await order.deleteOne();
    res.json({ message: `Order ${order.orderNumber} deleted — stock restored`, orderNumber: order.orderNumber });
  } catch (e) { next(e); }
};

/* ================= SALES REPORT (manual vs online) ================= */

const round2 = (n) => Math.round((+n || 0) * 100) / 100;
/* Dhaka calendar date (YYYY-MM-DD) for a given epoch ms — BDT = UTC+6, no DST */
const dhakaStr = (ms) => new Date(ms + 6 * 3600e3).toISOString().slice(0, 10);

/**
 * shared aggregation for salesReport + salesReportCsv
 * ?granularity=day|month  &from=YYYY-MM-DD &to=YYYY-MM-DD   (Dhaka dates, inclusive)
 * Revenue definition matches the dashboard: grandTotal of orders that are NOT
 * cancelled / payment-rejected. Buckets are Asia/Dhaka calendar days/months.
 */
async function salesData(query) {
  const gran = query.granularity === 'month' ? 'month' : 'day';
  const fmt = gran === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(String(query.from || ''));
  const isTo = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to || ''));
  const fromStr = isDay ? query.from : dhakaStr(Date.now() - 29 * 864e5);
  const toStr = isTo ? query.to : dhakaStr(Date.now());
  if (fromStr > toStr) throw Object.assign(new Error('from must be ≤ to (YYYY-MM-DD)'), { status: 400 });

  const from = new Date(fromStr + 'T00:00:00+06:00');
  const to = new Date(new Date(toStr + 'T00:00:00+06:00').getTime() + 864e5 - 1); // inclusive
  const days = Math.round((to - from) / 864e5) + 1;
  if (gran === 'day' && days > 200) throw Object.assign(new Error('Daily report capped at 200 days — switch to monthly'), { status: 400 });
  if (gran === 'month' && days > 366 * 3) throw Object.assign(new Error('Monthly report capped at 3 years'), { status: 400 });

  const match = { createdAt: { $gte: from, $lte: to }, status: { $nin: ['cancelled', 'payment-rejected'] } };
  const [buckets, methods] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $addFields: { units: { $sum: '$items.qty' } } },
      { $group: {
        _id: { period: { $dateToString: { format: fmt, date: '$createdAt', timezone: 'Asia/Dhaka' } }, source: '$source' },
        orders: { $sum: 1 },
        units: { $sum: '$units' },
        revenue: { $sum: '$totals.grandTotal' },
      } },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$payment.method', orders: { $sum: 1 }, revenue: { $sum: '$totals.grandTotal' } } },
      { $sort: { revenue: -1 } },
    ]),
  ]);

  const blank = () => ({ orders: 0, units: 0, revenue: 0 });
  const byPeriod = {};
  for (const row of buckets) {
    const per = byPeriod[row._id.period] || (byPeriod[row._id.period] = { period: row._id.period, online: blank(), manual: blank() });
    const src = row._id.source === 'manual' ? 'manual' : 'online';
    per[src] = { orders: row.orders, units: row.units, revenue: round2(row.revenue) };
  }

  /* every day/month in the range — empty buckets included so charts don't skip gaps */
  const periods = [];
  if (gran === 'day') {
    const cur = new Date(fromStr + 'T00:00:00Z');
    const end = new Date(toStr + 'T00:00:00Z');
    while (cur <= end) { periods.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
  } else {
    let [y, m] = fromStr.split('-').map(Number);
    const [ey, em] = toStr.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      periods.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
  }
  const series = periods.map((p) => byPeriod[p] || { period: p, online: blank(), manual: blank() });
  const pageRequested = query.page !== undefined || query.limit !== undefined;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 12));
  const pages = Math.max(1, Math.ceil(series.length / limit));
  const effectivePage = Math.min(page, pages);
  const pageSeries = pageRequested ? series.slice((effectivePage - 1) * limit, effectivePage * limit) : series;

  const acc = (k, f) => series.reduce((a, r) => a + f(r[k]), 0);
  const totals = {
    online: { orders: acc('online', (x) => x.orders), units: acc('online', (x) => x.units), revenue: round2(acc('online', (x) => x.revenue)) },
    manual: { orders: acc('manual', (x) => x.orders), units: acc('manual', (x) => x.units), revenue: round2(acc('manual', (x) => x.revenue)) },
  };
  totals.total = {
    orders: totals.online.orders + totals.manual.orders,
    units: totals.online.units + totals.manual.units,
    revenue: round2(totals.online.revenue + totals.manual.revenue),
  };
  totals.avgOrder = totals.total.orders ? round2(totals.total.revenue / totals.total.orders) : 0;
  totals.manualShare = totals.total.revenue ? Math.round((totals.manual.revenue / totals.total.revenue) * 1000) / 10 : 0;

  return {
    meta: { granularity: gran, from: fromStr, to: toStr, buckets: periods.length, page: pageRequested ? effectivePage : 1, limit, pages, total: periods.length, tz: 'Asia/Dhaka' },
    series: pageSeries,
    totals,
    methods: methods.map((m) => ({ method: m._id, orders: m.orders, revenue: round2(m.revenue) })),
  };
}

// GET /api/admin/reports/sales?granularity=day|month&from=&to=

exports.salesReport = async (req, res, next) => {
  try { res.json(await salesData(req.query)); } catch (e) { e.status ? res.status(e.status).json({ message: e.message }) : next(e); }
};

// GET /api/admin/reports/sales.csv?... — Excel-friendly report export (৳ BDT)

exports.salesReportCsv = async (req, res, next) => {
  try {
    const d = await salesData(req.query);
    const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['Period', 'Online Orders', 'Online Revenue (BDT)', 'Manual Orders', 'Manual Revenue (BDT)', 'Total Orders', 'Total Revenue (BDT)']];
    for (const r of d.series) {
      rows.push([
        r.period, r.online.orders, r.online.revenue, r.manual.orders, r.manual.revenue,
        r.online.orders + r.manual.orders, round2(r.online.revenue + r.manual.revenue),
      ]);
    }
    rows.push([]);
    rows.push(['TOTAL', d.totals.online.orders, d.totals.online.revenue, d.totals.manual.orders, d.totals.manual.revenue, d.totals.total.orders, d.totals.total.revenue]);
    rows.push(['Avg Order Value', '', '', '', '', '', d.totals.avgOrder]);
    rows.push(['Manual Share', '', '', '', '', '', d.totals.manualShare + '%']);
    rows.push([]);
    rows.push(['Payment Method', 'Orders', 'Revenue (BDT)']);
    for (const m of d.methods) rows.push([m.method, m.orders, m.revenue]);
    const csv = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="forged-sales-${d.meta.granularity}-${d.meta.from}_${d.meta.to}.csv"`);
    res.status(200).send(csv);
  } catch (e) { e.status ? res.status(e.status).json({ message: e.message }) : next(e); }
};

/* ================= PRODUCT CRUD ================= */

// POST /api/admin/products (multipart: images[])

exports.pushCourier = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (['cancelled', 'payment-rejected'].includes(order.status)) {
      return res.status(400).json({ message: 'Cancelled orders cannot be dispatched' });
    }
    if (order.courier && order.courier.consignmentNo && !req.body?.force) {
      return res.status(409).json({ message: `Already dispatched — consignment ${order.courier.consignmentNo}`, order });
    }
    const result = await courierService.pushToCourier(order);
    if (result.ok && result.consignmentNo) {
      order.courier = {
        name: result.provider,
        consignmentNo: result.consignmentNo,
        trackingUrl: result.trackingUrl || order.courier.trackingUrl || null,
      };
      order.pushHistory(order.status, `Pushed to ${result.provider} — consignment ${result.consignmentNo}`, ADMIN_NAME(req));
      await order.save();
    }
    res.json({ result, order });
  } catch (e) { next(e); }
};

/* ================= RETURN / RMA MANAGEMENT (Task 28 — Layer 3) ================= */

// GET /api/admin/returns?status= — newest first (cap 200)

exports.listReturns = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.status) q.status = req.query.status;
    if (req.query.orderNumber) q.orderNumber = String(req.query.orderNumber).toUpperCase().trim();
    const items = await ReturnRequest.find(q).sort({ createdAt: -1 }).limit(200);
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
};

// PATCH /api/admin/returns/:id  { status: approved|rejected|refunded, note?, refundAmount? }
// On "refunded" the amount is appended to the ORDER's payment.refunds ledger
// (finance reports) and the timeline gets a refund entry.

exports.resolveReturn = async (req, res, next) => {
  try {
    const { status, note, refundAmount } = req.body || {};
    if (!['approved', 'rejected', 'refunded'].includes(status)) {
      return res.status(400).json({ message: 'status must be approved | rejected | refunded' });
    }
    const rr = await ReturnRequest.findById(req.params.id);
    if (!rr) return res.status(404).json({ message: 'Return request not found' });
    if (rr.status === 'refunded') return res.status(409).json({ message: 'This request is already refunded' });
    if (rr.status !== 'requested' && status !== 'refunded') {
      return res.status(409).json({ message: `Request already ${rr.status}` });
    }

    rr.status = status;
    rr.resolveNote = String(note || '').trim().slice(0, 600);
    rr.resolvedBy = ADMIN_NAME(req);
    rr.resolvedAt = new Date();

    if (status === 'refunded') {
      const order = await Order.findById(rr.order);
      if (!order) return res.status(404).json({ message: 'Parent order no longer exists' });
      const amount = Math.max(0, Number(refundAmount) || rr.items.reduce((a, i) => a + i.price * i.qty, 0));
      rr.refundAmount = amount;
      order.payment.refunds = order.payment.refunds || [];
      order.payment.refunds.push({
        amount,
        note: `Return ${rr.reason}${rr.resolveNote ? ' — ' + rr.resolveNote : ''}`.slice(0, 300),
        by: ADMIN_NAME(req),
        at: new Date(),
      });
      order.pushHistory(order.status, `Refund ${amount} issued for return on ${rr.orderNumber}`, ADMIN_NAME(req));
      await order.save();
    }

    await rr.save();
    res.json({ request: rr.publicView() });
  } catch (e) { next(e); }
};

/* ================= ORDER ANALYTICS (Task 28 — Layer 3) ================= */

// GET /api/admin/analytics/orders?days=30
// Funnel (placed → verified → shipped → delivered), COD confirmation rate,
// average fulfillment time, payment rejection reasons, method split, revenue.

exports.orderAnalytics = async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const since = new Date(Date.now() - days * 864e5);
    const live = { status: { $nin: ['cancelled', 'payment-rejected'] } };

    const [statusCounts, payCounts, rejReasons, fulfillment, revenueAgg] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$payment.method', n: { $sum: 1 }, revenue: { $sum: '$totals.grandTotal' } } },
        { $sort: { revenue: -1 } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since }, 'payment.rejectReason': { $nin: [null, ''] } } },
        { $group: { _id: '$payment.rejectReason', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since }, status: 'delivered' } },
        { $project: {
          deliveredAt: {
            $let: {
              vars: { rev: { $arrayElemAt: [{ $filter: { input: '$statusHistory', cond: { $eq: ['$$this.status', 'delivered'] } } }, -1] } },
              in: '$$rev.at',
            },
          },
          createdAt: 1,
        } },
        { $project: { hours: { $divide: [{ $subtract: ['$deliveredAt', '$createdAt'] }, 3600e3] } } },
        { $group: { _id: null, avg: { $avg: '$hours' }, n: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: since }, ...live } },
        { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' }, aov: { $avg: '$totals.grandTotal' }, orders: { $sum: 1 } } },
      ]),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.n]));
    const placed = statusCounts.reduce((a, s) => a + s.n, 0);
    const verified = byStatus.processing + byStatus.packed + byStatus.shipped + byStatus.delivered || 0;
    const delivered = byStatus.delivered || 0;
    const cancelled = (byStatus.cancelled || 0) + (byStatus['payment-rejected'] || 0);

    const byMethod = payCounts.map((m) => ({ method: m._id || 'unknown', orders: m.n, revenue: Math.round(m.revenue * 100) / 100 }));
    const cod = byMethod.find((m) => m.method === 'cod');
    const codDelivered = await Order.countDocuments({
      createdAt: { $gte: since }, 'payment.method': 'cod', status: 'delivered',
    });
    const codRate = cod && cod.orders ? Math.round((codDelivered / cod.orders) * 1000) / 1000 : 0;

    res.json({
      days,
      funnel: {
        placed,
        verified,
        shipped: byStatus.shipped || 0,
        delivered,
        cancelled,
        cancelRate: placed ? Math.round((cancelled / placed) * 1000) / 1000 : 0,
      },
      payment: {
        byMethod,
        codRate,
        rejectReasons: rejReasons.map((r) => ({ reason: r._id, n: r.n })),
      },
      fulfillment: {
        avgHours: fulfillment[0] ? Math.round(fulfillment[0].avg * 10) / 10 : null,
        deliveredCount: fulfillment[0] ? fulfillment[0].n : 0,
      },
      revenue: {
        total: revenueAgg[0] ? Math.round(revenueAgg[0].revenue * 100) / 100 : 0,
        aov: revenueAgg[0] ? Math.round(revenueAgg[0].aov * 100) / 100 : 0,
        orders: revenueAgg[0] ? revenueAgg[0].orders : 0,
      },
    });
  } catch (e) { next(e); }
};

/* ================= LOYALTY MANAGEMENT (Task 56-a) ================= */

/**
 * GET /api/admin/loyalty?q=&sort=points|recent&page= — customer points ledger
 * Returns: points stats (outstanding balance + ৳ value + holders + redeemed 30d)
 * and the customer rows with embedded recent activity.
 */

exports.salesTrend = async (req, res, next) => {
  try {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const since = new Date(Date.now() - days * 864e5);
    const rows = await Order.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $nin: ['cancelled', 'payment-rejected'] } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$totals.grandTotal' },
        orders: { $sum: 1 },
      } },
      { $sort: { _id: 1 } },
    ]);
    /* fill zero days so the line chart never lies about gaps */
    const byDay = Object.fromEntries(rows.map((r) => [r._id, r]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      const r = byDay[d];
      series.push({ date: d, revenue: Math.round((r?.revenue || 0) * 100) / 100, orders: r?.orders || 0 });
    }
    res.json({ days, series, total: Math.round(series.reduce((a, s) => a + s.revenue, 0) * 100) / 100, orders: series.reduce((a, s) => a + s.orders, 0) });
  } catch (e) { next(e); }
};

/* ================= EMAIL TEMPLATE TEST (Task 56-d) ================= */

/**
 * POST /api/admin/email-templates/test — { key, to }
 * Builds the template with dummy data using the CURRENT saved overrides and
 * sends one copy to the admin's own address. keys: orderConfirmation |
 * statusUpdate | passwordReset | emailOtp
 */

module.exports = {
  orderList: exports.orderList,
  orderDetail: exports.orderDetail,
  exportOrders: exports.exportOrders,
  verifyPayment: exports.verifyPayment,
  rejectPayment: exports.rejectPayment,
  updateStatus: exports.updateStatus,
  setCourier: exports.setCourier,
  createManualOrder: exports.createManualOrder,
  updateManualOrder: exports.updateManualOrder,
  deleteOrder: exports.deleteOrder,
  salesReport: exports.salesReport,
  salesReportCsv: exports.salesReportCsv,
  pushCourier: exports.pushCourier,
  listReturns: exports.listReturns,
  resolveReturn: exports.resolveReturn,
  orderAnalytics: exports.orderAnalytics,
  salesTrend: exports.salesTrend,
};
