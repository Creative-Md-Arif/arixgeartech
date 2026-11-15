/* Task 37 — API QA: sound/push are client-only; this covers the compose loop:
   admin → customer compose → customer /mine inbox + unread → customer reply →
   admin inbox + bell. Plus read-marking + validation. */
const B = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); };
const j = (r) => r.json().catch(() => null);
async function api(path, opt = {}) {
  const r = await fetch(B + path, {
    method: opt.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opt.token ? { Authorization: 'Bearer ' + opt.token } : {}) },
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
  });
  return { status: r.status, d: await j(r) };
}

(async () => {
  const A = (await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } })).d.token;
  const U = (await api('/auth/login', { method: 'POST', body: { email: 'demo@forged.fit', password: 'forge2026' } })).d.token;
  ok(!!A && !!U, 'logins');

  /* find demo user id */
  const custs = (await api('/admin/customers', { token: A })).d.items || [];
  const demo = custs.find((u) => u.email === 'demo@forged.fit');
  demo._id = demo.id || demo._id; /* customers API ships id (public shape) */
  ok(!!demo, 'demo customer in admin customers list');

  /* 1. compose → 201 + bell notification */
  const bell0 = (await api('/notifications', { token: U })).d.unread;
  const c = await api('/admin/messages/compose', { method: 'POST', token: A, body: { userId: demo._id, subject: 'আপনার রিটার্ন অনুমোদিত', body: 'আপনার রিটার্ন রিকোয়েস্ট অনুমোদিত হয়েছে — কুরিয়ার শীঘ্রই পিকআপে আসবে।' } });
  ok(c.status === 201 && c.d.item && c.d.item.direction === 'out', 'admin compose → outbound message');
  await new Promise((r) => setTimeout(r, 600));
  const bell1 = (await api('/notifications', { token: U })).d.unread;
  ok(bell1 > bell0, 'compose → customer bell (' + bell0 + '→' + bell1 + ')');

  /* 2. customer /mine sees it with unread count */
  const mine0 = (await api('/messages/mine', { token: U })).d;
  ok(mine0.items.some((m) => m.direction === 'out' && m.subject === 'আপনার রিটার্ন অনুমোদিত'), 'customer /mine shows the outbound');
  ok(mine0.unread >= 1, 'mine unread ≥ 1 (' + mine0.unread + ')');

  /* 3. markMineRead → unread 0 */
  await api('/messages/mine/read', { method: 'POST', token: U });
  ok((await api('/messages/mine', { token: U })).d.unread === 0, 'markMineRead → 0');

  /* 4. customer reply (topic chat) → admin inbox + admin bell */
  const abell0 = (await api('/notifications', { token: A })).d.unread;
  const rep = await api('/messages', { method: 'POST', token: U, body: { name: 'Demo Customer', email: 'demo@forged.fit', topic: 'chat', message: 'ধন্যবাদ! কুরিয়ার কখন আসবে?' } });
  ok(rep.status === 201, 'customer reply sent');
  const adm = (await api('/admin/messages', { token: A })).d;
  ok(adm.items.some((m) => m.direction === 'in' && m.message.includes('কুরিয়ার')), 'reply lands in admin inbox (bound to user)');
  await new Promise((r) => setTimeout(r, 600));
  const abell1 = (await api('/notifications', { token: A })).d.unread;
  ok(abell1 > abell0, 'reply → admin bell (' + abell0 + '→' + abell1 + ')');

  /* 5. legacy inbound rows match by email (user ref fallback) */
  await api('/messages', { method: 'POST', body: { name: 'Demo By Email', email: 'demo@forged.fit', topic: 'general', message: 'legacy email-bound row for the mine fallback' } });
  const mine1 = (await api('/messages/mine', { token: U })).d;
  ok(mine1.items.some((m) => m.name === 'Demo By Email'), 'legacy inbound matched via email in /mine');

  /* 6. validation: compose without customer / empty body */
  let r = await api('/admin/messages/compose', { method: 'POST', token: A, body: { subject: 'x', body: 'y' } });
  ok(r.status === 400, 'compose without userId → 400');
  r = await api('/admin/messages/compose', { method: 'POST', token: A, body: { userId: demo._id, body: '  ' } });
  ok(r.status === 400, 'compose empty body → 400');
  r = await api('/admin/messages/compose', { method: 'POST', body: { userId: demo._id, body: 'x' } });
  ok(r.status === 401, 'compose unauth → 401');
  r = await api('/messages/mine', { token: A });
  ok(r.status === 200, 'mine works for admin too (no crash)');

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
