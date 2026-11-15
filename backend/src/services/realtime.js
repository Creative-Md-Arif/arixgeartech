/* Phase 4 (4.3) — Socket.IO gateway.
   ONE realtime channel next to the legacy SSE hub:

     • JWT handshake — token via socket.handshake.auth.token (or ?token= for
       clients that cannot set headers). Invalid/missing → connection refused.
     • automatic rooms: every socket joins `user:<id>`; staff (admin|subadmin)
       additionally joins `admin`.
     • `order:join` / `order:leave` — a customer (or admin) tracks one order
       room `order:<NUM>`; ownership is verified against the Order doc
       (account owner OR checkout phone match) before the join is granted.
     • emitters used across the backend: emitToUser / emitToAdmins /
       emitToOrder / broadcastAll.

   Events emitted: notification, order:updated, stock:alert, ticket:updated.
   SSE stays alive for the existing storefront/admin bells — this gateway is
   additive (Phase 7 wires the storefront client). */

let io = null;

function init(httpServer) {
  const { Server } = require('socket.io');
  const { jwtSecret } = require('../middleware/auth');
  const User = require('../models/User');
  const Order = require('../models/Order');

  io = new Server(httpServer, {
    cors: { origin: true, credentials: false }, // token auth, not cookies
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        socket.handshake.query?.token || null;
      if (!token) return next(new Error('auth required'));
      const decoded = require('jsonwebtoken').verify(String(token), jwtSecret());
      const user = await User.findById(decoded.id).select('name role active');
      if (!user) return next(new Error('account gone'));
      /* audit fix — a DISABLED customer used to keep a live socket; only staff
         disable was enforced. Same rule as the HTTP guards: nobody disabled
         keeps a realtime channel. */
      if (user.active === false) return next(new Error('account disabled'));
      socket.data.userId = String(user._id);
      socket.data.name = user.name;
      socket.data.role = user.role;
      next();
    } catch (_e) {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const uid = socket.data.userId;
    socket.join(`user:${uid}`);
    if (socket.data.role === 'admin' || socket.data.role === 'subadmin') socket.join('admin');

    socket.on('order:join', async ({ orderNumber, phone } = {}, ack) => {
      try {
        /* audit fix — per-socket attempt cap: order:join used to be an
           unthrottled brute-force surface for the 6-digit phone suffix */
        socket.data.joinTries = (socket.data.joinTries || 0) + 1;
        if (socket.data.joinTries > 20) throw new Error('too many attempts — reconnect');
        const num = String(orderNumber || '').toUpperCase().trim();
        if (!/^[A-Z0-9-]{4,24}$/.test(num)) throw new Error('bad orderNumber');
        const order = await Order.findOne({ orderNumber: num }).select('user customer').lean();
        if (!order) throw new Error('order not found');
        const isOwner = order.user && String(order.user) === uid;
        const isAdmin = ['admin', 'subadmin'].includes(socket.data.role);
        const phoneOk = String(phone || '').replace(/\D/g, '').length >= 6 &&
          String(order.customer?.phone || '').replace(/\D/g, '').endsWith(String(phone).replace(/\D/g, ''));
        if (!isOwner && !isAdmin && !phoneOk) throw new Error('not allowed');
        socket.join(`order:${num}`);
        if (typeof ack === 'function') ack({ ok: true, room: `order:${num}` });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    socket.on('order:leave', ({ orderNumber } = {}) => {
      const num = String(orderNumber || '').toUpperCase().trim();
      if (num) socket.leave(`order:${num}`);
    });
  });

  console.log('[realtime] Socket.IO gateway ready (JWT handshake, rooms: user:<id> · admin · order:<NUM>)');
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return 0;
  io.to(`user:${String(userId)}`).emit(event, payload);
  return 1;
}

function emitToAdmins(event, payload) {
  if (!io) return 0;
  io.to('admin').emit(event, payload);
  return 1;
}

function emitToOrder(orderNumber, event, payload) {
  if (!io || !orderNumber) return 0;
  io.to(`order:${String(orderNumber).toUpperCase()}`).emit(event, payload);
  return 1;
}

function broadcastAll(event, payload) {
  if (!io) return 0;
  io.emit(event, payload);
  return 1;
}

/* online staff/admin socket count — dashboard "live" pill feed */
function adminOnline() {
  if (!io) return 0;
  const room = io.sockets.adapter.rooms.get('admin');
  return room ? room.size : 0;
}

module.exports = { init, emitToUser, emitToAdmins, emitToOrder, broadcastAll, adminOnline, get io() { return io; } };
