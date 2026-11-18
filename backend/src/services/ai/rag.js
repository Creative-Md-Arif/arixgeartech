/* ════════════════════════════════════════════════════════════════════
   AI RAG LAYER — the ONLY door between the AI and MongoDB.

   "Securely connect AI with the entire MongoDB database" is implemented
   as a whitelist, not as a raw DB handle:

     · every query hits a fixed retriever below with a FIXED public
       projection — the LLM can never issue arbitrary queries;
     · PRIVATE customer fields (name, phone, email, address, payment
       trxIds) are NEVER projected. Order lookups return a minimal
       status view keyed by order number only;
     · all text is pre-packed into a bounded FACTS block, so even a
       misbehaving prompt cannot query anything else.

   Retrievers: products · categories · brands · deals · bundles ·
   faqs · policies (shipping/payment/store) · order-status.
   ════════════════════════════════════════════════════════════════════ */

const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const Deal = require('../../models/Deal');
const ComboBundle = require('../../models/ComboBundle');
const AiFaq = require('../../models/AiFaq');
const Order = require('../../models/Order');
const Setting = require('../../models/Setting');

const ESC = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = (n) => '৳' + (Number(n) || 0).toLocaleString('en-US');

/* ---------- stopwords (en + bn) ---------- */
const STOP = new Set(('the a an is are was were do does did you your we our for of and or to in on with what which how much price best any ' +
  'please can could tell about from at by me my i it its this that want need looking show give has have have any there here ' +
  'the of kotha korun amar apnar ki kemon koto kothao kon kore korbe hobe ache chhe jonno ebong o ba ami amra apni tumi ' +
  'dam damkoto darbro bhalo soto boro dekhan dite chai chao lagbe lagbhe janaben bole ' +
  'আছে মধ্যে লাখের কত দাম একটা একটি ভালো ভাল সেরা সাথে জন্য কি কী আমি আমার আপনি আপনার করে থাকে থাকবে হবে চাই দেখাও প্রিয় কোনো আরেক').split(/\s+/));

/* Bangla → English tech-term expansion — "ল্যাপটপ" must find "laptop".
   Word-level dictionary applied on top of tokenization (cost-efficient:
   pure JS, no translation API, no embeddings). */
const BN2EN = {
  'গেমিং': ['gaming'], 'ল্যাপটপ': ['laptop'], 'ফোন': ['smartphone', 'phone'], 'মোবাইল': ['smartphone', 'mobile'],
  'মনিটর': ['monitor'], 'ডেস্কটপ': ['desktop'], 'কম্পিউটার': ['computer', 'pc'], 'পিসি': ['pc'],
  'হেডফোন': ['headphone'], 'হেডসেট': ['headset'], 'ইয়ারবাড': ['earbuds'], 'স্পিকার': ['speaker'],
  'মাউস': ['mouse'], 'কিবোর্ড': ['keyboard'], 'টিভি': ['television', 'tv'], 'রেফ্রিজারেটর': ['refrigerator'],
  'চার্জার': ['charger'], 'প্রসেসর': ['processor'], 'প্রসেসর': ['processor'], 'এসএসডি': ['ssd'],
  'হার্ডডিস্ক': ['hard', 'hdd'], 'গ্রাফিক্স': ['graphics'], 'জিপিইউ': ['gpu', 'graphics'], 'রাউটার': ['router'],
  'ট্যাবলেট': ['tablet'], 'ট্যাব': ['tablet'], 'স্মার্টওয়াচ': ['smartwatch'], 'ঘড়ি': ['watch'],
  'ড্রোন': ['drone'], 'কন্ট্রোলার': ['controller'], 'গেমপ্যাড': ['controller', 'gamepad'],
  'এসুস': ['asus'], 'লেনোভো': ['lenovo'], 'এইচপি': ['hp'], 'ডেল': ['dell'], 'এসার': ['acer'],
  'এমএসআই': ['msi'], 'স্যামসাং': ['samsung'], 'এপল': ['apple'], 'আপেল': ['apple'], 'জিএসিসি': ['gigabyte'],
  'পাওয়ার': ['power'], 'ব্যাংক': ['bank'], 'র‍্যাম': ['ram', 'memory'], 'র‍্যাম': ['ram', 'memory'],
  'মেমোরি': ['memory'], 'স্টোরেজ': ['storage'], 'কুলিং': ['cooling'], 'ফ্যান': ['fan'],
  'ডেলিভারি': ['delivery'], 'শিপিং': ['shipping'], 'ওয়ারেন্টি': ['warranty'], 'গ্যারান্টি': ['warranty', 'guarantee'],
  'পেমেন্ট': ['payment'], 'রিটার্ন': ['return'], 'রিফান্ড': ['refund'], 'কুরিয়ার': ['courier'],
  'অর্ডার': ['order'], 'স্টক': ['stock'],
  'ঢাকা': ['dhaka'], 'ঢাকার': ['dhaka'], 'বাইরে': ['outside'], 'দিন': ['day', 'days'], 'সময়': ['time'],
};
function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, ' ') // \p{M} keeps the Bangla virama — মধ্যে/ল্যাপটপ stay whole words
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/* ---------- product cards (public projection only) ---------- */
const CARD_FIELDS = '_id name nameBn slug category categoryPath brand price comparePrice flash stock sold rating reviews warranty shortDesc shortDescBn images variantLabel variantLabelBn sourceUrl createdAt';

