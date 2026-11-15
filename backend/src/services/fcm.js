/* Phase 4 (4.3) — FCM (Firebase Cloud Messaging) push, HTTP v1 API.
   Zero new dependencies: the OAuth2 service-account assertion is signed with
   the jsonwebtoken we already ship (RS256), exchanged for an access token,
   then messages go to https://fcm.googleapis.com/v1/projects/<id>/messages:send.

   Env (all three required to go LIVE):
     FCM_PROJECT_ID=arixgear
     FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@arixgear.iam.gserviceaccount.com
     FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

   Without them the service runs in DRY-RUN (like SMS/email): every message is
   logged to backend/logs/fcm.jsonl so the whole flow is testable with zero
   credentials. Delivery NEVER breaks the caller — all failures are recorded
   and swallowed. */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'fcm.jsonl');
const TOKEN_CACHE = { token: null, exp: 0 };

function configured() {
  return Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}

function logRecord(record) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
  } catch (_e) { /* logging must never break a request */ }
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (TOKEN_CACHE.token && TOKEN_CACHE.exp - 60 > now) return TOKEN_CACHE.token;

  const jwt = require('jsonwebtoken');
  const key = String(process.env.FCM_PRIVATE_KEY).replace(/\\n/g, '\n');
  const assertion = jwt.sign(
    {
      iss: process.env.FCM_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
    key,
    { algorithm: 'RS256' }
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || `OAuth failed (HTTP ${res.status})`);
  TOKEN_CACHE.token = data.access_token;
  TOKEN_CACHE.exp = now + (data.expires_in || 3600);
  return data.access_token;
}

/**
 * sendToTokens({ title, body, tokens, link, data, topic }) — sends one message
 * per token (or a topic message when `topic` is given). Returns
 * { sent, failed, dryRun, pruned[] }. Dead tokens (UNREGISTERED/INVALID_ARGUMENT)
 * are reported back so the caller can prune DeviceToken rows.
 */
async function sendToTokens({ title, body = '', tokens = [], link = '', data = {}, topic = null }) {
  const list = Array.isArray(tokens) ? [...new Set(tokens.filter(Boolean))] : [];
  const mode = configured() ? 'fcm' : 'dry-run';
  const record = {
    at: new Date().toISOString(), mode,
    title: String(title || '').slice(0, 120),
    body: String(body || '').slice(0, 300),
    topic: topic || null, tokenCount: topic ? 0 : list.length, link: link || '',
  };

  if (!configured()) {
    logRecord(record);
    return { sent: 0, failed: 0, dryRun: true, pruned: [] };
  }
  if (!topic && !list.length) return { sent: 0, failed: 0, dryRun: false, pruned: [] };

  try {
    const token = await accessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`;
    const base = {
      notification: { title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 300) },
      webpush: { fcmOptions: link ? { link } : undefined },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    };

    let sent = 0, failed = 0;
    const pruned = [];

    /* topic broadcast — a single send covers every subscribed device */
    if (topic) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { ...base, topic } }),
      });
      if (res.ok) sent += 1; else failed += 1;
      logRecord({ ...record, ok: res.ok, status: res.status });
      return { sent, failed, dryRun: false, pruned };
    }

    for (const t of list.slice(0, 500)) { // hard cap per fanout
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { ...base, token: t } }),
        });
        if (res.ok) { sent += 1; continue; }
        failed += 1;
        const err = await res.json().catch(() => ({}));
        const code = err.error?.status || '';
        if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') pruned.push(t);
      } catch (_e) { failed += 1; }
    }
    logRecord({ ...record, ok: failed === 0, sent, failed, pruned: pruned.length });
    return { sent, failed, dryRun: false, pruned };
  } catch (e) {
    logRecord({ ...record, ok: false, error: e.message });
    return { sent: 0, failed: list.length, dryRun: false, pruned: [], error: e.message };
  }
}

/** status for the admin panel / prod checklist */
function status() {
  return { configured: configured(), mode: configured() ? 'fcm' : 'dry-run' };
}

module.exports = { sendToTokens, status, configured };
