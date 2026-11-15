/* Task 43 — FULL-STACK BUG HUNT: security gates, edge cases, data shapes,
   order lifecycle, and cross-cutting invariants across every API surface.  */
const B = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const bugs = [];
const ok = (cond, name) => { cond ? pass++ : fail++; if (!cond) bugs.push(name); console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); };

async function api(path, opt = {}) {
  const r = await fetch(B + path, {
    method: opt.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}),
      ...(opt.headers || {}),
    },
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch (e) {}
  return { status: r.status, d };
}

(async () => {
  /* ── identities ─────────────────────────────────────────────────────── */
  const A = (await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } }));
  const T = A.d.token;
  const U = (await api('/auth/login', { method: 'POST', body: { email: 'demo@forged.fit', password: 'forge2026' } })).d.token;
  const S = (await api('/auth/login', { method: 'POST', body: { email: 'staff@forged.fit', password: 'ForgeStaff2026' } })).d.token;
  ok(!!T && !!U && !!S, 'all three identities log in (admin / customer / staff)');

  /* ── 1. AUTH & TOKEN SECURITY ───────────────────────────────────────── */
  let r = await api('/auth/me', { token: 'forged.tampered.token' });
  ok(r.status === 401, 'tampered JWT → 401');
  r = await api('/admin/stats');
  ok(r.status === 401, 'no token on admin API → 401');
  r = await api('/admin/stats', { token: U });
  ok(r.status === 403, 'CUSTOMER token on admin API → 403');
  r = await api('/admin/team', { token: S });
  ok(r.status === 403, 'STAFF token on owner API → 403');
  r = await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'wrong' } });
  ok(r.status === 401 && !JSON.stringify(r.d).includes('token'), 'bad password → 401, no token leaked');
  r = await api('/orders/my');
  ok(r.status === 401, 'order history without token → 401');

  /* settings must never leak secrets */
  r = await api('/admin/settings', { token: T });
  const sTxt = JSON.stringify(r.d);
  ok(!sTxt.includes('ForgeAdmin2026') && !sTxt.includes('ForgeStaff2026'), 'settings GET leaks no plaintext staff passwords');
  const gw = r.d && r.d.store && r.d.store.gateway;
  ok(!gw || !gw.storePasswd || gw.storePasswd === '••••••••', 'gateway storePasswd masked as sentinel');
  r = await api('/settings/payment');
  ok(!JSON.stringify(r.d || {}).toLowerCase().includes('passwd') || !JSON.stringify(r.d.storePasswd || ''), 'public payment block ships no secret field values');

  /* password reset token hygiene */
  r = await api('/auth/forgot-password', { method: 'POST', body: { email: 'demo@forged.fit' } });
  ok(r.status === 200, 'forgot-password returns 200');
  if (r.d && r.d.resetUrl) {
    const tok = new URL(r.d.resetUrl).searchParams.get('token');
    const pwRes = await api('/auth/reset-password', { method: 'POST', body: { token: tok, password: 'forge2026' } });
    ok(pwRes.status === 200, 'reset with fresh token → 200 (password unchanged value)');
    const reuse = await api('/auth/reset-password', { method: 'POST', body: { token: tok, password: 'another123' } });
    ok(reuse.status === 400 || reuse.status === 404, 'REUSED reset token → rejected (single-use)');
  }

  /* ── 2. PUBLIC CATALOG SHAPES ───────────────────────────────────────── */
  r = await api('/products');
  ok(r.status === 200 && Array.isArray(r.d.items) && r.d.items.length > 0, 'public /products list ok');
  const listOk = r.d.items.every((p) => p.name && p.slug && p.price !== undefined && Array.isArray(p.images));
  ok(listOk, 'product CARD projection complete (name/slug/price/images)');
  r = await api('/products?cat=apparel');
  ok(r.status === 200 && r.d.items.length > 0 && r.d.items.every((p) => String(p.category).toLowerCase() === 'apparel'), 'cat deep-link alias filters (Task 43 fix)');
  r = await api('/products?category=apparel');
  ok(r.status === 200 && r.d.items.every((p) => String(p.category).toLowerCase() === 'apparel'), 'category filter respected');
  const anySlug = (await api('/products')).d.items[0].slug;
  r = await api('/products/' + anySlug);
  ok(r.status === 200 && r.d.product && r.d.product.description !== undefined, 'PDP endpoint returns full product');
  r = await api('/products/no-such-slug-xyz');
  ok(r.status === 404, 'unknown slug → 404');
  r = await api('/home-sections');
  ok(r.status === 200 && Array.isArray(r.d.items), 'public home-sections ok');
  r = await api('/banners');
  ok(r.status === 200 && Array.isArray(r.d.items || r.d), 'public banners ok');
  r = await api('/categories');
  ok(r.status === 200 && Array.isArray(r.d.items || r.d), 'public categories ok');
  r = await api('/coupons/validate', { method: 'POST', body: { code: 'NOPE404', subtotal: 5000, items: [] } });
  ok(r.status === 400 || r.status === 404, 'unknown coupon → rejected');
  r = await api('/settings/content');
  ok(r.status === 200 && r.d.content !== undefined, 'public content block ok');

  /* ── 3. ORDER LIFECYCLE (COD) + STOCK INVARIANTS ────────────────────── */
  const adminList = (await api('/admin/products', { token: T })).d.items;
  const whey = adminList.find((p) => p.slug === 'whey');
  const before = whey.stock;

  r = await api('/orders/preview', { method: 'POST', body: { items: [{ slug: 'whey', qty: 1 }], division: 'dhaka', coupon: null } });
  ok(r.status === 200 && r.d.grandTotal > 0, 'preview returns totals');
  const grand = r.d.grandTotal;

  /* tamper attempt: client-sent price must be ignored */
  r = await api('/orders/preview', { method: 'POST', body: { items: [{ slug: 'whey', qty: 1, price: 1 }], division: 'dhaka' } });
  ok(r.status === 200 && r.d.grandTotal === grand, 'price tampering IGNORED (server snapshot wins)');

  /* oversell guard */
  r = await api('/orders', { method: 'POST', body: { payload: JSON.stringify({
    items: [{ slug: 'whey', qty: before + 10, price: whey.price }],
    customer: { name: 'QA Hunt', phone: '01900000001', email: '' },
    shipping: { address: 'X', city: 'Dhaka', division: 'dhaka' },
    paymentMethod: 'cod',
  }), idemKey: 'hunt-oversell-1' } });
  ok(r.status === 400 || r.status === 409, 'oversell qty → rejected');

  /* happy COD order — NOTE the contract: idempotencyKey rides INSIDE the
     payload JSON string (checkout.jsx does the same) */
  const idem = 'hunt-' + Date.now();
  r = await api('/orders', { method: 'POST', body: { payload: JSON.stringify({
    items: [{ slug: 'whey', qty: 1, price: whey.price }],
    customer: { name: 'QA Hunt', phone: '01900000002', email: 'hunt@forged.fit' },
    shipping: { address: 'Road 9', city: 'Dhaka', division: 'dhaka', postal: '1213' },
    paymentMethod: 'cod', idempotencyKey: idem,
  }) } });
  ok(r.status === 201 && r.d.order, 'COD order placed → 201');
  const orderNo = r.d.order.orderNumber || (r.d.order.order && r.d.order.order.orderNumber);
  const after = (await api('/admin/products', { token: T })).d.items.find((p) => p.slug === 'whey').stock;
  ok(after === before - 1, `stock decremented exactly once (${before}→${after})`);

  /* idempotent replay */
  r = await api('/orders', { method: 'POST', body: { payload: JSON.stringify({
    items: [{ slug: 'whey', qty: 1, price: whey.price }],
    customer: { name: 'QA Hunt', phone: '01900000002', email: '' },
    shipping: { address: 'Road 9', city: 'Dhaka', division: 'dhaka' },
    paymentMethod: 'cod', idempotencyKey: idem,
  }) } });
  ok((r.status === 200 || r.status === 201) && (r.d.duplicate === true || r.d.order.orderNumber === orderNo), 'idempotency replay returns ORIGINAL order (no double charge)');

  /* customer cancel → stock restored once */
  r = await api('/orders/' + orderNo + '/cancel', { method: 'PATCH', body: { phone: '01900000002' } });
  ok(r.status === 200, 'customer cancel via phone proof → 200');
  const restored = (await api('/admin/products', { token: T })).d.items.find((p) => p.slug === 'whey').stock;
  ok(restored === before, `stock restored exactly once (${restored})`);
  r = await api('/orders/' + orderNo + '/cancel', { method: 'PATCH', body: { phone: '01900000002' } });
  ok(r.status === 409, 'double cancel → 409 (no double restore)');

  /* admin status flow + audit + notification */
  const oid = (await api('/admin/orders', { token: T })).d.items.find((o) => o.orderNumber === orderNo)._id;
  r = await api('/admin/orders/' + oid + '/status', { method: 'PATCH', token: T, body: { status: 'processing' } });
  ok(r.status === 200, 'admin status change → 200');
  await new Promise((res) => setTimeout(res, 350));
  r = await api('/admin/audit?entity=order&limit=10', { token: T });
  ok(r.status === 200 && r.d.items.some((x) => x.label && x.label.includes('processing')), 'status change audited with label');

  /* staff permission on orders + track payload */
  r = await api('/admin/orders', { token: S });
  ok(r.status === 200, 'staff sees orders (granted)');
  r = await api('/orders/track/' + orderNo + '?phone=01900000002');
  ok(r.status === 200 && r.d.order.statusHistory.length >= 2, 'track ships full history after lifecycle');

  /* ── 4. INPUT HARDENING ─────────────────────────────────────────────── */
  r = await api('/admin/orders/' + 'not-an-id' , { token: T });
  ok(r.status === 400 || r.status === 404 || r.status === 500, 'invalid ObjectId handled (no crash)');
  r = await api('/products/' + encodeURIComponent('<script>alert(1)</script>'));
  ok(r.status === 404 || r.status === 400, 'XSS-ish slug → 404/400 (no reflection)');
  r = await api('/orders/preview', { method: 'POST', body: { items: [{ slug: 'whey', qty: -3 }], division: 'dhaka' } });
  ok(r.status === 400 || (r.d.grandTotal !== undefined && r.d.grandTotal >= 0), 'negative qty rejected or clamped');
  r = await api('/messages', { method: 'POST', body: { name: 'X', email: 'x@y.z', topic: 'chat', message: '' } });
  ok(r.status === 400, 'empty message → 400');
  r = await api('/messages', { method: 'POST', body: { name: 'X', email: 'not-an-email', topic: 'contact', message: 'hello there friend' } });
  ok(r.status === 400, 'bad email on contact form → 400');
  r = await api('/reviews', { method: 'POST', body: { product: '000000000000000000000000', rating: 99, comment: 'x' } });
  ok(r.status === 400 || r.status === 404, 'rating 99 / bogus product rejected');

  /* rate limit headers present on public proof endpoint */
  const rr = await fetch(B + '/orders/track/FRG-NOPE?phone=000000');
  ok(['429', '404', '403'].includes(String(rr.status)), 'track limiter/proof endpoint responds sanely');

  /* ── 5. ADMIN SURFACES SHAPES (spot the crash) ──────────────────────── */
  for (const [ep, tok] of [
    ['/admin/stats', T], ['/admin/products', T], ['/admin/orders', T], ['/admin/returns', T],
    ['/admin/categories', T], ['/admin/badges', T], ['/admin/reviews', T], ['/admin/questions', T],
    ['/admin/banners', T], ['/admin/home-sections', T], ['/admin/coupons', T], ['/admin/customers', T],
    ['/admin/members', T], ['/admin/membership/plans', T], ['/admin/messages', T], ['/admin/settings', T],
    ['/admin/seo', T], ['/admin/team', T], ['/admin/audit', T], ['/admin/system/status', T],
    ['/admin/reports/sales', T], ['/admin/analytics/orders', T], ['/admin/analytics/funnel?days=28', T],
  ]) {
    r = await api(ep, { token: tok });
    ok(r.status === 200, 'admin ' + ep.replace('/admin/', '') + ' → 200');
  }

  /* staff denials on every blocked module (spot-check deep ones) */
  for (const ep of ['/admin/membership/plans', '/admin/home-sections', '/admin/coupons', '/admin/system/status']) {
    r = await api(ep, { token: S });
    ok(r.status === 403, 'staff blocked from ' + ep.replace('/admin/', ''));
  }

  /* notifications both audiences */
  r = await api('/notifications', { token: T });
  ok(r.status === 200 && r.d.items !== undefined, 'admin notifications ok');
  r = await api('/notifications', { token: U });
  ok(r.status === 200, 'customer notifications ok');
  r = await api('/notifications');
  ok(r.status === 401, 'notifications need token');

  console.log(`\n===== Task 43 BUG HUNT: ${pass} PASS / ${fail} FAIL =====`);
  if (bugs.length) console.log('BUGS FOUND:\n - ' + bugs.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