function brandLive(product) {
  const f = product && product.flash;
  if (f && f.price && f.startsAt && f.endsAt) {
    const now = Date.now();
    if (new Date(f.startsAt) <= now && now <= new Date(f.endsAt)) return f.price;
  }
  return null;
}

function livePrice(p) {
  if (!p) return 0;
  const b = brandLive(p);
  return Math.min(p.price, b ?? p.price);
}

function toCard(p) {
  const flashPrice = brandLive(p);
  return {
    _id: p._id,
    name: p.name,
    nameBn: p.nameBn || '',
    slug: p.slug,
    category: p.category || '',
    brandName: p.brand && typeof p.brand === 'object' ? p.brand.name : '',
    price: p.price,
    priceLabel: money(livePrice(p)),
    flashPrice: flashPrice || null,
    comparePrice: p.comparePrice || null,
    stock: p.stock,
    inStock: (p.stock || 0) > 0,
    rating: p.rating || 0,
    reviews: p.reviews || 0,
    warrantyMonths: p.warranty?.months || 0,
    shortDesc: (p.shortDesc || '').slice(0, 180),
    image: Array.isArray(p.images) && p.images[0] ? p.images[0].url : '',
    variantLabel: p.variantLabel || '',
  };
}

/* ---------- brand & category resolution ---------- */
async function resolveBrands(tokens_) {
  if (!tokens_.length) return [];
  const re = tokens_.map((t) => ESC(t)).join('|');
  return Brand.find({ $or: [{ name: new RegExp(re, 'i') }, { slug: new RegExp(re, 'i') }] }).select('_id name slug').lean();
}

async function resolveCategories(text, tokens_) {
  const slugish = String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
  const names = tokens_ ? [...tokens_] : tokens(slugish);
  const or = [];
  if (slugish) or.push({ slug: new RegExp(ESC(slugish.replace(/\s+/g, '-')), 'i') });
  for (const t of names.slice(0, 6)) or.push({ slug: new RegExp(ESC(t), 'i') }, { name: new RegExp(ESC(t), 'i') });
  if (!or.length) return [];
  return Category.find({ $or: or }).select('_id name slug path').lean().limit(6);
}

/** tokens + Bangla→English expansions */
function expandTokens(text) {
  const base = tokens(text);
  const extra = [];
  for (const t of base) if (BN2EN[t]) for (const e of BN2EN[t]) if (!base.includes(e)) extra.push(e);
  return [...base, ...extra];
}

