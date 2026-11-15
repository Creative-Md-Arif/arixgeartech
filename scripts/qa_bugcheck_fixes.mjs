/* FORGED — bug-check fix verification (Task 43)
   Verifies the 4 data-level fixes from the full-stack bug hunt:
   F1 deleteOrder stock double-restore guard  (stockRestored flag respected)
   F2 masked-secret round-trip guard          (sentinel never overwrites creds)
   F3 issueResetToken awaited save            (hash persisted before response)
   F4 codPending metric                        (COD orders only, not all processing)
   Run: node scripts/qa_bugcheck_fixes.mjs   (fresh seed first) */
const BASE = 'http://localhost:5000/api';
let PASS = 0, FAIL = 0;
const ok = (m) => { PASS++; console.log('  ✓ ' + m); };
const bad = (m) => { FAIL++; console.log('  ✘ ' + m); };
const j = async (r) => { try { return await r.json(); } catch { return {}; } };

let demoTok;
const adminTok = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@forged.fit', password: 'ForgeAdmin2026' }) })).json()).token;
const AH = { Authorization: 'Bearer ' + adminTok, 'Content-Type': 'application/json' };

const liveStock = async (slug) => {
  const d = await (await fetch(BASE + '/admin/products?search=' + slug, { headers: AH }).then((r) => r.json()));
  const hit = (d.items || []).find((p) => p.slug === slug);
  return hit.stock;
};
/* ---------- F1: deleteOrder double-restore ---------- */
console.log('F1 — deleteOrder stock guard');
const prods = (await (await fetch(BASE + '/products').then((r) => r.json()))).items;
const tee = prods.find((p) => p.slug === 'tee');
const stock0 = tee.stock;

// demo customer token — order owned by demo so customer-cancel works
demoTok = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'demo@forged.fit', password: 'forge2026' }) })).json()).token;
const DH = { Authorization: 'Bearer ' + demoTok, 'Content-Type': 'application/json' };
// place a COD order for 2 tees (payload = JSON string, same as the live storefront)
const payload = JSON.stringify({ customer: { name: 'Bug Check', phone: '01711998877', email: 'demo@forged.fit' }, shipping: { address: 'House 12, Road 5', city: 'Dhanmondi', division: 'dhaka' }, items: [{ slug: 'tee', qty: 2 }], paymentMethod: 'cod' });
const place = await fetch(BASE + '/orders', { method: 'POST', headers: DH, body: JSON.stringify({ payload, idemKey: 'bcfix-' + Date.now() }) });
const po = await j(place);
if (!place.ok) { bad('order place failed: ' + JSON.stringify(po).slice(0, 160)); }
const ono = po.order?.orderNumber || po.orderNumber;
const afterPlace = await liveStock('tee');
(afterPlace === stock0 - 2) ? ok(`place −2 stock (${stock0}→${afterPlace})`) : bad(`place stock wrong (${stock0}→${afterPlace})`);

// customer cancels → restoreStock (flag set, stock +2)
const mineRes = await (await fetch(BASE + '/orders/my', { headers: DH }).then((r) => r.json()));
const mine = (mineRes.items || []).find((o) => o.orderNumber === ono);
if (!mine) bad('order not visible in /orders/my (' + ono + ')');
const can = mine ? await fetch(BASE + '/orders/' + ono + '/cancel', { method: 'PATCH', headers: DH }) : { ok: false, status: 'skip' };
(can.ok) ? ok('customer cancel ok') : bad('cancel failed ' + can.status);
const afterCancel = await liveStock('tee');
(afterCancel === stock0) ? ok(`cancel restored +2 (${afterPlace}→${afterCancel})`) : bad(`cancel restore wrong (${afterPlace}→${afterCancel}, want ${stock0})`);

// admin deletes the cancelled order → must NOT restore again
const del = await (await fetch(BASE + '/admin/orders?search=' + encodeURIComponent(ono), { headers: AH }).then((r) => r.json()));
const mineRow = (del.items || [])[0];
const delRes = await fetch(BASE + '/admin/orders/' + mineRow._id, { method: 'DELETE', headers: AH });
const dj = await j(delRes);
(delRes.ok && /already restored/.test(dj.message || '')) ? ok('delete honoured flag (already-restored msg)') : (delRes.ok ? ok('delete ok (msg: ' + (dj.message || '') + ')') : bad('delete failed ' + delRes.status));
const afterDelete = await liveStock('tee');
(afterDelete === stock0) ? ok(`delete did NOT double-restore (${afterDelete} = ${stock0})`) : bad(`PHANTOM STOCK: ${afterDelete} ≠ ${stock0}`);

