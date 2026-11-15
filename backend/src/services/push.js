/* ArixGear service — admin web-push (Task 57).
   Real browser push for the admin's phone/desktop: every notifyAdmin() event
   also goes out over web-push to every subscribed admin device, in addition
   to the in-app SSE bell. VAPID keys are generated once and persisted in the
   Setting document (no .env babysitting); env overrides win when present.
   Every failure is swallowed — push must never break the main flow. */
const webpush = require('web-push');
const Setting = require('../models/Setting');

let cachedKeys = null;

/* VAPID pair: env → persisted → generate-and-persist */
async function vapidKeys() {
  if (cachedKeys) return cachedKeys;
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    cachedKeys = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
    return cachedKeys;
  }
  const s = await Setting.get();
  if (s.push && s.push.vapidPublic && s.push.vapidPrivate) {
    cachedKeys = { publicKey: s.push.vapidPublic, privateKey: s.push.vapidPrivate };
    return cachedKeys;
  }
  const gen = webpush.generateVAPIDKeys();
  await Setting.updateOne(
    { key: 'store' },
    { $set: { 'push.vapidPublic': gen.publicKey, 'push.vapidPrivate': gen.privateKey } }
  );
  cachedKeys = gen;
  return cachedKeys;
}

function urlBase64(str) { return Buffer.from(str, 'base64'); }

/* fan out to every stored admin subscription; prune dead endpoints (404/410) */
async function sendToAdmins({ title, body, link, tag }) {
  try {
    const keys = await vapidKeys();
    webpush.setVapidDetails('mailto:admin@arixgear.tech', keys.publicKey, keys.privateKey);
    const s = await Setting.get();
    const subs = (s.push && s.push.subscriptions) || [];
    if (!subs.length) return { sent: 0, failed: 0 };
    const payload = JSON.stringify({ title, body, link: link || '/admin/orders', tag: tag || 'forged-admin' });
    let sent = 0, failed = 0;
    const dead = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys && sub.keys.p256dh, auth: sub.keys && sub.keys.auth } },
          payload,
          { TTL: 3600 }
        );
        sent++;
      } catch (e) {
        failed++;
        if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(sub.endpoint);
      }
    }));
    if (dead.length) {
      await Setting.updateOne({ key: 'store' }, { $pull: { 'push.subscriptions': { endpoint: { $in: dead } } } });
    }
    return { sent, failed };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.warn('[push] fanout failed:', e.message);
    return { sent: 0, failed: 0, error: e.message };
  }
}

/* upsert one subscription (same endpoint → refresh keys instead of duplicating) */
async function subscribe(endpoint, keys, agent) {
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    const e = new Error('endpoint + keys.p256dh + keys.auth are required');
    e.status = 400;
    throw e;
  }
  const s = await Setting.get();
  s.push = s.push || { vapidPublic: '', vapidPrivate: '', subscriptions: [] };
  s.push.subscriptions = (s.push.subscriptions || []).filter((x) => x.endpoint !== endpoint);
  if (s.push.subscriptions.length >= 12) throw Object.assign(new Error('Too many push subscriptions — disable one first'), { status: 400 });
  s.push.subscriptions.push({ endpoint: String(endpoint).slice(0, 1000), keys, agent: String(agent || '').slice(0, 200), createdAt: new Date() });
  s.markModified('push.subscriptions');
  await s.save();
  return { subscribed: true, count: s.push.subscriptions.length };
}

async function unsubscribe(endpoint) {
  const r = await Setting.updateOne({ key: 'store' }, { $pull: { 'push.subscriptions': { endpoint } } });
  return { removed: Boolean(r.modifiedCount) };
}

module.exports = { vapidKeys, sendToAdmins, subscribe, unsubscribe };