/* ---------- product search ---------- */
async function searchProducts(q, opts = {}) {
  const limit = Math.min(opts.limit || 6, 12);
  const toks = expandTokens(q);
  const textQ = String(q || '').trim();

  const and = [{ active: { $ne: false } }];
  if (opts.inStockOnly) and.push({ stock: { $gt: 0 } });
  if (opts.maxPrice) and.push({ price: { $lte: opts.maxPrice } });
  if (opts.minPrice) and.push({ price: { $gte: opts.minPrice } });

  const [brands, cats] = await Promise.all([resolveBrands(toks), resolveCategories(textQ, toks)]);
  if (brands.length) and.push({ brand: { $in: brands.map((b) => b._id) } });
  if (cats.length) {
    const leaves = new Set();
    for (const c of cats) for (const s of c.path || []) leaves.add(s);
    for (const c of cats) leaves.add(c.slug);
    and.push({ category: { $in: [...leaves] } });
  }

  /* build OR match on tokens */
  const Ors = [];
  const clean = textQ.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
  if (clean) {
    Ors.push({ name: new RegExp(ESC(clean).replace(/\\\s+/g, '.*').replace(/\s+/g, '.*'), 'i') });
    Ors.push({ shortDesc: new RegExp(ESC(clean.split(/\s+/).slice(0, 3).join('.*')), 'i') });
    Ors.push({ sku: clean.toUpperCase() });
  }
  for (const t of toks.slice(0, 5)) Ors.push({ name: new RegExp(ESC(t), 'i') });
  if (!Ors.length) return [];
  and.push({ $or: Ors });

  let rows = await Product.find({ $and: and }).select(CARD_FIELDS).populate('brand', 'name slug').sort({ sold: -1, rating: -1, stock: -1 }).limit(limit).lean();

  /* graceful relax: brand/category filter may have eaten everything */
  if (!rows.length && (brands.length || cats.length)) {
    const and2 = [{ active: { $ne: false } }, { $or: Ors }];
    if (opts.maxPrice) and2.push({ price: { $lte: opts.maxPrice } });
    rows = await Product.find({ $and: and2 }).select(CARD_FIELDS).populate('brand', 'name slug').sort({ sold: -1 }).limit(limit).lean();
  }
  /* final relax: drop the free-text, show the filtered catalog */
  if (!rows.length && (brands.length || cats.length || opts.maxPrice)) {
    const and3 = [{ active: { $ne: false } }];
    if (brands.length) and3.push({ brand: { $in: brands.map((b) => b._id) } });
    if (cats.length) and3.push({ category: { $in: cats.map((c) => c.slug) } });
    if (opts.maxPrice) and3.push({ price: { $lte: opts.maxPrice } });
    rows = await Product.find({ $and: and3 }).select(CARD_FIELDS).populate('brand', 'name slug').sort({ sold: -1 }).limit(limit).lean();
  }
  /* budget-only floor: when a budget was given but the category/brand narrowed
     it to nothing, surface popular picks across the store within budget —
     still a pure DB read, still grounded. */
  if (!rows.length && opts.maxPrice) {
    rows = await Product.find({ active: { $ne: false }, price: { $lte: opts.maxPrice } })
      .select(CARD_FIELDS).populate('brand', 'name slug').sort({ sold: -1, rating: -1 }).limit(limit).lean();
  }
  return rows;
}

async function productsBySlugs(slugs) {
  const list = (slugs || []).filter(Boolean).slice(0, 6);
  if (!list.length) return [];
  return Product.find({ slug: { $in: list }, active: { $ne: false } }).select(CARD_FIELDS).populate('brand', 'name slug').lean();
}

/* ---------- deals / bundles ---------- */
async function liveDeals(limit = 5) {
  const now = new Date();
  return Deal.find({
    published: true, active: true,
    $and: [
      { $or: [{ 'window.startsAt': null }, { 'window.startsAt': { $lte: now } }] },
      { $or: [{ 'window.endsAt': null }, { 'window.endsAt': { $gte: now } }] },
    ],
  })
    .sort({ featured: -1, priority: 1 })
    .limit(limit)
    .select('name nameBn slug type badge discount bogo window description')
    .lean();
}

async function liveBundles(limit = 3) {
  const now = new Date();
  const rows = await ComboBundle.find({ active: true })
    .sort({ createdAt: -1 }).limit(limit)
    .select('title titleBn slug bundlePrice window items')
    .populate('items.product', 'active stock price')
    .lean();
  return rows.filter((b) => {
    const w = b.window || {};
    if (w.startsAt && now < new Date(w.startsAt)) return false;
    if (w.endsAt && now > new Date(w.endsAt)) return false;
    const total = (b.items || []).reduce((sum, item) => sum + (Number(item.product?.price) || 0) * (+item.qty || 1), 0);
    return total > +b.bundlePrice && (b.items || []).every((item) => item.product && item.product.active !== false && Number(item.product.stock) >= (+item.qty || 1));
  }).map((b) => ({ ...b, price: b.bundlePrice }));
}

/* ---------- FAQs (admin-curated + storefront content) ---------- */
function scoreFaq(f, toks) {
  const hay = `${f.q || ''} ${f.qBn || ''} ${f.a || ''} ${(f.tags || []).join(' ')}`.toLowerCase();
  let s = 0;
  for (const t of toks) if (hay.includes(t)) s += 2;
  if ((f.q || '').toLowerCase().includes(toks.join(' '))) s += 3;
  return s;
}

