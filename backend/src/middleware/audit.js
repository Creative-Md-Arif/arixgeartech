/**
 * Task 39 — audit middleware: records successful staff mutations into AuditLog
 * without any controller knowing about it.
 *
 * Usage in adminRoutes.js (AFTER auth + permission gates):
 *   router.post('/products', gate('products'), audit('create', 'product', {
 *     label: (req, body, ent) => `Product "${ent?.name || req.body.name}"`
 *   }), admin.createProduct);
 *
 * Mechanics:
 *  - wraps res.json() to capture the response payload
 *  - on 'finish', if status < 400 → extracts the entity doc (body.product /
 *    body.coupon / … or the :id param) and writes one AuditLog row
 *  - every failure path is swallowed — auditing can never break an API call
 */
const AuditLog = require('../models/AuditLog');

/* keys the controllers commonly return the saved doc under.
   audit fix — extended for the newer modules (their entityId used to fall
   back to req.params.id and stay empty on POST creates). */
const DOC_KEYS = ['product', 'category', 'badge', 'banner', 'section', 'coupon', 'order', 'setting', 'plan', 'member', 'seo', 'message', 'subadmin', 'return', 'review', 'question', 'brand', 'deal', 'bundle', 'campaign', 'flash', 'subscriber', 'template', 'ticket', 'warranty', 'center', 'import', 'faq', 'chat', 'notification'];

function pickDoc(body) {
  if (!body || typeof body !== 'object') return null;
  for (const k of DOC_KEYS) {
    const v = body[k];
    if (v && (v._id || v.id)) return v;
    if (Array.isArray(v) && v.length && v[0] && (v[0]._id || v[0].id)) return v[0];
  }
  return null;
}

function audit(action, entity, opts = {}) {
  return function (req, res, next) {
    const origJson = res.json.bind(res);
    res.json = (bodyArg) => { res.locals.__auditBody = bodyArg; return origJson(bodyArg); };

    res.on('finish', () => {
      try {
        if (res.statusCode >= 400) return; /* only successes get logged */
        const body = res.locals.__auditBody || {};
        const ent = pickDoc(body);
        const label = opts.label ? (opts.label(req, body, ent) || '') : '';
        const meta = {
          method: req.method,
          path: req.originalUrl,
          ...(opts.meta ? (opts.meta(req) || {}) : {}),
        };
        AuditLog.create({
          actor: req.user ? req.user._id : null,
          actorName: req.user ? req.user.name : 'system',
          actorEmail: req.user ? req.user.email : '',
          actorRole: req.user && req.user.role === 'subadmin' ? 'subadmin' : 'admin',
          action,
          entity,
          entityId: String((ent && (ent._id || ent.id)) || req.params.id || ''),
          label,
          meta,
          ip: req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '',
        }).catch(() => {});
      } catch (_) { /* never break the response */ }
    });

    next();
  };
}

module.exports = { audit };
