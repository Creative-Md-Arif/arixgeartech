/* Phase 4 (4.3) — NotificationTemplate rendering.
   Single {{var}} filler shared by every channel (email subject/intro, SMS,
   push). Unknown vars resolve to '' (same contract as emailService.fill) so a
   stale admin placeholder can never leak mustaches into a customer message. */

const NotificationTemplate = require('../models/NotificationTemplate');

function fill(str, vars = {}) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

/* defaults used when no admin template exists (or the doc is inactive) —
   mirrors the legacy emailService.TEMPLATE_DEFAULTS keys */
const DEFAULTS = {
  'order-confirmation': { channel: 'email', label: 'Order confirmation', subject: 'ArixGear Order {{orderNumber}} — received', body: 'Hi {{name}}, your gear is locked in. We\'ll email you at every step.', vars: ['name', 'orderNumber'] },
  'order-status': { channel: 'email', label: 'Order status update', subject: 'ArixGear Order {{orderNumber}} — {{status}}', body: 'Hi {{name}}, your order {{orderNumber}} is now {{status}}. {{note}}', vars: ['name', 'orderNumber', 'status', 'note'] },
  'ticket-created': { channel: 'email', label: 'Service ticket created', subject: 'ArixGear ticket {{ticketNumber}} — we received it', body: 'Hi {{name}}, your {{category}} ticket is in. Track it any time with {{ticketNumber}}.', vars: ['name', 'ticketNumber', 'category'] },
  'ticket-status': { channel: 'email', label: 'Service ticket update', subject: 'ArixGear ticket {{ticketNumber}} — {{status}}', body: 'Hi {{name}}, ticket {{ticketNumber}} moved to {{status}}. {{note}}', vars: ['name', 'ticketNumber', 'status', 'note'] },
  'warranty-registered': { channel: 'email', label: 'Warranty registered', subject: 'ArixGear warranty {{regNumber}} — active', body: 'Hi {{name}}, warranty for {{productName}} is active until {{expiresAt}}.', vars: ['name', 'regNumber', 'productName', 'expiresAt'] },
  'welcome-coupon': { channel: 'sms', label: 'Newsletter welcome SMS', subject: '', body: 'ArixGear: welcome! Use {{code}} for {{discount}}% off at checkout.', vars: ['code', 'discount'] },
  'admin-order-alert': { channel: 'push', label: 'Admin new-order push', subject: 'নতুন অর্ডার — {{orderNumber}}', body: '{{customer}} · ৳{{total}} · {{method}}', vars: ['orderNumber', 'customer', 'total', 'method'] },
};

/**
 * render(key, vars) → { key, channel, subject, body, source }
 * 'template' = admin doc, 'default' = built-in fallback, 'missing' = no copy.
 */
async function render(key, vars = {}) {
  const k = String(key || '').toLowerCase().trim();
  try {
    const doc = await NotificationTemplate.findOne({ key: k, active: true }).lean();
    const dflt = DEFAULTS[k] || {};
    const src = doc ? 'template' : 'default';
    const channel = (doc && doc.channel) || dflt.channel || 'email';
    const subjectRaw = doc && doc.subject ? doc.subject : (dflt.subject || '');
    let bodyRaw = doc && doc.body ? doc.body : (dflt.body || '');
    /* per-status override (order-status / ticket-status): vars.status note */
    const notes = (doc && doc.statusNotes) || {};
    if (vars.status && notes && typeof notes[vars.status] === 'string' && notes[vars.status]) {
      bodyRaw = `${bodyRaw}\n${notes[vars.status]}`.trim();
    }
    return { key: k, channel, subject: fill(subjectRaw, vars), body: fill(bodyRaw, vars), source: doc ? 'template' : dflt.subject || dflt.body ? 'default' : 'missing' };
  } catch (_e) {
    return { key: k, channel: 'email', subject: '', body: '', source: 'missing' };
  }
}

/* admin editor support: list of known keys + which vars each expects */
function catalog() {
  return Object.entries(DEFAULTS).map(([key, d]) => ({ key, channel: d.channel, label: d.label, vars: d.vars || [] }));
}

module.exports = { render, fill, DEFAULTS, catalog };
