/**
 * SMS Integration — SSLWireless (https://sslwireless.com) with DRY-RUN default
 * ---------------------------------------------------------------------------
 * SSLWireless "SMS Plus" needs a paid account, so this service boots in DRY-RUN:
 *
 *   SMS_PROVIDER=sslwireless  → SMS enabled (default)
 *   SMS_PROVIDER=off          → no SMS at all
 *   SMS_DRY_RUN=true          → log only, no HTTP call (default true)
 *   SMS_DRY_RUN=false         → live sending (requires the creds below)
 *
 *   SSLWIRELESS_API_URL=https://smsplus.sslwireless.com/api/v3/send-sms
 *   SSLWIRELESS_API_TOKEN=your_api_token_from_sslwireless_panel
 *   SSLWIRELESS_SID=your_sender_id
 *
 * Every message (dry-run or live) is appended to backend/logs/sms.jsonl
 * so the whole notification flow is testable before paying for the account.
 *
 * Hook points: order placed → payment verified/rejected → shipped → delivered.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sms.jsonl');

function logRecord(r) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(r) + '\n');
  } catch (_e) { /* logging must never break a request */ }
}

/** 01XXXXXXXXX → 8801XXXXXXXXX (SSLWireless expects full MSISDN) */
function normalizeBD(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return '880' + d.slice(1);
  return d;
}

/**
 * sendSMS(phone, message) — never throws. Returns {sent, mode, ...}.
 * Messages are capped at ~450 chars (SSLWireless concat-sms safe).
 */
async function sendSMS(phone, message) {
  const provider = String(process.env.SMS_PROVIDER || 'sslwireless').toLowerCase();
  const text = String(message || '').slice(0, 450);
  const record = { to: phone, msisdn: normalizeBD(phone), message: text, provider, at: new Date().toISOString() };

  if (provider === 'off') {
    record.mode = 'off';
    logRecord(record);
    return { sent: false, mode: 'off' };
  }

  if (String(process.env.SMS_DRY_RUN ?? 'true') !== 'false') {
    record.mode = 'dry-run';
    logRecord(record);
    console.log(`[sms:dry-run] → ${record.msisdn} | ${text.replace(/\n/g, ' · ').slice(0, 100)}`);
    return { sent: false, mode: 'dry-run' };
  }

  const token = process.env.SSLWIRELESS_API_TOKEN;
  const sid = process.env.SSLWIRELESS_SID;
  const url = process.env.SSLWIRELESS_API_URL || 'https://smsplus.sslwireless.com/api/v3/send-sms';
  if (!token || !sid) {
    record.mode = 'dry-run';
    record.reason = 'SSLWIRELESS_API_TOKEN / SSLWIRELESS_SID missing in .env';
    logRecord(record);
    console.warn('[sms] live mode requested but credentials missing — stayed in dry-run');
    return { sent: false, mode: 'dry-run', reason: record.reason };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: token,
        sid,
        sms: text,
        msisdn: record.msisdn,
        csms_id: String(Date.now()), // unique per message, required by SSLWireless
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `SSLWireless HTTP ${res.status}`);
    record.mode = 'sslwireless';
    record.response = data;
    logRecord(record);
    console.log(`[sms:sslwireless] → ${record.msisdn} | delivered`);
    return { sent: true, mode: 'sslwireless', data };
  } catch (e) {
    record.mode = 'error';
    record.error = e.message;
    logRecord(record);
    console.error('[sms:sslwireless] FAILED:', e.message);
    return { sent: false, mode: 'error', error: e.message };
  }
}

/* ---------- ৳ + branded SMS bodies (short, 1 segment when possible) ---------- */
const bdt = (n) => '৳' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

async function orderPlacedSMS(order) {
  const pay = order.payment.method === 'cod'
    ? `Keep ${bdt(order.totals.grandTotal)} cash ready.`
    : `We are verifying your ${order.payment.method.toUpperCase()} payment (TrxID ${order.payment.trxId}).`;
  return sendSMS(
    order.customer.phone,
    `ArixGear: Order ${order.orderNumber} received — ${bdt(order.totals.grandTotal)}. ${pay} Track on our site with order no + your phone.`
  );
}

async function statusSMS(order) {
  const map = {
    processing: 'Payment verified - your order is being prepared.',
    packed: 'Your order is packed and ready for the courier.',
    shipped: `Shipped${order.courier && order.courier.name ? ' via ' + order.courier.name : ''}${order.courier && order.courier.consignmentNo ? ' (consignment ' + order.courier.consignmentNo + ')' : ''}.`,
    delivered: 'Delivered. Train hard - welcome to the forged.',
    cancelled: 'Your order has been cancelled. Any online payment will be refunded via bKash/Nagad/Rocket within 3 working days.',
    'payment-rejected': `Payment could not be verified (${order.payment.rejectReason || 'TrxID not found'}). Please re-order with a correct TrxID or contact support.`,
  };
  const body = map[order.status];
  if (!body) return { sent: false, reason: 'no SMS template for ' + order.status };
  return sendSMS(order.customer.phone, `ArixGear: Order ${order.orderNumber} — ${body}`);
}

/* ---------- membership SMS — archived with the gym vertical (Phase 2) ---------- */

module.exports = { sendSMS, orderPlacedSMS, statusSMS, normalizeBD };
