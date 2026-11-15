/* Step 6 — OPS & HARDENING E2E (Node, hits a running :4000 stack).
   Covers: SSE stream tickets · schema versioning+audit · facet aliases ·
   field icons · showOnCard badges · thumbs · bulk spec fill · CSV formula
   guard · AI suggest-mapping · AI update-mode import · AI bulk approve ·
   migration probe.
   usage: node scripts/qa_step6_ops.js [base]   (default :4000) */
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
  return { status: res.status, data, ct: res.headers.get('content-type') || '', text };
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  console.log('── Step 6 · OPS & HARDENING E2E → ' + BASE + ' ──');
  const health = await api('/api/health');
  check('api.health', health.data && health.data.ok === true);

  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@arixgear.tech', password: 'ArixAdmin2026' } });
  const T = login.data && login.data.token;
  check('auth.admin-login', Boolean(T));

  /* ═════════ 1. SSE STREAM TICKETS ═════════ */
  console.log(' · SSE stream tickets');
  const tk = await api('/api/notifications/stream-ticket', { method: 'POST', token: T });
  check('ticket.mint', tk.status === 200 && /^[a-f0-9]{48}$/.test(tk.data.ticket || ''), JSON.stringify(tk.data).slice(0, 100));
  check('ticket.ttl', tk.data.expiresIn === 60, String(tk.data.expiresIn));

  // open the stream with the ticket and read the hello event
  let streamOk = false, hello = false;
  try {
    const res = await fetch(BASE + '/api/notifications/stream?ticket=' + tk.data.ticket);
    streamOk = res.status === 200 && /text\/event-stream/.test(res.headers.get('content-type') || '');
    const reader = res.body.getReader();
    const { value } = await reader.read();
    hello = new TextDecoder().decode(value || new Uint8Array()).includes('hello');
    await reader.cancel();
  } catch (e) { /* handled below */ }
  check('ticket.stream-open', streamOk);
  check('ticket.stream-hello', hello);
  const tkReuse = await fetch(BASE + '/api/notifications/stream?ticket=' + tk.data.ticket);
  /* Step 7 — the strict single-use contract evolved into a BOUNDED REPLAY
     WINDOW: an immediate re-present (EventSource auto-reconnect) is accepted
     within the 45s/2-replay budget. Budget exhaustion + unknown tickets are
     proven 401 in qa_step7_ops.js (#12). */
  check('ticket.replay-window', tkReuse.status === 200); // reconnect grace
  const tkBad = await api('/api/notifications/stream?ticket=' + 'a'.repeat(48));
  check('ticket.bogus-401', tkBad.status === 401);
  const tkNone = await api('/api/notifications/stream');
  check('ticket.none-401', tkNone.status === 401);
  const legacy = await fetch(BASE + '/api/notifications/stream?token=' + T);
  check('ticket.legacy-token-still-ok', legacy.status === 200);
  try { await legacy.body.cancel(); } catch (_) {}

  /* ═════════ 2. SCHEMA VERSIONING + AUDIT TRAIL ═════════ */
  console.log(' · schema versioning + audit');
  const cats = await api('/api/categories');
  const laptops = cats.data.items.find((c) => c.slug === 'laptops') || cats.data.items[0];
  check('categories.list', Boolean(laptops));
  const vBefore = laptops.schemaVersion || 0;
  /* preserve the ORIGINAL schema — restored in cleanup (rule ⑥: zero data loss) */
  const origSchema = JSON.parse(JSON.stringify(laptops.specGroups || []));

  const SCHEMA = {
    specGroups: [
      { key: 'performance', label: 'Performance', labelBn: 'পারফরম্যান্স', order: 0, fields: [
        { key: 'processor', label: 'Processor', type: 'text', filterable: false, icon: '⚙️', showInDetails: true },
        { key: 'ram', label: 'RAM', labelBn: 'র‍্যাম', type: 'select', options: ['8GB', '16GB', '32GB'], filterable: true, showOnCard: true, icon: '🧠', showInDetails: true },
        { key: 'storage', label: 'Storage', type: 'select', options: ['512GB SSD', '1TB SSD'], filterable: true,
          aliases: { '512GB NVMe SSD (M.2 2280)': '512GB SSD' }, showOnCard: true, icon: '💾', showInDetails: true },
        { key: 'screen-size', label: 'Screen Size', type: 'number', unit: 'inch', filterable: true, showOnCard: true, icon: '🖥', showInDetails: true },
        { key: 'qa-notes', label: 'QA Notes', type: 'text', defaultValue: 'standard build', showInDetails: false },
      ] },
    ],
    hideEmptyFields: true,
  };
  const put1 = await api(`/api/admin/categories/${laptops._id}/spec-schema`, { method: 'PUT', token: T, body: SCHEMA });
  check('version.put1', put1.status === 200 && put1.data.schemaVersion === vBefore + 1, JSON.stringify(put1.data).slice(0, 140));
  check('version.diff-added', Array.isArray(put1.data.diff.addedFields) && put1.data.diff.addedFields.some((s) => s.includes('QA Notes')), JSON.stringify(put1.data.diff));

  const ramF = (put1.data.groups || []).flatMap((g) => g.fields).find((f) => f.key === 'ram');
  check('normalize.icon-aliases-card', ramF && ramF.icon === '🧠' && ramF.showOnCard === true && ramF.aliases && ramF.aliases['512GB NVMe SSD (M.2 2280)'] === undefined, JSON.stringify(ramF).slice(0, 160));
  const stF = (put1.data.groups || []).flatMap((g) => g.fields).find((f) => f.key === 'storage');
  check('normalize.aliases-roundtrip', stF && stF.aliases && stF.aliases['512GB NVMe SSD (M.2 2280)'] === '512GB SSD', JSON.stringify(stF && stF.aliases));

  // second save (no structural change) → version bumps, audit entry lands
  const put2 = await api(`/api/admin/categories/${laptops._id}/spec-schema`, { method: 'PUT', token: T, body: SCHEMA });
  check('version.put2-increment', put2.status === 200 && put2.data.schemaVersion === vBefore + 2);
  const cats2 = await api('/api/categories');
  const lap2 = cats2.data.items.find((c) => c.slug === laptops.slug);
  check('version.public-rides', lap2 && lap2.schemaVersion === vBefore + 2);
  const audit0 = (lap2.schemaAudit || [])[0] || {};
  check('audit.entry-latest', audit0.action === 'edit' && audit0.by && audit0.at, JSON.stringify(audit0).slice(0, 140));

  /* ═════════ 3. products with RAW legacy values + ALIAS facets ═════════ */
  console.log(' · facet aliases');
  const mk = async (name, storage, size) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('price', '55555');
    fd.append('category', 'laptops');
    fd.append('stock', '3');
    fd.append('specValues', JSON.stringify([
      { g: 'performance', k: 'ram', v: '16GB' },
      { g: 'performance', k: 'storage', v: storage },
      { g: 'performance', k: 'screen-size', v: size },
    ]));
    fd.append('imageOrder', JSON.stringify([]));
    fd.append('images', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'a.png');
    return api('/api/admin/products', { method: 'POST', token: T, body: fd });
  };
  const pRaw = await mk('QA Alias Raw ' + Date.now(), '512GB NVMe SSD (M.2 2280)', 14);
  const pCanon = await mk('QA Alias Canon ' + Date.now(), '512GB SSD', 15.6);
  check('alias.products-created', pRaw.status === 201 && pCanon.status === 201, JSON.stringify(pRaw.data).slice(0, 120));
  const PR = pRaw.data.product, PC = pCanon.data.product;

  // thumbnails ride the created payloads (sharp local webp derivative)
  check('thumbs.local-created', PR.images[0] && PR.images[0].thumb && /\/uploads\/thumbs\/.+\.webp$/.test(PR.images[0].thumb), PR.images[0] && PR.images[0].thumb);
  const fs = require('fs');
  const thumbPath = '/home/z/my-project/arixgear-full-project/backend' + (PR.images[0].thumb || '').replace('/uploads', '/uploads');
  check('thumbs.file-exists', fs.existsSync(thumbPath), thumbPath);

  const fac = await api('/api/products/filters?category=laptops');
  const stFacet = (fac.data.specs || []).find((f) => f.key === 'storage');
  const facOpts = stFacet ? stFacet.options.map((o) => o.value) : [];
  check('alias.facet-canonical-only', facOpts.includes('512GB SSD') && !facOpts.includes('512GB NVMe SSD (M.2 2280)'), JSON.stringify(facOpts));
  const cnt = stFacet ? (stFacet.options.find((o) => o.value === '512GB SSD') || {}).count : 0;
  check('alias.facet-folded-count', cnt >= 2, String(cnt));
  check('facet.icon-rides', stFacet && stFacet.icon === '💾', stFacet && stFacet.icon);

  // alias-expanded filtering: canonical click matches the raw-variant doc
  const fCanon = await api('/api/products?category=laptops&spec_storage=' + encodeURIComponent('512GB SSD'));
  const ids = (fCanon.data.items || []).map((p) => p._id);
  check('alias.filter-matches-raw', fCanon.status === 200 && ids.includes(String(PR._id)) && ids.includes(String(PC._id)), JSON.stringify(ids).slice(0, 120));
  const fNone = await api('/api/products?category=laptops&spec_storage=' + encodeURIComponent('999GB FAKE'));
  check('alias.filter-empty-safe', fNone.status === 200 && fNone.data.total === 0);
  const fBad = await api('/api/products?category=laptops&spec_screen-size_min=abc&spec_screen-size_max=xyz');
  check('filter.range-nan-safe', fBad.status === 200);

  /* ═════════ 4. SHOW-ON-CARD BADGES on list cards ═════════ */
  console.log(' · card spec badges');
  const list = await api('/api/products?category=laptops&limit=10');
  const rawCard = (list.data.items || []).find((p) => p._id === String(PR._id) || p.slug === PR.slug);
  const badges = rawCard && rawCard.specBadges;
  check('badges.present', Array.isArray(badges) && badges.length > 0, JSON.stringify(badges));
  const ramBadge = (badges || []).find((b) => b.k === 'ram');
  check('badges.value', ramBadge && ramBadge.v === '16GB' && ramBadge.icon === '🧠', JSON.stringify(ramBadge));
  const sizeBadge = (badges || []).find((b) => b.k === 'screen-size');
  check('badges.number-unit', sizeBadge && /inch$/.test(sizeBadge.v), sizeBadge && sizeBadge.v);
  check('badges.cap-3', (badges || []).length <= 3);
  check('badges.list-thumb', rawCard && rawCard.images[0] && Boolean(rawCard.images[0].thumb));
  const pdp = await api('/api/products/' + PR.slug);
  const sschema = pdp.data.specSchema || [];
  const ssField = sschema.flatMap((g) => g.fields).find((f) => f.key === 'screen-size');
  check('pdp.schema-icon', ssField && ssField.icon === '🖥', ssField && ssField.icon);

  /* ═════════ 5. BULK SPEC FILL ═════════ */
  console.log(' · bulk spec fill');
  const fill = await api(`/api/admin/categories/${laptops._id}/apply-defaults`, { method: 'POST', token: T, body: {} });
  check('fill.accepted', fill.status === 200 && fill.data.ok === true, JSON.stringify(fill.data).slice(0, 140));
  check('fill.counts', fill.data.filled > 0 && fill.data.updated > 0 && fill.data.scanned > 0, JSON.stringify(fill.data));
  const pdpAfter = await api('/api/products/' + PR.slug);
  const notesRow = (pdpAfter.data.product.specValues || []).find((s) => s.k === 'qa-notes');
  check('fill.value-landed', notesRow && notesRow.v === 'standard build', JSON.stringify(notesRow));
  check('fill.flat-regen', (pdpAfter.data.product.specs || []).some((r) => r.k === 'QA Notes' && r.v === 'standard build'), JSON.stringify((pdpAfter.data.product.specs || []).slice(0, 3)));
  const fillAgain = await api(`/api/admin/categories/${laptops._id}/apply-defaults`, { method: 'POST', token: T, body: {} });
  check('fill.idempotent', fillAgain.status === 200 && fillAgain.data.filled === 0, JSON.stringify(fillAgain.data).slice(0, 120));

  /* ═════════ 6. CSV FORMULA GUARD ═════════ */
  console.log(' · CSV formula-injection guard');
  const fdEvil = new FormData();
  fdEvil.append('name', '=HYPERLINK("http://evil","pwn")');
  fdEvil.append('price', '1');
  fdEvil.append('category', 'laptops');
  fdEvil.append('images', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'a.png');
  const evil = await api('/api/admin/products', { method: 'POST', token: T, body: fdEvil });
  check('csv.evil-created', evil.status === 201, JSON.stringify(evil.data).slice(0, 120));
  /* raw bytes — undici (fetch) strips the UTF-8 BOM from .text() */
  const csvRes = await fetch(BASE + '/api/admin/products/export.csv', { headers: { Authorization: 'Bearer ' + T } });
  const csvBytes = Buffer.from(await csvRes.arrayBuffer());
  const csvText = csvBytes.toString('utf8');
  check('csv.export-200', csvRes.status === 200 && /text\/csv/.test(csvRes.headers.get('content-type') || ''));
  check('csv.bom', csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF, JSON.stringify(csvBytes.slice(0, 6)));
  const guarded = csvText.includes("'=HYPERLINK");
  check('csv.formula-guarded', guarded === true);
  const evilRow = csvText.split('\r\n').find((r) => r.includes('HYPERLINK'));
  check('csv.roundtrip-marker', Boolean(evilRow && evilRow.includes("'=HYPERLINK")), evilRow && evilRow.slice(0, 80));

  /* ═════════ 7. AI CONSOLE — suggest-mapping · update-mode · bulk-approve ═════════ */
  console.log(' · AI console');
  const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
  const AiImport = require('/home/z/my-project/arixgear-full-project/backend/src/models/AiImport');
  const Product = require('/home/z/my-project/arixgear-full-project/backend/src/models/Product');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');

  // — 7a. suggest-mapping (rules heuristics always answer)
  const stageMap = await AiImport.create({
    sourceUrl: 'https://qa-fixture.example/qa-map-' + Date.now(),
    host: 'qa-fixture.example',
    status: 'ready',
    price: 8800,
    category: 'laptops',
    extracted: {
      name: 'QA Mapping Book ' + Date.now(),
      price: 8800,
      specs: [
        { k: 'RAM', v: '16GB' },
        { k: 'Battery Weight', v: '2.1kg' },
        { k: 'Backlit Keyboard', v: 'Yes' },
        { k: 'Color', v: 'Space Gray' },
        { k: 'Warranty Note', v: 'One year parts and labor with registration on the official support portal within thirty days' },
      ],
      features: ['Feature A'],
      images: ['https://qa-fixture.example/m.png'],
    },
    aiContent: { name: 'QA Mapping Book', source: 'template' },
    images: [{ url: 'https://qa-fixture.example/m.png', publicId: '' }],
  });
  const sug = await api(`/api/admin/ai/imports/${stageMap._id}/suggest-mapping`, { method: 'POST', token: T });
  check('suggest.200', sug.status === 200 && Array.isArray(sug.data.suggestions) && sug.data.suggestions.length === 5, JSON.stringify(sug.data).slice(0, 160));
  const sugOf = (k) => (sug.data.suggestions || []).find((s) => s.k === k) || {};
  check('suggest.ram-number-filterable', sugOf('RAM').type === 'number' && sugOf('RAM').filterable === true, JSON.stringify(sugOf('RAM')));
  check('suggest.bool', sugOf('Backlit Keyboard').type === 'boolean');
  check('suggest.color-select', sugOf('Color').type === 'select' && sugOf('Color').filterable === true);
  check('suggest.weight-not-filterable', sugOf('Battery Weight').filterable === false);
  check('suggest.longtext-not-filterable', sugOf('Warranty Note').filterable === false && sugOf('Warranty Note').type === 'text');
  check('suggest.source', sug.data.provider === 'rules' || ['gemini', 'openai'].includes(sug.data.provider), sug.data.provider);

  // — 7b. update-mode approval (duplicate flag → refresh existing product)
  const target = await Product.findOne({ slug: PC.slug });
  const oldPrice = target.price, oldStock = target.stock, oldSku = target.sku;
  const stageUpd = await AiImport.create({
    sourceUrl: PC.sourceUrl || 'https://qa-fixture.example/qa-upd-' + Date.now(),
    host: 'qa-fixture.example',
    status: 'ready',
    price: 77777,
    category: 'laptops',
    duplicates: [{ productId: target._id, name: target.name, score: 0.97, reason: 'QA staged duplicate' }],
    extracted: {
      name: 'QA Alias Canon UPDATED',
      price: 77777,
      specs: [{ k: 'RAM', v: '32GB' }, { k: 'Storage', v: '1TB SSD' }, { k: 'Fresh Attribute', v: 'fresh!' }],
      features: ['Updated feature one', 'Updated feature two'],
      images: ['https://qa-fixture.example/u.png'],
    },
    aiContent: { name: 'QA Alias Canon UPDATED', source: 'template' },
    images: [{ url: 'https://qa-fixture.example/u.png', publicId: '' }],
  });
  const upd = await api(`/api/admin/ai/imports/${stageUpd._id}/approve`, { method: 'POST', token: T, body: { mode: 'update', targetProductId: String(target._id), price: 77777, category: 'laptops', specs: [{ k: 'RAM', v: '32GB' }, { k: 'Storage', v: '1TB SSD' }, { k: 'Fresh Attribute', v: 'fresh!' }], features: ['Updated feature one', 'Updated feature two'] } });
  check('update.approve-200', upd.status === 200 && upd.data.mode === 'update', JSON.stringify(upd.data).slice(0, 160));
  const updDoc = await Product.findById(target._id);
  check('update.price-changed', +updDoc.price === 77777 && +oldPrice !== 77777);
  check('update.stock-untouched', +updDoc.stock === +oldStock);
  check('update.sku-untouched', String(updDoc.sku || '') === String(oldSku || ''));
  check('update.slug-kept', updDoc.slug === PC.slug);
  check('update.specs-refreshed', (updDoc.specValues || []).some((s) => s.k === 'ram' && s.v === '32GB'));
  check('update.auto-create', (updDoc.specValues || []).some((s) => s.k === 'fresh-attribute'), JSON.stringify((updDoc.specValues || []).map((s) => s.k)));
  check('update.features-refreshed', (updDoc.features || []).includes('Updated feature one'));
  check('update.images-refreshed', (updDoc.images || []).some((i) => /u\.png/.test(i.url)));
  const schemaAfterUpd = await api('/api/categories');
  const lapUpd = schemaAfterUpd.data.items.find((c) => c.slug === 'laptops');
  check('update.schema-grew', (lapUpd.specGroups || []).flatMap((g) => g.fields).some((f) => f.key === 'fresh-attribute'));
  check('update.version-bumped', lapUpd.schemaVersion > lap2.schemaVersion, lapUpd.schemaVersion + '>' + lap2.schemaVersion);
  await AiImport.findByIdAndDelete(stageUpd._id);
  await AiImport.findByIdAndDelete(stageMap._id);

  // — 7c. bulk approve (two fresh staged imports → two products in one call)
  const now = Date.now();
  const s1 = await AiImport.create({ sourceUrl: 'https://qa-fixture.example/b1-' + now, host: 'qa-fixture.example', status: 'ready', price: 1000, category: 'laptops', extracted: { name: 'QA Bulk One ' + now, price: 1000, specs: [{ k: 'RAM', v: '8GB' }], features: ['b1f'], images: ['https://qa-fixture.example/1.png'] }, aiContent: { name: 'QA Bulk One', source: 'template' }, images: [{ url: 'https://qa-fixture.example/1.png', publicId: '' }] });
  const s2 = await AiImport.create({ sourceUrl: 'https://qa-fixture.example/b2-' + now, host: 'qa-fixture.example', status: 'ready', price: 2000, category: 'laptops', extracted: { name: 'QA Bulk Two ' + now, price: 2000, specs: [{ k: 'RAM', v: '8GB' }], features: ['b2f'], images: ['https://qa-fixture.example/2.png'] }, aiContent: { name: 'QA Bulk Two', source: 'template' }, images: [{ url: 'https://qa-fixture.example/2.png', publicId: '' }] });
  const bulk = await api('/api/admin/ai/imports/bulk-approve', { method: 'POST', token: T, body: { ids: [String(s1._id), String(s2._id)], category: 'laptops' } });
  check('bulk.200', bulk.status === 200 && bulk.data.requested === 2, JSON.stringify(bulk.data).slice(0, 200));
  check('bulk.approved-2', bulk.data.approved.length === 2 && bulk.data.failed.length === 0, JSON.stringify(bulk.data.approved));
  const bulkIds = bulk.data.approved.map((a) => a.slug);
  const bulkPdps = await Promise.all(bulkIds.map((s) => api('/api/products/' + s)));
  check('bulk.products-live', bulkPdps.every((r) => r.status === 200));
  const bulkBad = await api('/api/admin/ai/imports/bulk-approve', { method: 'POST', token: T, body: { ids: ['nope'] } });
  check('bulk.rejects-bad-ids', bulkBad.status === 400);

  /* ═════════ 8. migration probe (idempotent core) ═════════ */
  console.log(' · migration probe');
  const { needsMigration, runMigration } = require('/home/z/my-project/arixgear-full-project/backend/src/services/specMigration');
  const need = await needsMigration();
  check('migrate.probe-runs', typeof need === 'number');
  const rep = await runMigration({ dry: true, log: () => {} });
  check('migrate.dry-report', typeof rep.migrated === 'number' && rep.dry === true, JSON.stringify(rep));
  // plant a legacy-flat product → probe sees it → real run migrates it → probe clears
  const legacyDoc = await Product.create({
    name: 'QA Legacy Flat ' + now, slug: 'qa-legacy-flat-' + now, category: 'laptops', price: 1234,
    images: [{ url: 'https://qa-fixture.example/l.png' }],
    specs: [{ k: 'RAM', v: '16GB' }, { k: 'Storage', v: '512GB SSD' }],
    stock: 2,
  });
  const need2 = await needsMigration();
  check('migrate.probe-sees-legacy', need2 >= 1, String(need2));
  await runMigration({ log: () => {} });
  const migratedDoc = await Product.findById(legacyDoc._id);
  check('migrate.rows-created', (migratedDoc.specValues || []).length === 2, JSON.stringify(migratedDoc.specValues || []));
  const need3 = await needsMigration();
  check('migrate.probe-clears', need3 === 0, String(need3));
  check('migrate.flat-preserved', (migratedDoc.specs || []).some((r) => r.k === 'RAM'), 'legacy flat untouched');

  /* ═════════ cleanup ═════════ */
  console.log(' · cleanup');
  for (const id of [PR._id, PC._id, evil.data.product && evil.data.product._id].filter(Boolean)) {
    await api('/api/admin/products/' + id, { method: 'DELETE', token: T });
  }
  for (const s of bulkIds) {
    const r = await api('/api/products/' + s);
    if (r.status === 200 && r.data.product) await api('/api/admin/products/' + r.data.product._id, { method: 'DELETE', token: T });
  }
  await legacyDoc.deleteOne();
  const catsFinal = await api('/api/categories');
  const lapFinal = catsFinal.data.items.find((c) => c.slug === 'laptops');
  const restore = await api(`/api/admin/categories/${lapFinal._id}/spec-schema`, { method: 'PUT', token: T, body: { specGroups: origSchema, hideEmptyFields: lapFinal.hideEmptyFields } });
  check('cleanup.schema-restored', restore.status === 200);
  check('cleanup.migrated-doc-removed', !(await Product.exists({ slug: 'qa-legacy-flat-' + now })));

  console.log(`\n══ Step 6 OPS E2E: PASS=${PASS} FAIL=${FAIL} ══`);
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
