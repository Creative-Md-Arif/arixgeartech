const Coupon = require('../models/Coupon');
const ContactMessage = require('../models/ContactMessage');
const Subscriber = require('../models/Subscriber'); // Phase 4 — canonical newsletter list
const crypto = require('crypto');
const { sendNewsletterWelcome } = require('../services/emailService'); // audit fix — welcome mail now ships the coupon + unsubscribe link

/* ============ PUBLIC ============ */

/**
 * POST /api/newsletter { email } — storefront newsletter signup (Task 49).
 *
 * Stores a ContactMessage(topic:'newsletter') row (Admin → Messages can filter
 * by topic) and hands back the welcome coupon so the UI can show the code card
 * instantly. The campaign coupon (ARIX10) is ensured via upsert with hardened
 * limits — an existing admin-edited doc is NEVER overwritten ($setOnInsert).
 *
 * Duplicate subscribe is FRIENDLY (idempotent 200 + the same code again) —
 * re-submitting an email must never look like an error to a shopper.
 */
exports.subscribe = async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || email.length > 160) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    /* ensure the campaign coupon exists with the approved hardening
       (perUser:1, maxUses:500, public → checkout picker) — Task 49 */
    const coupon = await Coupon.findOneAndUpdate(
      { code: 'ARIX10' },
      {
        $setOnInsert: {
          type: 'percent', value: 10, minOrder: 0,
          maxUses: 500, perUser: 1, public: true, active: true,
          description: 'Newsletter welcome — 10% off your first order',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const couponView = {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrder: coupon.minOrder,
      expiresAt: coupon.expiresAt,
      description: coupon.description,
    };

    /* duplicate → friendly idempotent response (no duplicate rows).
       Phase 4 — the canonical Subscriber upsert runs BEFORE the early
       return, so a re-subscribe also re-activates the list row (e.g. after
       an unsubscribe) instead of leaving it stale. */
    const existing = await ContactMessage.findOne({ topic: 'newsletter', email }).sort({ createdAt: -1 });
    const unsubToken = crypto.randomBytes(16).toString('hex');
    await Subscriber.findOneAndUpdate(
      { email },
      [{
        $set: {
          email,
          user: req.user ? req.user._id : null,
          source: 'footer',
          unsubToken: { $ifNull: ['$unsubToken', unsubToken] },
          status: 'active',
          unsubscribedAt: null,
        },
      }],
      { upsert: true, setDefaultsOnInsert: true }
    );
    /* audit fix — read back the row's ACTUAL token (an existing row keeps its
       old one via $ifNull) and ship the welcome mail on EVERY subscribe path,
       so the unsubscribe link in the inbox always matches the DB row. The
       token never appears in an API response. */
    const row = await Subscriber.findOne({ email }).select('+unsubToken');
    const tokenForMail = row?.unsubToken || unsubToken;
    const unsubUrl = `${req.protocol}://${req.get('host')}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${tokenForMail}`;
    sendNewsletterWelcome({ to: email, name: String(body.name || '').trim(), code: couponView.code, unsubUrl }).catch(() => {});

    if (existing) {
      return res.json({
        ok: true,
        alreadySubscribed: true,
        coupon: couponView,
        message: "You're already on the list — your 10% code works at checkout.",
      });
    }

    await ContactMessage.create({
      user: req.user ? req.user._id : null,
      name: String(body.name || 'Newsletter subscriber').trim().slice(0, 120) || 'Newsletter subscriber',
      email,
      topic: 'newsletter',
      message: 'Newsletter signup — welcome code ARIX10 (10% off first order)',
      read: false,
    });

    res.status(201).json({
      ok: true,
      alreadySubscribed: false,
      coupon: couponView,
      message: 'Subscribed! Your 10% welcome code is ready.',
    });
  } catch (e) { next(e); }
};

/* ============ ADMIN (list filter support — Task 49-b consumes this) ============ */

/**
 * GET /api/newsletter/unsubscribe?email=…&token=… — one-click opt-out.
 * Token must match the Subscriber row (link shipped with every campaign mail).
 * Idempotent: unsubscribing twice is still a friendly 200.
 */
exports.unsubscribe = async (req, res, next) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    const token = String(req.query.token || '').trim();
    if (!email || !token) {
      return res.status(400).json({ message: 'email and token are required (use the unsubscribe link)' });
    }
    /* audit-fix companion — unsubToken is select:false now, so the comparison
       MUST explicitly pull it back (the plain findOne silently returned an
       undefined token and every real unsubscribe link failed with 403) */
    const s = await Subscriber.findOne({ email }).select('+unsubToken');
    if (!s) return res.json({ ok: true, message: 'You are not on the list — nothing to do.' });
    if (s.unsubToken !== token) return res.status(403).json({ message: 'Invalid unsubscribe link' });
    if (s.status === 'unsubscribed') {
      return res.json({ ok: true, message: 'You were already unsubscribed — no worries.' });
    }
    s.status = 'unsubscribed';
    s.unsubscribedAt = new Date();
    await s.save();
    res.json({ ok: true, message: 'You are out — no more marketing mails from arixgear.tech.' });
  } catch (e) { next(e); }
};

/**
 * GET /api/admin/messages — extended in Task 49 with ?topic= + counts so the
 * admin inbox can show a "Newsletter" chip with its own counter.
 */
exports.adminCounts = async (_req, res, next) => {
  try {
    const [all, unread, newsletter] = await Promise.all([
      ContactMessage.countDocuments({ direction: 'in' }),
      ContactMessage.countDocuments({ direction: 'in', read: false }),
      ContactMessage.countDocuments({ topic: 'newsletter' }),
    ]);
    res.json({ counts: { all, unread, newsletter } });
  } catch (e) { next(e); }
};
