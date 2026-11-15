/**
 * Email Integration — Resend (https://resend.com)
 *
 * Set in .env:
 *   RESEND_API_KEY=re_xxxxxxxx
 *   EMAIL_FROM="ArixGear <orders@yourdomain.com>"
 *
 * Without an API key the service runs in DRY-RUN mode: emails are logged to
 * the console and appended to backend/logs/emails.jsonl so the flow is fully
 * testable with zero credentials.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'ArixGear <onboarding@resend.dev>';
  const record = { to, subject, from, at: new Date().toISOString(), mode: key ? 'resend' : 'dry-run' };

  if (!key) {
    console.log(`[email:dry-run] → "${to}" | ${subject}`);
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(path.join(LOG_DIR, 'emails.jsonl'), JSON.stringify({ ...record, html }) + '\n');
    } catch (_e) { /* logging must never break the request */ }
    return { sent: false, dryRun: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Resend HTTP ${res.status}`);
    console.log(`[email:resend] → "${to}" | ${subject} | id=${data.id}`);
    return { sent: true, id: data.id };
  } catch (e) {
    console.error('[email:resend] FAILED:', e.message);
    return { sent: false, error: e.message };
  }
}

/* ---------- branded templates ---------- */

// ৳ amounts — Bangladeshi Taka (BDT)
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* ---------- Task 56-d — admin-editable template strings ----------
   Admin → Settings → ✉️ Email Templates saves overrides into
   settings.content.emailTemplates = { orderConfirmation:{subject,intro},
   statusUpdate:{subjectPrefix, notes:{}}, passwordReset:{subject,intro},
   emailOtp:{subject,intro} }. Every string supports {{placeholders}};
   everything else (tables, buttons, brand wrapper) stays hardcoded so a
   typo can never mangle a transactional email. Reading is cached per-call
   with a safe fallback — the defaults below always win on any error. */

const TEMPLATE_DEFAULTS = {
  orderConfirmation: {
    subject: 'ArixGear Order {{orderNumber}} — received',
    intro: 'Hi {{name}}, your gear is locked in. We\'ll email you at every step. Estimated delivery within <b style="color:#fff;">3 days</b>.',
  },
  statusUpdate: {
    subjectPrefix: 'ArixGear Order {{orderNumber}} — {{status}}',
    notes: {}, // per-status overrides keyed by verified|processing|packed|shipped|delivered|cancelled|rejected|payment-rejected
  },
  passwordReset: {
    subject: 'ArixGear — reset your password (valid {{minutes}} min)',
    intro: 'Hi {{name}}, we received a request to reset your ArixGear account password.',
  },
  emailOtp: {
    subject: 'ArixGear — your verification code: {{code}}',
    intro: 'Hi {{name}}, welcome to ArixGear\n      Use this 6-digit code to activate your account:',
  },
};

const STATUS_FALLBACK_NOTES = {
  verified: 'Payment verified ✓ Your order is moving to processing.',
  rejected: 'Payment could not be verified. Reason: {{reason}}. Please re-submit a valid TrxID or contact support.',
  processing: 'Your order is being prepared.',
  packed: 'Packed and ready for the courier.',
  shipped: 'Shipped via {{courier}}{{consignment}}.',
  delivered: 'Delivered. Enjoy your new gear — thanks for shopping with ArixGear.', // audit fix — carried over fitness-era copy
  cancelled: 'This order has been cancelled.',
  'payment-rejected': 'Payment verification failed — see your account or contact support.',
};

async function getTemplateOverrides() {
  try {
    const Setting = require('../models/Setting');
    const s = await Setting.get();
    const t = (s.content && s.content.emailTemplates) || {};
    const merged = JSON.parse(JSON.stringify(TEMPLATE_DEFAULTS));
    for (const k of Object.keys(TEMPLATE_DEFAULTS)) {
      if (!t[k] || typeof t[k] !== 'object') continue;
      if (typeof t[k].subject === 'string' && t[k].subject.trim()) merged[k].subject = t[k].subject;
      if (typeof t[k].intro === 'string' && t[k].intro.trim()) merged[k].intro = t[k].intro;
      if (typeof t[k].subjectPrefix === 'string' && t[k].subjectPrefix.trim()) merged.statusUpdate.subjectPrefix = t[k].subjectPrefix;
      if (t[k].notes && typeof t[k].notes === 'object') merged.statusUpdate.notes = { ...t[k].notes };
    }
    return merged;
  } catch (_e) { return JSON.parse(JSON.stringify(TEMPLATE_DEFAULTS)); }
}

/* {{key}} substitution — unknown keys resolve to '' so a stale admin
   placeholder can never leak raw mustaches into a customer email.
   Audit fix — every substituted value is HTML-escaped: a signup name like
   `<img src=x onerror=…>` becomes harmless text instead of email HTML/link
   injection (a phishing vector). Template bodies stay HTML by design. */
const escapeHtml = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function fill(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? escapeHtml(vars[k]) : ''));
}

const wrap = (title, bodyHtml) => `
<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#0a0a0a;color:#eee;">
    <div style="border-bottom:2px solid #2F81F7;padding-bottom:16px;margin-bottom:24px;">
      <span style="font-size:26px;font-weight:900;letter-spacing:2px;color:#fff;">arixgear<span style="color:#2F81F7;">.tech</span></span>
      <span style="float:right;color:#888;font-size:11px;letter-spacing:2px;padding-top:12px;">EST. 2019</span>
    </div>
    <h1 style="font-size:22px;letter-spacing:1px;color:#fff;margin:0 0 16px;">${title}</h1>
    ${bodyHtml}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #222;color:#777;font-size:11px;">
      ArixGear — Premium tech & gadgets, engineered for people who expect more.<br>
      Banani, Dhaka 1213, Bangladesh
    </div>
  </div>
</body></html>`;

const table = (rows) => `
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    ${rows.map((r) => `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #1c1c1c;color:#bbb;font-size:13px;">${r[0]}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #1c1c1c;color:#fff;font-size:13px;text-align:right;">${r[1]}</td>
    </tr>`).join('')}
  </table>`;

async function orderConfirmationEmail(order) {
  const rows = order.items.map((i) => [
    `${i.name}${i.size ? ` · ${i.size}` : ''}${i.color ? ` · ${i.color}` : ''} × ${i.qty}`,
    `${bdt(i.lineTotal ?? i.price * i.qty)}`,
  ]);
  rows.push(['Shipping', order.totals.shipping === 0 ? 'FREE' : bdt(order.totals.shipping)]);
  if (order.totals.discount > 0) rows.push([`Discount ${order.totals.couponCode ? `(${order.totals.couponCode})` : ''}`, `−${bdt(order.totals.discount)}`]);
  if (order.totals.pointsDiscount > 0) rows.push([`Points redeemed (${order.totals.pointsRedeemed} pts)`, `−${bdt(order.totals.pointsDiscount)}`]);
  rows.push(['<b>Grand Total</b>', `<b style="color:#2F81F7;">${bdt(order.totals.grandTotal)}</b>`]);

  const payLine = order.payment.method === 'cod'
    ? `Cash on Delivery — please keep ${bdt(order.totals.grandTotal)} ready.`
    : `${order.payment.method.toUpperCase()} TrxID <b>${order.payment.trxId || '—'}</b> — we are verifying your payment.`;

  const ov = await getTemplateOverrides();
  const vars = {
    orderNumber: order.orderNumber,
    name: order.customer.name,
    total: bdt(order.totals.grandTotal),
    status: order.status,
  };

  const html = wrap(
    `ORDER ${order.orderNumber} RECEIVED`,
    `<p style="color:#bbb;font-size:14px;line-height:1.6;">${fill(ov.orderConfirmation.intro, vars)}</p>
     ${table(rows)}
     <p style="color:#bbb;font-size:13px;">Payment: ${payLine}</p>
     <p style="color:#777;font-size:12px;">All amounts in BDT (Bangladeshi Taka). Track anytime: <span style="color:#2F81F7;">Order #${order.orderNumber}</span> + your phone number on our tracking page.</p>`
  );
  return { subject: fill(ov.orderConfirmation.subject, vars), html };
}

