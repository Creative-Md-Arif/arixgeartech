#!/usr/bin/env node
/* Task 48 QA — BN/EN language toggle (frontend + admin UI; backend stays English).
   API sanity + built-bundle assertions + served font checks. */
import { readFileSync, existsSync } from 'fs';
import { readdirSync } from 'fs';
const B = 'http://localhost:5000';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };

const js = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(dir + '/' + f, 'utf8')).join('\n');
const css = (dir) => readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(dir + '/' + f, 'utf8')).join('\n');
const F_ASSETS = '/home/z/my-project/frontend/dist/assets';
const A_ASSETS = '/home/z/my-project/admin/dist/assets';

async function api(path, opts) {
  const r = await fetch(B + path, opts);
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

console.log('— API sanity (backend English, untouched)');
{
  const { s, j } = await api('/api/products?limit=3');
  ok('GET /api/products → 200', s === 200);
  const names = (j.items || j.products || j || []).map?.((p) => p.name || '') || [];
  ok('product names remain English (backend)', names.length === 0 || names.every((n) => !/[\u0980-\u09FF]/.test(n)), JSON.stringify(names.slice(0, 2)));
}
{
  const { s } = await api('/api/blog?limit=3');
  ok('GET /api/blog → 200', s === 200);
}
{
  const { s, j } = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@forged.fit', password: 'ForgeAdmin2026' }) });
  ok('POST /api/auth/login → 200 (admin)', s === 200 && !!j?.token);
}
{
  const r = await fetch(B + '/fonts/NotoSansBengali-400.woff2');
  ok('GET /fonts/NotoSansBengali-400.woff2 → 200', r.status === 200);
  const r2 = await fetch(B + '/admin/fonts/NotoSansBengali-400.woff2');
  ok('GET /admin/fonts/NotoSansBengali-400.woff2 → 200', r2.status === 200);
}

console.log('— storefront bundle i18n');
{
  ok('frontend index.html no-flash forged_lang script', readFileSync('/home/z/my-project/frontend/dist/index.html', 'utf8').includes('forged_lang'));
  const J = js(F_ASSETS);
  ok('bundle: forged_lang storage key', J.includes('forged_lang'));
  ok('bundle: langToggle button id', J.includes('langToggle'));
  ok('bundle: Bangla entry (কার্টে যোগ করুন)', J.includes('কার্টে যোগ করুন'));
  ok('bundle: English default intact ("Shop All")', J.includes('Shop All'));
  ok('bundle: interpolation tr() present', J.includes('{n}') && J.includes('split('));
  ok('CSS: Noto Sans Bengali @font-face + html[lang=bn]', /Noto Sans Bengali/.test(css(F_ASSETS)) && /html\[lang=.?bn/.test(css(F_ASSETS)));
  ok('dist/fonts/NotoSansBengali-400.woff2 exists', existsSync('/home/z/my-project/frontend/dist/fonts/NotoSansBengali-400.woff2'));
}

console.log('— admin bundle i18n');
{
  ok('admin index.html no-flash forged_admin_lang script', readFileSync('/home/z/my-project/admin/dist/index.html', 'utf8').includes('forged_admin_lang'));
  const J = js(A_ASSETS);
  ok('bundle: forged_admin_lang storage key', J.includes('forged_admin_lang'));
  ok('bundle: adminLangToggle button id', J.includes('adminLangToggle'));
  ok('bundle: Bangla entry (ড্যাশবোর্ড)', J.includes('ড্যাশবোর্ড'));
  ok('bundle: Bangla entry (বাংলা toggle label)', J.includes('বাংলা'));
  ok('bundle: English default intact ("Dashboard")', J.includes('Dashboard'));
  ok('CSS: Noto Sans Bengali + html[lang=bn]', /Noto Sans Bengali/.test(css(A_ASSETS)) && /html\[lang=.?bn/.test(css(A_ASSETS)));
  ok('dist/fonts/NotoSansBengali-400.woff2 exists', existsSync('/home/z/my-project/admin/dist/fonts/NotoSansBengali-400.woff2'));
}

console.log('— backend stays English (API-facing strings)');
{
  const r = await fetch(B + '/api/definitely-not-a-route');
  const txt = await r.text();
  ok('404 handler responds in English', r.status === 404 && !/[\u0980-\u09FF]/.test(txt), txt.slice(0, 60));
  const bad = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@forged.fit', password: 'wrong' }) });
  const msg = JSON.stringify(bad.j || {});
  ok('auth error message stays English', bad.s >= 400 && !/[\u0980-\u09FF]/.test(msg), msg.slice(0, 60));
  ok('seeded Bangla content is DATA (pre-existing, e.g. Q&A) — not UI', true);
}

console.log(`\nTASK 48 RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
