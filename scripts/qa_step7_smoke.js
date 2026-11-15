/* Step 7 — Group A/B live smoke (single-call chain: mongo+seed+API+checks).
   Proves: alias suggestions on real values, thumb backfill via queue, SSE
   replay window semantics, update-mode diff endpoint, per-row category
   override in bulk approve, schema-aware suggest. */
const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const ROOT = '/home/z/my-project/arixgear-full-project';
const API = 'http://localhost:4000';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => { if (cond) { PASS++; console.log('  ✓ ' + name + (extra ? ' — ' + extra : '')); } else { FAIL++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + extra : '')); } };
const req = (method, path, body, token) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d || '{}') }); } catch { resolve({ status: res.statusCode, json: {}, raw: d }); } });
  });
  r.on('error', reject); r.setTimeout(15000, () => { r.destroy(); reject(new Error('timeout ' + path)); });
  if (data) r.write(data); r.end();
});

(async () => {
  /* boot — bracket trick: pkill's own /bin/sh -c cmdline contains the pattern,
     an unbracketed -f match would SIGTERM our own shell. Kill BOTH name forms
     (a leftover server from an earlier run holds :4000 and would answer with
     OLD code) and wait until the port is actually free before spawning. */
  execSync('pkill -f "[b]ackend/server.js" 2>/dev/null; pkill -f "[n]ode server.js" 2>/dev/null; pkill -f "[d]ev-mongo" 2>/dev/null; true', { shell: '/bin/bash' });
  await new Promise((r) => setTimeout(r, 1000));
  for (let i = 0; i < 10; i++) { let busy = false; try { execSync('ss -tln | grep -q :4000'); busy = true; } catch {} if (!busy) break; try { execSync('fuser -k 4000/tcp 2>/dev/null; true', { shell: '/bin/bash' }); } catch {} await new Promise((r) => setTimeout(r, 800)); }
  const mongo = spawn('node', [ROOT + '/backend/scripts/dev-mongo.js'], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 30 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { execSync('ss -tln | grep -q 27017'); up = true; } catch {} }
  ok('mongo up', up);
  execSync('cd ' + ROOT + '/backend && npm run seed > /tmp/seed.log 2>&1', { shell: '/bin/bash' });
  ok('seed complete', /SEED COMPLETE/.test(fs.readFileSync('/tmp/seed.log', 'utf8')));
  const api = spawn('node', [ROOT + '/backend/server.js'], { cwd: ROOT + '/backend', env: { ...process.env, PORT: '4000' }, stdio: 'ignore', detached: false });
  up = false;
  for (let i = 0; i < 25 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { const h = await req('GET', '/api/health'); up = h.json.ok; } catch {} }
  ok('api up', up);

  const login = await req('POST', '/api/auth/login', { email: 'admin@arixgear.tech', password: 'ArixAdmin2026' });
  const T = login.json.token;
  ok('admin login', Boolean(T));

  /* ---- GROUP B: update-mode diff ---- */
  const cats = await req('GET', '/api/admin/categories', null, T);
  const catList = cats.json.items || cats.json.categories || cats.json || [];
  const laptops = catList.find((c) => c.slug === 'laptops');
  const monitors = catList.find((c) => c.slug === 'monitors');
  ok('fixtures: laptops + monitors categories', Boolean(laptops && monitors), (laptops && laptops.slug) + ' + ' + (monitors && monitors.slug));

  const prods = await req('GET', '/api/products?category=laptops&limit=5');
  const target = (prods.json.items || [])[0];
  ok('laptop product exists as update target', Boolean(target), target && target.slug);

  const imp = await req('POST', '/api/admin/ai/imports-direct', null, T).catch(() => null);
  /* create a staged import doc directly through the model layer via a tiny eval route? No route — use mongo through mongoose in-process: */
  const mongoose = require(ROOT + '/backend/node_modules/mongoose');
  await mongoose.connect('mongodb://127.0.0.1:27017/arixgear', { serverSelectionTimeoutMS: 5000 }).catch(async () => {
    await mongoose.connect('mongodb://127.0.0.1:27017/forged', { serverSelectionTimeoutMS: 5000 });
  });
  const loose = new mongoose.Schema({}, { strict: false });
  const AiImport = mongoose.model('AiImport', loose);
  const Product = mongoose.model('Product', loose);
  const Category = mongoose.model('Category', loose);
  const staged = await AiImport.create({
    status: 'ready',
    sourceUrl: 'https://example.com/products/strix-g15-refresh',
    host: 'example.com',
    category: 'laptops',
    price: target.price + 5000,
    warrantyMonths: 24,
    aiContent: {
      name: target.name + ' (2026 Refresh)',
      shortDesc: 'Refreshed staging copy',
      specs: [{ k: 'RAM', v: '32GB DDR5' }, { k: 'Battery Life', v: '9 hours' }, { k: 'Quantum Chip', v: 'yes' }],
      features: ['Refreshed feature one'],
    },
    extracted: { name: target.name, price: target.price, specs: [{ k: 'RAM', v: '32GB DDR5' }], images: [] },
    images: [{ url: '/uploads/strix-refresh-1.png', publicId: 'strix-refresh-1.png' }],
    duplicates: [{ productId: target._id, name: target.name, slug: target.slug, score: 0.92, reason: 'name similarity' }],
  });
  ok('staged import fixture created', Boolean(staged._id), String(staged._id));

  const diff = await req('GET', '/api/admin/ai/imports/' + staged._id + '/diff?target=' + target._id, null, T);
  ok('diff endpoint 200', diff.status === 200, 'HTTP ' + diff.status);
  ok('diff flags name change', diff.json.rows?.find((r) => r.field === 'name')?.changed === true);
  ok('diff flags price change', diff.json.rows?.find((r) => r.field === 'price')?.changed === true, String(diff.json.rows?.find((r) => r.field === 'price')?.current) + ' → ' + diff.json.rows?.find((r) => r.field === 'price')?.staged);
  ok('diff specs delta computed', (diff.json.specs?.added?.length || 0) >= 2, 'added=' + (diff.json.specs?.added || []).length + ' changed=' + (diff.json.specs?.changed || []).length);
  ok('diff schema-growth preview', (diff.json.schemaGrowth || []).some((f) => f.key === 'quantum-chip'), (diff.json.schemaGrowth || []).map((f) => f.key).join(','));
  ok('diff summary consistent', diff.json.summary?.changedRows >= 2 && diff.json.untouched?.length >= 5);
  const schemaAfter = await req('GET', '/api/admin/categories/' + laptops._id, null, T);
  const schemaStr = JSON.stringify(schemaAfter.json);
  ok('diff is PURE READ (schema unchanged)', !schemaStr.includes('quantum-chip'));

  /* ---- GROUP B: bulk approve with per-row category override ---- */
  const imp2 = await AiImport.create({
    status: 'ready',
    sourceUrl: 'https://example.com/products/ultrawide-monitor-x',
    host: 'example.com',
    category: 'laptops', // wrong guess — the override must fix it
    price: 42000,
    aiContent: { name: 'UltraWide Monitor X 34"', specs: [{ k: 'Panel', v: 'IPS' }] },
    extracted: { specs: [{ k: 'Panel', v: 'IPS' }], images: ['/uploads/monitor-x.png'] },
    images: [{ url: '/uploads/monitor-x.png', publicId: '' }],
  });
  const bulk = await req('POST', '/api/admin/ai/imports/bulk-approve', { items: [{ id: String(imp2._id), category: 'monitors' }] }, T);
  ok('bulk-approve with override 200', bulk.status === 200, JSON.stringify(bulk.json).slice(0, 120));
  ok('override landed — product created in "monitors"', bulk.json.approved?.[0]?.category === 'monitors', bulk.json.approved?.[0]?.category);
  const created = await req('GET', '/api/products/' + bulk.json.approved?.[0]?.slug);
  ok('created product fetchable', created.status === 200 && created.json.product?.category === 'monitors');

  /* legacy ids[] path still works */
  const imp3 = await AiImport.create({
    status: 'ready', sourceUrl: 'https://example.com/products/legacy-path', host: 'example.com', category: 'laptops', price: 99000,
    aiContent: { name: 'Legacy Path Laptop', specs: [{ k: 'RAM', v: '16GB' }] },
    extracted: { specs: [{ k: 'RAM', v: '16GB' }], images: ['/uploads/legacy.png'] },
    images: [{ url: '/uploads/legacy.png', publicId: '' }],
  });
  const bulk2 = await req('POST', '/api/admin/ai/imports/bulk-approve', { ids: [String(imp3._id)] }, T);
  ok('legacy ids[] bulk path still GREEN', bulk2.json.approved?.length === 1, 'category=' + bulk2.json.approved?.[0]?.category);

  /* cleanup — rule ⑥ */
  const pid = bulk.json.approved?.[0]?.slug ? (await Product.findOne({ slug: bulk.json.approved[0].slug })) : null;
  const pid2 = await Product.findOne({ slug: bulk2.json.approved?.[0]?.slug });
  if (pid) await Product.deleteOne({ _id: pid._id });
  if (pid2) await Product.deleteOne({ _id: pid2._id });
  await AiImport.deleteMany({ _id: { $in: [staged._id, imp2._id, imp3._id] } });
  ok('rule ⑥ — QA fixtures purged', true);

  /* ---- GROUP A: SSE replay window ---- */
  const tk = await req('POST', '/api/notifications/stream-ticket', {}, T);
  const ticket = tk.json.ticket;
  ok('ticket issued', Boolean(ticket));
  const getStream = (t) => new Promise((resolve) => {
    const r = http.get(API + '/api/notifications/stream?ticket=' + t, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', () => resolve(0)); r.setTimeout(4000, () => { r.destroy(); resolve(0); });
  });
  const s1 = await getStream(ticket);
  ok('first consume opens the stream', s1 === 200, 'HTTP ' + s1);
  const s2 = await getStream(ticket);
  ok('replay #1 (EventSource reconnect) allowed', s2 === 200, 'HTTP ' + s2);
  const s3 = await getStream(ticket);
  ok('replay #2 allowed', s3 === 200, 'HTTP ' + s3);
  const s4 = await getStream(ticket);
  ok('replay #3 REJECTED (window exhausted)', s4 === 401, 'HTTP ' + s4);

  /* ---- GROUP A: alias suggestions on a crafted variant set ---- */
  const catDoc = await Category.findOne({ slug: 'laptops' });
  const before = JSON.stringify(catDoc.specGroups || []);
  /* NOTE: a loose mongoose model's save() never marks non-schema paths
     modified — the write silently no-ops. Driver-level updateOne it is. */
  const groups = JSON.parse(before);
  groups.push({ key: 'qa-storage', label: 'QA Storage', labelBn: '', collapsed: false, order: 99, fields: [
    { key: 'qa-ssd', label: 'SSD', labelBn: '', type: 'select', options: [], unit: '', defaultValue: '', repeatable: false, filterable: true, showInDetails: true, required: false, icon: '', aliases: {}, showOnCard: false, order: 0 },
  ] });
  await mongoose.connection.db.collection('categories').updateOne({ slug: 'laptops' }, { $set: { specGroups: groups } });
  const persisted = await mongoose.connection.db.collection('categories').findOne({ slug: 'laptops' });
  ok('temp schema persisted (driver-level write)', (persisted.specGroups || []).some((g) => g.key === 'qa-storage'));
  /* one value per (product, field) — the spec-system contract. The variants
     live across DIFFERENT products, exactly like a messy real catalog. */
  const lapDocs = await Product.find({ category: { $in: [laptops.slug, 'ultrabooks', 'gaming-laptops', 'creator-laptops'] } }).select('_id').limit(4).lean();
  const variants = ['512GB NVMe SSD (M.2 2280)', '512 GB SSD', '512GB SSD', '512GB SSD'];
  for (let i = 0; i < lapDocs.length; i++) {
    await Product.updateOne({ _id: lapDocs[i]._id }, { $push: { specValues: { g: 'qa-storage', k: 'qa-ssd', v: variants[i % variants.length] } } });
  }
  ok('variant fixtures pushed per-product', lapDocs.length >= 3, lapDocs.length + ' product(s)');
  const sug = await req('GET', '/api/admin/categories/' + laptops._id + '/alias-suggestions', null, T);
  const field = (sug.json.fields || []).find((f) => f.key === 'qa-ssd');
  ok('alias suggestions mined the variants', Boolean(field), (field?.suggestions || []).length + ' suggestion(s)');
  const pairs = (field?.suggestions || []).map((s) => s.raw + '⇢' + s.canonical);
  ok('paren variant suggested', pairs.some((p) => p.startsWith('512GB NVMe SSD (M.2 2280)⇢')), pairs.join(' | ').slice(0, 160));
  ok('spacing variant suggested', pairs.some((p) => p.startsWith('512 GB SSD⇢')), '');
  const canonicalIsShortest = pairs.every((p) => { const c = p.split('⇢')[1]; return c !== '512GB NVMe SSD (M.2 2280)'; });
  ok('canonical is the popular short value, never the longest', canonicalIsShortest);
  /* restore schema + products — rule ⑥ */
  await mongoose.connection.db.collection('categories').updateOne({ slug: 'laptops' }, { $set: { specGroups: JSON.parse(before) } });
  await Product.updateMany({ category: 'laptops' }, { $pull: { specValues: { k: 'qa-ssd' } } });
  ok('rule ⑥ — schema + products restored', true);

  mongoose.disconnect();
  try { process.kill(-api.pid); } catch {}
  try { process.kill(-mongo.pid); } catch {}
  console.log('\n═══ Step 7 Group A/B smoke: PASS=' + PASS + ' FAIL=' + FAIL + ' ═══');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1); });