async function statusUpdateEmail(order) {
  const ov = await getTemplateOverrides();
  const courierName = order.courier.name || 'courier';
  const consignment = order.courier.consignmentNo ? ` — consignment ${order.courier.consignmentNo}` : '';
  const notes = {
    verified: STATUS_FALLBACK_NOTES.verified,
    rejected: fill(STATUS_FALLBACK_NOTES.rejected, { reason: order.payment.rejectReason || '—' }),
    processing: STATUS_FALLBACK_NOTES.processing,
    packed: STATUS_FALLBACK_NOTES.packed,
    shipped: fill(STATUS_FALLBACK_NOTES.shipped, { courier: courierName, consignment }),
    delivered: STATUS_FALLBACK_NOTES.delivered,
    cancelled: STATUS_FALLBACK_NOTES.cancelled,
    'payment-rejected': STATUS_FALLBACK_NOTES['payment-rejected'],
    ...Object.fromEntries(Object.entries(ov.statusUpdate.notes || {}).map(([k, v]) => [k, fill(String(v), {
      orderNumber: order.orderNumber, name: order.customer.name, status: order.status,
      courier: courierName, consignment, reason: order.payment.rejectReason || '—',
    })])),
  };
  const vars = { orderNumber: order.orderNumber, status: order.status.toUpperCase(), name: order.customer.name, total: bdt(order.totals.grandTotal) };
  const html = wrap(
    `ORDER ${order.orderNumber} — ${order.status.toUpperCase()}`,
    `<p style="color:#bbb;font-size:14px;line-height:1.6;">${notes[order.status] || ''}</p>
     ${table([['Order', order.orderNumber], ['Current status', `<b style="color:#2F81F7;">${order.status.toUpperCase()}</b>`], ['Total', bdt(order.totals.grandTotal)]])}`
  );
  return { subject: fill(ov.statusUpdate.subjectPrefix, vars), html };
}

async function sendOrderConfirmation(order) {
  const { subject, html } = await orderConfirmationEmail(order);
  if (!order.customer.email) return { sent: false, reason: 'no email' };
  return sendEmail(order.customer.email, subject, html);
}

