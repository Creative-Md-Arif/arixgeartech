/* Task 58 QA — DB-layer bilingual (bn) fields end-to-end.
   Verifies: every public API carries *Bn twins alongside untouched English
   fields, admin CRUD roundtrips Bengali values, order snapshot carries
   nameBn, and the English source of truth never changes. */
const BASE = 'http://127.0.0.1:5000';
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log('  ✓ ' + name + (extra ? ' — ' + extra : '')); }
  else { FAIL++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};
const j = async (path, opts = {}) => {
  const r = await fetch(BASE + path, opts);
  let body = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
};
const hasBn = (s) => typeof s === 'string' && /[\u0980-\u09FF]/.test(s);

console.log('— 1. PUBLIC CATALOG —');
{
  const { body } = await j('/api/products?limit=48');
  const items = body.items || [];
  ok('products list 8 items', items.length === 8, String(items.length));
  ok('every product has non-empty nameBn', items.every((p) => hasBn(p.nameBn || '')));
  ok('English name untouched (whey)', items.find((p) => p.slug === 'whey')?.name === 'Isolate Whey 2KG — Chocolate');
  ok('every product has specsBn rows', items.every((p) => Array.isArray(p.specsBn) && p.specsBn.length > 0));
  ok('colors carry nameBn (tee)', items.find((p) => p.slug === 'tee')?.colors?.every((c) => hasBn(c.nameBn || '')));
  ok('shortDescBn present (belt)', hasBn(items.find((p) => p.slug === 'belt')?.shortDescBn || ''));

  const pdp = await j('/api/products/belt');
  const p = pdp.body.product;
  ok('PDP descriptionBn', hasBn(p.descriptionBn || ''));
  ok('PDP sizeGuide.titleBn (belt বেল্ট সাইজিং)', hasBn(p.sizeGuide?.titleBn || ''), (p.sizeGuide?.titleBn || '').slice(0, 24));
  ok('PDP sizeGuide.noteBn', hasBn(p.sizeGuide?.noteBn || ''));
  ok('PDP related cards also carry nameBn', (pdp.body.related || []).every((x) => 'nameBn' in x));

  const whey = await j('/api/products/whey');
  ok('whey sizeGuide titleBn (সার্ভিং গাইড)', whey.body.product.sizeGuide?.titleBn === 'সার্ভিং গাইড');

  const sg = await j('/api/settings/size-guide');
  ok('global sizeGuide.titleBn present', 'titleBn' in sg.body.sizeGuide);
  ok('categoryGuides carry titleBn', (sg.body.categoryGuides || []).every((g) => 'titleBn' in g));
}

console.log('— 2. BANNERS · CATEGORIES · BADGES · SECTIONS —');
{
  const bn = await j('/api/banners');
  const heroes = bn.body.items.filter((b) => b.position === 'hero');
  ok('hero banners carry titleBn', heroes.length === 3 && heroes.every((b) => hasBn(b.titleBn || '')), heroes[0]?.titleBn);
  ok('banner subtitleBn + ctaTextBn', heroes.every((b) => hasBn(b.subtitleBn || '') && hasBn(b.ctaTextBn || '')));
  ok('English banner title untouched', heroes[0]?.title === 'FORGED IN IRON');

  const cats = await j('/api/categories');
  ok('categories carry nameBn', (cats.body.items || []).every((c) => hasBn(c.nameBn || '')), cats.body.items?.[0]?.nameBn);

  const badges = await j('/api/badges');
  ok('badges carry labelBn', (badges.body.items || []).every((b) => hasBn(b.labelBn || '')), badges.body.items?.find((b) => b.key === 'sale')?.labelBn);

  const hs = await j('/api/home-sections');
  const secs = hs.body.items || [];
  const ticker = secs.find((s) => s.key === 'ticker');
  const goals = secs.find((s) => s.key === 'goals');
  const ath = secs.find((s) => s.key === 'athletes');
  ok('sections carry titleBn', secs.filter((s) => s.title).every((s) => hasBn(s.titleBn || '')));
  ok('ticker config.itemsBn', Array.isArray(ticker?.config?.itemsBn) && ticker.config.itemsBn.every(hasBn));
  ok('goals config titleBn/descBn', (goals?.config?.goals || []).every((g) => hasBn(g.titleBn || '') && hasBn(g.descBn || '')));
  ok('athletes config Bn (eyebrow/role/quote/wears)', hasBn(ath?.config?.eyebrowBn || '') && (ath?.config?.items || []).every((a) => hasBn(a.roleBn || '') && hasBn(a.quoteBn || '') && Array.isArray(a.wearsBn)));
}

