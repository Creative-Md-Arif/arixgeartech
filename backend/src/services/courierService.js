const Setting = require('../models/Setting');

/* ================= courierService — BD courier API integration (Layer 3 #11) =================
   Pushes a shipped order to the configured courier and returns consignment data.

   Providers (Admin → Settings → Courier):
     • steadfast — Steadfast Courier (portal.packzy.com). Simplest BD API:
       headers `Api-Key` + `Secret-Key`, returns { tracking_code }.
     • pathao — Pathao Courier (Hermes API): OAuth password-token then create order.
     • none — dry-run mode: manual dispatch, response explains it.

   Every call is defensive: config half-missing → dry-run answer, network/API
   failure → { ok:false, message } — the ERP button always gets an answer and
   never 500s. Credentials live in the admin Settings document (admin-only read).

   Response shape (uniform): { ok, provider, dryRun?, consignmentNo?, trackingUrl?, message? } */

const STEADFAST_URL = 'https://portal.packzy.com/api/v1/createOrder';
const STEADFAST_TRACK = 'https://steadfast.com.bd/t/';

async function pushSteadfast(order, cfg) {
  const { apiKey, secretKey } = cfg || {};
  if (!apiKey || !secretKey) {
    return { ok: false, provider: 'steadfast', dryRun: true, message: 'Steadfast API keys not set — Admin → Settings → Courier' };
  }
  try {
    const r = await fetch(STEADFAST_URL, {
      method: 'POST',
      headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice: order.orderNumber,
        recipient_name: order.customer.name,
        recipient_phone: order.customer.phone,
        recipient_address: [order.shipping.address, order.shipping.city, order.shipping.division].filter(Boolean).join(', '),
        cod_amount: order.totals.grandTotal,
        note: order.shipping.notes || '',
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || (d.status && Number(d.status) !== 200)) {
      return { ok: false, provider: 'steadfast', message: d.message || `Steadfast HTTP ${r.status}` };
    }
    const code = d.tracking_code || d.consignment_id || '';
    return {
      ok: Boolean(code),
      provider: 'steadfast',
      consignmentNo: code,
      trackingUrl: code ? STEADFAST_TRACK + code : null,
      message: d.message || 'Consignment created',
    };
  } catch (e) {
    return { ok: false, provider: 'steadfast', message: 'Steadfast unreachable — ' + e.message };
  }
}

async function pushPathao(order, cfg) {
  const { baseUrl = 'https://api-hermes.pathao.com', storeId, clientId, clientSecret, username, password } = cfg || {};
  if (!storeId || !clientId || !clientSecret || !username || !password) {
    return { ok: false, provider: 'pathao', dryRun: true, message: 'Pathao credentials not set — Admin → Settings → Courier' };
  }
  const base = String(baseUrl).replace(/\/+$/, '');
  try {
    /* 1. OAuth password grant */
    const tr = await fetch(`${base}/aladdin/api/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, username, password, grant_type: 'password' }),
    });
    const td = await tr.json().catch(() => ({}));
    const token = td.access_token;
    if (!tr.ok || !token) {
      return { ok: false, provider: 'pathao', message: td.message || `Pathao auth failed (HTTP ${tr.status})` };
    }
    /* 2. create the consignment */
    const or = await fetch(`${base}/aladdin/api/v1/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        store_id: Number(storeId),
        merchant_order_id: order.orderNumber,
        recipient_name: order.customer.name,
        recipient_phone: order.customer.phone,
        recipient_address: [order.shipping.address, order.shipping.city].filter(Boolean).join(', '),
        amount: order.totals.grandTotal,
        item_quantity: (order.items || []).reduce((a, i) => a + (i.qty || 0), 0),
        item_weight: 0.5,
        item_description: (order.items || []).map((i) => i.name).join(', ').slice(0, 200),
        delivery_type: 48,
        item_type: 2,
      }),
    });
    const od = await or.json().catch(() => ({}));
    const info = od.data || od;
    if (!or.ok || !(info.consignment_id || info.tracking_code)) {
      return { ok: false, provider: 'pathao', message: (od.message && String(od.message)) || `Pathao HTTP ${or.status}` };
    }
    return {
      ok: true,
      provider: 'pathao',
      consignmentNo: info.consignment_id || info.tracking_code,
      trackingUrl: null,
      message: 'Consignment created',
    };
  } catch (e) {
    return { ok: false, provider: 'pathao', message: 'Pathao unreachable — ' + e.message };
  }
}

async function pushToCourier(order) {
  const s = await Setting.get();
  const c = s.courier || {};
  const provider = c.provider || 'none';
  if (provider === 'steadfast') return pushSteadfast(order, c.steadfast);
  if (provider === 'pathao') return pushPathao(order, c.pathao);
  return { ok: false, provider: 'none', dryRun: true, message: 'No courier provider configured — dispatch stays manual' };
}

module.exports = { pushToCourier };
