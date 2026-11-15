/* Phase 4 (4.5) — adminController split: system. System: dashboard stats, global search, backup, uploads, email template test. */
const {
  Category,
  sendStatusUpdate,
  LoyaltyLog,
  Order,
  Product,
  User,
  Setting,
  ReturnRequest,
  saveImage,
  deleteImage,
  notifier,
  cache,
  orderOps,
} = require('./_shared');

exports.stats = async (_req, res, next) => {
  try {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    /* Task 57 — SLA breaches: live (not yet shipped) orders older than 24h.
       'verifying' | 'processing' | 'packed' all mean the parcel has not left. */
    const SLA_WINDOW_MS = 24 * 3600e3;
    const unshippedFilter = { status: { $in: ['verifying', 'processing', 'packed'] }, createdAt: { $lt: new Date(Date.now() - SLA_WINDOW_MS) } };

    const [todayOrders, todayRevenueAgg, todayManual, statusCounts, lowStock, weekAgg, topProducts, mostViewed, slaBreachCount, slaBreaches] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfToday }, status: { $nin: ['cancelled', 'payment-rejected'] } } },
        { $group: { _id: null, total: { $sum: '$totals.grandTotal' } } },
      ]),
      /* manual (WhatsApp/phone) vs online split — dashboard subtitle */
      Order.countDocuments({ createdAt: { $gte: startOfToday }, source: 'manual' }),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Product.find({ stock: { $lte: 5 }, active: true }).select('name stock slug').limit(10),
      Order.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 864e5) }, status: { $nin: ['cancelled', 'payment-rejected'] } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$totals.grandTotal' }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Product.find().sort({ sold: -1 }).limit(5).select('name sold stock price slug'),
      /* Task 27 — catalog view counter (PDP opens) */
      Product.find({ views: { $gt: 0 } }).sort({ views: -1 }).limit(5).select('name views slug'),
      Order.countDocuments(unshippedFilter),
      Order.find(unshippedFilter).sort({ createdAt: 1 }).limit(5).select('orderNumber createdAt status customer totals.grandTotal source').lean(),
    ]);

    const counts = Object.fromEntries(statusCounts.map((s) => [s._id, s.n]));
    res.json({
      todayOrders,
      todayManual,
      todayOnline: Math.max(0, todayOrders - todayManual),
      todayRevenue: todayRevenueAgg[0]?.total || 0,
      verifying: counts.verifying || 0,
      processing: counts.processing || 0,
      shipped: counts.shipped || 0,
      delivered: counts.delivered || 0,
      codPending: (counts.processing || 0),
      statusCounts: counts,
      week: weekAgg,
      lowStock,
      topProducts,
      mostViewed,
      slaBreachCount,
      slaBreaches: slaBreaches.map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        status: o.status,
        source: o.source,
        customer: o.customer && o.customer.name ? o.customer.name : '',
        total: o.totals ? o.totals.grandTotal : 0,
        hours: Math.max(0, Math.round((Date.now() - +new Date(o.createdAt)) / 3600e3)),
      })),
      slaHours: 24,
    });
  } catch (e) { next(e); }
};

/* ================= GLOBAL SEARCH (Task 57 — ⌘K command palette) ================= */

// GET /api/admin/search?q= — one call, three domains: orders (number/phone/name),
// products (name/slug/category), customers (name/email/phone). Regex-escaped,
// capped at 5 per group, staff-wide like /stats (all admin JWTs).

exports.globalSearch = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ q, orders: [], products: [], customers: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    /* audit fix — the customers leg carries name/email/phone + CRM tags; it is
       now served only to staff holding the `customers` module. Others still
       get the orders/products legs that every staff member needs. */
    const canCustomers = req.user.role === 'admin' || (req.user.permissions || []).includes('customers');
    const [orders, products, customers] = await Promise.all([
      Order.find({ $or: [{ orderNumber: rx }, { 'customer.phone': rx }, { 'customer.name': rx }] })
        .sort({ createdAt: -1 }).limit(5)
        .select('orderNumber status customer.name customer.phone totals.grandTotal createdAt').lean(),
      Product.find({ $or: [{ name: rx }, { slug: rx }, { category: rx }] })
        .sort({ sold: -1 }).limit(5).select('name slug price stock active images').lean(),
      canCustomers
        ? User.find({ role: 'customer', $or: [{ name: rx }, { email: rx }, { phone: rx }] })
          .sort({ createdAt: -1 }).limit(5).select('name email phone adminTags').lean()
        : Promise.resolve([]),
    ]);
    res.json({ q, orders, products, customers });
  } catch (e) { next(e); }
};

/* ================= ORDER MANAGEMENT ================= */

// GET /api/admin/orders?status=&method=&payStatus=&source=&search=&page=

