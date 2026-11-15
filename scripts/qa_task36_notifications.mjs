/* Task 36 — API QA: SSE notification system (triggers + list + read + stock guard) */
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

/* orders are multipart: payload JSON string (+ screenshot for mobile methods) */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function placeOrder(payload, token) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify({ idempotencyKey: 'qa36-' + Math.random().toString(36).slice(2), ...payload }));
  if (payload.paymentMethod !== 'cod') {
    fd.append('screenshot', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  }
  const r = await fetch(B + '/orders', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: fd });
  return { status: r.status, d: await j(r) };
}

(async () => {
  const A = (await api('/auth/login', { method: 'POST', body: { email: 'admin@forged.fit', password: 'ForgeAdmin2026' } })).d.token;
  const U = (await api('/auth/login', { method: 'POST', body: { email: 'demo@forged.fit', password: 'forge2026' } })).d.token;
  ok(!!A && !!U, 'admin + demo login');

  /* 0. clean slate */
  await api('/notifications/read-all', { method: 'POST', token: A });
  await api('/notifications/read-all', { method: 'POST', token: U });

  /* 1. SSE stream opens (admin) + receives an event live */
  const events = [];
  const es = await fetch(B + '/notifications/stream?token=' + A, { headers: { Accept: 'text/event-stream' } });
  ok(es.status === 200 && (es.headers.get('content-type') || '').includes('text/event-stream'), 'SSE stream opens (admin)');
  const reader = es.body.getReader();
  const dec = new TextDecoder();
  const readFor = async (ms) => {
    const t0 = Date.now();
    let buf = '';
    while (Date.now() - t0 < ms) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      for (const m of buf.matchAll(/event: notification\ndata: (.+)/g)) events.push(JSON.parse(m[1]));
      if (events.length) break;
    }
    return buf;
  };

  /* 2. new order → admin bell (place a real COD order as demo user) */
  const placed = await placeOrder({ customer: { name: 'Demo Customer', phone: '01712345678' }, shipping: { address: 'House 42, Road 11', city: 'Dhaka', division: 'dhaka', postal: '1213' }, items: [{ slug: 'shaker', qty: 1 }], paymentMethod: 'cod' }, U);
  ok(placed.status === 201, 'order placed (201) ' + (placed.status !== 201 ? JSON.stringify(placed.d) : ''));
  const ono = placed.d.order && placed.d.order.orderNumber;
  await readFor(4000);
  ok(events.some((e) => e.type === 'order' && e.title.includes(ono)), 'LIVE SSE: order → admin bell (' + events.length + ' event)');

  /* 3. admin status change → customer bell (guest excluded, demo has account) */
  const orders = (await api('/admin/orders?search=' + ono, { token: A })).d;
  const oid = orders.items && orders.items[0] ? orders.items[0]._id : (orders.items || [])[0];
  const list0 = (await api('/notifications', { token: U })).d;
  await api('/admin/orders/' + oid + '/status', { method: 'PATCH', token: A, body: { status: 'packed', note: 'QA push' } });
  await new Promise((r) => setTimeout(r, 700));
  const list1 = (await api('/notifications', { token: U })).d;
  ok(list1.unread > list0.unread && list1.items.some((n) => n.type === 'status' && n.title.includes(ono)), 'status change → customer bell (+unread)');

  /* 4. payment verify → customer bell (place a bkash order first) */
  const placed2 = await placeOrder({ customer: { name: 'Demo Customer', phone: '01712345678' }, shipping: { address: 'House 42, Road 11', city: 'Dhaka', division: 'dhaka' }, items: [{ slug: 'belt', qty: 1 }], paymentMethod: 'bkash', trxId: 'QA36' + Math.random().toString(36).slice(2, 8).toUpperCase(), senderNumber: '01712345678' }, U);
  ok(placed2.status === 201, 'bkash order placed ' + (placed2.status !== 201 ? JSON.stringify(placed2.d) : ''));
  const ono2 = placed2.d.order.orderNumber;
  const o2 = (await api('/admin/orders?search=' + ono2, { token: A })).d.items[0];
  const u1 = (await api('/notifications', { token: U })).d.unread;
  await api('/admin/orders/' + o2._id + '/verify', { method: 'PATCH', token: A, body: {} });
  await new Promise((r) => setTimeout(r, 700));
  const u2 = (await api('/notifications', { token: U })).d.unread;
  ok(u2 > u1, 'verify payment → customer bell (unread ' + u1 + '→' + u2 + ')');

  /* 5. guest order → NO customer bell, but admin bell yes */
  const before = (await api('/notifications', { token: A })).d.unread;
  const g = await placeOrder({ customer: { name: 'Guest Guy', phone: '01812345678' }, shipping: { address: 'Road 5', city: 'Dhaka', division: 'dhaka' }, items: [{ slug: 'tee', qty: 1 }], paymentMethod: 'cod' }, null);
  ok(g.status === 201, 'guest order placed');
  await new Promise((r) => setTimeout(r, 700));
  const after = (await api('/notifications', { token: A })).d.unread;
  ok(after > before, 'guest order → admin bell (no user side)');

  /* 6. chat message → admin bell */
  await api('/messages', { method: 'POST', body: { name: 'QA Guest', topic: 'chat', message: 'bell test' } });
  await new Promise((r) => setTimeout(r, 700));
  const msgs = (await api('/notifications', { token: A })).d;
  ok(msgs.items.some((n) => n.type === 'message'), 'chat message → admin bell');

  /* 7. mark one read + mark all read */
  const cur = (await api('/notifications', { token: A })).d;
  const firstUnread = cur.items.find((n) => !n.read);
  await api('/notifications/' + firstUnread._id + '/read', { method: 'POST', token: A });
  const afterOne = (await api('/notifications', { token: A })).d;
  ok(afterOne.unread === cur.unread - 1, 'mark-one-read decrements badge (' + cur.unread + '→' + afterOne.unread + ')');
  await api('/notifications/read-all', { method: 'POST', token: A });
  ok((await api('/notifications', { token: A })).d.unread === 0, 'mark-all-read → badge 0');

  /* 8. stock guard — cancel an order then delete it: stock must restore ONCE */
  const stock0 = (await api('/admin/products?search=whey', { token: A })).d.items[0].stock;
  const c = await placeOrder({ customer: { name: 'Demo Customer', phone: '01712345678' }, shipping: { address: 'House 42, Road 11', city: 'Dhaka', division: 'dhaka' }, items: [{ slug: 'whey', qty: 1 }], paymentMethod: 'cod' }, U);
  const cno = c.d.order.orderNumber;
  const cdoc = (await api('/admin/orders?search=' + cno, { token: A })).d.items[0];
  const stock1 = (await api('/admin/products?search=whey', { token: A })).d.items[0].stock;
  ok(stock1 === stock0 - 1, 'order deducts stock (' + stock0 + '→' + stock1 + ')');
  await api('/orders/' + cno + '/cancel', { method: 'PATCH', body: { phone: '01712345678' } });
  const stock2 = (await api('/admin/products?search=whey', { token: A })).d.items[0].stock;
  ok(stock2 === stock0, 'cancel restores stock (' + stock1 + '→' + stock2 + ')');
  const del = await api('/admin/orders/' + cdoc._id, { method: 'DELETE', token: A });
  ok(del.status === 200, 'cancelled order deleted');
  const stock3 = (await api('/admin/products?search=whey', { token: A })).d.items[0].stock;
  ok(stock3 === stock0, 'STOCK GUARD: delete does NOT double-restore (' + stock2 + '→' + stock3 + ')');

  /* 9. unauth guard */
  const un = await fetch(B + '/notifications/stream');
  ok(un.status === 401, 'stream without token → 401');

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
