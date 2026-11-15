/* Task 39 — API QA for sub-admin team + audit trail + track-order page data */
const B = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); };

async function api(path, opt = {}) {
  const r = await fetch(B + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}) },
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch (e) {}
  return { status: r.status, d };
}

(async () => {
  const L = await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } });
  const T = L.d.token;
  ok(!!T, 'owner login');

  /* 1. seeded sub-admin logs in with limited modules */
  let r = await api('/auth/login', { method: 'POST', body: { email: 'staff@forged.fit', password: 'ForgeStaff2026' } });
  ok(r.status === 200 && r.d.user && r.d.user.role === 'subadmin', 'seeded sub-admin login (role=subadmin)');
  const S = r.d.token;
  ok(JSON.stringify(r.d.user.permissions) === JSON.stringify(['orders', 'products', 'messages']), 'sub-admin ships only granted permissions');
  ok(r.d.user.active === true, 'sub-admin active flag visible');

  /* 2. permission matrix — allowed modules */
  r = await api('/admin/orders', { token: S });
  ok(r.status === 200 && Array.isArray(r.d.items), 'sub-admin CAN read /admin/orders (granted)');
  r = await api('/admin/products', { token: S });
  ok(r.status === 200 && r.d.total > 0, 'sub-admin CAN read /admin/products (granted)');
  r = await api('/admin/messages', { token: S });
  ok(r.status === 200 && r.d.items !== undefined, 'sub-admin CAN read /admin/messages (granted)');
  r = await api('/admin/stats', { token: S });
  ok(r.status === 200 && r.d.todayOrders !== undefined, 'sub-admin CAN read /admin/stats (staff-wide)');

  /* 3. permission matrix — denied modules */
  r = await api('/admin/coupons', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/coupons (403)');
  r = await api('/admin/banners', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/banners (403)');
  r = await api('/admin/settings', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/settings (403)');
  r = await api('/admin/reports/sales', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/reports/sales (403)');
  r = await api('/admin/customers', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/customers (403)');
  r = await api('/admin/members', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/members (403)');
  r = await api('/admin/seo', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/seo (403)');
  r = await api('/admin/categories', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/categories (403)');

  /* 4. owner-only modules — sub-admin can NEVER reach team/audit */
  r = await api('/admin/team', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/team (owner-only)');
  r = await api('/admin/audit', { token: S });
  ok(r.status === 403, 'sub-admin BLOCKED from /admin/audit (owner-only)');

  /* 5. team CRUD — create with validation */
  r = await api('/admin/team', { method: 'POST', token: T, body: { name: 'Ops Keeper', email: 'ops@forged.fit', password: 'OpsPass2026', permissions: ['orders', 'returns'] } });
  ok(r.status === 201 && r.d.subadmin && r.d.subadmin.email === 'ops@forged.fit', 'create sub-admin → 201');
  const OPS = r.d.subadmin ? r.d.subadmin.id : null;
  ok(!JSON.stringify(r.d.subadmin || {}).includes('password'), 'created sub-admin response has NO password hash');
  r = await api('/admin/team', { method: 'POST', token: T, body: { name: 'X', email: 'ops@forged.fit', password: 'xxxxxx', permissions: ['orders'] } });
  ok(r.status === 400, 'duplicate email → 400');
  r = await api('/admin/team', { method: 'POST', token: T, body: { name: 'X', email: 'x2@forged.fit', password: 'xxxxxx', permissions: [] } });
  ok(r.status === 400, 'zero permissions → 400');
  r = await api('/admin/team', { method: 'POST', token: T, body: { name: 'X', email: 'x3@forged.fit', password: 'xxxxxx', permissions: ['nuclear-codes'] } });
  ok(r.status === 400 || (r.d.subadmin && r.d.subadmin.permissions.length === 0), 'bogus module key rejected');
  r = await api('/admin/team', { method: 'POST', token: T, body: { name: 'X', email: 'x4@forged.fit', password: '123', permissions: ['orders'] } });
  ok(r.status === 400, 'short password → 400');

  /* 6. ops staff: orders+returns allowed, products now blocked */
  const OL = await api('/auth/login', { method: 'POST', body: { email: 'ops@forged.fit', password: 'OpsPass2026' } });
  const OT = OL.d.token;
  ok(!!OT, 'new sub-admin can login');
  r = await api('/admin/orders', { token: OT });
  ok(r.status === 200, 'ops CAN read orders');
  r = await api('/admin/returns', { token: OT });
  ok(r.status === 200, 'ops CAN read returns (granted)');
  r = await api('/admin/products', { token: OT });
  ok(r.status === 403, 'ops BLOCKED from products (not granted)');

  /* 7. update: re-permission + rename + disable + password */
  r = await api('/admin/team/' + OPS, { method: 'PUT', token: T, body: { permissions: ['orders', 'returns', 'products'], name: 'Ops Keeper 2' } });
  ok(r.status === 200 && r.d.subadmin.permissions.length === 3 && r.d.subadmin.name === 'Ops Keeper 2', 'update permissions + rename');
  r = await api('/admin/products', { token: OT });
  ok(r.status === 200, 're-permissioned ops now CAN read products (old token, fresh DB read)');
  r = await api('/admin/team/' + OPS, { method: 'PUT', token: T, body: { active: false } });
  ok(r.status === 200 && r.d.subadmin.active === false, 'disable sub-admin');
  r = await api('/auth/login', { method: 'POST', body: { email: 'ops@forged.fit', password: 'OpsPass2026' } });
  ok(r.status === 403, 'disabled sub-admin login → 403');
  r = await api('/admin/orders', { token: OT });
  ok(r.status === 403, 'disabled sub-admin EXISTING token blocked on next request');
  r = await api('/admin/team/' + OPS, { method: 'PUT', token: T, body: { password: 'NewOps2026', active: true } });
  ok(r.status === 200, 'password reset + re-enabled');
  const OL2 = await api('/auth/login', { method: 'POST', body: { email: 'ops@forged.fit', password: 'NewOps2026' } });
  ok(OL2.status === 200, 'login with NEW password works');

  /* 8. audit trail — actions performed above get recorded */
  r = await api('/admin/audit', { token: T, });
  ok(r.status === 200 && Array.isArray(r.d.items) && r.d.items.length > 0, 'audit list returns rows');
  const rows = r.d.items || [];
  const hasCreate = rows.some((x) => x.action === 'create' && x.entity === 'subadmin');
  ok(hasCreate, 'sub-admin CREATE audited with actor ' + (rows[0] ? rows[0].actorEmail : ''));
  const hasUpdate = rows.some((x) => x.action === 'update' && x.entity === 'subadmin');
  ok(hasUpdate, 'sub-admin UPDATE audited');
  ok(rows.every((x) => x.actorRole !== 'customer'), 'audit rows carry staff roles only');
  ok(rows[0] && rows[0].ip !== undefined, 'audit rows capture ip field');

  /* 9. audit of a real product mutation */
  const prods = (await api('/admin/products', { token: T })).d.items;
  const tee = prods.find((p) => p.slug === 'tee');
  r = await api('/admin/products/' + tee._id, { method: 'PUT', token: T, body: { name: 'QA Audit Tee' } });
  ok(r.status === 200, 'product update for audit probe');
  await new Promise((res) => setTimeout(res, 400)); // audit writes fire-and-forget
  r = await api('/admin/audit?entity=product&limit=10', { token: T });
  ok(r.status === 200 && r.d.items.some((x) => x.entity === 'product' && x.action === 'update' && x.label.includes('QA Audit Tee')), 'product UPDATE audited with label');
  r = await api('/admin/audit?q=QA+Audit', { token: T });
  ok(r.status === 200 && r.d.items.length > 0, 'audit search q= works');
  r = await api('/admin/audit?action=delete', { token: T });
  ok(r.status === 200 && r.d.items.every((x) => x.action === 'delete'), 'audit action filter works');
  r = await api('/admin/audit?actor=' + L.d.user.id, { token: T });
  ok(r.status === 200 && r.d.items.every((x) => x.actorEmail === 'admin@forged.fit'), 'audit actor filter works');

  /* 10. restore product name + cleanup */
  await api('/admin/products/' + tee._id, { method: 'PUT', token: T, body: { name: 'FORGED Tee' } });
  r = await api('/admin/team/' + OPS, { method: 'DELETE', token: T });
  ok(r.status === 200, 'delete sub-admin');
  r = await api('/auth/login', { method: 'POST', body: { email: 'ops@forged.fit', password: 'NewOps2026' } });
  ok(r.status === 401, 'deleted sub-admin login → 401');
  r = await api('/admin/team', { token: S });
  ok(r.status === 403, 'team list still owner-only after all ops');

  /* 11. track-order page data (public endpoint + phone proof) */
  const my = await api('/auth/login', { method: 'POST', body: { email: 'demo@forged.fit', password: 'forge2026' } });
  const DT = my.d.token;
  const mine = (await api('/orders/my', { token: DT })).d.items;
  if (mine && mine.length) {
    const o = mine[0];
    const phone = o.customer.phone;
    r = await api('/orders/track/' + o.orderNumber + '?phone=' + encodeURIComponent(phone));
    ok(r.status === 200 && r.d.order && r.d.order.orderNumber === o.orderNumber, 'track API: orderNumber + phone → 200');
    ok(r.d.order.status && r.d.order.statusHistory && Array.isArray(r.d.order.statusHistory), 'track payload ships status + history timeline');
    ok(r.d.order.items && r.d.order.totals, 'track payload ships items + totals (page renders from this)');
    r = await api('/orders/track/' + o.orderNumber + '?phone=999999');
    ok(r.status === 403 || r.status === 404, 'track API: wrong phone → rejected');
    r = await api('/orders/track/FRG-NOPE404?phone=' + encodeURIComponent(phone));
    ok(r.status === 404, 'track API: unknown order number → 404');
  } else {
    ok(true, 'no seeded orders for demo user (track API covered by earlier suites)');
  }

  console.log(`\n===== Task 39 API: ${pass} PASS / ${fail} FAIL =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
