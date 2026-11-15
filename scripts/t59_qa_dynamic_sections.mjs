/* Task 59 QA — dynamic home sections end-to-end.
   The bug: a "New Section" created in Admin → Homepage saved fine but the
   storefront home page (hardcoded component stack) never rendered it.
   Verifies: create → public list → order interleaving (4.5 lands between
   new-arrivals 4 and goals 5) → bn twins ride along → hide/show → reorder →
   delete → seed layout restored + known titles untouched. */
const BASE = 'http://127.0.0.1:5000';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log('  ✓ ' + name + (extra ? ' — ' + extra : '')); }
  else { FAIL++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};
const j = async (path, opts = {}) => {
  const r = await fetch(BASE + path, opts);
  let body = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
};
const hasBn = (s) => typeof s === 'string' && /[\u0980-\u09FF]/.test(s);
const pub = async () => {
  const { body } = await j('/api/home-sections');
  return { items: body.items || [], hidden: body.hidden || [] };
};

console.log('— 1. SEED BASELINE —');
let base;
{
  base = await pub();
  ok('8 seeded sections active', base.items.length === 8, String(base.items.length));
  ok('orders strictly ascending', base.items.every((s, i) => i === 0 || +s.order > +base.items[i - 1].order), base.items.map((s) => s.order).join(','));
  ok('order stack 1,2,3,4,5,7,8,9', base.items.map((s) => +s.order).join(',') === '1,2,3,4,5,7,8,9');
  ok('goals (5) sits before arsenal (7)', +base.items.find((s) => s.key === 'goals')?.order < +base.items.find((s) => s.key === 'arsenal')?.order);
  ok('nothing hidden', base.hidden.length === 0);
  ok('known title untouched (New Arrivals)', base.items.find((s) => s.key === 'new-arrivals')?.title === 'New Arrivals');
}

console.log('— 2. ADMIN LOGIN —');
let token;
{
  const r = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'admin@forged.fit', password: process.env.SEED_ADMIN_PASSWORD || 'ForgeAdmin2026' }) });
  token = r.body?.token;
  ok('admin token', Boolean(token));
}
const auth = (m, b) => ({ method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: b ? JSON.stringify(b) : undefined });

console.log('— 3. CREATE NEW SECTION (product-carousel, order 4.5) —');
let dropId, htmlId;
{
  const r = await j('/api/admin/home-sections', auth('POST', {
    key: 'qa-drop', type: 'product-carousel', title: 'QA Drop', titleBn: 'কিউএ ড্রপ',
    subtitle: 'Test carousel', subtitleBn: 'টেস্ট ক্যারোসেল', order: 4.5, active: true,
    config: { source: 'newest', limit: 4 },
  }));
  ok('create → 201', r.status === 201, 'got ' + r.status);
  dropId = r.body?.section?._id;
  ok('section id returned', Boolean(dropId));
  ok('bn twins stored (titleBn)', r.body?.section?.titleBn === 'কিউএ ড্রপ');

  const p = await pub();
  ok('public list now 9 items', p.items.length === 9, String(p.items.length));
  const keys = p.items.map((s) => s.key);
  const ia = keys.indexOf('new-arrivals'), ib = keys.indexOf('qa-drop'), ic = keys.indexOf('goals');
  ok('qa-drop interleaved: new-arrivals → qa-drop → goals', ia > -1 && ia < ib && ib < ic, keys.join(' | '));
}

console.log('— 4. CREATE HTML SECTION (order 2.5) —');
{
  const r = await j('/api/admin/home-sections', auth('POST', {
    key: 'qa-html', type: 'html', title: 'QA HTML', order: 2.5, active: true,
    config: { html: '<p data-qa="qa-html-block">FORGED QA BLOCK</p>' },
  }));
  htmlId = r.body?.section?._id;
  ok('create → 201', r.status === 201);
  const p = await pub();
  const keys = p.items.map((s) => s.key);
  ok('10 items now', p.items.length === 10, String(p.items.length));
  const it = keys.indexOf('ticker'), ih = keys.indexOf('qa-html'), ic = keys.indexOf('categories');
  ok('qa-html between ticker and categories', it < ih && ih < ic);
}

console.log('— 5. REORDER + HIDE/SHOW —');
{
  let r = await j('/api/admin/home-sections/' + dropId, auth('PUT', { order: 9.5 }));
  ok('reorder → 200', r.status === 200);
  let p = await pub();
  const keys = p.items.map((s) => s.key);
  const is = keys.indexOf('stories'), id = keys.indexOf('qa-drop');
  ok('qa-drop now after stories', is > -1 && is < id);
  r = await j('/api/admin/home-sections/' + dropId, auth('PUT', { order: 4.5 }));
  ok('restore order → 200', r.status === 200);

  r = await j('/api/admin/home-sections/' + dropId, auth('PUT', { active: false }));
  ok('hide → 200', r.status === 200);
  p = await pub();
  ok('hidden list carries qa-drop', p.hidden.includes('qa-drop'), p.hidden.join(','));
  ok('public list back to 9', p.items.length === 9);
  r = await j('/api/admin/home-sections/' + dropId, auth('PUT', { active: true }));
  ok('show again → public 10', (await pub()).items.length === 10);
}

console.log('— 6. CLEANUP —');
{
  const r1 = await j('/api/admin/home-sections/' + dropId, auth('DELETE'));
  const r2 = await j('/api/admin/home-sections/' + htmlId, auth('DELETE'));
  ok('deletes → 200', r1.status === 200 && r2.status === 200);
  const p = await pub();
  ok('seed baseline restored (8 items, none hidden)', p.items.length === 8 && p.hidden.length === 0, p.items.map((s) => s.order).join(','));
  ok('order stack intact', p.items.map((s) => +s.order).join(',') === '1,2,3,4,5,7,8,9');
}

console.log(`Task 59 QA: ${PASS} PASS · ${FAIL} FAIL`);
process.exit(FAIL ? 1 : 0);
