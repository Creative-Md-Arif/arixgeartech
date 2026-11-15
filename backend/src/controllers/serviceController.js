const WarrantyRegistration = require('../models/WarrantyRegistration');
const ServiceTicket = require('../models/ServiceTicket');
const ServiceCenter = require('../models/ServiceCenter');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { saveImage, deleteImage } = require('../services/storageService');
const { sendEmail } = require('../services/emailService');
const { render } = require('../services/templates');
const notifier = require('../services/notifier');
const realtime = require('../services/realtime');
const { validBDPhone } = require('../utils/phone');

/* Phase 4 (4.2) — after-sales suite.
   Public:  POST /api/service/warranty            → register a warranty (order + phone proof)
            GET  /api/service/warranty/:regNumber → lookup (phone suffix ≥ 6 digits)
            POST /api/service/tickets             → open a ticket (complaint/service)
            GET  /api/service/tickets/:ticketNumber?phone= → public tracking
            GET  /api/service/centers             → active service centers
   Admin:   /api/admin/warranty, /api/admin/tickets, /api/admin/service-centers  */

/* ---------- helpers ---------- */

function pickProductFromOrder(order, wantedSlug) {
  const items = order.items || [];
  if (wantedSlug) {
    const hit = items.find((i) => String(i.slug).toLowerCase() === String(wantedSlug).toLowerCase());
    if (hit) return hit;
  }
  return items.length >= 1 ? items[0] : null; // single-item order → implicit pick
}

/* ---------- warranty: public ---------- */

/**
 * POST /api/service/warranty
 * { orderNumber, phone, serial?, email?, productSlug?, notes?, purchaseDate? }
 * Proof = the order exists + phone matches the checkout phone. Warranty length
 * comes from the PRODUCT doc (Product.warranty.months, Phase 2) — not the client.
 */
exports.registerWarranty = async (req, res, next) => {
  try {
    const b = req.body || {};
    const orderNumber = String(b.orderNumber || '').toUpperCase().trim();
    const phone = validBDPhone(b.phone);
    if (!orderNumber || !phone) {
      return res.status(400).json({ message: 'Order number and the checkout phone are required' });
    }
    const order = await Order.findOne({ orderNumber });
    if (!order) return res.status(404).json({ message: 'No order found with this number' });
    if (String(order.customer.phone).replace(/\D/g, '') !== phone) {
      return res.status(403).json({ message: 'Phone does not match this order' });
    }

    const item = pickProductFromOrder(order, b.productSlug);
    if (!item) return res.status(400).json({ message: 'That product is not on this order' });

    const dupe = await WarrantyRegistration.findOne({ orderNumber, product: item.product });
    if (dupe) {
      return res.status(409).json({ message: `Already registered — your warranty number is ${dupe.regNumber}`, regNumber: dupe.regNumber });
    }

    const prod = await Product.findById(item.product).select('name slug sku warranty');
    const months = Math.max(0, Math.min(240, +prod?.warranty?.months || 0)); // audit fix — 240 aligns with Product.warranty cap
    if (!months) {
      return res.status(400).json({ message: 'This product carries no registrable warranty' });
    }

    const purchaseDate = b.purchaseDate && !Number.isNaN(+new Date(b.purchaseDate))
      ? new Date(b.purchaseDate)
      : (order.deliveredAt || order.updatedAt || order.createdAt);
    const expiresAt = new Date(purchaseDate);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const doc = await WarrantyRegistration.create({
      regNumber: WarrantyRegistration.generateRegNumber(),
      product: prod._id, productName: prod.name, productSlug: prod.slug, sku: prod.sku || '',
      order: order._id, orderNumber,
      customer: {
        name: order.customer.name, phone,
        email: String(b.email || order.customer.email || '').toLowerCase().trim(),
      },
      serial: String(b.serial || '').toUpperCase().trim().slice(0, 40),
      purchaseDate, warrantyMonths: months, expiresAt,
      notes: String(b.notes || '').trim().slice(0, 500),
    });

    /* fire & forget: confirmation email from the admin-editable template */
    render('warranty-registered', {
      name: doc.customer.name, regNumber: doc.regNumber,
      productName: doc.productName, expiresAt: doc.expiresAt.toISOString().slice(0, 10),
    }).then((t) => {
      if (doc.customer.email && t.subject) {
        sendEmail(doc.customer.email, t.subject, `<p>${t.body}</p>`).catch(() => {});
      }
    }).catch(() => {});

    res.status(201).json({ registration: doc.publicView() });
  } catch (e) { next(e); }
};

