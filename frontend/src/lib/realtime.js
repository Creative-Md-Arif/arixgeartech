/* ArixGear core — storefront Socket.IO client (Phase 7 integration).
   ADDITIVE to the SSE notification stream by design:
   - SSE (/notifications/stream) stays the primary bell/notification channel
   - this client adds the low-latency ORDER ROOM: a detail/track page joins
     `order:<NUM>` (owner JWT or checkout-phone proof, enforced server-side)
     and receives `order:updated` fan-outs, so status changes render live
     without any polling.
   Handshake = JWT via auth.token, exactly what the backend gateway middleware
   expects (Phase 4). Every failure is swallowed — the socket is a progressive
   enhancement: pages still work when it never connects.
   QA mirror: window.__arixRT = { connected, id? } (checked by qa_phase7).    */
import { io } from 'socket.io-client';
import { API_BASE } from '../services/http.js';
import { getSession } from './storage.js';

/* same origin the API rides (single-port model) — strip the /api suffix */
const ORIGIN = API_BASE.replace(/\/api\/?$/, '') || location.origin;

let socket = null;
let currentToken = null;
const subs = {};

function attach(s) {
  s.on('connect', () => { window.__arixRT = { connected: true, id: s.id }; });
  s.on('disconnect', () => { window.__arixRT = { connected: false }; });
  s.on('connect_error', () => { window.__arixRT = { connected: false, error: true }; });
  s.on('order:updated', (p) => {
    (subs['order:updated'] || new Set()).forEach((fn) => { try { fn(p); } catch (_e) {} });
  });
}

/* connectRealtime(token?) — idempotent per token; guests (no JWT) disconnect */
export function connectRealtime(token) {
  const tk = token || (getSession() || {}).token || null;
  if (!tk) { disconnectRealtime(); return null; }
  if (socket && currentToken === tk) return socket;
  disconnectRealtime();
  currentToken = tk;
  socket = io(ORIGIN, {
    auth: { token: tk },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 3000,
    reconnectionDelayMax: 15000,
  });
  attach(socket);
  return socket;
}

export function disconnectRealtime() {
  if (socket) { try { socket.disconnect(); } catch (_e) {} }
  socket = null;
  currentToken = null;
  window.__arixRT = { connected: false };
}

/* onRealtime(event, fn) → unsubscribe */
export function onRealtime(event, fn) {
  if (!subs[event]) subs[event] = new Set();
  subs[event].add(fn);
  return () => subs[event].delete(fn);
}

/* joinOrder(orderNumber, phone?) → { ok } — phone = checkout phone (a ≥6-digit
   suffix is accepted by the gateway, mirroring the REST phone-proof rule). */
export function joinOrder(orderNumber, phone) {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'socket offline' });
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r && typeof r === 'object' ? r : { ok: false }); } };
    try {
      socket.timeout(4000).emit('order:join', { orderNumber, phone }, (err, res) => {
        if (err) return done({ ok: false, error: err.message });
        done(res);
      });
    } catch (_e) { resolve({ ok: false, error: 'emit failed' }); }
    setTimeout(() => done({ ok: false, error: 'ack timeout' }), 4200);
  });
}

export function leaveOrder(orderNumber) {
  try { if (socket) socket.emit('order:leave', { orderNumber }); } catch (_e) {}
}
