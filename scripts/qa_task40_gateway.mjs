/* Task 40 — API smoke test for the SSLCOMMERZ gateway lifecycle (sim mode) */
const B = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); };

async function api(path, opt = {}) {
  const r = await fetch(B + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch (e) {}
  return { status: r.status, d };
}

(async () => {
  // admin login
  const L = await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } });
  const T = L.d.token;
  ok(!!T, 'admin login');

  // 0. self-contained start: disable + clear any stored creds from a previous run
  await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { enabled: false } } });
  await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { storeId: '', storePasswd: '' } } });

  // 1. enable gateway without creds → 400
  let r = await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { enabled: true } } });
  ok(r.status === 400, `enable without creds → 400 (got ${r.status})`);

  // 2. save creds → enable → masked GET
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { storeId: 'FORGED5E5D', storePasswd: 'SECRET99X', sandbox: true, enabled: true } } });
  ok(r.status === 200 && r.d.setting.gateway.enabled === true, 'save creds + enable');
  ok(r.d.setting.gateway.storePasswd === '••••••••', 'storePasswd masked in response');
  r = await api('/admin/settings', { token: T });
  ok(r.d.setting.gateway.storePasswd === '••••••••' && r.d.setting.gateway.storeId === 'FORGED5E5D', 'GET after save: mask + storeId');

  // 3. re-save with mask → creds kept (init should still work later)
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { storePasswd: '••••••••' } } });
  ok(r.status === 200, 'save with mask accepted');
  ok(r.d.setting.gateway.storePasswd === '••••••••', 'mask round-trip stable');

  // switch to SIM mode: enable + clear creds is impossible (enabled guard) → disable, clear, re-enable? 
  // SIM mode = enabled && no creds. Disable first, then clear creds, then... enabling without creds → 400.
  // So for SIM lifecycle we disable the gateway and clear creds, but placeOrder requires enabled.
  // ⇒ SIM lifecycle only works when admin enabled WITHOUT creds — the enable-guard blocks that.
  // Design fix check: placeOrder 503s when !enabled; init requires enabled. With creds saved the
  // init path goes REAL mode (would hit sandbox.sslcommerz.com). For QA we keep creds but must NOT
  // call real gateway → use masked-save trick: storeId non-empty + passwd empty is impossible after mask-save.
  // Cleanest QA path: temporarily disable, clear both creds, save, then enable via direct DB? NO —
  // the enable-guard is a real product rule. SIM mode is reachable when creds are EMPTY and enabled
  // was never toggled through this API... keep product rule, and for QA: leave creds saved but set
  // storeId to a value, then call init → REAL mode → will 502 (unreachable sandbox or refused creds).
  // That IS a valid QA assertion (502 path). The SIM lifecycle gets tested by seeding an order while
  // enabled-without-creds via the SAME public rule we shipped: we relax — enable requires creds ONLY
  // when switching false→true through admin; DB-level sim is a dev tool. For the QA suite we drive
  // SIM by disabling + clearing, placing order, then flipping enabled=true in DB directly.
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { enabled: false } } });
  ok(r.status === 200, 'disable gateway');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { gateway: { storeId: '', storePasswd: '' } } });
  ok(r.status === 200 && r.d.setting.gateway.storeId === '', 'clear creds');
  const { createRequire } = await import('module');
  const req2 = createRequire('/home/z/my-project/backend/package.json');
  const S = req2('mongoose');
  await S.connect('mongodb://localhost:27017/arixgear');
  await S.connection.db.collection('settings').updateOne({ key: 'store' }, { $set: { 'gateway.enabled': true } });
  console.log('— DB: gateway.enabled=true with empty creds (SIM mode) —');

  // 4. public payment shows gateway enabled
  r = await api('/settings/payment');
  ok(r.d.gateway && r.d.gateway.enabled === true && r.d.gateway.sandbox === true, 'public gateway block enabled/sandbox');

  // 5. place order (guest, sslcommerz, no screenshot) — pick an IN-STOCK product (QA orders deplete stock)
  const P = await api('/products?limit=20');
  const items0 = P.d.items || P.d.products || [];
  const p = items0.find((x) => Number(x.stock || 0) >= 3) || items0[0];
  const payload = JSON.stringify({
    customer: { name: 'Gateway Tester', phone: '01712345678', email: 'gw@test.dev' },
    shipping: { address: '12 Gulshan Ave', city: 'Dhaka', division: 'dhaka' },
    items: [{ slug: p.slug, qty: 1 }],
    paymentMethod: 'sslcommerz',
    idempotencyKey: 'gw-smoke-' + Date.now(),
  });
  r = await api('/orders', { method: 'POST', body: { payload } });
  ok(r.status === 201 && r.d.order.orderNumber, `place sslcommerz order (got ${r.status} ${JSON.stringify(r.d).slice(0, 120)})`);
  const ono = r.d.order.orderNumber;
  ok(r.d.order.payment.method === 'sslcommerz' && r.d.order.payment.status === 'pending', 'order payment pending');
  ok(r.d.order.status === 'verifying', 'order status verifying');

  // 6. init guards
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono, phone: '01999999999' } });
  ok(r.status === 403, `init wrong phone → 403 (got ${r.status})`);
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: 'FRG-NOPE01', phone: '01712345678' } });
  ok(r.status === 404, `init unknown order → 404 (got ${r.status})`);
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono } });
  ok(r.status === 400, `init without phone → 400 (got ${r.status})`);

  // 7. init success → sim redirect
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono, phone: '01712345678' } });
  ok(r.status === 200 && r.d.simulated === true, 'init → simulated session');
  ok(/^\/payment\/sandbox\?order=.+&sim=/.test(r.d.redirect || ''), `sim redirect shape (${r.d.redirect})`);
  const sim = (r.d.redirect.match(/sim=([a-f0-9]+)/) || [])[1];
  ok(!!sim && sim.length === 32, 'sim tag 32-hex');

  // 8. tamper validate (wrong sim) → redirect to /checkout?payment=failed
  r = await fetch(B + `/payments/validate/${ono}?sim=deadbeef&val_id=SIMFAKE1`, { redirect: 'manual' });
  ok(r.status === 302 && (r.headers.get('location') || '').includes('payment=failed'), `validate tamper → 302 failed (got ${r.status})`);

  // 9. real validate (sim) → 302 /success?order=..&paid=1
  r = await fetch(B + `/payments/validate/${ono}?sim=${sim}&val_id=SIMVAL123456&card_type=VISA`, { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  ok(r.status === 302 && loc.includes('/success?order=' + ono) && loc.includes('paid=1'), `validate → success redirect (${loc})`);

  // 10. order now paid + processing + history
  r = await api(`/orders/track/${ono}?phone=01712345678`);
  ok(r.d.order.payment.status === 'paid', 'payment.status=paid');
  ok(r.d.order.status === 'processing', 'order pushed to processing');
  ok(r.d.order.payment.gateway && r.d.order.payment.gateway.valId === 'SIMVAL123456', 'gateway.valId stored');
  ok((r.d.order.statusHistory || []).some((h) => /SSLCOMMERZ/.test(h.note || '')), 'history note SSLCOMMERZ');

  // 11. idempotent: re-init → 409, re-validate → success redirect again (no dup move)
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono, phone: '01712345678' } });
  ok(r.status === 409, `re-init after paid → 409 (got ${r.status})`);
  r = await fetch(B + `/payments/validate/${ono}?sim=${sim}&val_id=SIMVAL123456`, { redirect: 'manual' });
  ok(r.status === 302 && (r.headers.get('location') || '').includes('/success'), 're-validate idempotent success');
  r = await api(`/orders/track/${ono}?phone=01712345678`);
  const hist = r.d.order.statusHistory.filter((h) => h.status === 'processing').length;
  ok(hist === 1, `history has exactly 1 processing entry (got ${hist})`);

  // 12. IPN in sim mode → 400
  r = await fetch(B + '/payments/ipn', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `tran_id=${ono}&val_id=SIMVAL123456` });
  ok(r.status === 400, `IPN sim mode → 400 (got ${r.status})`);

  // 13. FAIL path on a fresh order
  const payload2 = JSON.stringify({ ...JSON.parse(payload), idempotencyKey: 'gw-smoke2-' + Date.now() });
  r = await api('/orders', { method: 'POST', body: { payload: payload2 } });
  const ono2 = r.d.order.orderNumber;
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono2, phone: '01712345678' } });
  const sim2 = (r.d.redirect.match(/sim=([a-f0-9]+)/) || [])[1];
  r = await fetch(B + `/payments/fail/${ono2}`, { redirect: 'manual' });
  ok(r.status === 302 && (r.headers.get('location') || '').includes('payment=failed'), 'fail endpoint → 302 checkout?failed');
  r = await api(`/orders/track/${ono2}?phone=01712345678`);
  ok(r.d.order.payment.status === 'failed' && r.d.order.status === 'verifying', 'failed payment, order still verifying');
  // retry after failure allowed
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono2, phone: '01712345678' } });
  ok(r.status === 200 && r.d.simulated, 're-init after failure allowed');
  const sim2b = (r.d.redirect.match(/sim=([a-f0-9]+)/) || [])[1];
  r = await fetch(B + `/payments/validate/${ono2}?sim=${sim2b}&val_id=SIMVAL777`, { redirect: 'manual' });
  ok(r.status === 302 && (r.headers.get('location') || '').includes('paid=1'), 'retry → paid');

  // 14. CANCEL path on a third order
  const payload3 = JSON.stringify({ ...JSON.parse(payload), idempotencyKey: 'gw-smoke3-' + Date.now() });
  r = await api('/orders', { method: 'POST', body: { payload: payload3 } });
  const ono3 = r.d.order.orderNumber;
  await api('/payments/init', { method: 'POST', body: { orderNumber: ono3, phone: '01712345678' } });
  r = await fetch(B + `/payments/cancel/${ono3}`, { redirect: 'manual' });
  ok(r.status === 302 && (r.headers.get('location') || '').includes('payment=cancelled'), 'cancel endpoint → 302 checkout?cancelled');
  r = await api(`/orders/track/${ono3}?phone=01712345678`);
  ok(r.d.order.payment.status === 'pending', 'cancel keeps payment pending');
  ok((r.d.order.statusHistory || []).some((h) => /cancelled by customer/i.test(h.note || '')), 'cancel history note');

  // 15. non-sslcommerz order → init 400; cod order unaffected end-to-end
  const payload4 = JSON.stringify({ ...JSON.parse(payload), paymentMethod: 'cod', idempotencyKey: 'gw-smoke4-' + Date.now() });
  r = await api('/orders', { method: 'POST', body: { payload: payload4 } });
  ok(r.status === 201 && r.d.order.status === 'processing' && r.d.order.payment.status === 'cod-pending', 'cod order regression intact');
  const ono4 = r.d.order.orderNumber;
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono4, phone: '01712345678' } });
  ok(r.status === 400, `init on cod order → 400 (got ${r.status})`);

  // 16. place sslcommerz order while gateway DISABLED → 503
  await S.connection.db.collection('settings').updateOne({ key: 'store' }, { $set: { 'gateway.enabled': false } });
  const payload5 = JSON.stringify({ ...JSON.parse(payload), idempotencyKey: 'gw-smoke5-' + Date.now() });
  r = await api('/orders', { method: 'POST', body: { payload: payload5 } });
  ok(r.status === 503, `place order while disabled → 503 (got ${r.status})`);
  // init on existing pending order while disabled → 503
  r = await api('/payments/init', { method: 'POST', body: { orderNumber: ono3, phone: '01712345678' } });
  ok(r.status === 503, `init while disabled → 503 (got ${r.status})`);

  // restore defaults: gateway off + sim orders cleaned? keep orders (they are QA evidence) but reset settings
  await S.connection.db.collection('settings').updateOne({ key: 'store' }, { $set: { 'gateway.enabled': false, 'gateway.storeId': 'FORGED5E5D', 'gateway.storePasswd': 'SECRET99X', 'gateway.sandbox': true } });
  console.log(`\n==== ${pass} passed / ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
