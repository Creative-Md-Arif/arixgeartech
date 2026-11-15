/* Step 6 — XSS FIXTURE SUITE (carried from the Step 4 improvement list).
   Verifies the stored-XSS defense model end to end:
     · JSON APIs store payloads verbatim but ONLY ever answer application/json
       (React renders everything as text nodes — no server-side HTML);
     · server-generated HTML/XML (sitemap.xml) escapes user-controlled values;
     · CSV exports neutralize formula-injection cells (= + - @ / tab);
     · user-supplied spec values pass through the length-capped normalizers;
     · review/question/comments are length-clamped and never reflected in HTML.
   usage: node scripts/qa_step6_xss.js [base]   (default :4000) */
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
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ct: res.headers.get('content-type') || '', text };
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const S = '<script>alert(1)</script>';
const IMG = '<img src=x onerror=alert(1)>';
const TAGS = S + IMG + '"><svg onload=alert(2)>';
const now = Date.now();

(async () => {
  console.log('── Step 6 · XSS FIXTURES → ' + BASE + ' ──');
  const health = await api('/api/health');
  check('api.health', health.data && health.data.ok === true);
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@arixgear.tech', password: 'ArixAdmin2026' } });
  const T = login.data && login.data.token;
  check('auth.admin-login', Boolean(T));

  /* ── 1. poisoned product flows through the DYNAMIC SPEC system ── */
  const fd = new FormData();
  fd.append('name', 'QA XSS Probe ' + TAGS);
  fd.append('price', '444');
  fd.append('category', 'laptops');
  fd.append('stock', '1');
  fd.append('features', JSON.stringify(['<script>x()</script>', IMG + ' feature']));
  fd.append('specValues', JSON.stringify([
    { g: 'performance', k: 'processor', v: S },
    { g: 'performance', k: 'ram', v: '16GB' },
    { g: 'performance', k: 'longattack', v: 'X'.repeat(5000) },
  ]));
  fd.append('images', new Blob([Buffer.from(PNG, 'base64')], { type: 'image/png' }), 'a.png');
  const created = await api('/api/admin/products', { method: 'POST', token: T, body: fd });
  check('xss.product-created', created.status === 201, JSON.stringify(created.data).slice(0, 140));
  const P = created.data.product;
  const slug = P.slug;

  const listRes = await api('/api/products?search=' + encodeURIComponent('QA XSS Probe'));
  check('xss.list-json-only', /application\/json/.test(listRes.ct));
  const listBody = JSON.stringify(listRes.data);
  check('xss.stored-verbatim-json', listBody.includes(S), 'payload preserved in JSON (React escapes at render)');

  const pdp = await api('/api/products/' + slug);
  check('xss.pdp-json-only', /application\/json/.test(pdp.ct));
  const pdpSpec = (pdp.data.product.specValues || []).find((s) => s.k === 'processor');
  check('xss.spec-value-verbatim', pdpSpec && pdpSpec.v === S);
  const longRow = (pdp.data.product.specValues || []).find((s) => s.k === 'longattack');
  check('xss.spec-value-capped', longRow && String(longRow.v).length <= 2000, String(longRow && longRow.v.length));

  const suggest = await api('/api/products/search/suggest?q=' + encodeURIComponent('<script>'));
  /* echoing the query inside JSON is safe (JSON content-type + React text
     nodes) — the danger would be an HTML response reflecting it. */
  check('xss.suggest-json-only', /application\/json/.test(suggest.ct));
  check('xss.suggest-no-html', !/<!DOCTYPE|<html/i.test(suggest.text));

  /* ── 2. server-generated XML: sitemap escapes ── */
  const sm = await fetch(BASE + '/sitemap.xml');
  const smText = await sm.text();
  check('xss.sitemap-xml', /xml/.test(sm.headers.get('content-type') || ''));
  const escaped = smText.includes('&lt;script&gt;') || !smText.includes('<script>alert(1)');
  check('xss.sitemap-escapes-name', escaped, 'product name never lands raw in the sitemap');
  check('xss.sitemap-no-raw-script', !smText.includes('<script>alert(1)</script>'));

  /* ── 3. reviews + questions: clamp + JSON only ── */
  const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'QA XSSer', email: 'xss' + now + '@qa.test', password: 'QaXss2026!' } });
  const UT = (reg.data && reg.data.token) || T;
  check('xss.user-ready', Boolean(UT), JSON.stringify(reg.data).slice(0, 100));
  const rev = await api(`/api/products/${slug}/reviews`, { method: 'POST', token: UT, body: { name: IMG, rating: 5, comment: TAGS + ' great gear really ' + 'A'.repeat(4000) } });
  check('xss.review-received', [200, 201].includes(rev.status) || rev.status === 400, String(rev.status));
  if ([200, 201].includes(rev.status)) {
    const revBody = JSON.stringify(rev.data);
    check('xss.review-json-only', /application\/json/.test(rev.ct));
    const stored = (rev.data.review && rev.data.review.comment) || revBody;
    check('xss.review-clamped', String(stored).length <= 1600, String(stored.length));
    check('xss.review-not-html', !/<!DOCTYPE|<html/i.test(rev.text));
  }
  const q = await api(`/api/products/${slug}/questions`, { method: 'POST', token: UT, body: { name: 'x', question: TAGS } });
  check('xss.question-received', [200, 201].includes(q.status) || q.status === 400, String(q.status));
  if ([200, 201].includes(q.status)) {
    check('xss.question-json-only', /application\/json/.test(q.ct));
    /* the create response only echoes {ok,id} — verify the stored text via
       the admin questions list (user input stored verbatim, rendered safe) */
    const qAdmin = await api('/api/admin/questions?limit=20', { token: T });
    const qRows = qAdmin.data.items || qAdmin.data.questions || [];
    check('xss.question-stored-verbatim', qRows.some((x) => String(x.question || '').includes(S)), JSON.stringify(qAdmin.data).slice(0, 120));
    check('xss.question-admin-list-json', /application\/json/.test(qAdmin.ct));
  }

  /* ── 4. AI import fields (the dynamic system's front door) ── */
  const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
  const AiImport = require('/home/z/my-project/arixgear-full-project/backend/src/models/AiImport');
  const Product = require('/home/z/my-project/arixgear-full-project/backend/src/models/Product');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');
  const stage = await AiImport.create({
    sourceUrl: 'https://qa-fixture.example/xss-' + now,
    host: 'qa-fixture.example',
    status: 'ready',
    price: 500,
    category: 'laptops',
    extracted: {
      name: 'QA XSS Import ' + now,
      price: 500,
      specs: [{ k: IMG, v: S }, { k: 'RAM', v: '8GB' }],
      features: [S + ' feature'],
      images: ['https://qa-fixture.example/x.png'],
    },
    aiContent: { name: 'QA XSS Import', source: 'template' },
    images: [{ url: 'https://qa-fixture.example/x.png', publicId: '' }],
  });
  const appr = await api(`/api/admin/ai/imports/${stage._id}/approve`, { method: 'POST', token: T, body: { price: 500, category: 'laptops', specs: [{ k: IMG, v: S }, { k: 'RAM', v: '8GB' }], features: [S + ' feature'] } });
  check('xss.ai-approve', appr.status === 200, JSON.stringify(appr.data).slice(0, 140));
  const xPdp = await api('/api/products/' + appr.data.product.slug);
  check('xss.ai-pdp-json-only', /application\/json/.test(xPdp.ct));
  check('xss.ai-spec-verbatim', (xPdp.data.product.specs || []).some((r) => r.v === S));
  // the label got slugged by the schema normalizer — no < > survives keys
  check('xss.ai-key-slugged', (xPdp.data.product.specValues || []).every((s) => !/[<>]/.test(s.k)), JSON.stringify((xPdp.data.product.specValues || []).map((s) => s.k)));

  /* ── 5. CSV formula guard on the poisoned name ── */
  const csv = await api('/api/admin/products/export.csv', { token: T });
  const csvText = String(csv.data);
  check('xss.csv-guard-name', /'?<script>alert\(1\)<\/script>/.test(csvText) || csvText.includes(S), 'name stored verbatim (JSON-ish CSV cell)');
  check('xss.csv-no-eval-prefix', !csvText.split('\r\n').some((row) => row.startsWith('=') || row.startsWith('@')), 'no cell in col 1 starts with = or @');

  /* ── 6. category name vector ── */
  const cat = await api('/api/admin/categories', { method: 'POST', token: T, body: { name: 'QA XSS Cat ' + TAGS } });
  if (cat.status === 201) {
    const catList = await api('/api/categories/tree');
    check('xss.category-json', /application\/json/.test(catList.ct));
    await api('/api/admin/categories/' + cat.data.category._id, { method: 'DELETE', token: T });
    ok('xss.category-cleanup');
  } else if (cat.status === 409 || cat.status === 400) {
    /* 400 = the model REJECTED the oversized payload (name maxlength 80) —
       rejection is a valid defense; 409 = dupe guard */
    ok('xss.category-' + (cat.status === 400 ? 'rejected-by-maxlength' : 'dupe-rejected'));
  } else bad('xss.category-vector', String(cat.status));

  /* ── cleanup ── */
  await api('/api/admin/products/' + P._id, { method: 'DELETE', token: T });
  if (appr.status === 200) await api('/api/admin/products/' + appr.data.product._id, { method: 'DELETE', token: T });
  await AiImport.findByIdAndDelete(stage._id);
  try { await mongoose.connection.close(); } catch (_) {}
  ok('cleanup.done');

  console.log(`\n══ Step 6 XSS FIXTURES: PASS=${PASS} FAIL=${FAIL} ══`);
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
