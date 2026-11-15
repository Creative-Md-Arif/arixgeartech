const crypto = require('crypto');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const Product = require('../models/Product');
const { sendEmail } = require('../services/emailService');

/* ============ helpers ============ */

const URL_RE = /(https?:\/\/|www\.)[^\s]+/gi;

/* voter identity — account id when logged in, else salted IP hash
   (exactly the same scheme the review helpful-votes use) */
function voterKey(req) {
  if (req.user && req.user._id) return 'u:' + req.user._id;
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '').trim();
  return 'i:' + crypto.createHash('sha256').update('forged-q1|' + (ip || 'anon')).digest('hex').slice(0, 24);
}

function oidOf(v) {
  return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null;
}

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ============ PUBLIC ============ */

// GET /api/products/:slug/questions[?mine=1&sort=helpful] — ANSWERED questions for
// the PDP (newest or most-helpful first). With a JWT + ?mine=1 the asker also gets
// their own PENDING questions so they can see the moderation status.
exports.listByProduct = async (req, res, next) => {
  try {
    const p = await Product.findOne({ slug: String(req.params.slug || '').toLowerCase(), active: true }).select('_id');
    if (!p) return res.json({ items: [] });

    const sort = req.query.sort === 'helpful'
      ? { helpfulCount: -1, createdAt: -1 }
      : { createdAt: -1 };

    if (req.query.mine === '1' && req.user) {
      /* asker view — own questions in BOTH states + status chips.
         NEVER send raw docs here: they carry voter keys + user refs. */
      const docs = await Question.find({ product: p._id, user: req.user._id }).sort(sort).limit(50);
      const mine = docs.map((qa) => ({
        id: qa._id,
        question: qa.question,
        answer: qa.answer || '',
        answered: qa.answered,
        name: qa.name,
        createdAt: qa.createdAt,
        answeredAt: qa.answeredAt,
        helpfulCount: qa.helpfulCount || 0,
        status: qa.answered ? 'answered' : 'pending',
      }));
      const answered = await Question.find({ product: p._id, answered: true }).sort(sort).limit(50);
      return res.json({ items: answered.map(pubItem(req)), mine });
    }

    const items = await Question.find({ product: p._id, answered: true }).sort(sort).limit(50);
    res.json({ items: items.map(pubItem(req)) });
  } catch (e) { next(e); }
};

/* public shape + "mine"/"myVote" flags for the logged-in asker
   (`answered` always true on the public list — kept for legacy contract checks) */
function pubItem(req) {
  const uid = req.user ? String(req.user._id) : null;
  const key = voterKey(req);
  return (qa) => ({
    id: qa._id,
    question: qa.question,
    answer: qa.answer || '',
    answered: qa.answered,
    name: qa.name,
    createdAt: qa.createdAt,
    helpfulCount: qa.helpfulCount || 0,
    mine: !!(uid && qa.user && String(qa.user) === uid),
    myVote: qa.voters && qa.voters.some((v) => v.key === key) ? 1 : 0,
  });
}

// POST /api/products/:slug/questions — visitor asks (unanswered until admin replies).
// Task 30: JWT name auto-fill, link-spam rejection, duplicate guard (10 min window),
// and a fire-and-forget email alert to the shop owner (ADMIN_NOTIFY_EMAIL).
exports.create = async (req, res, next) => {
  try {
    const p = await Product.findOne({ slug: String(req.params.slug || '').toLowerCase(), active: true }).select('_id name');
    if (!p) return res.status(404).json({ message: 'Product not found' });

    let name = String((req.body || {}).name || '').trim();
    const question = String((req.body || {}).question || '').trim();

    /* logged-in visitors get their account name pre-filled (review-flow parity) */
    if (!name && req.user && req.user.name) name = String(req.user.name).trim();

    if (!name) return res.status(400).json({ message: 'Name is required' });
    if (question.trim().length < 5) return res.status(400).json({ message: 'Question must be at least 5 characters' });

    /* anti-spam 1 — link flood (same rule as reviews: ≥3 URLs → reject) */
    const links = question.match(URL_RE) || [];
    if (links.length >= 3) return res.status(400).json({ message: 'Too many links — please ask without URLs' });

    /* anti-spam 2 — identical asker+question on the same product within 10 min */
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const dupQ = {
      product: p._id,
      name: name.slice(0, 80),
      question: question.slice(0, 600),
      createdAt: { $gte: tenMinAgo },
    };
    if (await Question.findOne(dupQ).select('_id')) {
      return res.status(409).json({ message: 'You already asked this exact question a moment ago' });
    }

    const doc = await Question.create({
      product: p._id,
      name: name.slice(0, 80),
      question: question.slice(0, 600),
      user: req.user ? req.user._id : undefined, // undefined → field ABSENT for guests
    });

    /* admin alert — never blocks, never throws.
       Step 6 (XSS fixture) — the asker name is USER INPUT and rode into the
       HTML email UNESCAPED (only the question body was escaped): an
       <img onerror> name injected markup into webmail clients. Escape both. */
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    if (to) {
      sendEmail(
        to,
        `ArixGear — new question on ${p.name}`,
        `<p style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
           <b>${esc(name)}</b> asked about <b>${esc(p.name)}</b>:<br><br>
           “${esc(question)}”<br><br>
           Answer it from Admin → Questions.
         </p>`
      ).catch(() => {});
    }

    res.status(201).json({ ok: true, id: doc._id, message: 'Question received — our team answers within one working day.' });
  } catch (e) { next(e); }
};

