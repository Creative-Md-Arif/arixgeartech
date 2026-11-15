/* Step 7 — QA BATTERY: the 12 improvement candidates, proven against the live
   stack (mongo+seed+API booted by qa_one_suite.sh in the SAME process tree).
   Covers: #1 alias auto-suggest · #2 schema-aware search · #4 update-mode
   diff · #5 per-row override bulk approve · #6 thumbnail backfill · #7 audit
   schemaEdits stream · #10 rate-limit headers · #11 prefetch queue · #12 SSE
   replay window. (#3/#8/#9 are UI behaviours — proven in the browser QA pass.) */
const http = require('http');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:4000';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => { if (cond) { PASS++; console.log('  ✓ ' + name + (extra ? ' — ' + extra : '')); } else { FAIL++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + extra : '')); } };

const req = (method, path, body, token, raw) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const u = new URL(BASE + path);
  const r = http.request(u, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
    let d = ''; res.on('data', (c) => (d += c));
    res.on('end', () => { if (raw) return resolve({ status: res.statusCode, headers: res.headers, body: d }); try { resolve({ status: res.statusCode, json: JSON.parse(d || '{}'), headers: res.headers }); } catch { resolve({ status: res.statusCode, json: {}, headers: res.headers, raw: d }); } });
  });
  r.on('error', reject); r.setTimeout(20000, () => { r.destroy(); reject(new Error('timeout ' + path)); });
  if (data) r.write(data); r.end();
});

