/* Task 32 — API QA for per-product + per-category Size Guide (3-tier system) */
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
  ok(!!T, 'admin login');

  // 1. public endpoint ships both blocks
  let r = await api('/settings/size-guide');
  ok(r.status === 200 && r.d.sizeGuide && Array.isArray(r.d.categoryGuides), 'public size-guide returns global + categoryGuides');
  const eq = (r.d.categoryGuides || []).find((g) => g.category === 'equipment');
  ok(eq && eq.enabled === true && eq.title === 'Equipment Spec Guide' && eq.rows.length >= 4, 'seeded equipment table present (tier-2)');

  // 2. seeded products carry the right tiers
  r = await api('/products/belt');
  ok(r.d.product && r.d.product.sizeGuide && r.d.product.sizeGuide.mode === 'custom' && r.d.product.sizeGuide.title === 'Belt Sizing (waist chart)', 'belt: custom waist chart (tier-1)');
  ok(r.d.product.sizeGuide.headers.length === 3 && r.d.product.sizeGuide.rows.length === 4, 'belt table shape 3x4');
  r = await api('/products/whey');
  ok(r.d.product.sizeGuide && r.d.product.sizeGuide.mode === 'custom' && r.d.product.sizeGuide.title === 'Serving Guide', 'whey: custom serving guide (tier-1)');
  r = await api('/products/dumbbell');
  ok(r.d.product.sizeGuide && r.d.product.sizeGuide.mode === 'inherit' && !r.d.product.sizeGuide.headers.length, 'dumbbell: inherit (falls to category)');
  r = await api('/products?search=belt');
  ok(r.d.items && r.d.items[0] && r.d.items[0].sizeGuide && r.d.items[0].sizeGuide.mode === 'custom', 'CARD projection ships sizeGuide in the list payload');

  // 3. admin update: tee → custom table round-trip
  let teeId = (await api('/products?search=tee')).d.items[0]._id;
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: {
    sizeGuide: { mode: 'custom', enabled: true, title: 'Tee Fit Chart', note: 'Slim athletic cut.', headers: ['Size', 'Chest'], rows: [['M', '96']] },
  } });
  ok(r.status === 200 && r.d.product.sizeGuide.mode === 'custom' && r.d.product.sizeGuide.title === 'Tee Fit Chart', 'product PUT: custom table saved');

  // 4. blank rows + cells normalized on product save
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: {
    sizeGuide: { mode: 'custom', title: 'Tee Fit Chart', headers: ['Size', 'Chest'], rows: [['M', '96'], ['', ''], ['   ', ' ']] },
  } });
  ok(r.status === 200 && r.d.product.sizeGuide.rows.length === 1, 'blank rows dropped by normalizer');
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: {
    sizeGuide: { mode: 'custom', headers: ['Size', 'Chest'], rows: [['M', '  97  ']] },
  } });
  ok(r.status === 200 && r.d.product.sizeGuide.rows[0][1] === '97', 'cells trimmed');
  ok(r.d.product.sizeGuide.title === 'Tee Fit Chart', 'partial save keeps previous title');

  // 5. invalid product guide → 400
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: { sizeGuide: { mode: 'custom', headers: [], rows: [['a']] } } });
  ok(r.status === 400, 'custom with 0 headers → 400');
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: { sizeGuide: 'not-json{{' } });
  ok(r.status === 400, 'invalid JSON sizeGuide → 400');
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: { sizeGuide: { mode: 'bogus' } } });
  ok(r.status === 400, 'bogus mode → 400');

  // 6. back to inherit
  r = await api('/admin/products/' + teeId, { method: 'PUT', token: T, body: { sizeGuide: { mode: 'inherit' } } });
  ok(r.status === 200 && r.d.product.sizeGuide.mode === 'inherit' && r.d.product.sizeGuide.headers.length === 0, 'switch back to inherit clears the table');

  // 7. category guides — create/replace + enabled-only toggle + remove
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { categoryGuides: [{ category: 'apparel', enabled: true, title: 'Apparel Chart', note: 'n', headers: ['Size', 'Chest'], rows: [['S', '90'], ['M', '98']] }] } });
  ok(r.status === 200 && r.d.setting.categoryGuides.some((g) => g.category === 'apparel' && g.title === 'Apparel Chart'), 'category table created');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { categoryGuides: [{ category: 'apparel', enabled: false }] } });
  const ap = r.d.setting.categoryGuides.find((g) => g.category === 'apparel');
  ok(r.status === 200 && ap.enabled === false && ap.rows.length === 2, 'enabled-only toggle keeps the table (merge semantics)');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { categoryGuides: [{ category: 'nosuchcat', enabled: false }] } });
  ok(r.status === 400, 'enabled-only toggle without an existing table → 400');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { categoryGuides: [{ enabled: false }] } });
  ok(r.status === 400, 'entry without category → 400');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { categoryGuides: [{ category: 'apparel', headers: ['A'], rows: [] }] } });
  ok(r.status === 400, 'category table with 0 rows → 400');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { categoryGuides: [{ category: 'apparel', remove: true }] } });
  ok(r.status === 200 && !r.d.setting.categoryGuides.some((g) => g.category === 'apparel'), 'remove:true deletes the entry');

  // 8. equipment table still intact after all of the above (merge never wipes)
  r = await api('/admin/settings', { token: T });
  const eq2 = (r.d.setting.categoryGuides || []).find((g) => g.category === 'equipment');
  ok(eq2 && eq2.rows.length >= 4 && eq2.enabled !== false, 'equipment table survived the merge round-trips');

  // 9. global table normalizer via the shared util (blank-row drop + limits)
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { sizeGuide: { headers: ['Size', 'Chest', 'Waist'], rows: [['S', '88', '72'], ['', '', '']] } } });
  ok(r.status === 200 && r.d.setting.sizeGuide.rows.length === 1, 'global: blank rows dropped, rows padded to width');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { sizeGuide: { headers: ['1', '2', '3', '4', '5', '6', '7'] } } });
  ok(r.status === 400, 'global: 7 columns → 400');
  r = await api('/admin/settings', { method: 'PUT', token: T, body: { sizeGuide: { headers: [''], rows: [['x']] } } });
  ok(r.status === 400, 'global: all-blank headers → 400');

  // 10. unauth guard
  r = await api('/admin/settings', { method: 'PUT', body: { sizeGuide: { headers: ['X'] } } });
  ok(r.status === 401, 'unauth admin settings PUT → 401');

  // cleanup: restore global default rows (seed state)
  await api('/admin/settings', { method: 'PUT', token: T, body: { sizeGuide: { headers: ['Size', 'Chest (cm)', 'Waist (cm)'], rows: [['S', '88–94', '72–78'], ['M', '95–101', '79–85'], ['L', '102–108', '86–92'], ['XL', '109–115', '93–99'], ['XXL', '116–124', '100–108']] } } });

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