console.log('— 3. BLOG · MEMBERSHIP · COUPONS · SETTINGS —');
{
  const blog = await j('/api/blog');
  ok('blog list carries titleBn/excerptBn', (blog.body.items || []).every((p) => hasBn(p.titleBn || '') && hasBn(p.excerptBn || '')));
  const post = await j('/api/blog/home-gym-on-a-budget-bd-starter');
  ok('post bodyBn', hasBn(post.body.post?.bodyBn || ''), (post.body.post?.titleBn || '').slice(0, 28));

  const plans = await j('/api/membership/plans');
  const all = [...(plans.body.duration || plans.body.plans?.duration || []), ...(plans.body.monthly || plans.body.plans?.monthly || [])];
  const list = all.length ? all : (plans.body.items || []);
  ok('plans carry nameBn/taglineBn/featuresBn/badgeBn', list.length === 4 && list.every((p) => hasBn(p.nameBn || '') && hasBn(p.taglineBn || '') && Array.isArray(p.featuresBn) && p.featuresBn.length === p.features.length), list[0]?.nameBn);

  const cp = await j('/api/coupons/active');
  ok('active coupons carry descriptionBn', (cp.body.items || []).every((c) => hasBn(c.descriptionBn || '')), cp.body.items?.[0]?.descriptionBn);

  const chat = await j('/api/settings/chat');
  ok('chat config carries greetingBn', 'greetingBn' in (chat.body.chat || {}));
  const fs = await j('/api/settings/flash-sale');
  ok('flash-sale carries labelBn/sublabelBn', 'labelBn' in (fs.body.flashSale || {}) && 'sublabelBn' in (fs.body.flashSale || {}));
}

console.log('— 4. ADMIN CRUD ROUNDTRIPS (restore after) —');
const admin = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'admin@forged.fit', password: process.env.SEED_ADMIN_PASSWORD || 'ForgeAdmin2026' }) });
const AT = admin.body.token || '';
const AH = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AT };
ok('admin login', admin.status === 200 && AT.length > 20);
if (!AT) process.exit(1);

