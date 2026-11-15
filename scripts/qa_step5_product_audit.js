/* Step 5 — PRODUCTCONTROLLER CONTRACT AUDIT (three ends).
   Sweeps EVERY public product route + the admin product write surface and
   asserts response contracts — the "everything productController-related
   works across frontend/admin/backend" verification.
   usage: node scripts/qa_step5_product_audit.js [base]  (default :4000) */
const BASE = process.argv[2] || 'http://localhost:4000';
let PASS = 0, FAIL = 0;
const ok = (n) => { PASS++; console.log('  ✓ ' + n); };
const bad = (n, extra) => { FAIL++; console.log('  ✗ ' + n + (extra ? ' — ' + extra : '')); };
const check = (n, cond, extra) => (cond ? ok(n) : bad(n, extra));

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  console.log('── Step 5 · PRODUCTCONTROLLER CONTRACT AUDIT → ' + BASE + ' ──');
  check('health', (await api('/api/health')).data?.ok === true);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@arixgear.tech', password: 'ArixAdmin2026' } });
  const T = login.data?.token;
  check('admin.token', Boolean(T));

  /* ---------- 1. GET /api/products — every documented param ---------- */
  const CARD_FIELDS = ['name', 'slug', 'category', 'categoryPath', 'price', 'images', 'badge', 'stock', 'sold', 'rating', 'featured', 'sizes', 'sizeStocks', 'colors', 'specs', 'specValues', 'features', 'warranty', 'brand'];
  const l1 = await api('/api/products?limit=3');
  check('list.default', l1.status === 200 && Array.isArray(l1.data.items) && l1.data.total > 0);
  check('list.card-shape', CARD_FIELDS.every((f) => f in (l1.data.items[0] || {})), 'missing: ' + CARD_FIELDS.filter((f) => !(f in (l1.data.items[0] || {}))).join(','));
  const sorts = ['featured', 'price-asc', 'price-desc', 'newest', 'popular', 'rating', 'trending', 'best-selling'];
  let sortsOk = true;
  for (const s of sorts) {
    const r = await api('/api/products?sort=' + s + '&limit=2');
    if (r.status !== 200 || !Array.isArray(r.data.items)) sortsOk = false;
  }
  check('list.sorts×8', sortsOk);
  const paramCombos = [
    'category=laptops', 'cat=laptops', 'brand=lenovo', 'search=lenovo', 'minPrice=1000&maxPrice=999999',
    'featured=true', 'badge=sale', 'inStock=true', 'rating=4', 'discounted=true', 'page=2&limit=5', 'limit=60',
  ];
  let combosOk = true;
  for (const c of paramCombos) {
    const r = await api('/api/products?' + c);
    if (r.status !== 200 || !Array.isArray(r.data.items)) combosOk = false;
  }
  check('list.param-combos×12', combosOk);
  const bad1 = await api('/api/products?rating=99');
  check('list.rating-guard-400', bad1.status === 400);
  const bad2 = await api('/api/products?minPrice=abc');
  check('list.nan-guard-400', bad2.status === 400);
  const inj = await api('/api/products?brandId=' + encodeURIComponent('[$ne]=x'));
  check('list.brandId-injection-guard', inj.status === 200);

  /* ---------- 2. GET /api/products/:slug ---------- */
  const slug0 = l1.data.items[0].slug;
  const d1 = await api('/api/products/' + slug0);
  check('detail.full', d1.status === 200 && d1.data.product && d1.data.product.slug === slug0);
  check('detail.specSchema-key', 'specSchema' in d1.data && 'hideEmptyFields' in d1.data);
  check('detail.related', Array.isArray(d1.data.related) && d1.data.related.length <= 4);
  check('detail.related-card-shape', (d1.data.related[0] || {}).price !== undefined && (d1.data.related[0] || {}).slug !== undefined);
  const d404 = await api('/api/products/definitely-not-a-real-slug-xyz');
  check('detail.404', d404.status === 404);

  /* ---------- 3. flash / filters / suggest / related / stock ---------- */
  const fl = await api('/api/products/flash');
  check('flash.list', fl.status === 200 && Array.isArray(fl.data.items) && 'serverNow' in fl.data);
  const f1 = await api('/api/products/filters');
  check('filters.global', f1.status === 200 && f1.data.categories && f1.data.sizes && f1.data.price && f1.data.brands);
  const f2 = await api('/api/products/filters?category=laptops');
  check('filters.scoped', f2.status === 200 && Array.isArray(f2.data.specs) && 'specSchema' in f2.data);
  const sg = await api('/api/products/search/suggest?q=len&limit=5');
  check('suggest', sg.status === 200 && Array.isArray(sg.data.items) && sg.data.items.length <= 5);
  const rel = await api('/api/products/' + slug0 + '/related?mode=auto');
  check('related.auto', rel.status === 200 && Array.isArray(rel.data.items) && rel.data.mode === 'auto');
  const rel2 = await api('/api/products/' + slug0 + '/related?mode=crosssell');
  check('related.crosssell', rel2.status === 200 && rel2.data.crossSell !== undefined);
  const rel3 = await api('/api/products/' + slug0 + '/related?mode=category');
  check('related.category', rel3.status === 200 && Array.isArray(rel3.data.items));
  const st1 = await api('/api/products/' + slug0 + '/stock');
  check('stock.general', st1.status === 200 && st1.data.available !== undefined && st1.data.inStock !== undefined && st1.data.checkedAt);
  const szs = d1.data.product.sizes || [];
  const st2 = await api('/api/products/' + slug0 + '/stock' + (szs[0] ? '?size=' + encodeURIComponent(szs[0]) : ''));
  check('stock.per-size', st2.status === 200 && (szs[0] ? st2.data.size === szs[0] : st2.data.size === null));

  /* ---------- 4. nested reviews/questions (product-scoped) ---------- */
  const rv = await api('/api/products/' + slug0 + '/reviews');
  check('reviews.list', rv.status === 200);
  const qs = await api('/api/products/' + slug0 + '/questions');
  check('questions.list', qs.status === 200);

  /* ---------- 5. spec_* params (dynamic facets end-to-end) ---------- */
  const sp = await api('/api/products?category=laptops&spec_ram=16GB');
  check('spec.filter-200', sp.status === 200 && Array.isArray(sp.data.items));
  const spr = await api('/api/products?category=laptops&spec_screen-size_min=0&spec_screen-size_max=99');
  check('spec.range-200', spr.status === 200);

  /* ---------- 6. admin write surface round-trip ---------- */
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const imgBlob = (b64) => new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' });
  const fd = new FormData();
  fd.append('name', 'QA Contract Audit Rig');
  fd.append('price', '12345');
  fd.append('category', 'accessories');
  fd.append('stock', '3');
  fd.append('specs', JSON.stringify([{ k: 'Weight', v: '250g' }]));
  fd.append('features', JSON.stringify(['Audit feature A']));
  fd.append('images', imgBlob(png), 'a.png');
  fd.append('images', imgBlob(png), 'b.png');
  const cRes = await fetch(BASE + '/api/admin/products', { method: 'POST', headers: { Authorization: 'Bearer ' + T }, body: fd });
  const cData = await cRes.json();
  check('admin.create-201', cRes.status === 201 && cData.product, JSON.stringify(cData).slice(0, 140));
  const P = cData.product;
  /* files land in append order on create (order control is the UPDATE imageOrder contract) */
  check('admin.create-images', P.images.length === 2, String(P.images && P.images.length));
  check('admin.create-legacy-specs', Array.isArray(P.specs) && P.specs[0].k === 'Weight');

  const uRes = await fetch(BASE + '/api/admin/products/' + P._id, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + T },
    body: (() => { const f2 = new FormData(); f2.append('price', '13000'); f2.append('features', '["Audit feature A","Audit feature B"]'); return f2; })(),
  });
  const uData = await uRes.json();
  check('admin.update', uRes.status === 200 && uData.product.price === 13000);
  check('admin.update-features', uData.product.features.length === 2);

  const dupRes = await fetch(BASE + '/api/admin/products/' + P._id + '/duplicate', { method: 'POST', headers: { Authorization: 'Bearer ' + T } });
  const dupData = await dupRes.json();
  check('admin.duplicate-draft', dupRes.status === 201 && dupData.product.active === false);

  const bulk = await api('/api/admin/products/bulk', { method: 'POST', token: T, body: { ids: [P._id], action: 'inactive' } });
  check('admin.bulk', bulk.status === 200 && bulk.data.matched >= 1);

  const csvRes = await fetch(BASE + '/api/admin/products/export.csv', { headers: { Authorization: 'Bearer ' + T } });
  const csvText = await csvRes.text();
  check('admin.csv-export', csvRes.status === 200 && csvText.includes('QA Contract Audit Rig'));
  check('admin.csv-features-column', /features/i.test(csvText.split('\n')[0]));

  const delDup = await api('/api/admin/products/' + dupData.product._id, { method: 'DELETE', token: T });
  const delMain = await api('/api/admin/products/' + P._id, { method: 'DELETE', token: T });
  check('admin.delete', delDup.status === 200 && delMain.status === 200);

  /* ---------- 7. cache coherence: list changes after mutations ---------- */
  const after = await api('/api/products?search=QA%20Contract%20Audit&limit=5');
  check('cache.mutation-coherence', after.status === 200 && after.data.total === 0, String(after.data.total));

  console.log('');
  console.log(`── PRODUCTCONTROLLER AUDIT: PASS=${PASS} FAIL=${FAIL} ──`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