async function sendStatusUpdate(order) {
  const { subject, html } = await statusUpdateEmail(order);
  if (!order.customer.email) return { sent: false, reason: 'no email' };
  return sendEmail(order.customer.email, subject, html);
}

/* ---------- password reset (forgot-password flow) ---------- */

async function passwordResetEmail({ name, resetUrl, minutes }) {
  const ov = await getTemplateOverrides();
  const vars = { name: name || 'there', resetUrl, minutes };
  const html = wrap(
    'PASSWORD RESET REQUEST',
    `<p style="color:#bbb;font-size:14px;line-height:1.6;">${fill(ov.passwordReset.intro, vars)}</p>
     <p style="text-align:center;margin:26px 0;">
       <a href="${resetUrl}" style="background:#2F81F7;color:#000;font-weight:900;padding:14px 34px;text-decoration:none;letter-spacing:2px;font-size:13px;display:inline-block;">RESET PASSWORD</a>
     </p>
     <p style="color:#777;font-size:12px;word-break:break-all;">Or paste this link into your browser:<br><span style="color:#2F81F7;">${resetUrl}</span></p>
     <p style="color:#bbb;font-size:13px;">The link is valid for <b style="color:#fff;">${minutes} minutes</b> and works exactly once.</p>
     <p style="color:#777;font-size:12px;">Didn't ask for this? Ignore this email — your password stays unchanged.</p>`
  );
  return { subject: fill(ov.passwordReset.subject, vars), html };
}

async function sendPasswordReset({ to, name, resetUrl, minutes = 15 }) {
  if (!to) return { sent: false, reason: 'no email' };
  const { subject, html } = await passwordResetEmail({ name, resetUrl, minutes });
  return sendEmail(to, subject, html);
}

/* ---------- email verification OTP (Task 51) ---------- */

async function emailOtpEmail({ name, code, minutes }) {
  const ov = await getTemplateOverrides();
  const vars = { name: name || 'there', code, minutes };
  const html = wrap(
    'VERIFY YOUR EMAIL',
    `<p style="color:#bbb;font-size:14px;line-height:1.6;">${fill(ov.emailOtp.intro, vars)}</p>
     <p style="text-align:center;margin:26px 0;">
       <span style="display:inline-block;background:#161616;border:1px solid #2F81F7;color:#2F81F7;
         font-size:34px;font-weight:900;letter-spacing:12px;padding:16px 28px;">${code}</span>
     </p>
     <p style="text-align:center;color:#999;font-size:12px;margin:-8px 0 22px;">উপরের ৬ ডিজিটের কোডটি ওয়েবসাইটের ভেরিফিকেশন বক্সে লিখুন — কোডটি কারও সাথে শেয়ার করবেন না।</p>
     <p style="color:#bbb;font-size:13px;">The code is valid for <b style="color:#fff;">${minutes} minutes</b>
      and works exactly once. Never share it with anyone.</p>
     <p style="color:#777;font-size:12px;">Didn't create an account? Ignore this email — nothing changes.</p>`
  );
  return { subject: fill(ov.emailOtp.subject, vars), html };
}

async function sendEmailOtp({ to, name, code, minutes = 10 }) {
  if (!to) return { sent: false, reason: 'no email' };
  const { subject, html } = await emailOtpEmail({ name, code, minutes });
  return sendEmail(to, subject, html);
}

/* ---------- newsletter welcome (audit fix — the Subscriber row always had an
   unsubscribe token, but NO email ever shipped it: customers had no self-
   service opt-out. The welcome mail now carries the coupon + the link.) ---------- */
async function newsletterWelcomeEmail({ name, code, unsubUrl }) {
  const html = wrap(
    'WELCOME TO ARIXGEAR',
    `<p style="color:#bbb;font-size:14px;line-height:1.6;">Hi ${name ? escapeHtml(name) : 'there'} — thanks for joining the list.</p>
     <p style="text-align:center;margin:26px 0;">
       <span style="display:inline-block;background:#161616;border:1px solid #2F81F7;color:#2F81F7;
         font-size:30px;font-weight:900;letter-spacing:8px;padding:16px 28px;">${code}</span>
     </p>
     <p style="text-align:center;color:#999;font-size:13px;margin:-8px 0 22px;">Use it at checkout — 10% off your first order.</p>
     <p style="color:#777;font-size:12px;">No longer interested?
       <a href="${unsubUrl}" style="color:#2F81F7;">Unsubscribe here</a> — one click, no questions.</p>`
  );
  return { subject: 'ArixGear — your 10% welcome code is ready', html };
}
async function sendNewsletterWelcome({ to, name, code, unsubUrl }) {
  if (!to) return { sent: false, reason: 'no email' };
  const { subject, html } = await newsletterWelcomeEmail({ name, code, unsubUrl });
  return sendEmail(to, subject, html);
}

module.exports = { sendEmail, sendOrderConfirmation, sendStatusUpdate, sendPasswordReset, sendEmailOtp, sendNewsletterWelcome, getTemplateOverrides, TEMPLATE_DEFAULTS, fill };
