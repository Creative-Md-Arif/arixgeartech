/* Phase 4 — notification hub: persist + live-push over SSE **and** Socket.IO.
   The legacy SSE registry stays (storefront/admin bells keep working); every
   emit now ALSO fans out to the Socket.IO gateway (services/realtime — rooms
   user:<id> / admin) and, for customer notifications, to FCM device tokens
   (dry-run until env keys exist). Delivery is fire-and-forget by contract:
   a notification must NEVER break the request that triggered it. */
const Notification = require('../models/Notification');
const pushSvc = require('./push'); // Task 57 — admin web-push fanout
const realtime = require('./realtime'); // Phase 4 — Socket.IO gateway
const fcm = require('./fcm'); // Phase 4 — customer device push
const DeviceToken = require('../models/DeviceToken');

/* clientId → res */
const clients = new Map();
let nextId = 1;

function addClient(res, audience) {
  const id = nextId++;
  clients.set(id, { res, audience });
  return id;
}
function removeClient(id) { clients.delete(id); }

/* push an SSE event to every stream whose audience matches */
function push(audience, event) {
  for (const { res, audience: a } of clients.values()) {
    if (a !== audience) continue;
    try { res.write(`event: notification\ndata: ${JSON.stringify(event)}\n\n`); } catch (_) {}
  }
}

/* build the stream: headers + initial ping + heartbeat every 25s */
function stream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);
  const id = addClient(res, req._notifAudience);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(hb); removeClient(id); });
}

/* core — persist then push (SSE + Socket.IO [+ FCM for customers]) */
async function emit({ forAdmin, user, type, title, body, link }) {
  try {
    const doc = await Notification.create({ forAdmin, user: forAdmin ? null : user, type, title, body, link });
    const payload = {
      _id: String(doc._id), type: doc.type, title: doc.title, body: doc.body,
      link: doc.link, read: false, createdAt: doc.createdAt,
    };
    const audience = forAdmin ? 'admin' : String(user);
    push(audience, payload); // legacy SSE streams
    realtime.emitToUser(audience, 'notification', payload); // Socket.IO user room
    if (forAdmin) {
      realtime.emitToAdmins('notification', payload); // Socket.IO admin room
      /* Task 57 — real browser push for admin devices, fire-and-forget */
      pushSvc.sendToAdmins({ title, body, link, tag: type }).catch(() => {});
    } else {
      /* Phase 4 — FCM fanout to this customer's devices (dry-run until keys) */
      DeviceToken.find({ user: audience, fails: { $lt: 5 } }).select('token').lean()
        .then((rows) => {
          if (!rows.length) return;
          return fcm.sendToTokens({
            title, body, link: link ? `https://arixgear.tech${link}` : '',
            tokens: rows.map((r) => r.token), data: { kind: type, link: link || '' },
          }).then((r) => pruneTokens(rows, r.pruned)).catch(() => {});
        }).catch(() => {});
    }
    return payload;
  } catch (e) { /* notifications NEVER break the main flow */ return null; }
}

/* prune dead FCM tokens reported by the sender (fire-and-forget) */
async function pruneTokens(rows, pruned = []) {
  if (!pruned.length) return;
  const ids = rows.filter((r) => pruned.includes(r.token)).map((r) => r._id);
  if (ids.length) await DeviceToken.deleteMany({ _id: { $in: ids } }).catch(() => {});
}

/* ---------- admin-side helpers ---------- */
const notifyAdmin = (type, title, body, link) => emit({ forAdmin: true, type, title, body, link });

/* ---------- customer-side helpers (guests are silently skipped) ---------- */
const notifyUser = (userId, type, title, body, link) => {
  if (!userId) return Promise.resolve(null); // guest order — no bell
  return emit({ forAdmin: false, user: userId, type, title, body, link });
};

/* unread count for a bell badge */
const unreadFor = async (forAdmin, userId) => {
  const q = forAdmin ? { forAdmin: true, read: false } : { forAdmin: false, user: userId, read: false };
  return Notification.countDocuments(q);
};

module.exports = { stream, notifyAdmin, notifyUser, unreadFor, emit };
