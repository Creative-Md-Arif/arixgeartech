/**
 * arixgear.tech — Seed everything (Phase 2: tech catalog)
 * ---------------------------------------------------------------
 * Wipes and reseeds: settings, brands, category TREE, products (with brand
 * refs / warranty / SKUs), banners, homepage sections, coupons, admin user,
 * demo customer + staff, sample orders (ARG- prefix), reviews, Q&A.
 *
 *   npm run seed
 *
 * Login after seeding:
 *   admin  → admin@arixgear.tech  / ArixAdmin2026   (override: SEED_ADMIN_PASSWORD)
 *   demo   → demo@arixgear.tech   / arix2026        (override: SEED_DEMO_PASSWORD)
 *   staff  → staff@arixgear.tech  / ArixStaff2026   (sub-admin: orders·products·brands·messages)
 *
 * Catalog data lives in ./techData.js — this file only wires refs + dates.
 */
const path = require('path');
const Notification = require('../models/Notification');
const ContactMessage = require('../models/ContactMessage');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Banner = require('../models/Banner');
const Post = require('../models/Post');
const HomeSection = require('../models/HomeSection');
const HomeSectionMetadata = require('../models/HomeSectionMetadata');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const Setting = require('../models/Setting');
const Badge = require('../models/Badge');
const Review = require('../models/Review');
const Question = require('../models/Question');
const SeoModel = require('../models/Seo');
const { SeoSite } = require('../models/Seo');
const ComboBundle = require('../models/ComboBundle');       // Phase 4 — real bundles
const ServiceCenter = require('../models/ServiceCenter');   // Phase 4 — after-sales
const NotificationTemplate = require('../models/NotificationTemplate'); // Phase 4 — template editor
const { PAGES, pageDefaults, SITE_DEFAULTS } = require('../config/seoDefaults');
const contentDefaults = require('../config/contentDefaults');
const T = require('./techData');
const homeSectionMetadata = require('./homeSectionMetadata');
const quickServiceData = require('./quickServiceData');

