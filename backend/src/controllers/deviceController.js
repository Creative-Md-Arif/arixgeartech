const DeviceToken = require('../models/DeviceToken');

/* Phase 4 (4.3) — FCM device registration.
   POST /api/devices  { token, platform?, agent?, topics? }  (JWT optional —
   attached token is bound to the account, anonymous tokens still register)
   DELETE /api/devices { token }  — deregistration (logout / browser purge)
   GET  /api/devices/mine (auth)  — devices bound to this account */

exports.register = async (req, res, next) => {
  try {
    const b = req.body || {};
    const token = String(b.token || '').trim();
    if (!token || token.length < 20 || token.length > 4096) {
      return res.status(400).json({ message: 'A valid FCM token is required' });
    }
    const platform = ['web', 'android', 'ios'].includes(b.platform) ? b.platform : 'web';
    const topics = Array.isArray(b.topics)
      ? [...new Set(b.topics.map((t) => String(t).toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean))].slice(0, 6)
      : ['general'];
    if (!topics.length) topics.push('general');

    const doc = await DeviceToken.findOneAndUpdate(
      { token },
      {
        $set: {
          user: req.user?._id || null,
          platform, agent: String(b.agent || '').slice(0, 200), topics,
          lastSeenAt: new Date(),
        },
        $unset: { fails: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ device: { id: String(doc._id), platform: doc.platform, topics: doc.topics } });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const r = await DeviceToken.deleteOne({ token: String((req.body || {}).token || '').trim() });
    res.json({ removed: Boolean(r.deletedCount) });
  } catch (e) { next(e); }
};

exports.mine = async (req, res, next) => {
  try {
    const items = await DeviceToken.find({ user: req.user._id }).select('platform agent topics lastSeenAt').lean();
    res.json({ items });
  } catch (e) { next(e); }
};
