/* QA — frontend packs backend surfaces: flash sale, address book, profile/
   password self-service, loyalty + referral, user notifications (SSE + inbox),
   order note delivery. Run: node scripts/qa_task42_packs.mjs  */
const BASE = process.env.QA_BASE || 'http://localhost:5000';
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } };

async function j(method, path, { token, body, form } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: form ? form : body !== undefined ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

const ts = Date.now();
const USER = { email: `qa-pack-${ts}@forged.fit`, password: 'forge2026', name: 'QA Packer', phone: '01712000456' };

console.log('— Packs: flash sale / address book / profile / loyalty / notifications —');

/* 0. admin boot */
const admin = (await j('POST', '/api/auth/login', { body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } })).data;
ok(Boolean(admin.token), 'admin login');
const A = admin.token;

/* 1. FLASH SALE — save via settings, read via public endpoint */
const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
const fs1 = await j('PUT', '/api/admin/settings', { token: A, body: { flashSale: { enabled: true, label: 'QA FLASH', sublabel: 'qa drop', link: '/shop', endsAt: future } } });
ok(fs1.status === 200, 'flashSale saved (admin settings)');
const fsPub = await j('GET', '/api/settings/flash-sale');
ok(fsPub.data.flashSale.enabled === true && fsPub.data.flashSale.label === 'QA FLASH', 'public flash-sale reflects instantly');
const fsBad = await j('PUT', '/api/admin/settings', { token: A, body: { flashSale: { endsAt: 'not-a-date' } } });
ok(fsBad.status === 400, 'invalid endsAt → 400');
const fsPast = await j('GET', '/api/settings/flash-sale');
ok(fsPast.data.flashSale.enabled === true, 'future end → enabled');
await j('PUT', '/api/admin/settings', { token: A, body: { flashSale: { enabled: false, endsAt: null } } });
ok((await j('GET', '/api/settings/flash-sale')).data.flashSale.enabled === false, 'cleared flash → disabled');

/* 2. REGISTER → Task 51: unverified; exchange the emailed OTP for a token */
const reg = await j('POST', '/api/auth/register', { body: USER });
ok(reg.status === 201 && reg.data.needsVerification === true && reg.data.devOtp, 'register works (unverified + devOtp)');
const ver = await j('POST', '/api/auth/verify-email', { body: { email: USER.email, code: reg.data.devOtp } });
ok(ver.status === 200 && ver.data.token && ver.data.user.emailVerified === true, 'OTP verify → token');
const T = ver.data.token;

/* 3. ADDRESS BOOK — CRUD + default management */
const ad1 = await j('POST', '/api/auth/addresses', { token: T, body: { label: 'Home', line: '12 Barbell Row', city: 'Mirpur', division: 'dhaka', postal: '1216', isDefault: true } });
ok(ad1.status === 201 && ad1.data.addresses[0].isDefault === true, 'address added as default');
const ad2 = await j('POST', '/api/auth/addresses', { token: T, body: { label: 'Office', line: '9 Iron Street', city: 'Gulshan', division: 'dhaka', postal: '1212' } });
ok(ad2.status === 201 && ad2.data.addresses.length === 2, 'second address added');
ok(ad2.data.addresses[0].isDefault === true && ad2.data.addresses[1].isDefault === false, 'default stays on first');
const ad3 = await j('PUT', '/api/auth/addresses/1', { token: T, body: { isDefault: true } });
ok(ad3.status === 200 && ad3.data.addresses[1].isDefault === true && ad3.data.addresses[0].isDefault === false, 'make-default promotes + demotes');
const adBad = await j('POST', '/api/auth/addresses', { token: T, body: { line: 'X', division: 'atlantis' } });
ok(adBad.status === 400, 'invalid division → 400');
const ad4 = await j('DELETE', '/api/auth/addresses/1', { token: T });
ok(ad4.status === 200 && ad4.data.addresses[0].isDefault === true, 'delete falls default back to remaining');

/* 4. PROFILE + PASSWORD */
const pf = await j('PATCH', '/api/auth/profile', { token: T, body: { name: 'QA Packer Jr', phone: '01712000457' } });
ok(pf.status === 200 && pf.data.user.name === 'QA Packer Jr', 'profile update works');
const pfBad = await j('PATCH', '/api/auth/profile', { token: T, body: { phone: '999' } });
ok(pfBad.status === 400, 'invalid phone → 400');
const pwBad = await j('POST', '/api/auth/change-password', { token: T, body: { current: 'wrong', next: 'forge2027' } });
ok(pwBad.status === 401, 'wrong current password → 401');
const pwOk = await j('POST', '/api/auth/change-password', { token: T, body: { current: 'forge2026', next: 'forge2027' } });
ok(pwOk.status === 200, 'password change works');
const relog = await j('POST', '/api/auth/login', { body: { email: USER.email, password: 'forge2027' } });
ok(relog.status === 200, 'login with new password works');