async function searchFaqs(q, limit = 4) {
  const toks = expandTokens(q);
  if (!toks.length) return [];
  const [curated, setting] = await Promise.all([
    AiFaq.find({ active: true }).sort({ sortOrder: 1 }).lean(),
    Setting.publicContent().catch(() => ({})),
  ]);
  const contentList = Array.isArray(setting.faqs) ? setting.faqs : (setting.faqs && setting.faqs.list) || [];
  const all = [
    ...curated.map((f) => ({ q: f.q, a: f.a, qBn: f.qBn, aBn: f.aBn, tags: f.tags, topic: f.topic })),
    ...contentList.map((f) => ({ q: f.q || f.question || '', a: f.a || f.answer || '', qBn: f.qBn || '', aBn: f.aBn || '', tags: [], topic: 'general' })),
  ].filter((f) => f.q && f.a);
  return all
    .map((f) => ({ f, s: scoreFaq(f, toks) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}

/* ---------- policies / store facts (from Settings — no private data) ---------- */
async function storeFacts() {
  const [setting, content] = await Promise.all([Setting.publicView(), Setting.publicContent()]);
  const ships = Object.entries(setting.shipping.divisions || {})
    .map(([d, v]) => `${d}: ${money(v)}`)
    .join(' · ');
  const pay = setting.payments || {};
  return [
    `Store: ${setting.store.name} (${setting.store.email}, ${setting.store.phone}, ${setting.store.address})`,
    `Delivery: inside Dhaka 1–2 working days, outside Dhaka 2–4 working days (Steadfast/Pathao). Charges — ${ships}. Free shipping on orders at/above ${money(setting.shipping.freeThreshold)}.`,
    `Payments: bKash ${pay.bkash?.number || ''} · Nagad ${pay.nagad?.number || ''} · Rocket ${pay.rocket?.number || ''} · Cash on Delivery${setting.gateway?.enabled ? ' · Online payment (SSLCOMMERZ)' : ''}. Send-money orders: upload the TrxID screenshot at checkout.`,
    `Currency: ${setting.currencyCode} (${setting.currency}).`,
  ];
}

/* ---------- ORDER STATUS — privacy-hardened minimal view ---------- */
/* audit fix — the chat widget used to answer ANY order number (semi-
   guessable: timestamp + 2 random chars) with items + totals. A phone-suffix
   proof now gates the details, mirroring the /orders/track endpoint:
     • no proof / wrong proof  → { orderNo, needsPhone: true } (existence only)
     • correct last-6 digits   → the full minimal view (still zero PII)      */
async function orderStatusByNo(orderNo, phoneSuffix) {
  const no = String(orderNo || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(no)) return null;
  const o = await Order.findOne({ orderNumber: no }).lean();
  if (!o) return null;
  const proof = String(phoneSuffix || '').replace(/\D/g, '');
  if (proof) {
    const digits = String(o.customer?.phone || '').replace(/\D/g, '');
    if (!digits.endsWith(proof)) return { orderNo: no, needsPhone: true };
  } else {
    return { orderNo: no, needsPhone: true };
  }
  /* MINIMAL VIEW — deliberately excludes customer name/phone/email/address,
     payment trxId and internal notes. Status + timeline + item names + totals only. */
  return {
    orderNo: o.orderNumber,
    status: o.status,
    paymentStatus: o.payment?.status || '',
    method: o.payment?.method || '',
    grandTotal: o.totals?.grandTotal ?? 0,
    grandLabel: money(o.totals?.grandTotal ?? 0),
    placedAt: o.createdAt,
    items: (o.items || []).slice(0, 6).map((i) => ({ name: i.name || i.title || 'Item', qty: i.qty || 1, price: i.price ?? i.unitPrice ?? 0 })),
    /* audit fix — the model field is statusHistory; the old `o.timeline` read
       always produced an empty array, silently breaking grounded timelines */
    timeline: (o.statusHistory || []).slice(-6).map((t) => ({ status: t.status, at: t.at })),
  };
}

module.exports = {
  tokens, expandTokens, money, livePrice, toCard,
  searchProducts, productsBySlugs, resolveBrands, resolveCategories,
  liveDeals, liveBundles, searchFaqs, storeFacts, orderStatusByNo,
};