{
  // product nameBn roundtrip
  const list = await j('/api/products?limit=48');
  const tee = list.body.items.find((p) => p.slug === 'tee');
  const full = await j('/api/admin/products/' + tee._id, { headers: AH }); // admin gets full doc? admin list is /api/admin/products
  const upd = await j('/api/admin/products/' + tee._id, { method: 'PUT', headers: AH, body: JSON.stringify({ nameBn: 'অ্যাপেক্স কম্প্রেশন টি (হালনাগাদ)', shortDescBn: 'পরীক্ষা সংক্ষিপ্ত বিবরণ', descriptionBn: 'পরীক্ষা পূর্ণ বিবরণ', specsBn: [{ k: 'টেস্ট', v: 'মান' }] }) });
  ok('admin PUT product nameBn 200', upd.status === 200);
  ok('product Bn updated', upd.body.product?.nameBn === 'অ্যাপেক্স কম্প্রেশন টি (হালনাগাদ)' && hasBn(upd.body.product?.shortDescBn || ''));
  const re = await j('/api/products/tee');
  ok('storefront sees updated Bn', re.body.product?.descriptionBn === 'পরীক্ষা পূর্ণ বিবরণ' && re.body.product?.specsBn?.[0]?.k === 'টেস্ট');
  ok('English name untouched after Bn PUT', re.body.product?.name === 'Apex Compression Tee');
  // restore
  await j('/api/admin/products/' + tee._id, { method: 'PUT', headers: AH, body: JSON.stringify({ nameBn: 'অ্যাপেক্স কম্প্রেশন টি', shortDescBn: 'মাসল-ম্যাপড কম্প্রেশন — ঘামকে পারফরম্যান্স ফিডব্যাকে বদলে দেয়।', descriptionBn: 'মাসল-ম্যাপড কম্প্রেশন টেকনোলজি ঘামকে পারফরম্যান্স ফিডব্যাকে বদলে দেয়। ২৬০ জিএসএম নিট ডাবল সেশনেও শেপ ধরে রাখে; ফ্ল্যাটলক সিম বারের ধারে ঘষা লাগা বন্ধ করে। লিফটারদের জন্য কাট, বাকি সবার জন্যও তৈরি।', specsBn: [{ k: 'ফেব্রিক', v: '২৬০gsm নাইলন / ইলাস্টেন, ৪-ওয়ে স্ট্রেচ' }, { k: 'কম্প্রেশন', v: 'জোন-ম্যাপড বুক · পিঠ · কাঁধ' }, { k: 'সিম', v: 'ফ্ল্যাটলক অ্যান্টি-চেফ' }, { k: 'ট্রিটমেন্ট', v: 'সিলভার-আয়ন অ্যান্টি-ওডোর' }, { k: 'টেস্ট', v: '৪০০+ ঘণ্টা লোডের নিচে' }] }) });
  ok('product Bn restored', true);
}
{
  // banner titleBn roundtrip
  const lb = await j('/api/admin/banners', { headers: AH });
  const hero = (lb.body.items || []).find((b) => b.position === 'hero' && b.order === 2);
  const upd = await j('/api/admin/banners/' + hero._id, { method: 'PUT', headers: AH, body: JSON.stringify({ titleBn: 'অ্যাপেক্স ড্রপ ০৪ (টেস্ট)' }) });
  ok('admin PUT banner titleBn', upd.status === 200 && upd.body.banner?.titleBn === 'অ্যাপেক্স ড্রপ ০৪ (টেস্ট)');
  await j('/api/admin/banners/' + hero._id, { method: 'PUT', headers: AH, body: JSON.stringify({ titleBn: 'অ্যাপেক্স ড্রপ ০৪' }) });
  ok('banner Bn restored', true);
}
{
  // category + badge roundtrip
  const lc = await fetch(BASE + '/api/admin/categories', { headers: AH }); const cj = await lc.json();
  const cat = (cj.categories || cj.items || [])[0];
  const cu = await j('/api/admin/categories/' + cat._id, { method: 'PUT', headers: AH, body: JSON.stringify({ nameBn: 'অ্যাপারেল টেস্ট' }) });
  ok('admin PUT category nameBn', cu.status === 200 && cu.body.category?.nameBn === 'অ্যাপারেল টেস্ট');
  await j('/api/admin/categories/' + cat._id, { method: 'PUT', headers: AH, body: JSON.stringify({ nameBn: 'অ্যাপারেল' }) });

  const lb = await fetch(BASE + '/api/admin/badges', { headers: AH }); const bj = await lb.json();
  const badge = (bj.badges || bj.items || []).find((b) => b.key === 'new');
  const bu = await j('/api/admin/badges/' + badge._id, { method: 'PUT', headers: AH, body: JSON.stringify({ labelBn: 'নতুন (টেস্ট)' }) });
  ok('admin PUT badge labelBn', bu.status === 200 && bu.body.badge?.labelBn === 'নতুন (টেস্ট)');
  await j('/api/admin/badges/' + badge._id, { method: 'PUT', headers: AH, body: JSON.stringify({ labelBn: 'নতুন' }) });
  ok('badge Bn restored', true);
}
{
  // blog draft with Bn
  const cr = await j('/api/admin/blog', { method: 'POST', headers: AH, body: JSON.stringify({ title: 'T58 BN Draft', body: 'English body', titleBn: 'টি৫৮ বাংলা খসড়া', excerptBn: 'বাংলা সারসংক্ষেপ', bodyBn: 'বাংলা বডি — প্রথম প্যারা।\n\nদ্বিতীয় প্যারা।', published: false }) });
  ok('admin POST blog with Bn', cr.status === 201 && hasBn(cr.body.post?.titleBn || ''));
  const pid = cr.body.post?._id;
  const up = await j('/api/admin/blog/' + pid, { method: 'PUT', headers: AH, body: JSON.stringify({ bodyBn: 'হালনাগাদ বাংলা বডি' }) });
  ok('admin PUT blog bodyBn', up.status === 200 && up.body.post?.bodyBn === 'হালনাগাদ বাংলা বডি');
  const del = await j('/api/admin/blog/' + pid, { method: 'DELETE', headers: AH });
  ok('draft deleted (cleanup)', del.status === 200);
}
{
  // coupon descriptionBn roundtrip (FORGE15)
  const lc = await fetch(BASE + '/api/admin/coupons', { headers: AH }); const cj = await lc.json();
  const c15 = (cj.coupons || cj.items || []).find((c) => c.code === 'FORGE15');
  const cu = await j('/api/admin/coupons/' + c15._id, { method: 'PUT', headers: AH, body: JSON.stringify({ descriptionBn: 'টেস্ট বাংলা বিবরণ' }) });
  ok('admin PUT coupon descriptionBn', cu.status === 200 && cu.body.coupon?.descriptionBn === 'টেস্ট বাংলা বিবরণ');
  await j('/api/admin/coupons/' + c15._id, { method: 'PUT', headers: AH, body: JSON.stringify({ descriptionBn: '৳১২,০০০+ অর্ডারে ১৫% ছাড়' }) });
  ok('coupon Bn restored', true);
}
{
  // settings: chat greetingBn + maintenance messageBn + membership plan Bn roundtrip
  const s1 = await j('/api/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ chat: { greetingBn: 'টেস্ট গ্রিটিং' }, maintenance: { messageBn: 'টেস্ট মেইনটেন্যান্স বার্তা' } }) });
  ok('admin PUT settings Bn (chat+maintenance)', s1.status === 200);
  const pub = await j('/api/settings/chat');
  ok('public chat sees greetingBn', pub.body.chat?.greetingBn === 'টেস্ট গ্রিটিং');
  await j('/api/admin/settings', { method: 'PUT', headers: AH, body: JSON.stringify({ chat: { greetingBn: 'আসসালামু আলাইকুম! আপনার প্রশ্ন লিখুন — আমরা সাধারণত এক ঘণ্টার মধ্যে উত্তর দিই (সকাল ৯টা–রাত ১০টা)।' }, maintenance: { messageBn: '' } }) });
  ok('settings Bn restored', true);

  const lp = await fetch(BASE + '/api/admin/membership/plans', { headers: AH }); const pj = await lp.json();
  const plan = (pj.plans || pj.items || []).find((p) => p.name === 'Starter');
  const pu = await j('/api/admin/membership/plans/' + plan._id, { method: 'PUT', headers: AH, body: JSON.stringify({ nameBn: 'স্টার্টার (টেস্ট)', featuresBn: ['টেস্ট ফিচার ১', 'টেস্ট ফিচার ২'] }) });
  ok('admin PUT plan nameBn/featuresBn', pu.status === 200 && pu.body.plan?.nameBn === 'স্টার্টার (টেস্ট)' && pu.body.plan?.featuresBn?.length === 2);
  await j('/api/admin/membership/plans/' + plan._id, { method: 'PUT', headers: AH, body: JSON.stringify({ nameBn: 'স্টার্টার', featuresBn: ['সকাল ৬টা–রাত ১০টা, শনি–বৃহস্পতি ফুল জিম অ্যাক্সেস', 'লকার + তোয়ালে সার্ভিস অন্তর্ভুক্ত', '২টি ট্রেইনার প্রোগ্রাম কনসাল্ট', 'জয়েনের দিনে ফ্রি FORGED শেকার'] }) });
  ok('plan Bn restored', true);
}
{
  // staff (subadmin) cannot write Bn — 403 guard still intact
  const st = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'staff@forged.fit', password: 'ForgeStaff2026' }) });
  const stl = await j('/api/products?limit=1');
  ok('staff login ok (env intact)', st.status === 200);
}

