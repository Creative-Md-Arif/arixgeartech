/* Phase 4 (4.5) — shared imports + helpers for the admin/* controller split.
   ONE dependency graph, four focused modules; adminController.js is the barrel. */
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Setting = require('../../models/Setting');
const ReturnRequest = require('../../models/ReturnRequest');
const Brand = require('../../models/Brand');       // Phase 2 — v2 catalog brand ref
const Category = require('../../models/Category'); // Phase 2 — v2 catalog tree
const { saveImage, deleteImage } = require('../../services/storageService');
const { sendStatusUpdate } = require('../../services/emailService');
const { statusSMS } = require('../../services/smsService');
const { autoNotifyProduct } = require('../../services/googleApi');
const cache = require('../../services/cache');
const orderOps = require('../../services/orderOps');
const courierService = require('../../services/courierService');
const { normalizeProductGuide } = require('../../utils/sizeGuide');
const notifier = require('../../services/notifier'); // Task 36 — in-app bell
const realtime = require('../../services/realtime'); // Phase 4 — Socket.IO gateway
const loyaltyEngine = require('../../services/loyalty');   // Task 56-a
const LoyaltyLog = require('../../models/LoyaltyLog');     // Task 56-a
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Phase 2 (v2 catalog) — helpers shared by product create/update.
   resolveCatRefs: category slug → { categoryRef, categoryPath } from the tree.
   resolveBrand: body.brandId (Mongo id) or body.brandSlug → Brand _id | null.
   warrantyFromPayload: {months, type, note} JSON/string → normalized block.
   skuFrom: explicit SKU else ARG- + 8 hex chars (collision-safe retry). */
async function resolveCatRefs(slug) {
  const c = await Category.findOne({ slug: String(slug || '').toLowerCase().trim() }).select('_id path slug').lean();
  if (!c) return { categoryRef: null, categoryPath: [] };
  return { categoryRef: c._id, categoryPath: (c.path && c.path.length ? c.path : [c.slug]) };
}
async function resolveBrand(b) {
  if (b.brandId && b.brandId !== 'none' && b.brandId !== '') return b.brandId;
  if (b.brandSlug && b.brandSlug !== 'none') {
    const doc = await Brand.findOne({ slug: slugify(b.brandSlug) }).select('_id').lean();
    return doc ? doc._id : null;
  }
  return null; // 'none' / empty → no brand
}
function warrantyFromPayload(b) {
  if (b.warranty === undefined) return undefined; // untouched
  let w = b.warranty;
  if (typeof w === 'string') { try { w = JSON.parse(w); } catch { w = {}; } }
  const months = Math.max(0, Math.min(240, parseInt(w && w.months, 10) || 0));
  const type = ['manufacturer', 'seller', 'service', 'none'].includes(w && w.type) ? w.type : 'manufacturer';
  return { months: type === 'none' ? 0 : months, type, note: String((w && w.note) || '').trim().slice(0, 300) };
}
async function skuFor(explicit, excludeId) {
  const clean = String(explicit || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
  if (clean) {
    const dupe = await Product.findOne({ sku: clean, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('_id').lean();
    if (dupe) throw Object.assign(new Error(`SKU "${clean}" is already in use`), { status: 409 });
    return clean;
  }
  for (let i = 0; i < 5; i++) {
    const cand = 'ARG-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const dupe = await Product.findOne({ sku: cand }).select('_id').lean();
    if (!dupe) return cand;
  }
  return null;
}

/* Task 32 — product form ships sizeGuide as a JSON string (multipart body).
   Returns { skip } when absent, { error, status } on invalid input,
   { guide } with the normalized block otherwise. */
const guideFromPayload = (b, prev) => {
  if (b.sizeGuide === undefined) return { skip: true };
  let g = b.sizeGuide;
  if (typeof g === 'string') {
    try { g = JSON.parse(g); } catch (e) { return { error: 'sizeGuide must be valid JSON', status: 400 }; }
  }
  const n = normalizeProductGuide(g, prev);
  if (n.error) return { error: n.error, status: 400 };
  return { guide: n.guide };
};

/* Size-based pricing: sizePrices entry wins over base price (shared logic
   with the storefront orderController — mirrored here for manual entries). */
const priceFor = (p, size) => {
  if (size && Array.isArray(p.sizePrices)) {
    const hit = p.sizePrices.find((v) => String(v.s) === String(size));
    if (hit && +hit.price > 0) return +hit.price;
  }
  return +p.price || 0;
};

/* ================= DASHBOARD ================= */

// GET /api/admin/stats
const ADMIN_NAME = (req) => req.user?.name || 'admin';

/* autoPushIfNeeded — courier auto-dispatch used by order status flips */
async function autoPushIfNeeded(order) {
  try {
    const s = await Setting.get();
    const c = s.courier || {};
    if (!c.autoPushOnShipped || c.provider === 'none') return;
    if (order.courier && order.courier.consignmentNo) return;
    const r = await courierService.pushToCourier(order);
    if (r.ok && r.consignmentNo) {
      await Order.updateOne(
        { _id: order._id },
        { $set: { courier: { name: r.provider, consignmentNo: r.consignmentNo, trackingUrl: r.trackingUrl || null } } }
      );
    }
  } catch (_e) { /* never break the status update */ }
}

// POST /api/admin/orders/:id/courier/push — manual "Push to Courier" ERP button.
// Creates the consignment at the configured provider; on success the courier
// block + status timeline are updated and the result is returned verbatim.

module.exports = {
  Order,
  Product,
  User,
  Setting,
  ReturnRequest,
  Brand,
  Category,
  saveImage,
  deleteImage,
  sendStatusUpdate,
  statusSMS,
  autoNotifyProduct,
  cache,
  orderOps,
  courierService,
  normalizeProductGuide,
  notifier,
  realtime,
  loyaltyEngine,
  LoyaltyLog,
  slugify,
  resolveCatRefs,
  resolveBrand,
  warrantyFromPayload,
  skuFor,
  guideFromPayload,
  priceFor,
  ADMIN_NAME,
  autoPushIfNeeded,
};
