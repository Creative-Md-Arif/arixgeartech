const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const notifier = require('../services/notifier');
const streamTickets = require('../services/streamTickets');
const { protect, jwtSecret } = require('../middleware/auth');

const router = express.Router();

/* Step 6 — SHORT-LIVED STREAM TICKETS. EventSource cannot send headers, so
   the stream used to carry the long-lived JWT in the URL (logs/history leak).
   New flow: a JWT-protected POST mints a 60s opaque ticket; the EventSource
   opens with ?ticket=… Step 7 — tickets carry a SHORT REPLAY WINDOW for
   EventSource auto-reconnects (flaky mobile networks): re-presenting a used
   ticket within 45s (≤2 times) still opens the stream — see streamTickets.js.
   The legacy ?token= path stays (deprecated) for one release — old QA clients
   keep passing until they migrate. */
router.post('/stream-ticket', protect, (req, res) => {
  const audience = req.user.role === 'admin' ? 'admin' : String(req.user._id);
  res.json({ ...streamTickets.issueTicket(audience), role: req.user.role });
});

/* SSE stream — ?ticket= (preferred, single-use) or ?token= (deprecated legacy).
   Admin streams use the admin audience; customer streams their own user id. */
router.get('/stream', async (req, res, next) => {
  try {
    const ticket = req.query.ticket || null;
    if (ticket) {
      const audience = streamTickets.consumeTicket(ticket);
      if (!audience) return res.status(401).json({ message: 'Invalid or expired stream ticket — request a new one' });
      req._notifAudience = audience;
      return notifier.stream(req, res);
    }
    let token = req.query.token || null;
    const h = req.headers.authorization || '';
    if (!token && h.startsWith('Bearer ')) token = h.slice(7);
    if (!token) return res.status(401).json({ message: 'Token required for the notification stream' });
    let payload;
    try { payload = jwt.verify(token, jwtSecret()); } catch (e) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    const user = await User.findById(payload.id || payload._id).select('role');
    if (!user) return res.status(401).json({ message: 'User not found' });
    req._notifAudience = user.role === 'admin' ? 'admin' : String(user._id);
    notifier.stream(req, res);
  } catch (e) { next(e); }
});

/* customer + admin list (JWT) — latest 30 + unread badge */
router.get('/', protect, async (req, res, next) => {
  try {
    const forAdmin = req.user.role === 'admin';
    const q = forAdmin ? { forAdmin: true } : { forAdmin: false, user: req.user._id };
    const [items, unread] = await Promise.all([
      Notification.find(q).sort({ createdAt: -1 }).limit(30).lean(),
      Notification.countDocuments({ ...q, read: false }),
    ]);
    res.json({
      items: items.map((n) => ({ id: String(n._id), _id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: n.createdAt })),
      unread,
    });
  } catch (e) { next(e); }
});

/* mark all read (JWT) */
router.post('/read-all', protect, async (req, res, next) => {
  try {
    const forAdmin = req.user.role === 'admin';
    const q = forAdmin ? { forAdmin: true, read: false } : { forAdmin: false, user: req.user._id, read: false };
    const r = await Notification.updateMany(q, { $set: { read: true, readAt: new Date() } });
    res.json({ message: 'All notifications marked read', modified: r.modifiedCount, unread: 0 });
  } catch (e) { next(e); }
});

/* mark one read (JWT) */
router.post('/:id/read', protect, async (req, res, next) => {
  try {
    const forAdmin = req.user.role === 'admin';
    const q = forAdmin ? { _id: req.params.id, forAdmin: true } : { _id: req.params.id, forAdmin: false, user: req.user._id };
    const n = await Notification.findOneAndUpdate(q, { $set: { read: true, readAt: new Date() } }, { new: true }).lean();
    if (!n) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Marked read' });
  } catch (e) { next(e); }
});

/* ---------- Task 57 — admin web-push (PWA) ---------- */
const pushSvc = require('../services/push');

/* GET /api/n/push/key — VAPID public key for PushManager.subscribe (staff) */
router.get('/push/key', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    res.json({ publicKey: (await pushSvc.vapidKeys()).publicKey });
  } catch (e) { next(e); }
});

/* POST /api/n/push/subscribe — register this device (staff; admin UI gates it) */
router.post('/push/subscribe', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const { endpoint, keys, agent } = req.body || {};
    res.json(await pushSvc.subscribe(endpoint, keys, agent));
  } catch (e) {
    /* validation errors carry .status — map it (error middleware reads statusCode) */
    e.statusCode = e.status || e.statusCode;
    next(e);
  }
});

/* POST /api/n/push/unsubscribe — forget this device */
router.post('/push/unsubscribe', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    res.json(await pushSvc.unsubscribe(String((req.body || {}).endpoint || '')));
  } catch (e) { next(e); }
});

/* POST /api/n/push/test — ring every admin device */
router.post('/push/test', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const r = await pushSvc.sendToAdmins({ title: 'ArixGear — test push', body: 'New orders will land here. You are subscribed ✓', link: '/admin/dashboard', tag: 'test' });
    res.json({ message: `Push fanout: ${r.sent} sent, ${r.failed} failed`, ...r });
  } catch (e) { next(e); }
});

module.exports = router;