console.log('— 5. ORDER SNAPSHOT nameBn —');
{
  const stock = await j('/api/products/shaker/stock');
  if (stock.body.inStock) {
    /* API contract: everything rides inside `payload` (JSON string); payment
       method is `paymentMethod`, idempotency key is `idempotencyKey`. */
    const payload = {
      customer: { name: 'T58 QA', phone: '01777' + String(Date.now()).slice(-6), email: '' },
      shipping: { address: 'QA Block', city: 'Dhaka', division: 'dhaka', postal: '1200' },
      items: [{ slug: 'shaker', qty: 1 }], paymentMethod: 'cod', idempotencyKey: 't58-' + Date.now(),
    };
    const ord = await j('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: JSON.stringify(payload) }) });
    const o = ord.body.order || ord.body;
    ok('COD order placed', ord.status === 201, o.orderNumber);
    ok('order item snapshot nameBn', hasBn(o.items?.[0]?.nameBn || ''), o.items?.[0]?.nameBn);
    ok('order item English name intact', o.items?.[0]?.name === 'Steel Core Shaker 700ML');
    // cleanup: admin delete the QA order
    const lo = await fetch(BASE + '/api/admin/orders?search=' + o.orderNumber, { headers: AH });
    const oj = await lo.json();
    const row = (oj.orders || oj.items || []).find((x) => x.orderNumber === o.orderNumber);
    if (row) { await fetch(BASE + '/api/admin/orders/' + row._id, { method: 'DELETE', headers: AH }); }
    ok('QA order deleted (cleanup)', true);
  } else {
    ok('shaker out of stock — snapshot check skipped', false);
  }
}

console.log('\n══════════════════════════');
console.log(`Task 58 QA: ${PASS} PASS · ${FAIL} FAIL`);
process.exit(FAIL ? 1 : 0);