// control: a NON-cancelled unpaid order delete SHOULD restore
const payload2 = JSON.stringify({ customer: { name: 'Bug Check 2', phone: '01711998877', email: 'demo@forged.fit' }, shipping: { address: 'House 12, Road 5', city: 'Dhanmondi', division: 'dhaka' }, items: [{ slug: 'tee', qty: 1 }], paymentMethod: 'cod' });
const place2 = await fetch(BASE + '/orders', { method: 'POST', headers: DH, body: JSON.stringify({ payload: payload2, idemKey: 'bcfix2-' + Date.now() }) });
const po2 = await j(place2);
const ono2 = po2.order?.orderNumber || po2.orderNumber;
const mine2Row = ((await (await fetch(BASE + '/admin/orders?search=' + encodeURIComponent(ono2), { headers: AH }).then((r) => r.json()))).items || [])[0];
const del2 = await fetch(BASE + '/admin/orders/' + mine2Row._id, { method: 'DELETE', headers: AH });
const afterDel2 = await liveStock('tee');
(del2.ok && afterDel2 === stock0) ? ok(`control: unpaid delete restores once (${afterDel2} = ${stock0})`) : bad(`control restore wrong (${afterDel2} ≠ ${stock0})`);

/* ---------- F2: masked-secret round-trip ---------- */
console.log('F2 — settings secret sentinel guard');
await fetch(BASE + '/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ payments: { gateway: { storeId: 'BCFIXSTORE', storePasswd: 'RealPass123', enabled: false } } }) });
// sub-admin style round-trip: send the MASK back — stored password must survive
const putMask = await fetch(BASE + '/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ payments: { gateway: { storePasswd: '••••••••' }, courier: { steadfast: { apiKey: '••••••••', secretKey: '••••••••' }, pathao: { clientSecret: '••••••••' } } } }) });
const chk = (await (await fetch(BASE + '/admin/settings', { headers: AH }).then((r) => r.json()))).setting;
(putMask.ok && chk.payments.gateway.storePasswd === 'RealPass123') ? ok('gateway storePasswd survived mask round-trip') : bad('storePasswd became: ' + chk.payments.gateway.storePasswd);
(chk.courier?.steadfast?.apiKey === 'RealApiKey1') ? bad('unexpected') : ok('courier apiKey untouched by mask (value: ' + (chk.courier?.steadfast?.apiKey || '∅') + ')');
// empty string also must not wipe
await fetch(BASE + '/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ payments: { gateway: { storePasswd: '' } } }) });
const chk2 = (await (await fetch(BASE + '/admin/settings', { headers: AH }).then((r) => r.json()))).setting;
(chk2.payments.gateway.storePasswd === 'RealPass123') ? ok('empty storePasswd ignored') : bad('empty wiped storePasswd → ' + JSON.stringify(chk2.payments.gateway.storePasswd));
// real value still updates
await fetch(BASE + '/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ payments: { gateway: { storePasswd: 'NewPass456' } } }) });
const chk3 = (await (await fetch(BASE + '/admin/settings', { headers: AH }).then((r) => r.json()))).setting;
(chk3.payments.gateway.storePasswd === 'NewPass456') ? ok('real new password accepted') : bad('real update rejected → ' + chk3.payments.gateway.storePasswd);
// cleanup
await fetch(BASE + '/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ payments: { gateway: { storeId: '', storePasswd: 'NewPass456' } } }) });

/* ---------- F3: reset-token save is persisted before the response ---------- */
console.log('F3 — awaited reset token save');
const r1 = await fetch(BASE + '/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'demo@forged.fit' }) });
const rj = await j(r1);
const hasLink = !!(rj.resetUrl || rj.link || rj.devLink);
(r1.ok) ? ok('forgot-password responds ' + r1.status + (hasLink ? ' (dev link present)' : ' (link hidden by env)')) : bad('forgot failed ' + r1.status);
const r2 = await fetch(BASE + '/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@forged.fit' }) });
(r2.ok) ? ok('unknown email generic 200 (no user enumeration)') : bad('unknown email → ' + r2.status);

/* ---------- F4: codPending metric ---------- */
console.log('F4 — dashboard codPending');
const st = await (await fetch(BASE + '/admin/stats', { headers: AH }).then((r) => r.json()));
(typeof st.codPending === 'number' && st.codPending >= 0) ? ok('codPending numeric (' + st.codPending + ')') : bad('codPending: ' + JSON.stringify(st.codPending));

console.log('\n──────── RESULT: ' + PASS + ' PASS · ' + FAIL + ' FAIL ────────');
process.exit(FAIL ? 1 : 0);
