/* Task 42 — PWA pack QA: manifest + service worker + icons + registration + offline shell */
const B = 'http://localhost:5000';
let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); };

(async () => {
  /* 1. manifest served + valid + complete */
  let r = await fetch(B + '/manifest.webmanifest');
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes('json'), 'manifest.webmanifest served as JSON');
  const m = await r.json();
  ok(m.name && m.short_name && m.start_url === '/?source=pwa' && m.scope === '/', 'manifest identity fields (name, start_url, scope)');
  ok(m.display === 'standalone' && m.theme_color === '#0a0a0b' && m.background_color === '#0a0a0b', 'manifest display + brand colors');
  ok(Array.isArray(m.icons) && m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.purpose === 'maskable'), 'manifest icons 192 + 512 + maskable');
  ok(Array.isArray(m.shortcuts) && m.shortcuts.length >= 3, 'manifest app shortcuts (shop/track/account)');

  /* 2. icons served as PNG with real dimensions */
  for (const [path, w, h] of [['/pwa-icon-192.png', 192, 192], ['/pwa-icon-512.png', 512, 512], ['/pwa-maskable-512.png', 512, 512], ['/apple-touch-icon.png', 180, 180]]) {
    const res = await fetch(B + path);
    const buf = Buffer.from(await res.arrayBuffer());
    const iw = buf.readUInt32BE(16), ih = buf.readUInt32BE(20);
    ok(res.status === 200 && (res.headers.get('content-type') || '').includes('png') && iw === w && ih === h, `icon ${path} → ${w}x${h} PNG`);
  }

  /* 3. service worker served + sane */
  r = await fetch(B + '/sw.js');
  const sw = await r.text();
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes('javascript'), 'sw.js served as JS');
  ok(sw.includes("VERSION = 'forged-v1'") && sw.includes('addEventListener(\'fetch\'') && sw.includes('caches'), 'sw.js has version + fetch handler + cache logic');
  ok(sw.includes("/api/") && sw.includes("startsWith('/api/')"), 'sw.js bypasses /api (commerce data never cached)');
  ok(sw.includes("req.mode === 'navigate'") && sw.includes("caches.match('/')"), 'sw.js offline shell fallback for navigations');

  /* 4. HTML wires the PWA */
  r = await fetch(B + '/');
  const html = await r.text();
  ok(html.includes('/manifest.webmanifest'), 'index.html links manifest');
  ok(html.includes('theme-color') && html.includes('apple-touch-icon'), 'index.html has theme-color + apple-touch-icon');

  /* 5. store still healthy over the same origin (SW must not interfere) */
  r = await fetch(B + '/api/products');
  ok(r.status === 200 && (await r.json()).items.length > 0, 'storefront API still healthy');

  /* 6. admin icons copied */
  r = await fetch(B + '/admin/pwa-icon-192.png');
  ok(r.status === 200, 'admin console icon served (reuses icon set)');

  console.log(`\n===== Task 42 API: ${pass} PASS / ${fail} FAIL =====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