const PROOF = path.join(__dirname, 'demo-proof.png');
const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const img = (f) => ({ url: f });
const days = (n) => new Date(Date.now() - n * 864e5);

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');
  /* audit fix — the seed WIPES every collection. A momentary fat-finger against
     a production URI must be impossible: refuse to run in production unless
     SEED_CONFIRM=yes is set explicitly. */
  if (process.env.NODE_ENV === 'production' && process.env.SEED_CONFIRM !== 'yes') {
    console.error('[seed] REFUSED: NODE_ENV=production and SEED_CONFIRM is not "yes".');
    console.error('[seed] This script deletes ALL data. Re-run with SEED_CONFIRM=yes if you really mean it.');
    process.exit(1);
  }
  console.log('[seed] connected');

  /* ---------- wipe ---------- */
  await Promise.all([
    User.deleteMany({}), Product.deleteMany({}), Category.deleteMany({}), Brand.deleteMany({}),
    Banner.deleteMany({}), HomeSection.deleteMany({}), HomeSectionMetadata.deleteMany({}), Coupon.deleteMany({}),
    Order.deleteMany({}), Setting.deleteMany({}), Badge.deleteMany({}),
    Review.deleteMany({}), Question.deleteMany({}),
    SeoModel.deleteMany({}), SeoSite.deleteMany({}),
    Notification.deleteMany({}), ContactMessage.deleteMany({}),
    require('../models/AuditLog').deleteMany({}),
    Post.deleteMany({}),
    /* Phase 4 — new feature collections */
    ComboBundle.deleteMany({}), ServiceCenter.deleteMany({}),
    NotificationTemplate.deleteMany({}),
    require('../models/FlashCampaign').deleteMany({}),
    require('../models/Deal').deleteMany({}), // Phase 8 — centralized deals
    require('../models/WarrantyRegistration').deleteMany({}),
    require('../models/ServiceTicket').deleteMany({}),
    require('../models/StockLog').deleteMany({}),
    require('../models/Subscriber').deleteMany({}),
    require('../models/DeviceToken').deleteMany({}),
    // membership vertical archived (Phase 2) — wipe any legacy rows if present
    mongoose.connection.collection('membershipplans').deleteMany({}).catch(() => {}),
    mongoose.connection.collection('members').deleteMany({}).catch(() => {}),
  ]);
  console.log('[seed] old data cleared');

  /* ---------- users ---------- */
  const admin = await User.create({
    name: 'ArixGear Admin', email: 'admin@arixgear.tech', phone: '01700000000',
    password: process.env.SEED_ADMIN_PASSWORD || 'ArixAdmin2026', role: 'admin', emailVerified: true,
  });
  const demo = await User.create({
    name: 'Demo Customer', email: 'demo@arixgear.tech', phone: '01712345678',
    password: process.env.SEED_DEMO_PASSWORD || 'arix2026', role: 'customer', emailVerified: true,
    addresses: [{ label: 'Home', line: 'House 42, Road 11, Banani', city: 'Dhaka', division: 'dhaka', postal: '1213', isDefault: true }],
  });
  const staff = await User.create({
    name: 'ArixGear Staff', email: 'staff@arixgear.tech', phone: '01700000111',
    password: 'ArixStaff2026', role: 'subadmin', emailVerified: true,
    permissions: ['orders', 'products', 'brands', 'messages'],
  });
  console.log('[seed] users: admin@arixgear.tech / ArixAdmin2026, demo@arixgear.tech / arix2026');
  console.log('[seed] sub-admin: staff@arixgear.tech / ArixStaff2026 (orders, products, brands, messages)');

  /* ---------- badges ---------- */
  await Badge.insertMany([
    { key: 'new', label: 'NEW', labelBn: 'নতুন', color: '#111114', order: 1 },
    { key: 'sale', label: 'SALE', labelBn: 'সেল', color: '#2F81F7', order: 2 },
    { key: 'best-seller', label: 'BEST SELLER', labelBn: 'বেস্ট সেলার', color: '#c9ced4', order: 3 },
  ]);
  console.log('[seed] badges: new · sale · best-seller');

  /* ---------- brands ---------- */
  const brandDocs = await Brand.insertMany(T.BRANDS);
  const brandBySlug = Object.fromEntries(brandDocs.map((b) => [b.slug, b._id]));
  console.log('[seed] brands: ' + brandDocs.length);

  /* ---------- category tree (parent slug → ref, denormalized path) ---------- */
  const catBySlug = {};
  for (const c of T.CATEGORIES) {
    const parent = c.parent ? catBySlug[c.parent] : null;
    if (c.parent && !parent) throw new Error(`[seed] category "${c.slug}" references unknown parent "${c.parent}"`);
    const doc = await Category.create({
      name: c.name, nameBn: c.nameBn || '', slug: c.slug, parent: parent ? parent._id : null,
      icon: c.icon || '', image: c.image || '', order: c.order || 0, active: true,
      path: parent ? [...parent.path, c.slug] : [c.slug],
    });
    catBySlug[c.slug] = doc;
  }
  const roots = T.CATEGORIES.filter((c) => !c.parent).length;
  console.log(`[seed] categories: ${T.CATEGORIES.length} (${roots} roots + ${T.CATEGORIES.length - roots} subs)`);

  /* ---------- products (brand slug → ref, category slug → ref + path) ---------- */
  const productDocs = [];
  for (const p of T.PRODUCTS) {
    const brandId = p.brand ? brandBySlug[p.brand] : null;
    if (p.brand && !brandId) throw new Error(`[seed] product "${p.slug}" references unknown brand "${p.brand}"`);
    const cat = catBySlug[p.category];
    if (!cat) throw new Error(`[seed] product "${p.slug}" references unknown category "${p.category}"`);

    /* relative flash windows: { startsAt: 'live'|'+2d', endsAt: '+3d' } */
    const at = (v, fallbackDays) => {
      if (!v) return null;
      if (v === 'live') return new Date(Date.now() - 3600e3);
      if (typeof v === 'string' && v.startsWith('+')) return new Date(Date.now() + parseFloat(v.slice(1)) * 864e5);
      return v;
    };
    productDocs.push({
      ...p,
      brand: brandId || null,
      categoryRef: cat._id,
      categoryPath: cat.path,
      flash: p.flash ? { price: p.flash.price, startsAt: at(p.flash.startsAt), endsAt: at(p.flash.endsAt) } : { price: null, startsAt: null, endsAt: null },
      images: (p.images || []).map((i) => (typeof i === 'string' ? img(i) : i)), // techData passes {url} objects
      warranty: p.warranty || { months: 0, type: 'none', note: '' },
      colors: (p.colors || []).map((c) => ({ ...c, image: c.image || '' })),
    });
  }
  const saved = await Product.insertMany(productDocs);
  const bySlug = Object.fromEntries(saved.map((p) => [p.slug, p]));
  console.log('[seed] products: ' + saved.length + ' (BDT · brand refs · tree refs · ARG- SKUs · warranties)');

  /* ---------- product reviews ---------- */
  await Review.insertMany(T.REVIEWS.map((r) => ({
    product: bySlug[r.product]._id, name: r.name, rating: r.rating, comment: r.comment,
    approved: r.approved, createdAt: days(r.days),
  })));
  console.log('[seed] reviews: ' + T.REVIEWS.length + ` (${T.REVIEWS.filter((r) => r.approved).length} approved + ${T.REVIEWS.filter((r) => !r.approved).length} pending)`);

  /* ---------- product questions ---------- */
  await Question.insertMany(T.QUESTIONS.map((q) => ({
    product: bySlug[q.product]._id, name: q.name, question: q.question, answer: q.answer || '',
    answered: q.answered, createdAt: days(q.days),
  })));
  console.log('[seed] questions: ' + T.QUESTIONS.filter((q) => q.answered).length + ' answered + ' + T.QUESTIONS.filter((q) => !q.answered).length + ' pending');

  /* ---------- banners ---------- */
  await Banner.insertMany(T.BANNERS.map((b) => ({ ...b, image: { url: b.image } }))); // Banner model expects a {url} subdoc
  console.log('[seed] banners: 3 hero + 1 promo');

  /* ---------- journal ---------- */
  await Post.insertMany(T.POSTS.map((p) => ({
    ...p, publishedAt: days(p.publishedAt || 1),
  })));
  console.log('[seed] journal: ' + T.POSTS.length + ' published tech guides');

  /* ---------- homepage sections ---------- */
  const comboSource = T.HOME_SECTIONS.find((s) => s.key === 'combo-bundles');
  const bundleSpecs = (comboSource && comboSource.config && comboSource.config.bundles) || [];
  const sections = T.HOME_SECTIONS.map((s) => {
    if (s.key === 'combo-bundles') return { ...s, config: {} };
    if (s.key === 'athletes' || s.key === 'stories') return { ...s, config: {} };
    if (s.key === 'quick-services') return { ...s, config: { ...(s.config || {}), cards: quickServiceData } };
    if (s.key === 'arsenal') {
      /* curated All-tab order: featured first, then best-sellers */
      const featured = saved.filter((p) => p.featured).map((p) => p.slug);
      const rest = saved.filter((p) => !p.featured && p.badge === 'best-seller').map((p) => p.slug);
      return { ...s, config: { ...s.config, products: [...featured, ...rest].slice(0, 16) } };
    }
    return s;
  });
  await HomeSection.insertMany(sections);
  console.log('[seed] homepage sections: ' + sections.length + ' (slider · ticker · categories · carousel · grid · community · stories)');
  await HomeSectionMetadata.create(homeSectionMetadata);
  console.log('[seed] homepage editor metadata: section types · sources · actions');

  /* ---------- coupons ---------- */
  await Coupon.insertMany(T.COUPONS);
  console.log('[seed] coupons: ' + T.COUPONS.map((c) => c.code).join(', '));

  /* ---------- Phase 4 — combo bundles (mirrors the homepage section config) ---------- */
  for (const b of bundleSpecs) {
    const itemDocs = (b.items || []).map((s) => bySlug[s]).filter(Boolean);
    if (itemDocs.length < 2) continue;
    await ComboBundle.create({
      slug: b.items.join('-').slice(0, 60),
      title: b.title, titleBn: b.titleBn || '', tagline: b.tagline || '', taglineBn: b.taglineBn || '',
      tag: b.tag || '',
      items: itemDocs.map((p) => ({ product: p._id, slug: p.slug, name: p.name, price: p.price, qty: 1 })),
      bundlePrice: b.bundlePrice,
      active: true,
      sortOrder: bundleSpecs.indexOf(b),
    });
  }
  console.log('[seed] combo bundles: ' + bundleSpecs.length + ' (order-time allocation pricing enabled)');

  /* ---------- Phase 8 — centralized deals & promotions ---------- */
  const { seedDeals } = require('./deals');
  await seedDeals();

  /* ---------- Phase 4 — service centers (walk-in servicing network) ---------- */
  await ServiceCenter.insertMany([
    { name: 'ArixGear Service Hub — Dhaka', city: 'Dhaka', address: 'Level 3, Twin Towers, Mobile Gate, Shyamoli', phone: '01712-345670', hours: 'Sat–Thu 10:00–19:00', mapUrl: 'https://maps.google.com/?q=Shyamoli+Dhaka', services: ['Diagnostics', 'Repairs', 'Warranty claims', 'Data recovery'], sortOrder: 1 },
    { name: 'ArixGear Service Point — Chattogram', city: 'Chattogram', address: 'Shop 14, Yunus Plaza, GEC Circle', phone: '01712-345671', hours: 'Sat–Thu 10:00–18:30', services: ['Diagnostics', 'Repairs', 'Warranty claims'], sortOrder: 2 },
    { name: 'ArixGear Service Point — Khulna', city: 'Khulna', address: '2nd Floor, Rupsha Strands, Shibbari More', phone: '01712-345672', hours: 'Sun–Thu 10:00–18:00', services: ['Diagnostics', 'Warranty claims'], sortOrder: 3 },
    { name: 'ArixGear Service Point — Sylhet', city: 'Sylhet', address: 'Binamonni Complex, Zindabazar', phone: '01712-345673', hours: 'Sun–Thu 10:00–18:00', services: ['Diagnostics', 'Repairs'], sortOrder: 4 },
    { name: 'ArixGear Service Point — Rajshahi', city: 'Rajshahi', address: 'Greater Road, Shaheb Bazar Zero Point', phone: '01712-345674', hours: 'Sun–Thu 10:00–18:00', services: ['Diagnostics', 'Warranty claims'], sortOrder: 5 },
  ]);
  console.log('[seed] service centers: 5 (Dhaka · Chattogram · Khulna · Sylhet · Rajshahi)');

  /* ---------- Phase 4 — notification templates (admin-editable copies) ---------- */
  await NotificationTemplate.insertMany([
    { key: 'order-confirmation', channel: 'email', label: 'Order confirmation', description: 'Sent the moment an order lands (guest + account).',
      subject: 'ArixGear Order {{orderNumber}} — received',
      body: 'Hi {{name}}, your gear is locked in. We\'ll email you at every step. Estimated delivery within 3 days.',
      vars: ['name', 'orderNumber'] },
    { key: 'order-status', channel: 'email', label: 'Order status update', description: 'Status flips (verified → shipped → delivered). {{note}} carries the admin remark.',
      subject: 'ArixGear Order {{orderNumber}} — {{status}}',
      body: 'Hi {{name}}, your order {{orderNumber}} is now {{status}}. {{note}}',
      statusNotes: { shipped: 'Track it live from your account — consignment details included.', delivered: 'Delivered! Enjoy the gear — and don\'t forget to register your warranty.' },
      vars: ['name', 'orderNumber', 'status', 'note'] },
    { key: 'ticket-created', channel: 'email', label: 'Service ticket created', description: 'Complaint/service confirmation with the tracking number.',
      subject: 'ArixGear ticket {{ticketNumber}} — we received it',
      body: 'Hi {{name}}, your {{category}} ticket is in. Our service desk replies within one working day. Track it any time with {{ticketNumber}}.',
      vars: ['name', 'ticketNumber', 'category'] },
    { key: 'warranty-registered', channel: 'email', label: 'Warranty registered', description: 'Warranty activation confirmation.',
      subject: 'ArixGear warranty {{regNumber}} — active',
      body: 'Hi {{name}}, warranty for {{productName}} is active until {{expiresAt}}. Keep {{regNumber}} handy when you contact us.',
      vars: ['name', 'regNumber', 'productName', 'expiresAt'] },
    { key: 'admin-order-alert', channel: 'push', label: 'Admin new-order push', description: 'Fanned out to admin devices (web-push + FCM).',
      subject: 'নতুন অর্ডার — {{orderNumber}}',
      body: '{{customer}} · ৳{{total}} · {{method}}',
      vars: ['orderNumber', 'customer', 'total', 'method'] },
  ]);
  console.log('[seed] notification templates: 5 (email×4, push×1 — admin editor ready)');

  /* ---------- settings (site content + checkout rules; no fitness size guides) ---------- */
  await Setting.create({
    key: 'store',
    content: contentDefaults,
    checkout: { guestEnabled: true },
    categoryGuides: [], // fitness guides removed with the vertical (Phase 2)
  });
  console.log('[seed] settings: site content + 8-division shipping (৳) + guest checkout');

  /* ---------- contact messages demo ---------- */
  await ContactMessage.insertMany([
    { name: 'Rafi Ahmed', email: 'rafi.ahmed@example.com', orderNo: 'ARG-SEED001', topic: 'payment', message: 'আমি গতকাল bKash-এ টাকা পাঠিয়েছি, কিন্তু আমার TrxID verify হয়নি। একটু চেক করবেন প্লিজ।', read: false },
    { name: 'Nusrat Jahan', email: 'nusrat.j@example.com', topic: 'warranty', message: 'laptop-strix-g15 এর warranty card online কিভাবে register করব?', read: false },
  ]);
  console.log('[seed] contact messages: 2 unread');

  /* ---------- sample orders (ARG- prefix) ---------- */
  fs.mkdirSync(UPLOADS, { recursive: true });
  const proofName = 'seed-proof-bkash.png';
  const proofDest = path.join(UPLOADS, proofName);
  if (fs.existsSync(PROOF)) fs.copyFileSync(PROOF, proofDest);

  const laptop = bySlug['laptop-voyage-14'];
  const gpu = bySlug['gpu-vortex-rtx'];
  const monitor = bySlug['monitor-view-24'];
  const upsWith = bySlug['ups-line-650'];

  const now = Date.now();
  await Order.insertMany([
    {
      orderNumber: 'ARG-SEED001', user: null, isGuest: true,
      customer: { name: 'Rahim Ahmed', phone: '01711-223344', email: 'rahim@example.com' },
      shipping: { address: 'Flat B4, House 21, Road 7, Dhanmondi', city: 'Dhaka', division: 'dhaka', postal: '1209' },
      items: [{ product: monitor._id, name: monitor.name, slug: monitor.slug, image: monitor.images[0].url, price: monitor.price, qty: 1, lineTotal: monitor.price }],
      totals: { subtotal: monitor.price, discount: 0, couponCode: null, shipping: 60, grandTotal: monitor.price + 60 },
      payment: { method: 'bkash', trxId: '9G3AXKD6GK', screenshot: { url: `/uploads/${proofName}`, publicId: proofName, filename: 'bkash-proof.png' }, expectedAmount: monitor.price + 60, status: 'pending' },
      status: 'verifying',
      statusHistory: [{ status: 'verifying', note: 'Order placed — waiting for payment verification', at: new Date(now - 2 * 3600e3), by: 'system' }],
      createdAt: new Date(now - 2 * 3600e3),
    },
    {
      orderNumber: 'ARG-SEED002', user: demo._id, isGuest: false,
      customer: { name: 'Demo Customer', phone: '01712345678', email: 'demo@arixgear.tech' },
      shipping: { address: 'House 42, Road 11, Banani', city: 'Dhaka', division: 'dhaka', postal: '1213' },
      items: [
        { product: gpu._id, name: gpu.name, slug: gpu.slug, image: gpu.images[0].url, price: gpu.price, qty: 1, lineTotal: gpu.price },
        { product: upsWith._id, name: upsWith.name, slug: upsWith.slug, image: upsWith.images[0].url, price: upsWith.price, qty: 1, lineTotal: upsWith.price },
      ],
      totals: { subtotal: gpu.price + upsWith.price, discount: 0, couponCode: null, shipping: 0, grandTotal: gpu.price + upsWith.price },
      payment: { method: 'cod', expectedAmount: gpu.price + upsWith.price, status: 'cod-pending' },
      status: 'processing',
      statusHistory: [{ status: 'processing', note: 'Cash on delivery order placed', at: new Date(now - 26 * 3600e3), by: 'system' }],
      createdAt: new Date(now - 26 * 3600e3),
    },
    {
      orderNumber: 'ARG-SEED003', user: demo._id, isGuest: false,
      customer: { name: 'Demo Customer', phone: '01712345678', email: 'demo@arixgear.tech' },
      shipping: { address: 'House 42, Road 11, Banani', city: 'Dhaka', division: 'dhaka', postal: '1213' },
      items: [{ product: laptop._id, name: laptop.name, slug: laptop.slug, image: laptop.images[0].url, price: laptop.price, qty: 1, lineTotal: laptop.price }],
      totals: { subtotal: laptop.price, discount: 0, couponCode: null, shipping: 60, grandTotal: laptop.price + 60 },
      payment: { method: 'bkash', trxId: 'H4KQM2P7XT', expectedAmount: laptop.price + 60, status: 'verified', verifiedAt: new Date(now - 5 * 864e5) },
      status: 'delivered',
      statusHistory: [
        { status: 'verifying', note: 'Order placed', at: new Date(now - 7 * 864e5), by: 'system' },
        { status: 'processing', note: 'Payment verified (bKash TrxID H4KQM2P7XT)', at: new Date(now - 6 * 864e5), by: 'ArixGear Admin' },
        { status: 'shipped', note: 'Shipped via Steadfast — consignment SF78451236', at: new Date(now - 5 * 864e5), by: 'ArixGear Admin' },
        { status: 'delivered', note: 'Cash collected by courier', at: new Date(now - 3 * 864e5), by: 'ArixGear Admin' },
      ],
      courier: { name: 'Steadfast', consignmentNo: 'SF78451236' },
      createdAt: new Date(now - 7 * 864e5),
    },
  ]);
  console.log('[seed] sample orders: 3 (1 bkash verifying, 1 COD processing, 1 delivered)');

  /* ---------- SEO defaults ---------- */
  await SeoModel.insertMany(PAGES.map((p) => ({ pageKey: p.key, ...pageDefaults(p.key) })));
  await SeoSite.create({ key: 'seo', ...SITE_DEFAULTS });
  console.log(`[seed] seo: ${PAGES.length} page docs + site config`);

  console.log('\n✅ SEED COMPLETE — arixgear.tech tech catalog');
  console.log('   admin login → admin@arixgear.tech / ArixAdmin2026');
  console.log('   demo login  → demo@arixgear.tech  / arix2026');
  console.log('   staff login → staff@arixgear.tech / ArixStaff2026\n');
  await mongoose.disconnect();
}

seed().catch((e) => { console.error('[seed] FAILED:', e); process.exit(1); });