exports.backupDatabase = async (_req, res, next) => {
  try {
    const caps = { auditLogs: 2000, gscLogs: 1000, notifications: 500 };
    const sets = {
      users: require('../models/User'), products: Product, orders: Order,
      coupons: require('../models/Coupon'), categories: require('../models/Category'),
      badges: require('../models/Badge'), banners: require('../models/Banner'),
      reviews: require('../models/Review'), questions: require('../models/Question'),
      returns: require('../models/ReturnRequest'),
      messages: require('../models/ContactMessage'),
      posts: require('../models/Post'), homeSections: require('../models/HomeSection'),
      notifications: require('../models/Notification'), seo: require('../models/Seo'),
      settings: require('../models/Setting'), loyaltyLogs: require('../models/LoyaltyLog'),
      auditLogs: require('../models/AuditLog'), gscLogs: require('../models/GscLog'),
    };
    const collections = {};
    const counts = {};
    /* audit fix — owner-only backup must not carry live secrets/password
       hashes in a plain JSON download; masked placeholders keep the shape */
    const STRIP = '***backup-omitted***';
    const sanitize = (name, docs) => {
      if (name === 'users') {
        return docs.map((d) => ({ ...d, password: STRIP, resetTokenHash: undefined, emailOtpHash: undefined }));
      }
      if (name === 'settings') {
        return docs.map((d) => ({
          ...d,
          gateway: d.gateway ? { ...d.gateway, storePasswd: d.gateway.storePasswd ? STRIP : '' } : d.gateway,
          courier: d.courier ? {
            ...d.courier,
            steadfast: { ...(d.courier.steadfast || {}), apiKey: d.courier.steadfast?.apiKey ? STRIP : '', secretKey: d.courier.steadfast?.secretKey ? STRIP : '' },
            pathao: { ...(d.courier.pathao || {}), clientId: d.courier.pathao?.clientId ? STRIP : '', clientSecret: d.courier.pathao?.clientSecret ? STRIP : '', password: d.courier.pathao?.password ? STRIP : '' },
          } : d.courier,
          push: d.push ? { ...d.push, vapidPrivate: d.push.vapidPrivate ? STRIP : '' } : d.push,
        }));
      }
      return docs;
    };
    for (const [name, M] of Object.entries(sets)) {
      let q = M.find().lean();
      if (caps[name]) q = q.sort({ createdAt: -1 }).limit(caps[name]);
      const docs = await q;
      collections[name] = sanitize(name, docs);
      counts[name] = docs.length;
    }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="arixgear-backup-' + stamp + '.json"');
    res.json({ meta: { at: new Date().toISOString(), counts, capped: caps }, collections });
  } catch (e) { next(e); }
};

/* ================= FILE UPLOAD ================= */

// POST /api/admin/uploads (single image) — used by admin panel image pickers

exports.uploadImage = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image received' });
    const saved = await saveImage(req.file, 'forged/uploads');
    res.status(201).json({ image: saved });
  } catch (e) { next(e); }
};

/* ================= COURIER DISPATCH (Task 28 — Layer 3) ================= */

/* Fire-and-forget auto-push when an order flips to "shipped" with the
   autoPushOnShipped setting enabled and no consignment yet. */

exports.emailTemplateTest = async (req, res, next) => {
  try {
    const key = String(req.body?.key || '');
    const to = String(req.body?.to || '').trim();
    if (!['orderConfirmation', 'statusUpdate', 'passwordReset', 'emailOtp'].includes(key)) {
      return res.status(400).json({ message: 'key must be orderConfirmation | statusUpdate | passwordReset | emailOtp' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ message: 'Valid target email required' });
    const emailService = require('../services/emailService');
    const dummyOrder = {
      orderNumber: 'ARG-TEST01',
      customer: { name: 'Test Customer', email: to },
      items: [{ name: 'ArixGear 65W GaN Charger', size: '2kg', qty: 1, price: 4500, lineTotal: 4500 }],
      totals: { subtotal: 4500, discount: 0, couponCode: null, shipping: 60, grandTotal: 4560 },
      payment: { method: 'cod' },
      status: 'processing',
      courier: { name: 'Steadfast', consignmentNo: 'TEST123' },
    };
    let out;
    if (key === 'orderConfirmation') out = await emailService.sendOrderConfirmation(dummyOrder);
    else if (key === 'statusUpdate') out = await emailService.sendStatusUpdate(dummyOrder);
    else if (key === 'passwordReset') out = await emailService.sendPasswordReset({ to, name: 'Test Customer', resetUrl: 'https://arixgear.tech/reset-password?token=TEST', minutes: 15 });
    else out = await emailService.sendEmailOtp({ to, name: 'Test Customer', code: '123456', minutes: 10 });
    res.json({ message: out && out.sent === false ? `Test email NOT sent — ${out.reason || 'mail provider dry-run'}` : 'Test email sent', detail: out });
  } catch (e) { next(e); }
};

module.exports = {
  stats: exports.stats,
  globalSearch: exports.globalSearch,
  backupDatabase: exports.backupDatabase,
  uploadImage: exports.uploadImage,
  emailTemplateTest: exports.emailTemplateTest,
};
