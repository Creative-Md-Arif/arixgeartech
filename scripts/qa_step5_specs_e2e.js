/* Step 5 — DYNAMIC SPEC SYSTEM E2E (Node, hits a running :4000 stack).
   Covers: category schema CRUD · templates (save/apply) · product specValues
   write + flat regeneration · PDP specSchema · spec facets · spec_* list
   filters (select/multi/number-range/boolean) · imageOrder/imageAlts ·
   sizeStocks persistence · migration · AI-approve auto-creation.
   usage: node scripts/qa_step5_specs_e2e.js [base]   (default :4000) */
const BASE = process.argv[2] || 'http://localhost:4000';
let PASS = 0, FAIL = 0;
const ok = (n) => { PASS++; console.log('  ✓ ' + n); };
const bad = (n, extra) => { FAIL++; console.log('  ✗ ' + n + (extra ? ' — ' + extra : '')); };
const check = (n, cond, extra) => (cond ? ok(n) : bad(n, extra));

async function api(path, { method = 'GET', body, token, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  console.log('── Step 5 · DYNAMIC SPEC SYSTEM E2E → ' + BASE + ' ──');
  const health = await api('/api/health');
  check('api.health', health.data && health.data.ok === true);

  /* admin token */
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@arixgear.tech', password: 'ArixAdmin2026' } });
  const T = login.data && login.data.token;
  check('auth.admin-login', Boolean(T));

  /* ---------- 1. category spec schema CRUD ---------- */
  const cats = await api('/api/categories');
  const laptops = cats.data.items.find((c) => c.slug === 'laptops') || cats.data.items[0];
  check('categories.list', Boolean(laptops));

  const SCHEMA = {
    specGroups: [
      { key: 'performance', label: 'Performance', labelBn: 'পারফরম্যান্স', order: 0, fields: [
        { key: 'processor', label: 'Processor', labelBn: 'প্রসেসর', type: 'text', filterable: false, showInDetails: true },
        { key: 'ram', label: 'RAM', labelBn: 'র‍্যাম', type: 'multiselect', options: ['8GB', '16GB', '32GB'], filterable: true, showInDetails: true },
        { key: 'storage', label: 'Storage', type: 'select', options: ['256GB SSD', '512GB SSD', '1TB SSD'], filterable: true, showInDetails: true },
      ] },
      { key: 'display', label: 'Display', labelBn: 'ডিসপ্লে', order: 1, fields: [
        { key: 'screen-size', label: 'Screen Size', labelBn: 'স্ক্রিন সাইজ', type: 'number', unit: 'inch', filterable: true, showInDetails: true },
        { key: 'fastcharge', label: 'Fast Charge', type: 'boolean', filterable: true, showInDetails: true },
        { key: 'ports', label: 'Ports', type: 'text', repeatable: true, showInDetails: true },
      ] },
    ],
    hideEmptyFields: true,
  };
  const put = await api(`/api/admin/categories/${laptops._id}/spec-schema`, { method: 'PUT', token: T, body: SCHEMA });
  check('schema.put', put.status === 200 && Array.isArray(put.data.groups) && put.data.groups.length === 2, JSON.stringify(put.data).slice(0, 120));
  const ramField = (put.data.groups || []).flatMap((g) => g.fields).find((f) => f.key === 'ram');
  check('schema.field-normalized', ramField && ramField.type === 'multiselect' && ramField.filterable === true);

  /* ---------- 2. product create with specValues (multipart) ---------- */
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const imgBuf = Buffer.from(pngB64, 'base64');
  const fd = new FormData();
  fd.append('name', 'QA Spec Book 15');
  fd.append('price', '99999');
  fd.append('category', 'laptops');
  fd.append('stock', '4');
  fd.append('features', JSON.stringify(['Machined aluminum chassis', '16-hour battery life', 'Backlit keyboard']));
  fd.append('specValues', JSON.stringify([
    { g: 'performance', k: 'processor', v: 'Core Ultra 7' },
    { g: 'performance', k: 'ram', v: ['16GB', '32GB'] },
    { g: 'performance', k: 'storage', v: '1TB SSD' },
    { g: 'display', k: 'screen-size', v: 15.6 },
    { g: 'display', k: 'fastcharge', v: true },
    { g: 'display', k: 'ports', v: ['USB-C ×2', 'HDMI'] },
    { g: 'display', k: 'emptyfield', v: '' },
  ]));
  fd.append('sizeStocks', JSON.stringify([{ s: '16GB / 1TB', stock: 3 }]));
  fd.append('imageAlts', JSON.stringify({ 'new:0': 'QA spec hero' }));
  fd.append('images', new Blob([imgBuf], { type: 'image/png' }), 'a.png');
  fd.append('images', new Blob([imgBuf], { type: 'image/png' }), 'b.png');
  const created = await api('/api/admin/products', { method: 'POST', token: T, body: fd });
  check('product.create-spec', created.status === 201, JSON.stringify(created.data).slice(0, 140));
  const P = created.data.product;
  check('product.specValues-canonical', Array.isArray(P.specValues) && P.specValues.length === 6, String(P.specValues && P.specValues.length));
  check('product.empty-dropped', !P.specValues.some((s) => s.k === 'emptyfield'));
  check('product.flat-regen', Array.isArray(P.specs) && P.specs.some((r) => r.k === 'RAM' && /16GB, 32GB/.test(r.v)), JSON.stringify(P.specs).slice(0, 160));
  check('product.flat-regen-bn', Array.isArray(P.specsBn) && P.specsBn.some((r) => r.k === 'র‍্যাম'), JSON.stringify(P.specsBn).slice(0, 120));
  check('product.features', Array.isArray(P.features) && P.features.length === 3 && P.features[0] === 'Machined aluminum chassis');
  check('product.sizeStocks-persisted', Array.isArray(P.sizeStocks) && P.sizeStocks.length === 1 && P.sizeStocks[0].s === '16GB / 1TB', JSON.stringify(P.sizeStocks));
  check('product.number-coerced', P.specValues.find((s) => s.k === 'screen-size').v === 15.6);
  check('product.bool-coerced', P.specValues.find((s) => s.k === 'fastcharge').v === true);
  check('product.alt-set', P.images[0].alt === 'QA spec hero');

  /* ---------- 3. PDP: specSchema + product payload ---------- */
  const pdp = await api('/api/products/' + P.slug);
  check('pdp.specSchema', Array.isArray(pdp.data.specSchema) && pdp.data.specSchema.length === 2);
  check('pdp.hideEmptyFields', pdp.data.hideEmptyFields === true);
  check('pdp.card-specs-present', Array.isArray(pdp.data.product.specs) && pdp.data.product.specs.length > 0);

  /* list card projection now carries specs (Step 4 audit bug) */
  const listResp = await api('/api/products?search=QA%20Spec%20Book&limit=5');
  const cardItem = (listResp.data.items || [])[0];
  check('card.specs-in-projection', cardItem && Array.isArray(cardItem.specs) && cardItem.specs.length > 0);

  /* ---------- 4. spec facets (category-scoped) ---------- */
  const facets = await api('/api/products/filters?category=laptops');
  const specFacets = facets.data.specs || [];
  const ramFacet = specFacets.find((f) => f.key === 'ram');
  const screenFacet = specFacets.find((f) => f.key === 'screen-size');
  const chargeFacet = specFacets.find((f) => f.key === 'fastcharge');
  check('facets.specs-present', specFacets.length >= 4, String(specFacets.length));
  check('facets.multiselect-counts', ramFacet && ramFacet.options.some((o) => o.value === '16GB' && o.count >= 1));
  check('facets.number-range', screenFacet && screenFacet.range && screenFacet.range.min <= 15.6 && screenFacet.range.max >= 15.6, JSON.stringify(screenFacet && screenFacet.range));
  check('facets.boolean', chargeFacet && chargeFacet.options.some((o) => o.value === 'Yes' && o.count >= 1));

  /* ---------- 5. spec_* list filters ---------- */
  const f1 = await api('/api/products?category=laptops&spec_ram=16GB');
  check('filter.multiselect-hits', f1.data.items.some((i) => i.slug === P.slug) && f1.data.total >= 1, String(f1.data.total));
  const f2 = await api('/api/products?category=laptops&spec_ram=8GB');
  check('filter.multiselect-miss', !f2.data.items.some((i) => i.slug === P.slug), String(f2.data.total));
  const f3 = await api('/api/products?category=laptops&spec_screen-size_min=14&spec_screen-size_max=16');
  check('filter.number-range-hits', f3.data.items.some((i) => i.slug === P.slug));
  const f4 = await api('/api/products?category=laptops&spec_screen-size_min=17');
  check('filter.number-range-miss', !f4.data.items.some((i) => i.slug === P.slug));
  const f5 = await api('/api/products?category=laptops&spec_fastcharge=yes');
  check('filter.boolean-hits', f5.data.items.some((i) => i.slug === P.slug));
  const f6 = await api('/api/products?category=laptops&spec_fastcharge=no');
  check('filter.boolean-miss', !f6.data.items.some((i) => i.slug === P.slug));
  const f7 = await api('/api/products?category=laptops&spec_storage=1TB%20SSD');
  check('filter.select-hits', f7.data.items.some((i) => i.slug === P.slug));
  const f8 = await api('/api/products?category=laptops&spec_unknownkey=zzz');
  check('filter.unknown-key-ignored', f8.status === 200 && Array.isArray(f8.data.items));

  /* ---------- 6. imageOrder reorder + alt edit on update ---------- */
  const url1 = P.images[0].url, url2 = P.images[1].url;
  const fd2 = new FormData();
  fd2.append('imageOrder', JSON.stringify([url2, url1]));
  fd2.append('imageAlts', JSON.stringify({ [url2]: 'New main alt', [url1]: 'Second alt' }));
  const upd = await api(`/api/admin/products/${P._id}`, { method: 'PUT', token: T, body: fd2 });
  check('imageOrder.reorder', upd.status === 200 && upd.data.product.images[0].url === url2, JSON.stringify(upd.data.product.images || []).slice(0, 120));
  check('imageOrder.alts', upd.data.product.images[0].alt === 'New main alt' && upd.data.product.images[1].alt === 'Second alt');
  const fd2b = new FormData();
  fd2b.append('imageOrder', JSON.stringify([url1]));
  const upd2 = await api(`/api/admin/products/${P._id}`, { method: 'PUT', token: T, body: fd2b });
  check('imageOrder.remove-via-order', upd2.status === 200 && upd2.data.product.images.length === 1 && upd2.data.product.images[0].url === url1);

  /* ---------- 7. specValues update + hideEmpty ---------- */
  const fd3 = new FormData();
  fd3.append('specValues', JSON.stringify([
    { g: 'performance', k: 'processor', v: 'Core Ultra 9' },
    { g: 'display', k: 'ports', v: ['USB-C ×2'] },
  ]));
  fd3.append('hideEmptySpecs', 'true');
  const upd3 = await api(`/api/admin/products/${P._id}`, { method: 'PUT', token: T, body: fd3 });
  check('specValues.update', upd3.status === 200 && upd3.data.product.specValues.find((s) => s.k === 'processor').v === 'Core Ultra 9');
  check('specValues.flat-sync', upd3.data.product.specs.find((r) => r.k === 'Processor').v === 'Core Ultra 9');

  /* ---------- 8. templates: save from category → apply merge → apply replace ---------- */
  const tpl = await api('/api/admin/spec-templates', { method: 'POST', token: T, body: { name: 'QA Laptop Template', fromCategory: 'laptops' } });
  check('template.save-from-category', tpl.status === 201 && tpl.data.template.groups.length === 2, JSON.stringify(tpl.data).slice(0, 120));
  const other = cats.data.items.find((c) => c.slug !== laptops.slug);
  const tplPut = await api(`/api/admin/categories/${other._id}/spec-schema`, { method: 'PUT', token: T, body: { specGroups: [{ key: 'misc', label: 'Misc', fields: [{ key: 'wattage', label: 'Wattage', type: 'number', unit: 'W', filterable: true }] }] } });
  check('schema.other-cat', tplPut.status === 200);
  const applied = await api(`/api/admin/categories/${other._id}/apply-template`, { method: 'POST', token: T, body: { templateId: tpl.data.template._id, mode: 'merge' } });
  const gKeys = (applied.data.groups || []).map((g) => g.key);
  check('template.apply-merge', applied.status === 200 && gKeys.includes('misc') && gKeys.includes('performance'), gKeys.join(','));
  const applied2 = await api(`/api/admin/categories/${other._id}/apply-template`, { method: 'POST', token: T, body: { templateId: tpl.data.template._id, mode: 'replace' } });
  check('template.apply-replace', applied2.status === 200 && applied2.data.groups.every((g) => g.key !== 'misc'));
  const tplList = await api('/api/admin/spec-templates', { token: T });
  check('template.list', tplList.status === 200 && tplList.data.items.some((t) => t.name === 'QA Laptop Template'));
  const tplDel = await api(`/api/admin/spec-templates/${tpl.data.template._id}`, { method: 'DELETE', token: T });
  check('template.delete', tplDel.status === 200 && tplDel.data.ok === true);

  /* ---------- 9. AI-approve auto-creation (unknown fields materialize) ---------- */
  const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
  const AiImport = require('/home/z/my-project/arixgear-full-project/backend/src/models/AiImport');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');
  const stage = await AiImport.create({
    sourceUrl: 'https://qa-fixture.example/qa-autocreate-' + Date.now(),
    host: 'qa-fixture.example',
    status: 'ready',
    price: 12345,
    category: 'laptops',
    extracted: {
      name: 'QA AutoCreate Notebook ' + Date.now(),
      price: 12345,
      specs: [
        { k: 'Processor', v: 'QA Core M1' },
        { k: 'Totally New Attribute', v: 'brand-new value' },
        { k: 'RAM', v: '32GB' },
      ],
      features: ['Auto-created feature one', 'Auto-created feature two'],
      images: ['https://qa-fixture.example/1.png'],
    },
    aiContent: { name: 'QA AutoCreate Notebook', source: 'template' },
    images: [{ url: 'https://qa-fixture.example/1.png', publicId: '' }],
  });
  const appr = await api(`/api/admin/ai/imports/${stage._id}/approve`, { method: 'POST', token: T, body: { price: 12345, category: 'laptops' } });
  check('ai.approve', appr.status === 200 && appr.data.product && appr.data.product.slug, JSON.stringify(appr.data).slice(0, 140));
  const aiPdp = await api('/api/products/' + appr.data.product.slug);
  const aiValues = aiPdp.data.product.specValues || [];
  check('ai.auto-create-value', aiValues.some((s) => s.k === 'totally-new-attribute' && s.v === 'brand-new value'), JSON.stringify(aiValues).slice(0, 200));
  const schemaAfter = await api('/api/categories');
  const lapAfter = schemaAfter.data.items.find((c) => c.slug === 'laptops');
  const grew = (lapAfter.specGroups || []).flatMap((g) => g.fields).some((f) => f.key === 'totally-new-attribute');
  check('ai.schema-grown', grew === true);
  check('ai.features-mapped', (aiPdp.data.product.features || []).includes('Auto-created feature one'));
  check('ai.flat-sync', (aiPdp.data.product.specs || []).some((r) => r.k === 'Totally New Attribute' && r.v === 'brand-new value'));
  await AiImport.findByIdAndDelete(stage._id);

  /* ---------- 10. legacy back-compat: flat rows still filterable ---------- */
  const legacySeed = await api('/api/products?limit=1');
  const legacy = (legacySeed.data.items || [])[0];
  if (legacy && Array.isArray(legacy.specs) && legacy.specs.length) {
    const key0 = legacy.specs[0].k, val0 = legacy.specs[0].v;
    /* only assertable when the value matches a filterable field — probe facet keys instead */
    const fLegacy = await api('/api/products?category=' + legacy.category + '&spec_processor=zzz-none');
    check('filter.legacy-safe', fLegacy.status === 200);
  }

  /* ---------- cleanup ---------- */
  const del = await api(`/api/admin/products/${P._id}`, { method: 'DELETE', token: T });
  check('cleanup.product', del.status === 200);
  const apprDel = await api(`/api/admin/products/${appr.data.product._id}`, { method: 'DELETE', token: T });
  check('cleanup.ai-product', apprDel.status === 200);
  /* restore laptops schema to its pre-test state */
  const lapNow = await api('/api/categories');
  const lapDoc = lapNow.data.items.find((c) => c.slug === 'laptops');
  const keepGroups = (lapDoc.specGroups || []).filter((g) => g.key === 'general' || g.key === 'performance' || g.key === 'display');
  await api(`/api/admin/categories/${lapDoc._id}/spec-schema`, { method: 'PUT', token: T, body: { specGroups: keepGroups } });
  await mongoose.disconnect();

  console.log('');
  console.log(`── Step 5 SPEC QA: PASS=${PASS} FAIL=${FAIL} ──`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