/* GET /api/service/warranty/:regNumber?phone=… (suffix ≥ 6 digits) */
exports.lookupWarranty = async (req, res, next) => {
  try {
    const reg = await WarrantyRegistration.findOne({ regNumber: String(req.params.regNumber || '').toUpperCase().trim() });
    if (!reg) return res.status(404).json({ message: 'No warranty found with this number' });
    const phone = String(req.query.phone || '').replace(/\D/g, '');
    if (phone.length < 6 || !String(reg.customer.phone).replace(/\D/g, '').endsWith(phone)) {
      return res.status(403).json({ message: 'Provide the registered phone (at least last 6 digits)' });
    }
    res.json({ registration: reg.publicView() });
  } catch (e) { next(e); }
};

/* ---------- tickets: public ---------- */

exports.createTicket = async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const phone = validBDPhone(b.phone);
    const subject = String(b.subject || '').trim();
    const description = String(b.description || '').trim();
    const category = ['complaint', 'service', 'warranty-claim', 'return', 'general'].includes(b.category) ? b.category : 'complaint';
    if (!name || !phone || !subject || !description) {
      return res.status(400).json({ message: 'Name, phone, subject and description are required' });
    }
    if (description.length < 10) return res.status(400).json({ message: 'Please describe the issue in at least 10 characters' });

    /* optional bindings are verified when present */
    let orderNumber = String(b.orderNumber || '').toUpperCase().trim();
    if (orderNumber) {
      const order = await Order.findOne({ orderNumber }).select('customer user');
      if (!order) return res.status(404).json({ message: 'No order found with this number' });
      if (String(order.customer.phone).replace(/\D/g, '') !== phone) {
        return res.status(403).json({ message: 'Phone does not match this order' });
      }
    } else orderNumber = '';

    let warrantyRegNumber = null;
    if (b.warrantyRegNumber) {
      const w = await WarrantyRegistration.findOne({ regNumber: String(b.warrantyRegNumber).toUpperCase().trim() });
      if (w) {
        if (String(w.customer.phone).replace(/\D/g, '') !== phone) {
          return res.status(403).json({ message: 'Phone does not match this warranty registration' });
        }
        warrantyRegNumber = w.regNumber;
      }
    }

    /* optional attachments (max 3, reuse the storage pipeline) */
    const attachments = [];
    for (const f of (req.files || []).slice(0, 3)) {
      const saved = await saveImage(f, 'arix/service-tickets');
      attachments.push({ ...saved, filename: f.originalname });
    }

    const doc = await ServiceTicket.create({
      ticketNumber: ServiceTicket.generateTicketNumber(),
      customer: { name, phone, email: String(b.email || '').toLowerCase().trim() },
      user: req.user?._id || null,
      category, subject, description,
      orderNumber,
      productSlug: String(b.productSlug || '').toLowerCase().trim(),
      productName: String(b.productName || '').trim().slice(0, 160),
      warrantyRegNumber,
      attachments,
      priority: ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium',
      timeline: [{ status: 'open', note: 'Ticket opened by the customer', at: new Date(), by: 'customer' }],
    });

    /* admin bell + socket room + confirmation email (fire & forget) */
    notifier.notifyAdmin('message', `নতুন সার্ভিস টিকিট — ${doc.ticketNumber}`,
      `${doc.category.toUpperCase()} · ${doc.subject} · ${doc.customer.name}`, '/admin/service/tickets');
    realtime.emitToAdmins('ticket:updated', { ticketNumber: doc.ticketNumber, status: doc.status, kind: 'created' });
    render('ticket-created', { name, ticketNumber: doc.ticketNumber, category })
      .then((t) => {
        const email = doc.customer.email;
        if (email && t.subject) sendEmail(email, t.subject, `<p>${t.body}</p>`).catch(() => {});
      }).catch(() => {});

    res.status(201).json({ ticket: doc.publicView() });
  } catch (e) { next(e); }
};