/* 5. LOYALTY — code issued; referral credits both sides */
const lo1 = await j('GET', '/api/auth/loyalty', { token: relog.data.token });
ok(lo1.status === 200 && lo1.data.referralCode && lo1.data.referralCode.startsWith('FRG-R-'), 'loyalty code auto-issued: ' + lo1.data.referralCode);
const USER2 = { email: `qa-ref-${ts}@forged.fit`, password: 'forge2026', name: 'QA Referred' };
const reg2 = await j('POST', '/api/auth/register', { body: { ...USER2, ref: lo1.data.referralCode } });
ok(reg2.status === 201, 'referred register works');
/* Task 51 — referral credits land at VERIFICATION, not at register */
const ver2 = await j('POST', '/api/auth/verify-email', { body: { email: USER2.email, code: reg2.data.devOtp } });
ok(ver2.status === 200 && ver2.data.token, 'referred account verified (OTP)');
const lo2 = await j('GET', '/api/auth/loyalty', { token: ver2.data.token });
ok(lo2.data.points === 50, 'referred newcomer gets +50 starter pts (after verify)');
const lo3 = await j('GET', '/api/auth/loyalty', { token: relog.data.token });
ok(lo3.data.points === 100, 'referrer got +100 pts (after referree verified)');

/* 6. ORDER + NOTE → NOTIFICATIONS (place an order as the logged-in user;
   POST /api/orders takes a multipart-style body: payload = JSON STRING) */
const prods = (await j('GET', '/api/products?limit=4')).data.items || [];
ok(prods.length >= 1, 'catalog has products');
const slug = prods[0].slug;
const payloadStr = JSON.stringify({
  customer: { name: USER2.name, phone: USER.phone, email: USER2.email },
  shipping: { address: '12 Barbell Row', city: 'Mirpur', division: 'dhaka', postal: '1216', notes: 'Ring the bell twice — QA note' },
  items: [{ slug, qty: 1 }],
  paymentMethod: 'cod',
  idempotencyKey: 'qa-pack-' + ts,
});
const order = await j('POST', '/api/orders', { token: relog.data.token, body: { payload: payloadStr } });
ok(order.status === 201 && order.data.order.orderNumber, 'order placed (COD, logged-in)');
const ORD = order.data.order.orderNumber;
ok(order.data.order.shipping.notes === 'Ring the bell twice — QA note', 'order note stored (cart-drawer note flows through)');

/* status change → notification lands (order id comes from the admin ledger —
   publicView intentionally omits _id/user) */
const ledger = await j('GET', '/api/admin/orders?q=' + encodeURIComponent(ORD), { token: A });
const ledgerRow = (ledger.data.items || [])[0];
ok(ledgerRow && ledgerRow.user, 'order linked to the account');
const oid = ledgerRow && ledgerRow._id;
ok(Boolean(oid), 'admin ledger resolves the order id');
const st = await j('PATCH', `/api/admin/orders/${oid}/status`, { token: A, body: { status: 'shipped', note: 'QA ship' } });
ok(st.status === 200, 'admin shipped the order');
const notif = await j('GET', '/api/notifications', { token: relog.data.token });
ok(notif.status === 200 && (notif.data.items || []).some((n) => (n.title || '').toLowerCase().includes('shipped') && (n.title || '').includes(ORD)), 'inbox has the shipped push');
ok(notif.data.unread >= 1, 'unread count ≥ 1');

/* mark read */
const target = (notif.data.items || []).find((n) => !(n.read));
const mr = await j('POST', `/api/notifications/${target.id}/read`, { token: relog.data.token });
ok(mr.status === 200, 'mark-one-read works');
const mra = await j('POST', '/api/notifications/read-all', { token: relog.data.token });
ok(mra.status === 200 && mra.data.unread === 0, 'read-all zeroes the badge');

/* delivered → loyalty points awarded once */
const st2 = await j('PATCH', `/api/admin/orders/${oid}/status`, { token: A, body: { status: 'delivered' } });
ok(st2.status === 200, 'delivered');
const lo4 = await j('GET', '/api/auth/loyalty', { token: relog.data.token });
ok(lo4.data.points === 100 + Math.floor(order.data.order.totals.grandTotal / 100), 'delivery points awarded (1pt/৳100) — points now ' + lo4.data.points);
ok((await j('GET', '/api/notifications', { token: relog.data.token })).data.items.some((n) => (n.title || '').includes('loyalty points')), 'loyalty push in inbox');

/* SSE smoke — stream opens with a valid token, 401 without */
const sseCtrl = new AbortController();
const sseRes = await fetch(BASE + '/api/notifications/stream?token=' + relog.data.token, { signal: sseCtrl.signal });
ok(sseRes.status === 200 && (sseRes.headers.get('content-type') || '').includes('text/event-stream'), 'SSE stream opens (valid token)');
sseCtrl.abort(); // close immediately — the stream never ends on its own
ok((await fetch(BASE + '/api/notifications/stream')).status === 401, 'SSE without token → 401');

/* cleanup: restore flash sale defaults */
await j('PUT', '/api/admin/settings', { token: A, body: { flashSale: { enabled: false, label: 'FLASH SALE', sublabel: 'Save big — limited time only', link: '/shop', endsAt: null } } });

console.log(`\n──────── RESULT: ${pass} PASS · ${fail} FAIL ────────`);
process.exit(fail ? 1 : 0);
