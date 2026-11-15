const AuditLog = require('../models/AuditLog');

/* Task 39 — audit helper. Fire-and-forget: NEVER awaited, NEVER throws, and
   caps its own payload so a fat meta object can't blow the capped collection.
   Usage:  audit(req, 'order.status', 'order:ARG-8FK2QA', { to: 'shipped' }); */
module.exports = function audit(req, action, target = '', meta = {}) {
  try {
    const u = req && req.user;
    let safeMeta = {};
    if (meta && typeof meta === 'object') {
      safeMeta = JSON.parse(
        JSON.stringify(meta, (k, v) => (v instanceof Date ? v.toISOString() : v))
      );
      const s = JSON.stringify(safeMeta);
      if (s.length > 4000) safeMeta = { note: 'meta too large', bytes: s.length };
    }
    AuditLog.create({
      actor: (u && u._id) || null,
      actorName: (u && u.name) || 'system',
      actorEmail: (u && u.email) || '',
      actorRole: (u && u.role) || 'system', // '' fails the enum — anonymous events (failed logins) are 'system'
      action,
      /* Task 57 fix — the model requires `entity`; the service previously
         omitted it, so EVERY service-side audit row silently failed
         validation (order.status, login, … never landed). */
      entity: String(target || '').split(':')[0] || 'system',
      entityId: '',
      target: String(target || '').slice(0, 200),
      label: '',
      meta: safeMeta,
      ip: (req && (req.headers['x-forwarded-for'] || '').split(',')[0].trim())
        || (req && req.ip) || '',
    }).catch(() => {}); // logging must never break the request
  } catch (_e) { /* silent */ }
};