/* GET /api/service/tickets/:ticketNumber?phone=… */
exports.trackTicket = async (req, res, next) => {
  try {
    const t = await ServiceTicket.findOne({ ticketNumber: String(req.params.ticketNumber || '').toUpperCase().trim() });
    if (!t) return res.status(404).json({ message: 'No ticket found with this number' });
    const isOwner = req.user && t.user && String(t.user) === String(req.user._id);
    const phone = String(req.query.phone || '').replace(/\D/g, '');
    if (!isOwner && (phone.length < 6 || !String(t.customer.phone).replace(/\D/g, '').endsWith(phone))) {
      return res.status(403).json({ message: 'Provide the ticket phone (at least last 6 digits)' });
    }
    res.json({ ticket: t.publicView() });
  } catch (e) { next(e); }
};

/* ---------- service centers: public ---------- */

exports.listCenters = async (_req, res, next) => {
  try {
    const centers = await ServiceCenter.find({ active: true }).sort({ sortOrder: 1, city: 1 });
    res.json({ items: centers.map((c) => c.publicView()) });
  } catch (e) { next(e); }
};

/* ================= ADMIN ================= */

/* warranty list + detail + status/notes */
exports.adminWarrantyList = async (req, res, next) => {
  try {
    const { q, status } = req.query;
    const qy = {};
    if (q) {
      const rx = new RegExp(String(q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      qy.$or = [{ regNumber: rx }, { orderNumber: rx }, { productName: rx }, { 'customer.phone': rx }, { 'customer.name': rx }, { serial: rx }];
    }
    if (status === 'claimed' || status === 'active') qy.status = status;
    const [items, total] = await Promise.all([
      WarrantyRegistration.find(qy).sort({ createdAt: -1 }).limit(100).lean(),
      WarrantyRegistration.countDocuments(qy),
    ]);
    res.json({ items, total });
  } catch (e) { next(e); }
};

exports.adminWarrantyDetail = async (req, res, next) => {
  try {
    const w = await WarrantyRegistration.findById(req.params.id);
    if (!w) return res.status(404).json({ message: 'Warranty not found' });
    res.json({ registration: { ...w.toObject() } });
  } catch (e) { next(e); }
};

exports.adminWarrantyUpdate = async (req, res, next) => {
  try {
    const w = await WarrantyRegistration.findById(req.params.id);
    if (!w) return res.status(404).json({ message: 'Warranty not found' });
    const b = req.body || {};
    if (b.status && ['active', 'claimed'].includes(b.status)) w.status = b.status;
    if (b.ticketNumber !== undefined) w.ticketNumber = String(b.ticketNumber || '').toUpperCase().trim() || null;
    if (b.notes !== undefined) w.notes = String(b.notes || '').trim().slice(0, 500);
    if (b.serial !== undefined) w.serial = String(b.serial || '').toUpperCase().trim().slice(0, 40);
    await w.save();
    res.json({ registration: w.toObject() });
  } catch (e) { next(e); }
};

/* tickets: list / detail / status / note / assign / priority */
exports.adminTicketList = async (req, res, next) => {
  try {
    const { status, category, priority, q } = req.query;
    const qy = {};
    if (status) qy.status = String(status);
    if (category) qy.category = String(category);
    if (priority) qy.priority = String(priority);
    if (q) {
      const rx = new RegExp(String(q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      qy.$or = [{ ticketNumber: rx }, { subject: rx }, { 'customer.name': rx }, { 'customer.phone': rx }, { orderNumber: rx }];
    }
    const [items, openCount] = await Promise.all([
      ServiceTicket.find(qy).sort({ createdAt: -1 }).limit(100).select('-attachments').lean(),
      ServiceTicket.countDocuments({ status: { $in: ServiceTicket.OPEN_STATUSES } }),
    ]);
    res.json({ items, openCount });
  } catch (e) { next(e); }
};

exports.adminTicketDetail = async (req, res, next) => {
  try {
    const t = await ServiceTicket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticket: t });
  } catch (e) { next(e); }
};

/* PATCH /api/admin/tickets/:id — { status?, note?, priority?, assignedTo? }
   Status changes append the timeline + notify the customer (bell + email). */
exports.adminTicketUpdate = async (req, res, next) => {
  try {
    const t = await ServiceTicket.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Ticket not found' });
    const b = req.body || {};
    const actor = req.user ? req.user.name : 'admin';

    if (b.priority !== undefined && ['low', 'medium', 'high'].includes(b.priority)) t.priority = b.priority;

    if (b.assignedTo !== undefined) {
      if (b.assignedTo) {
        const staff = await User.findById(b.assignedTo).select('name role');
        if (!staff || !['admin', 'subadmin'].includes(staff.role)) {
          return res.status(400).json({ message: 'assignedTo must be a staff account' });
        }
        t.assignedTo = staff._id;
        t.timeline.push({ status: t.status, note: `Assigned to ${staff.name}`, at: new Date(), by: actor });
      } else t.assignedTo = null;
    }

    if (b.status !== undefined) {
      const status = String(b.status);
      if (!ServiceTicket.TICKET_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Unknown status: ${status}` });
      }
      if (status !== t.status) {
        t.pushTimeline(status, String(b.note || '').slice(0, 500), actor);
      }
    } else if (b.note) {
      /* note-only update rides on the current status */
      t.timeline.push({ status: t.status, note: String(b.note).slice(0, 500), at: new Date(), by: actor });
    }

    await t.save();

    /* customer notification — bell + Socket.IO + email template (fire & forget) */
    if (t.user) {
      notifier.notifyUser(t.user, 'status', `Ticket ${t.ticketNumber} — ${t.status}`,
        `${t.subject}`, '/account/service');
    }
    realtime.emitToAdmins('ticket:updated', { ticketNumber: t.ticketNumber, status: t.status, kind: 'updated' });
    render('ticket-status', { name: t.customer.name, ticketNumber: t.ticketNumber, status: t.status, note: '' })
      .then((tpl) => {
        if (t.customer.email && tpl.subject) sendEmail(t.customer.email, tpl.subject, `<p>${tpl.body}</p>`).catch(() => {});
      }).catch(() => {});

    res.json({ ticket: t });
  } catch (e) { next(e); }
};

/* service centers CRUD */
exports.adminCenterList = async (_req, res, next) => {
  try {
    const items = await ServiceCenter.find({}).sort({ sortOrder: 1, city: 1 });
    res.json({ items });
  } catch (e) { next(e); }
};

exports.adminCenterCreate = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.city || !b.address || !b.phone) {
      return res.status(400).json({ message: 'name, city, address and phone are required' });
    }
    const c = await ServiceCenter.create({
      name: String(b.name).trim().slice(0, 120),
      city: String(b.city).trim().slice(0, 60),
      address: String(b.address).trim().slice(0, 300),
      phone: String(b.phone).trim().slice(0, 20),
      email: String(b.email || '').toLowerCase().trim(),
      hours: String(b.hours || 'Sat–Thu 10:00–19:00').trim().slice(0, 120),
      mapUrl: String(b.mapUrl || '').trim().slice(0, 300),
      services: Array.isArray(b.services) ? b.services.map((s) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 8) : undefined,
      active: b.active === undefined ? true : Boolean(b.active),
      sortOrder: Number(b.sortOrder) || 0,
    });
    res.status(201).json({ center: c });
  } catch (e) { next(e); }
};

exports.adminCenterUpdate = async (req, res, next) => {
  try {
    const c = await ServiceCenter.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Service center not found' });
    const b = req.body || {};
    for (const f of ['name', 'city', 'address', 'phone', 'email', 'hours', 'mapUrl']) {
      if (b[f] !== undefined) c[f] = String(b[f]).trim().slice(0, 300);
    }
    if (b.email !== undefined) c.email = String(b.email).toLowerCase().trim();
    if (b.services !== undefined) c.services = Array.isArray(b.services) ? b.services.map((s) => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 8) : [];
    if (b.active !== undefined) c.active = Boolean(b.active);
    if (b.sortOrder !== undefined) c.sortOrder = Number(b.sortOrder) || 0;
    await c.save();
    res.json({ center: c });
  } catch (e) { next(e); }
};

exports.adminCenterDelete = async (req, res, next) => {
  try {
    const r = await ServiceCenter.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Service center not found' });
    res.json({ message: 'Service center deleted' });
  } catch (e) { next(e); }
};

/* Phase 4 QA/ops — removals (admin) */
exports.adminWarrantyDelete = async (req, res, next) => {
  try {
    const r = await WarrantyRegistration.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Warranty not found' });
    res.json({ message: 'Warranty registration deleted' });
  } catch (e) { next(e); }
};

exports.adminTicketDelete = async (req, res, next) => {
  try {
    const r = await ServiceTicket.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ message: 'Ticket deleted' });
  } catch (e) { next(e); }
};