/* helpful votes — answered questions only, one vote per visitor (toggle out with -1) */
// POST /api/questions/:id/helpful  {vote: 1 | -1}
exports.voteHelpful = async (req, res, next) => {
  try {
    const qa = await Question.findOne({ _id: req.params.id, answered: true });
    if (!qa) return res.status(404).json({ message: 'Question not found' });
    const key = voterKey(req);
    const vote = Number((req.body || {}).vote);
    if (vote !== 1 && vote !== -1) return res.status(400).json({ message: 'vote must be 1 or -1' });

    const has = qa.voters.some((v) => v.key === key);
    if (vote === 1 && !has) {
      if (qa.voters.length >= 1000) return res.status(400).json({ message: 'Vote limit reached for this question' });
      qa.voters.push({ key });
      qa.helpfulCount = (qa.helpfulCount || 0) + 1;
    } else if (vote === -1 && has) {
      qa.voters = qa.voters.filter((v) => v.key !== key);
      qa.helpfulCount = Math.max(0, (qa.helpfulCount || 0) - 1);
    }
    await qa.save();
    res.json({ helpfulCount: qa.helpfulCount, voted: qa.voters.some((v) => v.key === key) });
  } catch (e) { next(e); }
};

/* ============ ADMIN ============ */

// GET /api/admin/questions?filter=unanswered|answered|all&q=..&page=1&limit=50
exports.adminList = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.filter === 'unanswered') q.answered = false;
    if (req.query.filter === 'answered') q.answered = true;
    const s = String(req.query.q || '').trim();
    if (s) {
      const rx = new RegExp(escapeRx(s), 'i');
      q.$or = [{ name: rx }, { question: rx }, { answer: rx }];
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    const [items, all, unanswered, answered] = await Promise.all([
      Question.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('product', 'name slug'),
      Question.countDocuments({}),
      Question.countDocuments({ answered: false }),
      Question.countDocuments({ answered: true }),
    ]);
    res.json({ items, counts: { all, unanswered, answered }, page, pages: Math.ceil(all / limit) || 1 });
  } catch (e) { next(e); }
};

// PUT /api/admin/questions/:id  {answer} — publish OR edit an answer
exports.answer = async (req, res, next) => {
  try {
    const text = String((req.body || {}).answer || '').trim();
    if (!text) return res.status(400).json({ message: 'Answer text is required' });
    if (!oidOf(req.params.id)) return res.status(400).json({ message: 'Bad question id' });
    const item = await Question.findByIdAndUpdate(
      req.params.id,
      { answer: text.slice(0, 2000), answered: true, answeredAt: new Date() },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Question not found' });
    res.json({ item });
  } catch (e) { next(e); }
};

// PATCH /api/admin/questions/:id/unanswer — pull an answer back to the queue
exports.unanswer = async (req, res, next) => {
  try {
    if (!oidOf(req.params.id)) return res.status(400).json({ message: 'Bad question id' });
    const item = await Question.findByIdAndUpdate(
      req.params.id,
      { answer: '', answered: false, answeredAt: null },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Question not found' });
    res.json({ item });
  } catch (e) { next(e); }
};

// PATCH /api/admin/questions/bulk  {ids:[..], action:'delete'} — bulk moderation
exports.adminBulk = async (req, res, next) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) {
      return res.status(400).json({ message: 'ids must be an array of 1-100 ids' });
    }
    const oids = ids.map(oidOf).filter(Boolean);
    if (!oids.length) return res.status(400).json({ message: 'No valid ids' });
    if (action !== 'delete') return res.status(400).json({ message: "action must be 'delete'" });
    const r = await Question.deleteMany({ _id: { $in: oids } });
    res.json({ ok: true, deleted: r.deletedCount });
  } catch (e) { next(e); }
};

// GET /api/admin/questions/stats — Q&A health for the dashboard
exports.adminStats = async (_req, res, next) => {
  try {
    const [all, unanswered] = await Promise.all([Question.countDocuments({}), Question.countDocuments({ answered: false })]);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    /* response-time + daily trend in one aggregate pass */
    const answeredAgg = await Question.aggregate([
      { $match: { answered: true, answeredAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          avgHours: { $avg: { $divide: [{ $subtract: ['$answeredAt', '$createdAt'] }, 3600000] } },
          avgHours30: {
            $avg: {
              $cond: [
                { $gte: ['$answeredAt', since] },
                { $divide: [{ $subtract: ['$answeredAt', '$createdAt'] }, 3600000] },
                null,
              ],
            },
          },
        },
      },
    ]);

    const trend = await Question.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const topProducts = await Question.aggregate([
      { $group: { _id: '$product', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
      { $project: { count: 1, name: { $first: '$p.name' }, slug: { $first: '$p.slug' } } },
    ]);

    const asked7 = await Question.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });

    res.json({
      counts: { all, unanswered, answered: all - unanswered },
      avgResponseHours: answeredAgg[0] ? Math.round((answeredAgg[0].avgHours || 0) * 10) / 10 : null,
      avgResponseHours30: answeredAgg[0] ? Math.round((answeredAgg[0].avgHours30 || 0) * 10) / 10 : null,
      asked7,
      trend,
      topProducts,
    });
  } catch (e) { next(e); }
};

// DELETE /api/admin/questions/:id
exports.remove = async (req, res, next) => {
  try {
    if (!oidOf(req.params.id)) return res.status(400).json({ message: 'Bad question id' });
    const item = await Question.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Question not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
};
