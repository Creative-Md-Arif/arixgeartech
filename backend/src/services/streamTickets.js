/* Step 6 — SSE STREAM TICKETS (security hardening carried from the Step 4/5
   improvement lists). EventSource cannot send headers, so the notification
   stream used to carry the LONG-LIVED JWT in the URL (?token=…) — URLs land
   in proxy logs, browser history and server logs. This module issues
   SHORT-LIVED (60s) opaque tickets instead of the JWT:
     POST /api/notifications/stream-ticket (JWT-protected) → { ticket }
     GET  /api/notifications/stream?ticket=… → consumes it, opens the stream
   The legacy ?token= path keeps working for one release (QA suites, old
   clients) but is deprecated — the SPAs now use the ticket flow.

   Step 7 — REPLAY WINDOW (#12 of the improvement list). Strict single-use
   collided with EventSource's auto-reconnect: on a flaky mobile network the
   browser re-opens with the SAME URL seconds later, the ticket was already
   consumed, and the bell died until the page reloaded. Tickets now enter a
   short bounded replay grace after their first use:
     · first consume → always OK (marks usedAt)
     · re-present within REPLAY_MS (default 45s, env SSE_REPLAY_MS) up to
       REPLAY_MAX times (default 2, env SSE_REPLAY_MAX) → OK (same audience)
     · anything else (third+ reconnect, window expired, unknown ticket) → 401
   The window is far shorter than the JWT lifetime and the ticket still never
   carries credentials, so the URL-leak threat model is unchanged; an attacker
   who reads a consumed ticket from logs has ≤45s and ≤2 stream opens. */
const crypto = require('crypto');

const TTL_MS = 60 * 1000;
const MAX_TICKETS = 300;
const REPLAY_MS = Math.max(0, parseInt(process.env.SSE_REPLAY_MS, 10) || 45 * 1000);
const REPLAY_MAX = Math.max(0, parseInt(process.env.SSE_REPLAY_MAX, 10) || 2);
const tickets = new Map(); // ticket → { audience, exp, usedAt, replays }

/* issue a ticket bound to a stream audience ('admin' | user id) */
function issueTicket(audience) {
  /* opportunistic eviction keeps the map bounded under abuse */
  if (tickets.size >= MAX_TICKETS) {
    const now = Date.now();
    for (const [k, v] of tickets) if (v.exp <= now - REPLAY_MS) tickets.delete(k);
    while (tickets.size >= MAX_TICKETS) {
      const first = tickets.keys().next().value;
      tickets.delete(first);
    }
  }
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { audience: String(audience), exp: Date.now() + TTL_MS, usedAt: null, replays: 0 });
  return { ticket, expiresIn: Math.round(TTL_MS / 1000) };
}

/* consume a ticket — first use opens the stream, re-uses ride the replay
   window (bounded count + bounded time); everything else is rejected. */
function consumeTicket(ticket) {
  const t = String(ticket || '');
  const hit = tickets.get(t);
  const now = Date.now();
  if (!hit) return null;
  if (hit.exp <= now) { tickets.delete(t); return null; }
  if (hit.usedAt === null) {
    hit.usedAt = now; // first open
    return hit.audience;
  }
  if (now - hit.usedAt <= REPLAY_MS && hit.replays < REPLAY_MAX) {
    hit.replays++;
    return hit.audience;
  }
  return null;
}

/* test/ops helper — drop expired entries (plus their replay window) */
function sweep() {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.exp <= now - REPLAY_MS) tickets.delete(k);
  return tickets.size;
}

module.exports = { issueTicket, consumeTicket, sweep, _TTL_MS: TTL_MS, _REPLAY_MS: REPLAY_MS, _REPLAY_MAX: REPLAY_MAX };
