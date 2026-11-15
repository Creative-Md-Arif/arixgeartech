#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
   Task 47 QA — frontend polish pack
   Covers the API-testable surfaces of: compare activation (store contract
   shipped in bundle), 404 route, skeletons (bundle presence), theme (bundle
   presence), Blog/Journal full-stack CRUD + public contract + audit trail.
   Browser E2E (theme flip, compare table, 404 render, blog pages) runs
   separately via the browser pass.
   ════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
const BASE = 'http://localhost:5000';
const ROOT = '/home/z/my-project';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('PASS —', name, extra); } else { fail++; console.log('FAIL —', name, extra); } };
const j = (r) => r.json();

const login = async (email, password) => {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return j(r);
};
const admin = await login('admin@forged.fit', 'ForgeAdmin2026');
const A = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin.token };

/* ── 1. BLOG — admin CRUD ─────────────────────────────────────────── */
const uniq = 'qa-post-' + Date.now();
let r = await fetch(BASE + '/api/admin/blog', { headers: A });
let d = await j(r);
ok('admin blog list (seeded 4)', r.status === 200 && d.items.length >= 4);

r = await fetch(BASE + '/api/admin/blog', { method: 'POST', headers: A, body: JSON.stringify({ title: 'QA Post Draft', body: 'Para one.\n\nPara two.', tags: ['QA', 'temp'], excerpt: 'QA excerpt', published: false }) });
d = await j(r);
ok('admin create draft → 201 + draft slug', r.status === 201 && d.post && d.post.published === false, `slug=${d.post && d.post.slug}`);
const draftId = d.post._id;
ok('draft has null publishedAt', d.post.publishedAt === null);

r = await fetch(BASE + '/api/admin/blog', { method: 'POST', headers: A, body: JSON.stringify({ body: 'no title' }) });
ok('create without title → 400', r.status === 400);
r = await fetch(BASE + '/api/admin/blog', { method: 'POST', headers: A, body: JSON.stringify({ title: 'No Body' }) });
ok('create without body → 400', r.status === 400);

r = await fetch(BASE + '/api/admin/blog/' + draftId, { method: 'PUT', headers: A, body: JSON.stringify({ title: 'QA Post ' + uniq, published: true }) });
d = await j(r);
ok('publish draft → publishedAt stamped', r.status === 200 && d.post.published === true && !!d.post.publishedAt);

r = await fetch(BASE + `/api/admin/blog/${draftId}`, { method: 'PUT', headers: A, body: JSON.stringify({ slug: uniq }) });
d = await j(r);
ok('slug editable', r.status === 200 && d.post.slug === uniq);

/* slug collision → -2 suffix */
r = await fetch(BASE + '/api/admin/blog', { method: 'POST', headers: A, body: JSON.stringify({ title: 'Collision', slug: uniq, body: 'x', published: true }) });
d = await j(r);
ok('duplicate slug uniquified', r.status === 201 && d.post.slug !== uniq, `got=${d.post.slug}`);
const dupId = d.post._id;

/* ── 2. BLOG — public contract ────────────────────────────────────── */
r = await fetch(BASE + '/api/blog');
d = await j(r);
ok('public list → published only', r.status === 200 && d.items.every((p) => p.published !== false) && d.items.some((p) => p.slug === uniq));

r = await fetch(BASE + '/api/blog?tag=home-gym');
d = await j(r);
ok('tag filter works', r.status === 200 && d.items.length >= 2 && d.items.every((p) => (p.tags || []).includes('home-gym')));

r = await fetch(BASE + `/api/blog/${uniq}`);
d = await j(r);
ok('public get by slug', r.status === 200 && d.post.title.startsWith('QA Post') && Array.isArray(d.related));
const views0 = d.post.views;

await fetch(BASE + `/api/blog/${uniq}`);
r = await fetch(BASE + `/api/blog/${uniq}`);
d = await j(r);
ok('view bump on read', d.post.views >= views0 + 1, `${views0}→${d.post.views}`);

r = await fetch(BASE + '/api/blog/definitely-not-a-real-slug');
ok('unknown slug → 404', r.status === 404);

/* drafts invisible publicly */
r = await fetch(BASE + '/api/admin/blog', { method: 'POST', headers: A, body: JSON.stringify({ title: 'Hidden Draft', body: 'x' }) });
d = await j(r);
r = await fetch(BASE + `/api/blog/${d.post.slug}`);
ok('draft not publicly visible', r.status === 404);
await fetch(BASE + '/api/admin/blog/' + d.post._id, { method: 'DELETE', headers: A });

/* ── 3. BLOG — auth guards ────────────────────────────────────────── */
r = await fetch(BASE + '/api/admin/blog');
ok('admin blog unauth → 401', r.status === 401);
const demo = await login('demo@forged.fit', 'forge2026');
r = await fetch(BASE + '/api/admin/blog', { headers: { Authorization: 'Bearer ' + demo.token } });
ok('customer on admin blog → 403', r.status === 403);

/* ── 4. cleanup QA posts + audit row exists ───────────────────────── */
r = await fetch(BASE + '/api/admin/audit?entity=post&limit=10', { headers: A });
d = await j(r);
ok('audit logged post mutations', r.status === 200 && (d.items || []).length >= 1);

await fetch(BASE + '/api/admin/blog/' + draftId, { method: 'DELETE', headers: A }).catch(() => {});
await fetch(BASE + '/api/admin/blog/' + dupId, { method: 'DELETE', headers: A }).catch(() => {});
r = await fetch(BASE + '/api/blog');
d = await j(r);
ok('cleanup → public list back to seed (4)', r.status === 200 && d.total === 4);

/* ── 5. bundle presence: compare/404/theme/skeleton actually shipped ─ */
const bundle = fs.readdirSync(ROOT + '/frontend/dist/assets').find((f) => f.endsWith('.js'));
const js = fs.readFileSync(ROOT + '/frontend/dist/assets/' + bundle, 'utf8');
const has = (s) => js.includes(s);
ok('bundle: compare route + tray', has('comparePage') && has('Compare tray is full'));
ok('bundle: branded 404 wired', has('notFound'));
const cssFile = fs.readdirSync(ROOT + '/frontend/dist/assets').find((f) => f.endsWith('.css'));
const css = fs.readFileSync(ROOT + '/frontend/dist/assets/' + cssFile, 'utf8');
ok('bundle: theme toggle + no-flash var', has('themeToggle') && css.includes('--c-txt-rgb') && css.includes('.light'));
ok('bundle: skeleton loaders', has('gridSkeleton'));
ok('bundle: blog pages', has('blogPage') && has('postBody'));
ok('bundle: compare btn on cards', has('data-compare'));

/* index.html no-flash script */
const html = fs.readFileSync(ROOT + '/frontend/dist/index.html', 'utf8');
ok('dist index.html: no-flash theme script', html.includes('forged_theme'));

console.log(`\n===== Task 47: ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