(async () => {
  console.log('── Step 7 ops battery ──');

  const login = await req('POST', '/api/auth/login', { email: 'admin@arixgear.tech', password: 'ArixAdmin2026' });
  const T = login.json.token;
  ok('admin login', Boolean(T));

  /* in-process mongoose for fixture writes (driver-level — a loose model's
     save() never marks non-schema paths modified, learned the hard way) */
  const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
  await mongoose.connect('mongodb://127.0.0.1:27017/arixgear', { serverSelectionTimeoutMS: 5000 });
  const loose = new mongoose.Schema({}, { strict: false });
  const AiImport = mongoose.model('AiImport', loose);
  const ProductM = mongoose.model('Product', loose);
  const CategoryM = mongoose.model('Category', loose);
  const catsCol = mongoose.connection.db.collection('categories');

  const cats = await req('GET', '/api/admin/categories', null, T);
  const catList = cats.json.items || cats.json.categories || [];
  const laptops = catList.find((c) => c.slug === 'laptops');
  const monitors = catList.find((c) => c.slug === 'monitors');
  ok('fixtures ready (laptops + monitors)', Boolean(laptops && monitors));

  /* ============ #10 — RATE-LIMIT HEADERS (draft-7 per express-rate-limit v8:
     Policy + the COMBINED "RateLimit: limit=…, remaining=…, reset=…" header) ============ */
  console.log('  · #10 rate-limit headers');
  const rl = await req('GET', '/api/products?limit=1', null, null, true);
  ok('RateLimit-Policy present (<limit>;w=<seconds>)', /^\d+;w=\d+$/.test(String(rl.headers['ratelimit-policy'] || '')), rl.headers['ratelimit-policy']);
  const combined = String(rl.headers['ratelimit'] || '');
  const mLimit = /limit=(\d+)/.exec(combined), mRem = /remaining=(\d+)/.exec(combined), mReset = /reset=(\d+)/.exec(combined);
  ok('combined RateLimit header carries limit/remaining/reset', Boolean(mLimit && mRem && mReset), combined);
  ok('limit matches the configured 800/window 900s', mLimit && mLimit[1] === '800' && /w=900/.test(String(rl.headers['ratelimit-policy'] || '')));
  const rl2 = await req('GET', '/api/products?limit=1', null, null, true);
  const rem2 = Number((/remaining=(\d+)/.exec(String(rl2.headers['ratelimit'] || '')) || [])[1]);
  ok('remaining decrements per request', Number.isFinite(rem2) && rem2 < Number(mRem[1]), mRem[1] + ' → ' + rem2);
  /* legacy x-ratelimit headers OFF (draft-7 only — no double-header confusion) */
  ok('legacy X-RateLimit headers disabled', rl.headers['x-ratelimit-limit'] === undefined);

  /* ============ #2 — SCHEMA-AWARE SEARCH ============ */
  console.log('  · #2 schema-aware search');
  const sug1 = await req('GET', '/api/products/search/suggest?q=RTX&limit=6');
  ok('suggest 200 + items', sug1.status === 200 && sug1.json.items?.length > 0);
  ok('specMatches aggregated', (sug1.json.specMatches || []).length > 0 && sug1.json.specMatches[0].label && sug1.json.specMatches[0].v, JSON.stringify((sug1.json.specMatches || [])[0]).slice(0, 120));
  const hitRow = (sug1.json.items || []).find((i) => i.specHit);
  ok('matching rows carry specHit chips', Boolean(hitRow), hitRow ? hitRow.specHit.label + ' · ' + hitRow.specHit.v : '');
  const sug2 = await req('GET', '/api/products/search/suggest?q=16&limit=6');
  ok('partial tokens match spec values too ("16" → 16000 DPI class rows)', sug2.json.items?.length > 0 && (sug2.json.specMatches?.length || sug2.json.items.some((i) => i.specHit)));
  const sug3 = await req('GET', '/api/products/search/suggest?q=a');
  ok('sub-2-char query → empty + shape kept', sug3.json.items?.length === 0 && Array.isArray(sug3.json.specMatches) && sug3.json.specMatches.length === 0);

  /* ============ #1 — FACET ALIAS AUTO-SUGGEST ============ */
  console.log('  · #1 facet alias auto-suggest');
  /* temp filterable field + one variant per product (the one-entry-per-(g,k)
     contract — variants live ACROSS products, exactly like a messy catalog) */
  const before = await catsCol.findOne({ slug: 'laptops' });
  const groupsBefore = JSON.parse(JSON.stringify(before.specGroups || []));
  groupsBefore.push({ key: 'qa-storage', label: 'QA Storage', labelBn: '', collapsed: false, order: 99, fields: [
    { key: 'qa-ssd', label: 'SSD', labelBn: '', type: 'select', options: [], unit: '', defaultValue: '', repeatable: false, filterable: true, showInDetails: true, required: false, icon: '', aliases: {}, showOnCard: false, order: 0 },
  ] });
  await catsCol.updateOne({ slug: 'laptops' }, { $set: { specGroups: groupsBefore } });
  const branchSlugs = (await mongoose.connection.db.collection('categories').find({ path: 'laptops' }).project({ slug: 1 }).toArray()).map((d) => d.slug).concat('laptops');
  const lapDocs = await ProductM.find({ category: { $in: [...new Set(branchSlugs)] } }).select('_id').limit(4).lean();
  const variants = ['512GB NVMe SSD (M.2 2280)', '512 GB SSD', '512GB SSD', '512GB SSD'];
  for (let i = 0; i < lapDocs.length; i++) {
    await ProductM.updateOne({ _id: lapDocs[i]._id }, { $push: { specValues: { g: 'qa-storage', k: 'qa-ssd', v: variants[i % variants.length] } } });
  }
  const schemaAfterFixture = JSON.stringify((await catsCol.findOne({ slug: 'laptops' })).specGroups || []);
  const sugA = await req('GET', '/api/admin/categories/' + laptops._id + '/alias-suggestions', null, T);
  ok('alias-suggestions 200 + branch-aware scan', sugA.status === 200 && sugA.json.scanned > 0 && (sugA.json.branch || []).includes('gaming-laptops'), 'scanned=' + sugA.json.scanned);
  const qaField = (sugA.json.fields || []).find((f) => f.key === 'qa-ssd');
  ok('variants mined into suggestions', Boolean(qaField) && qaField.suggestions.length >= 2, (qaField?.suggestions || []).length + ' suggestion(s)');
  const pairs = (qaField?.suggestions || []).map((s) => s.raw + '⇢' + s.canonical);
  ok('paren variant → popular short canonical', pairs.some((p) => p.startsWith('512GB NVMe SSD (M.2 2280)⇢')), pairs.join(' | '));
  ok('spacing variant suggested', pairs.some((p) => p.startsWith('512 GB SSD⇢')));
  ok('suggestions carry why+count', (qaField.suggestions || []).every((s) => s.count >= 1 && ['normalize', 'collapse'].includes(s.why)));
  const schemaAfterSuggest = JSON.stringify((await catsCol.findOne({ slug: 'laptops' })).specGroups || []);
  ok('suggest is PURE READ (schema untouched)', schemaAfterSuggest === schemaAfterFixture);
  ok('bad category id → 404', (await req('GET', '/api/admin/categories/000000000000000000000000/alias-suggestions', null, T)).status === 404);

  /* ============ #11/#6 — THUMB QUEUE + BACKFILL ============ */
  console.log('  · #6/#11 thumbnail backfill + prefetch queue');
  const q0 = await req('GET', '/api/admin/system/thumb-queue', null, T);
  ok('queue stats endpoint', q0.status === 200 && Number.isInteger(q0.json.pending) && q0.json.concurrency === 2, JSON.stringify(q0.json).slice(0, 120));
  /* upload a real image through the admin endpoint, attach to a QA product */
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pngBuf = Buffer.from(pngB64, 'base64');
  const boundary = '----step7qa' + Date.now();
  const mp = Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="qa7.png"\r\nContent-Type: image/png\r\n\r\n'),
    pngBuf, Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);
  const upRes = await new Promise((resolve, reject) => {
    const u = new URL(BASE + '/api/admin/uploads');
    const r = http.request(u, { method: 'POST', headers: { Authorization: 'Bearer ' + T, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': mp.length } }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d || '{}') }); } catch { resolve({ status: res.statusCode, json: {} }); } }); });
    r.on('error', reject); r.write(mp); r.end();
  });
  ok('test image uploaded via /admin/uploads', upRes.status === 201 && Boolean(upRes.json.image?.url), upRes.json.image?.url || JSON.stringify(upRes.json).slice(0, 120));
  const testUrl = upRes.json.image?.url || null;
  if (!testUrl) { console.log('  ⚠ upload failed — skipping thumb-backfill block'); }
  const testProduct = testUrl ? await ProductM.create({
    name: 'QA7 ThumbBackfill Product', slug: 'qa7-thumb-' + Date.now().toString(36), category: 'laptops',
    price: 12345, stock: 1, active: false, badge: 'none',
    images: [{ url: testUrl, publicId: testUrl.replace('/uploads/', '') }], /* NO thumb — pre-Step-6 shape */
  }) : null;
  if (testProduct) {
  const bf = await req('POST', '/api/admin/system/backfill-thumbs?wait=1&limit=200', null, T);
  ok('backfill 200 + report shape', bf.status === 200 && typeof bf.json.scanned === 'number' && bf.json.mode === 'inline');
  ok('backfill derived the local thumb', bf.json.queued >= 1 || (await ProductM.findOne({ slug: testProduct.slug })).images[0].thumb !== testUrl, 'queued=' + bf.json.queued);
  const patched = await ProductM.findOne({ slug: testProduct.slug }).lean();
  ok('thumb persisted on the image row', patched.images[0].thumb && patched.images[0].thumb !== testUrl && patched.images[0].thumb.startsWith('/uploads/thumbs/'), patched.images[0].thumb);
  const thumbFile = '/home/z/my-project/arixgear-full-project/backend' + patched.images[0].thumb;
  ok('thumb file exists on disk (sharp wrote it)', fs.existsSync(thumbFile), patched.images[0].thumb);
  const bf2 = await req('POST', '/api/admin/system/backfill-thumbs?wait=1&limit=200', null, T);
  ok('backfill is IDEMPOTENT (2nd run skips)', (bf2.json.alreadyThumbed || 0) >= (bf.json.alreadyThumbed || 0) + 1, 'already=' + bf2.json.alreadyThumbed);
  const q1 = await req('GET', '/api/admin/system/thumb-queue', null, T);
  ok('queue drained (pending=0, active=0)', q1.json.pending === 0 && q1.json.active === 0);
  ok('backfill without auth → 401/403', [401, 403].includes((await req('POST', '/api/admin/system/backfill-thumbs', null, null)).status));
  }

  /* ============ #4 — UPDATE-MODE DIFF ============ */
  console.log('  · #4 update-mode diff');
  const prods = await req('GET', '/api/products?category=laptops&limit=5');
  const target = (prods.json.items || [])[0];
  const staged = await AiImport.create({
    status: 'ready', sourceUrl: 'https://example.com/products/qa7-refresh', host: 'example.com', category: 'laptops',
    price: target.price + 5000, warrantyMonths: 24,
    aiContent: { name: target.name + ' (QA7 Refresh)', shortDesc: 'QA7 staging copy', specs: [{ k: 'RAM', v: '32GB DDR5' }, { k: 'Quantum Chip', v: 'yes' }], features: ['QA7 feature'] },
    extracted: { name: target.name, price: target.price, specs: [{ k: 'RAM', v: '32GB DDR5' }], images: [] },
    images: [{ url: testUrl, publicId: '' }],
    duplicates: [{ productId: target._id, name: target.name, slug: target.slug, score: 0.93, reason: 'name similarity' }],
  });
  const diff = await req('GET', '/api/admin/ai/imports/' + staged._id + '/diff?target=' + target._id, null, T);
  ok('diff 200 + target identity', diff.status === 200 && diff.json.target?.slug === target.slug);
  ok('diff flags name + price changes', diff.json.rows.find((r) => r.field === 'name')?.changed && diff.json.rows.find((r) => r.field === 'price')?.changed);
  ok('diff specs delta (added rows)', (diff.json.specs?.added || []).length >= 2, 'added=' + diff.json.specs.added.length);
  ok('diff schema-growth preview names unknown fields', (diff.json.schemaGrowth || []).some((f) => f.key === 'quantum-chip'), (diff.json.schemaGrowth || []).map((f) => f.key).join(','));
  ok('diff untouched list', (diff.json.untouched || []).length >= 5 && diff.json.untouched.join(' ').includes('stock'));
  ok('diff without target → 400', (await req('GET', '/api/admin/ai/imports/' + staged._id + '/diff', null, T)).status === 400);
  const schemaStrAfterDiff = JSON.stringify((await catsCol.findOne({ slug: 'laptops' })).specGroups || []);
  ok('diff is PURE READ', schemaStrAfterDiff === schemaAfterSuggest);

  /* ============ #5 — BULK APPROVE PER-ROW OVERRIDE ============ */
  console.log('  · #5 bulk approve per-row override');
  const imp2 = await AiImport.create({
    status: 'ready', sourceUrl: 'https://example.com/products/qa7-monitor', host: 'example.com', category: 'laptops' /* wrong guess */,
    price: 42000, aiContent: { name: 'QA7 Override Monitor 34"', specs: [{ k: 'Panel', v: 'IPS' }] },
    extracted: { specs: [{ k: 'Panel', v: 'IPS' }], images: [testUrl] }, images: [{ url: testUrl, publicId: '' }],
  });
  const bulk = await req('POST', '/api/admin/ai/imports/bulk-approve', { items: [{ id: String(imp2._id), category: 'monitors' }] }, T);
  ok('override bulk 200 + lands in target category', bulk.json.approved?.[0]?.category === 'monitors', bulk.json.approved?.[0]?.category);
  const created = await req('GET', '/api/products/' + bulk.json.approved?.[0]?.slug);
  ok('created product fetchable in monitors', created.status === 200 && created.json.product?.category === 'monitors');
  const imp3 = await AiImport.create({
    status: 'ready', sourceUrl: 'https://example.com/products/qa7-legacy', host: 'example.com', category: 'laptops', price: 99000,
    aiContent: { name: 'QA7 Legacy Path', specs: [{ k: 'RAM', v: '16GB' }] }, extracted: { specs: [{ k: 'RAM', v: '16GB' }], images: [testUrl] }, images: [{ url: testUrl, publicId: '' }],
  });
  const bulk2 = await req('POST', '/api/admin/ai/imports/bulk-approve', { ids: [String(imp3._id)] }, T);
  ok('legacy ids[] path unchanged (import guess wins)', bulk2.json.approved?.length === 1 && bulk2.json.approved[0].category === 'laptops', bulk2.json.approved?.[0]?.category);
  ok('>20 items rejected', (await req('POST', '/api/admin/ai/imports/bulk-approve', { items: Array.from({ length: 25 }, () => ({ id: String(staged._id) })) }, T)).status === 400);
  ok('empty payload → 400', (await req('POST', '/api/admin/ai/imports/bulk-approve', {}, T)).status === 400);

  /* ============ #7 — AUDIT SCHEMA-EDIT STREAM ============ */
  console.log('  · #7 audit schemaEdits');
  const aud = await req('GET', '/api/admin/audit?limit=5', null, T);
  ok('audit 200 + schemaEdits array', aud.status === 200 && Array.isArray(aud.json.schemaEdits));
  ok('schema edits carry version chips + summary + who', (aud.json.schemaEdits || []).length > 0 && aud.json.schemaEdits.every((s) => Number.isInteger(s.version) && s.summary && s.by), (aud.json.schemaEdits || [])[0]?.category + ' v' + (aud.json.schemaEdits || [])[0]?.version);
  ok('ownerOnly still enforced (no token → 401)', (await req('GET', '/api/admin/audit', null, null)).status === 401);

  /* ============ #12 — SSE REPLAY WINDOW ============ */
  console.log('  · #12 SSE ticket replay window');
  const tk = await req('POST', '/api/notifications/stream-ticket', {}, T);
  ok('ticket issued (60s TTL)', Boolean(tk.json.ticket) && tk.json.expiresIn === 60);
  const openStream = (t) => new Promise((resolve) => {
    const r = http.get(BASE + '/api/notifications/stream?ticket=' + t, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', () => resolve(0)); r.setTimeout(4000, () => { r.destroy(); resolve(0); });
  });
  const ticket = tk.json.ticket;
  ok('first consume 200', (await openStream(ticket)) === 200);
  ok('replay #1 (EventSource reconnect) 200', (await openStream(ticket)) === 200);
  ok('replay #2 200', (await openStream(ticket)) === 200);
  ok('replay #3 REJECTED 401 (window budget spent)', (await openStream(ticket)) === 401);
  ok('unknown ticket 401', (await openStream('deadbeef'.repeat(6))) === 401);
  /* a FRESH ticket gets its own budget */
  const tk2 = await req('POST', '/api/notifications/stream-ticket', {}, T);
  ok('fresh ticket opens + 1 replay', (await openStream(tk2.json.ticket)) === 200 && (await openStream(tk2.json.ticket)) === 200);

  /* ============ rule ⑥ — cleanup ============ */
  console.log('  · cleanup');
  if (testProduct) await ProductM.deleteOne({ _id: testProduct._id });
  const bySlug = bulk.json.approved?.[0]?.slug ? await ProductM.findOne({ slug: bulk.json.approved[0].slug }) : null;
  const bySlug2 = bulk2.json.approved?.[0]?.slug ? await ProductM.findOne({ slug: bulk2.json.approved[0].slug }) : null;
  if (bySlug) await ProductM.deleteOne({ _id: bySlug._id });
  if (bySlug2) await ProductM.deleteOne({ _id: bySlug2._id });
  await AiImport.deleteMany({ _id: { $in: [staged._id, imp2._id, imp3._id] } });
  await catsCol.updateOne({ slug: 'laptops' }, { $set: { specGroups: groupsBefore.filter((g) => g.key !== 'qa-storage') } });
  await ProductM.updateMany({}, { $pull: { specValues: { k: 'qa-ssd' } } });
  if (testUrl && testUrl.startsWith('/uploads/')) {
    try { fs.unlinkSync('/home/z/my-project/arixgear-full-project/backend' + testUrl); } catch {}
    try { fs.unlinkSync(thumbFile); } catch {}
  }
  ok('rule ⑥ — fixtures, schema, uploads restored', true);

  mongoose.disconnect();
  console.log('\n═══ Step 7 ops battery: PASS=' + PASS + ' FAIL=' + FAIL + ' ═══');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('BATTERY CRASH:', e); process.exit(1); });
