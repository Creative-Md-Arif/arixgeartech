const ContactMessage = require('../models/ContactMessage');
const notifier = require('../services/notifier'); // Task 36 — in-app bell
const User = require('../models/User');

/* ============ PUBLIC ============ */

// POST /api/messages — storefront contact form + live-chat widget (guest OK, rate-limited)
// topic 'chat' is the chat widget: email optional, short messages allowed.
exports.create = async (req, res, next) => {
  try {
    const { name, email, orderNo, topic, message } = req.body || {};
    const isChat = String(topic || '') === 'chat';
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
    if (!isChat && (!email || !/^\S+@\S+\.\S+$/.test(String(email)))) return res.status(400).json({ message: 'A valid email is required' });
    const minLen = isChat ? 2 : 10;
    if (!message || String(message).trim().length < minLen) {
      return res.status(400).json({ message: isChat ? 'Message is required' : `Message must be at least ${minLen} characters` });
    }

    const doc = await ContactMessage.create({
      user: req.user ? req.user._id : null, /* Task 37 — logged-in senders get a two-way thread */
      name: String(name).trim().slice(0, 120),
      email: String(email || '').trim().toLowerCase().slice(0, 160),
      orderNo: String(orderNo || '').trim().slice(0, 40),
      topic: String(topic || 'general').trim().slice(0, 60),
      message: String(message).trim().slice(0, 4000),
    });
    /* Task 36 — admin bell: new inbound message (chat widget / contact form) */
    notifier.notifyAdmin('message', 'নতুন মেসেজ — ' + (isChat ? 'চ্যাট' : doc.topic),
      doc.name + ': ' + doc.message.slice(0, 80),
      '/admin/messages');
    res.status(201).json({ ok: true, id: doc._id, message: isChat ? 'Message received — we usually reply within an hour.' : 'Message received — we reply within one working day.' });
  } catch (e) { next(e); }
};

/* ============ ADMIN ============ */

// GET /api/admin/messages?filter=all|unread|read&topic=newsletter  (Task 49 topic filter)
exports.adminList = async (req, res, next) => {
  try {
    const q = {}; /* legacy: admin inbox shows inbound + outbound history */
    if (req.query.filter === 'unread') q.read = false;
    if (req.query.filter === 'read') q.read = true;
    if (req.query.topic) q.topic = String(req.query.topic).trim().slice(0, 60); /* Task 49 — newsletter chip */
    const items = await ContactMessage.find(q).sort({ createdAt: -1 }).limit(200);
    const unread = await ContactMessage.countDocuments({ direction: 'in', read: false }); /* Task 37 — outbound never counts as admin-unread */
    /* Task 49 — chip counters for the inbox toolbar (all / unread / newsletter) */
    const newsletter = await ContactMessage.countDocuments({ topic: 'newsletter' });
    const all = await ContactMessage.countDocuments({ direction: 'in' });
    res.json({ items, unread, counts: { all, unread, newsletter } });
  } catch (e) { next(e); }
};

// PATCH /api/admin/messages/:id  {read:boolean}
exports.markRead = async (req, res, next) => {
  try {
    const m = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { read: req.body.read !== false },
      { new: true }
    );
    if (!m) return res.status(404).json({ message: 'Message not found' });
    res.json({ item: m });
  } catch (e) { next(e); }
};

// DELETE /api/admin/messages/:id
exports.remove = async (req, res, next) => {
  try {
    const m = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!m) return res.status(404).json({ message: 'Message not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

/* ============ TASK 37 — two-way messaging ============ */

// GET /api/messages/mine (JWT) — the customer's inbox: messages bound to the
// account (user ref) or sent from the account email (legacy inbound rows).
exports.mine = async (req, res, next) => {
  try {
    const q = { $or: [{ user: req.user._id }, { email: req.user.email }] };
    const items = await ContactMessage.find(q).sort({ createdAt: 1 }).limit(100).lean();
    const unread = items.filter((n) => n.direction === 'out' && !n.read).length;
    res.json({
      items: items.map((n) => ({
        _id: String(n._id), direction: n.direction || 'in', subject: n.subject || '',
        topic: n.topic, message: n.message, name: n.name,
        createdAt: n.createdAt, read: n.read,
      })),
      unread,
    });
  } catch (e) { next(e); }
};

// POST /api/messages/mine/read (JWT) — opening the inbox clears outbound NEW chips
exports.markMineRead = async (req, res, next) => {
  try {
    const r = await ContactMessage.updateMany(
      { direction: 'out', read: false, $or: [{ user: req.user._id }, { email: req.user.email }] },
      { $set: { read: true } }
    );
    res.json({ ok: true, modified: r.modifiedCount });
  } catch (e) { next(e); }
};

// POST /api/admin/messages/compose { userId, subject, body } (admin)
// Outbound message → lands in the customer's bell + Account inbox instantly.
exports.adminCompose = async (req, res, next) => {
  try {
    const { userId, subject, body } = req.body || {};
    if (!userId || !/^[0-9a-fA-F]{24}$/.test(String(userId))) return res.status(400).json({ message: 'Pick a customer first' });
    if (!body || !String(body).trim() || String(body).trim().length < 2) return res.status(400).json({ message: 'Message body is required' });
    const user = await User.findById(userId).select('name email');
    if (!user) return res.status(404).json({ message: 'Customer not found' });
    const doc = await ContactMessage.create({
      direction: 'out', user: user._id, name: 'ArixGear Support', email: 'support@arixgear.tech',
      topic: 'support', subject: String(subject || '').trim().slice(0, 160),
      message: String(body).trim().slice(0, 4000), read: false, /* unread for the CUSTOMER (admin unread only counts direction:'in') */
    });
    notifier.notifyUser(user._id, 'compose', 'ArixGear থেকে নতুন মেসেজ' + (doc.subject ? ' — ' + doc.subject : ''),
      doc.message.slice(0, 120), '/account');
    res.status(201).json({ ok: true, item: doc, message: 'Sent — customer notified instantly' });
  } catch (e) { next(e); }
};
