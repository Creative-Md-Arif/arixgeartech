const NotificationTemplate = require('../models/NotificationTemplate');
const Subscriber = require('../models/Subscriber');
const DeviceToken = require('../models/DeviceToken');
const { sendEmail } = require('../services/emailService');
const templates = require('../services/templates');
const fcm = require('../services/fcm');
const realtime = require('../services/realtime');
const pushSvc = require('../services/push');
const notifier = require('../services/notifier');

/* Phase 4 (4.3/4.4) — notification-template editor backend + broadcast.
   Admin:
     GET/POST/PUT/DELETE /api/admin/notification-templates
     POST /api/admin/notification-templates/:id/preview  { vars }  → rendered copy
     POST /api/admin/notification-templates/:id/test     { to? }   → real send (dry-run logs)
     POST /api/admin/notifications/broadcast             → all customers
                                                         (socket + FCM + admin web-push)
   GET /api/admin/notification-templates/catalog → known keys + expected vars */

const KEYS_RE = /^[a-z0-9-]{3,60}$/;

exports.catalog = async (_req, res, next) => {
  try {
    res.json({ catalog: templates.catalog() });
  } catch (e) { next(e); }
};

exports.list = async (_req, res, next) => {
  try {
    const items = await NotificationTemplate.find({}).sort({ channel: 1, key: 1 });
    res.json({ items });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    const key = String(b.key || '').toLowerCase().trim();
    if (!KEYS_RE.test(key)) return res.status(400).json({ message: 'key must be 3–60 lowercase letters/digits/hyphens' });
    const dupe = await NotificationTemplate.findOne({ key });
    if (dupe) return res.status(409).json({ message: `Template key already exists: ${key}` });
    const doc = await NotificationTemplate.create({
      key,
      channel: ['email', 'sms', 'push'].includes(b.channel) ? b.channel : 'email',
      label: String(b.label || '').trim().slice(0, 80),
      description: String(b.description || '').trim().slice(0, 300),
      subject: String(b.subject || '').slice(0, 200),
      body: String(b.body || '').slice(0, 4000),
      statusNotes: b.statusNotes && typeof b.statusNotes === 'object' ? b.statusNotes : {},
      vars: Array.isArray(b.vars) ? b.vars.map((v) => String(v).slice(0, 40)).slice(0, 20) : [],
      active: b.active === undefined ? true : Boolean(b.active),
    });
    res.status(201).json({ template: doc });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const t = await NotificationTemplate.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    const b = req.body || {};
    if (b.channel !== undefined && ['email', 'sms', 'push'].includes(b.channel)) t.channel = b.channel;
    if (b.label !== undefined) t.label = String(b.label).trim().slice(0, 80);
    if (b.description !== undefined) t.description = String(b.description).trim().slice(0, 300);
    if (b.subject !== undefined) t.subject = String(b.subject).slice(0, 200);
    if (b.body !== undefined) t.body = String(b.body).slice(0, 4000);
    if (b.statusNotes !== undefined && typeof b.statusNotes === 'object') t.statusNotes = b.statusNotes;
    if (b.vars !== undefined) t.vars = Array.isArray(b.vars) ? b.vars.map((v) => String(v).slice(0, 40)).slice(0, 20) : [];
    if (b.active !== undefined) t.active = Boolean(b.active);
    await t.save();
    res.json({ template: t });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const r = await NotificationTemplate.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template deleted — the built-in default copy takes over again' });
  } catch (e) { next(e); }
};

/* POST /:id/preview { vars: {name, orderNumber…} } */
exports.preview = async (req, res, next) => {
  try {
    const t = await NotificationTemplate.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    const vars = (req.body && req.body.vars && typeof req.body.vars === 'object') ? req.body.vars : {};
    const out = await templates.render(t.key, vars); // async — DB-backed copy
    res.json({
      preview: {
        key: t.key, channel: t.channel,
        subject: out.subject, body: out.body,
        source: 'template',
      },
    });
  } catch (e) { next(e); }
};

/* POST /:id/test { to? } — sends a sample through the real pipeline.
   No RESEND_API_KEY → dry-run row in backend/logs/emails.jsonl (still 200). */
exports.test = async (req, res, next) => {
  try {
    const t = await NotificationTemplate.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    const vars = (req.body && req.body.vars && typeof req.body.vars === 'object') ? req.body.vars : {};
    const sample = Object.keys(vars).length ? vars : {
      name: 'Sample Customer', orderNumber: 'ARG-DEMO01', status: 'processing',
      ticketNumber: 'ARG-SRV-DEMO01', category: 'service', regNumber: 'ARG-W-DEMO01',
      productName: 'Sample Laptop', expiresAt: '2027-01-01', code: 'ARIX10', discount: 10,
    };
    const out = await templates.render(t.key, sample);
    const to = String((req.body && req.body.to) || process.env.ADMIN_NOTIFY_EMAIL || 'demo@arixgear.tech');
    const r = await sendEmail(to, out.subject || `(no subject) ${t.key}`, `<p>${out.body || '(empty body)'}</p>`);
    res.json({ message: r.dryRun ? 'Test send logged (dry-run — no RESEND_API_KEY)' : 'Test email sent', ...r, rendered: out });
  } catch (e) { next(e); }
};

/* POST /api/admin/notifications/broadcast { title, body, link?, audience? }
   audience: 'all' (default) — every connected socket + FCM token + admin web-push.
   No FCM keys → dry-run rows in backend/logs/fcm.jsonl. */
exports.broadcast = async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 120);
    const body = String(b.body || '').trim().slice(0, 300);
    const link = String(b.link || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ message: 'title is required' });

    /* 1. Socket.IO live fanout (every connected client) */
    const sockets = realtime.broadcastAll('notification', {
      _id: null, type: 'promo', title, body, link, read: false, createdAt: new Date(),
    });

    /* 2. FCM fanout (dry-run until keys; topic 'general' reaches every token) */
    const fcmMode = fcm.status();
    const fcmResult = await fcm.sendToTokens({ title, body, topic: 'general', link });

    /* 3. Admin device web-push (VAPID, already live from Task 57) */
    const pushResult = await pushSvc.sendToAdmins({ title, body, link, tag: 'broadcast' });

    notifier.notifyAdmin('compose', `Broadcast sent — ${title}`, body.slice(0, 200), '/admin/marketing');
    res.json({
      message: `Broadcast delivered — sockets: ${sockets}, fcm: ${fcmMode.mode} (sent ${fcmResult.sent}, failed ${fcmResult.failed})`,
      sockets, fcm: { ...fcmMode, ...fcmResult }, webPush: pushResult,
    });
  } catch (e) { next(e); }
};
