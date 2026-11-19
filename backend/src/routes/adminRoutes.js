const router = require('express').Router();
const Product = require('../models/Product');
const admin = require('../controllers/adminController');
const banner = require('../controllers/bannerController');
const hs = require('../controllers/homeSectionController');
const coupon = require('../controllers/couponController');
const setting = require('../controllers/settingController');
const categoryAdmin = require('../controllers/categoryController');
const badgeAdmin = require('../controllers/badgeController');
const reviews = require('../controllers/reviewController');
const questions = require('../controllers/questionController');
const brandAdmin = require('../controllers/brandController'); // Phase 2 — v2 catalog brands
const team = require('../controllers/teamController');
const blogAdmin = require('../controllers/blogController'); // Task 47 — Journal CRUD
const { protect, adminOnly, ownerOnly, requirePermission } = require('../middleware/auth');
const { audit } = require('../middleware/audit');
const { upload, uploadCsv, uploadMedia } = require('../middleware/upload');

/* P(mods…) — sub-admin module gate (full admins always pass) */
const P = requirePermission;

// everything under /api/admin is protected (staff = admin | sub-admin)
router.use(protect, adminOnly);

/* dashboard — open to all staff so the shell renders (pills go empty without it) */
router.get('/stats', admin.stats);
router.get('/search', admin.globalSearch); // Task 57 — ⌘K command palette (staff-wide)

/* ── payments ledger (module: orders) — Step 2 sync fix: the admin Payments
   page shipped against endpoints that never existed (404 everywhere) ── */
const adminPayments = require('../controllers/admin/payments');
router.get('/payments/transactions', P('orders'), adminPayments.transactions);
router.post('/payments/gateway/:orderNumber/refund', P('orders'), audit('update', 'order', { label: (req) => `Ledger refund ${req.params.orderNumber}` }), adminPayments.gatewayRefund);

/* ── order management (module: orders) ─────────────────────────────────── */
router.get('/orders', P('orders'), admin.orderList);
router.get('/orders/export.csv', P('orders'), admin.exportOrders); // MUST be above /orders/:id
router.post('/orders/manual', P('orders'), audit('create', 'order', { label: (req) => `Manual order for ${req.body?.customer?.name || 'customer'}` }), admin.createManualOrder); // manual entry (WhatsApp / phone orders)
router.get('/orders/:id', P('orders'), admin.orderDetail);
router.put('/orders/:id', P('orders'), audit('update', 'order'), admin.updateManualOrder); // edit a manual order (wrong-entry correction)
router.delete('/orders/:id', P('orders'), audit('delete', 'order'), admin.deleteOrder); // remove a wrong entry (stock restored)
router.patch('/orders/:id/verify', P('orders'), audit('verify', 'order'), admin.verifyPayment);
router.patch('/orders/:id/reject', P('orders'), audit('reject', 'order'), admin.rejectPayment);
router.patch('/orders/:id/status', P('orders'), audit('status', 'order', { label: (req) => `Status → ${req.body?.status || ''}` }), admin.updateStatus);
router.patch('/orders/:id/courier', P('orders'), audit('update', 'order', { label: () => 'Courier assigned' }), admin.setCourier);
router.post('/orders/:id/courier/push', P('orders'), audit('dispatch', 'order', { label: () => 'Courier dispatch pushed' }), admin.pushCourier); // Task 28 — one-click courier dispatch

/* returns / RMA management (Task 28) — module: orders */
router.get('/returns', P('orders', 'returns'), admin.listReturns);
router.patch('/returns/:id', P('orders', 'returns'), audit('update', 'return'), admin.resolveReturn);

/* order funnel analytics (Task 28) — module: orders */
router.get('/analytics/orders', P('orders'), admin.orderAnalytics);
/* sales trend (Task 56-c — dashboard line chart) — module: reports */
router.get('/analytics/trend', P('reports'), admin.salesTrend);

/* loyalty management (Task 56-a) — module: customers */
router.get('/loyalty', P('customers'), admin.loyaltyList);
router.get('/loyalty-settings', P('customers'), admin.loyaltySettingsGet);
router.put('/loyalty-settings', P('customers'), audit('update', 'loyalty-settings'), admin.loyaltySettingsPut);
router.get('/loyalty/:userId', P('customers'), admin.loyaltyDetail);
router.post('/loyalty/:userId/adjust', P('customers'), audit('create', 'loyalty-adjust', { label: (req) => `Points ${req.body?.points > 0 ? '+' : ''}${req.body?.points || ''} → ${req.params.userId}` }), admin.loyaltyAdjust);

/* email template test send (Task 56-d) — module: settings */
router.post('/email-templates/test', P('settings'), audit('create', 'email-test', { label: (req) => `Test email: ${req.body?.key || ''}` }), admin.emailTemplateTest);

/* sales report — module: reports */
router.get('/reports/sales.csv', P('reports'), admin.salesReportCsv);
router.get('/reports/sales', P('reports'), admin.salesReport);

/* ═══════════ Phase 4 — Backend Feature Expansion ═══════════ */

/* combo bundles (4.1) — module: catalog */
const bundle = require('../controllers/bundleController');
router.get('/bundles', P('catalog'), bundle.adminList);
router.get('/bundles/products', P('catalog'), async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const query = { active: true };
    const [items, total] = await Promise.all([
      Product.find(query).select('name nameBn slug price stock images').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(query),
    ]);
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (e) { next(e); }
});
router.post('/bundles', P('catalog'), audit('create', 'bundle', { label: (req) => `Bundle ${req.body?.title || ''}` }), bundle.adminCreate);
router.put('/bundles/:id', P('catalog'), audit('update', 'bundle'), bundle.adminUpdate);
router.delete('/bundles/:id', P('catalog'), audit('delete', 'bundle'), bundle.adminDelete);

/* flash campaigns (4.1) — module: marketing rides catalog/homepage gates */
const flashCampaign = require('../controllers/flashCampaignController');
router.get('/flash-campaigns', P('catalog', 'homepage'), flashCampaign.adminList);
router.post('/flash-campaigns', P('catalog', 'homepage'), audit('create', 'flash-campaign', { label: (req) => `Campaign ${req.body?.title || ''}` }), flashCampaign.adminCreate);
router.put('/flash-campaigns/:id', P('catalog', 'homepage'), audit('update', 'flash-campaign'), flashCampaign.adminUpdate);
router.delete('/flash-campaigns/:id', P('catalog', 'homepage'), audit('delete', 'flash-campaign'), flashCampaign.adminDelete);
router.post('/flash-campaigns/:id/apply', P('catalog', 'homepage'), audit('update', 'flash-campaign', { label: () => 'Campaign deal prices applied' }), flashCampaign.adminApply);
router.post('/flash-campaigns/:id/end', P('catalog', 'homepage'), audit('update', 'flash-campaign', { label: () => 'Campaign ended' }), flashCampaign.adminEnd);

/* Phase 8 — centralized deals & promotions (module: deals).
   ONE controller/service for every campaign type (11.11, 12.12, flash, mega,
   daily, seasonal, brand, combo, bogo, clearance, custom) — new types are
   registry entries in services/dealService.js TYPES, never new routes. */
const deals = require('../controllers/dealController');
router.get('/deals/meta', P('deals'), deals.adminMeta);       // type registry + pickers (before /:id)
router.get('/deals/stats', P('deals'), deals.adminStats);
router.get('/deals', P('deals'), deals.adminList);
router.post('/deals', P('deals'), audit('create', 'deal', { label: (req) => `Deal ${req.body?.name || ''} (${req.body?.type || 'custom'})` }), deals.adminCreate);
router.get('/deals/:id', P('deals'), deals.adminGet);
router.put('/deals/:id', P('deals'), audit('update', 'deal', { label: (req) => `Deal ${req.body?.name || req.params.id}` }), deals.adminUpdate);
router.patch('/deals/:id/state', P('deals'), audit('update', 'deal', { label: (req) => `Deal state → ${JSON.stringify(req.body || {})}` }), deals.adminSetState);
router.delete('/deals/:id', P('deals'), audit('delete', 'deal'), deals.adminRemove);

/* warranty registrations (4.2) — module: orders */
const service = require('../controllers/serviceController');
router.get('/warranty', P('orders'), service.adminWarrantyList);
router.get('/warranty/:id', P('orders'), service.adminWarrantyDetail);
router.patch('/warranty/:id', P('orders'), audit('update', 'warranty'), service.adminWarrantyUpdate);
router.delete('/warranty/:id', P('orders'), audit('delete', 'warranty'), service.adminWarrantyDelete);

/* service tickets (4.2) — module: messages (complaint inbox) */
router.get('/tickets', P('messages'), service.adminTicketList);
router.get('/tickets/:id', P('messages'), service.adminTicketDetail);
router.patch('/tickets/:id', P('messages'), audit('update', 'ticket', { label: (req) => `Ticket ${req.body?.status || ''}` }), service.adminTicketUpdate);
router.delete('/tickets/:id', P('messages'), audit('delete', 'ticket'), service.adminTicketDelete);

/* service centers (4.2) — module: content */
router.get('/service-centers', P('content'), service.adminCenterList);
router.post('/service-centers', P('content'), audit('create', 'service-center', { label: (req) => `Center ${req.body?.name || ''}` }), service.adminCenterCreate);
router.put('/service-centers/:id', P('content'), audit('update', 'service-center'), service.adminCenterUpdate);
router.delete('/service-centers/:id', P('content'), audit('delete', 'service-center'), service.adminCenterDelete);

/* stock ledger + adjustment (4.4) — module: products */
const stock = require('../controllers/stockController');
router.get('/stock/logs', P('products', 'orders'), stock.logs);
router.post('/stock/adjust', P('products'), audit('update', 'stock', { label: (req) => `Stock ${req.body?.delta > 0 ? '+' : ''}${req.body?.delta || ''}` }), stock.adjust);

/* subscribers (4.4) — module: customers */
const subscribers = require('../controllers/subscriberController');
router.get('/subscribers', P('customers'), subscribers.list);
router.get('/subscribers/export.csv', P('customers'), subscribers.exportCsv);
router.patch('/subscribers/:id', P('customers'), audit('update', 'subscriber'), subscribers.update);
router.delete('/subscribers/:id', P('customers'), audit('delete', 'subscriber'), subscribers.remove);

/* notification templates + broadcast (4.3/4.4) — module: settings */
const templates = require('../controllers/templateController');
router.get('/notification-templates', P('settings'), templates.list);
router.get('/notification-templates/catalog', P('settings'), templates.catalog);
router.post('/notification-templates', P('settings'), audit('create', 'notification-template', { label: (req) => `Template ${req.body?.key || ''}` }), templates.create);
router.put('/notification-templates/:id', P('settings'), audit('update', 'notification-template'), templates.update);
router.delete('/notification-templates/:id', P('settings'), audit('delete', 'notification-template'), templates.remove);
router.post('/notification-templates/:id/preview', P('settings'), templates.preview);
router.post('/notification-templates/:id/test', P('settings'), audit('create', 'template-test', { label: (req) => `Template test send` }), templates.test);
router.post('/notifications/broadcast', P('settings'), audit('create', 'broadcast', { label: (req) => `Broadcast: ${req.body?.title || ''}` }), templates.broadcast);

/* ═══════════ end Phase 4 ═══════════ */

/* product CRUD — Task 35: server-driven search/filters/sort for the admin list (module: products) */
router.get('/products', P('products'), async (req, res, next) => {
  try {
    const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const { search, category, status, stock, sort } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const q = {};
    if (category) q.category = String(category).toLowerCase().trim();
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRe(String(search).trim()), 'i');
      q.$or = [{ name: rx }, { slug: rx }, { category: rx }];
    }
    if (status === 'active') q.active = true;
    else if (status === 'inactive') q.active = false;
    if (stock === 'out') q.stock = 0;
    else if (stock === 'low') q.stock = { $gt: 0, $lte: 5 };
    else if (stock === 'in') q.stock = { $gt: 5 };
    const SORTS = {
      'name-asc': { name: 1 }, 'name-desc': { name: -1 },
      'price-asc': { price: 1 }, 'price-desc': { price: -1 },
      'stock-asc': { stock: 1 }, 'stock-desc': { stock: -1 },
      newest: { createdAt: -1 }, oldest: { createdAt: 1 },
    };
    const sortQ = SORTS[sort] || { createdAt: -1 };
    /* Phase 5 — populate the brand ref so the product form can show/edit it */
    const [items, total] = await Promise.all([
      Product.find(q).sort(sortQ).skip((page - 1) * limit).limit(limit).populate('brand', 'name slug'),
      Product.countDocuments(q),
    ]);
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (e) { next(e); }
});
router.post('/products', P('products'), upload.array('images', 6), audit('create', 'product', { label: (req, b, ent) => `Product "${ent?.name || req.body?.name || ''}"` }), admin.createProduct);
router.put('/products/:id', P('products'), upload.array('newImages', 6), audit('update', 'product', { label: (req, b, ent) => `Product "${ent?.name || ''}"` }), admin.updateProduct);
router.delete('/products/:id', P('products'), audit('delete', 'product'), admin.deleteProduct);

/* Task 27 — bulk ops, one-click duplicate, CSV round-trip (module: products) */
router.post('/products/bulk', P('products'), audit('bulk', 'product', { label: (req) => `Bulk ${req.body?.op || 'op'}` }), admin.bulkProducts);
/* Task 37 — admin → customer composed message (module: messages) */
router.post('/messages/compose', P('messages'), audit('compose', 'message'), require('../controllers/messageController').adminCompose);
router.get('/products/export.csv', P('products'), admin.exportProductsCsv);
router.post('/products/import', P('products'), uploadCsv.single('csv'), audit('import', 'product', { label: () => 'CSV import' }), admin.importProductsCsv);
router.post('/products/:id/duplicate', P('products'), audit('duplicate', 'product'), admin.duplicateProduct);

/* categories (Admin → Catalog) — module: catalog */
router.get('/categories', P('catalog', 'ai'), async (_req, res, next) => {
  try {
    const items = await require('../models/Category').find().sort({ order: 1 });
    res.json({ items });
  } catch (e) { next(e); }
});
router.post('/categories', P('catalog'), upload.single('image'), audit('create', 'category'), categoryAdmin.create);
router.put('/categories/:id', P('catalog'), upload.single('image'), audit('update', 'category'), categoryAdmin.update);
router.delete('/categories/:id', P('catalog'), audit('delete', 'category'), categoryAdmin.remove);

/* Step 5 — dynamic spec schema + reusable templates (Admin → Catalog → Specs) */
router.put('/categories/:id/spec-schema', P('catalog'), audit('update', 'category'), categoryAdmin.updateSpecSchema);
router.post('/categories/:id/apply-template', P('catalog'), audit('update', 'category'), categoryAdmin.applyTemplate);
router.post('/categories/:id/apply-defaults', P('catalog'), audit('update', 'category', { label: () => 'Bulk spec fill (apply schema defaults)' }), categoryAdmin.applyDefaults);
router.get('/spec-templates', P('catalog'), categoryAdmin.listTemplates);
router.post('/spec-templates', P('catalog'), audit('create', 'spec-template'), categoryAdmin.createTemplate);
router.put('/spec-templates/:id', P('catalog'), audit('update', 'spec-template'), categoryAdmin.updateTemplate);
router.delete('/spec-templates/:id', P('catalog'), audit('delete', 'spec-template'), categoryAdmin.removeTemplate);
/* Step 7 — facet alias auto-suggest: mine the category's own values and propose
   raw→canonical alias pairs (read-only; the editor applies what the admin picks) */
router.get('/categories/:id/alias-suggestions', P('catalog'), categoryAdmin.aliasSuggestions);

/* badges (Admin → Catalog) — module: catalog */
router.get('/badges', P('catalog'), async (_req, res, next) => {
  try {
    const items = await require('../models/Badge').find().sort({ order: 1, createdAt: 1 });
    res.json({ items });
  } catch (e) { next(e); }
});
router.post('/badges', P('catalog'), audit('create', 'badge'), badgeAdmin.create);
router.put('/badges/:id', P('catalog'), audit('update', 'badge'), badgeAdmin.update);
router.delete('/badges/:id', P('catalog'), audit('delete', 'badge'), badgeAdmin.remove);

/* Task 47 — Blog / Journal (content permission) */
router.get('/blog', P('content'), blogAdmin.adminList);
router.post('/blog', P('content'), audit('create', 'post', { label: (req, b, ent) => `Post "${ent?.title || req.body?.title || ''}"` }), blogAdmin.adminCreate);
router.put('/blog/:id', P('content'), audit('update', 'post', { label: (req, b, ent) => `Post "${ent?.title || req.body?.title || ''}"` }), blogAdmin.adminUpdate);
router.delete('/blog/:id', P('content'), audit('delete', 'post', { label: (req, b, ent) => `Post "${ent?.title || ''}"` }), blogAdmin.adminRemove);

/* product reviews moderation — Task 29 (module: reviews) */
router.get('/reviews', P('reviews'), reviews.adminList);
router.get('/reviews/stats', P('reviews'), reviews.adminStats);
router.patch('/reviews/bulk', P('reviews'), audit('bulk', 'review', { label: () => 'Bulk review moderation' }), reviews.adminBulk); // MUST sit above /reviews/:id
router.patch('/reviews/:id/approve', P('reviews'), audit('update', 'review', { label: () => 'Review approved' }), reviews.approve);
router.patch('/reviews/:id/unapprove', P('reviews'), audit('update', 'review', { label: () => 'Review unapproved' }), reviews.unapprove);
router.patch('/reviews/:id/homepage', P('reviews'), audit('update', 'review', { label: () => 'Homepage review visibility changed' }), reviews.toggleHomepage);
router.patch('/reviews/:id', P('reviews'), audit('update', 'review'), reviews.adminEdit);
router.patch('/reviews/:id/reply', P('reviews'), audit('update', 'review', { label: () => 'Reply posted' }), reviews.reply);
router.delete('/reviews/:id', P('reviews'), audit('delete', 'review'), reviews.remove);

/* product questions (answer / moderate) — Task 30 (module: questions) */
router.get('/questions', P('questions'), questions.adminList);
router.get('/questions/stats', P('questions'), questions.adminStats);
router.patch('/questions/bulk', P('questions'), audit('bulk', 'question', { label: () => 'Bulk question moderation' }), questions.adminBulk); // MUST sit above :id routes
router.put('/questions/:id', P('questions'), audit('update', 'question', { label: () => 'Answer posted' }), questions.answer);
router.patch('/questions/:id/unanswer', P('questions'), audit('update', 'question', { label: () => 'Answer withdrawn' }), questions.unanswer);
router.delete('/questions/:id', P('questions'), audit('delete', 'question'), questions.remove);

/* Phase 2 (v2 catalog) — brands CRUD (module: brands) */
router.get('/brands', P('brands'), brandAdmin.adminList);
router.post('/brands', P('brands'), upload.single('logo'), audit('create', 'brand'), brandAdmin.create);
router.put('/brands/:id', P('brands'), upload.single('logo'), audit('update', 'brand'), brandAdmin.update);
router.delete('/brands/:id', P('brands'), audit('delete', 'brand'), brandAdmin.remove);

/* customers (module: customers) */
router.get('/customers', P('customers'), admin.customers);
router.delete('/customers/:id', P('customers'), audit('delete', 'customer'), admin.deleteCustomer);
router.put('/customers/:id/tags', P('customers'), audit('update', 'customer', { label: (req) => `CRM tags/note — ${req.body?.tags ? 'tags ' + req.body.tags : 'note'}` }), admin.customerTags); // Task 57 — private CRM layer
router.post('/customers/:id/reset-password', P('customers'), audit('reset-password', 'customer'), admin.resetCustomerPassword); // ERP-assisted reset link

/* banners — Task 30: reorder / duplicate / click analytics (module: banners) */
router.get('/banners', P('banners'), banner.adminList);
router.get('/banners/analytics', P('banners'), banner.analytics);
router.post('/banners', P('banners'), uploadMedia.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), audit('create', 'banner'), banner.create);
router.patch('/banners/reorder', P('banners'), audit('update', 'banner', { label: () => 'Banners reordered' }), banner.reorder); // MUST sit above :id-style paths
router.post('/banners/:id/duplicate', P('banners'), audit('duplicate', 'banner'), banner.duplicate);
router.put('/banners/:id', P('banners'), uploadMedia.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), audit('update', 'banner'), banner.update);
router.delete('/banners/:id', P('banners'), audit('delete', 'banner'), banner.remove);

/* homepage sections (module: homepage) */
router.get('/home-sections', P('homepage'), hs.adminList);
router.get('/home-sections/metadata', P('homepage'), hs.metadata);
router.post('/home-sections', P('homepage'), audit('create', 'home-section'), hs.create);
router.put('/home-sections/:id', P('homepage'), audit('update', 'home-section'), hs.update);
router.delete('/home-sections/:id', P('homepage'), audit('delete', 'home-section'), hs.remove);

/* coupons — Task 29: validation, scoping, bulk-generate, export, analytics (module: coupons) */
router.get('/coupons', P('coupons'), coupon.adminList);
router.get('/coupons/export.csv', P('coupons'), coupon.exportCsv);
router.get('/coupons/analytics', P('coupons'), coupon.adminAnalytics);
router.post('/coupons', P('coupons'), audit('create', 'coupon', { label: (req, b, ent) => `Coupon ${ent?.code || req.body?.code || ''}` }), coupon.create);
router.post('/coupons/bulk-generate', P('coupons'), audit('bulk', 'coupon', { label: (req) => `Bulk-generate ${req.body?.count || ''} codes` }), coupon.bulkGenerate);
router.get('/coupons/:id/analytics', P('coupons'), coupon.couponAnalytics);
router.put('/coupons/:id', P('coupons'), audit('update', 'coupon'), coupon.update);
router.delete('/coupons/:id', P('coupons'), audit('delete', 'coupon'), coupon.remove);

/* settings — shared by Settings AND Content pages (module: settings | content) */
router.get('/settings', P('settings', 'content'), setting.get);
router.put('/settings', P('settings', 'content'), audit('update', 'setting', { label: (req) => { const k = Object.keys(req.body || {}); return k.length ? `Settings: ${k.slice(0, 3).join(', ')}${k.length > 3 ? '…' : ''}` : 'Settings updated'; } }), setting.update);
/* Theme presets — persistent drafts and explicit publish/rollback. */

/* SEO management (module: seo) */
const seo = require('../controllers/seoController');
router.get('/seo', P('seo'), seo.adminList);
router.put('/seo/pages/:pageKey', P('seo'), audit('update', 'seo', { label: (req) => `Page meta: ${req.params.pageKey}` }), seo.upsertPage);
router.get('/seo/products', P('seo'), seo.productList);
router.put('/seo/product/:id', P('seo'), audit('update', 'seo', { label: () => 'Product SEO override' }), seo.saveProductSeo);
router.put('/seo/site', P('seo'), audit('update', 'seo', { label: () => 'Site SEO/schema' }), seo.updateSite);
router.get('/seo/robots/preview', P('seo'), seo.robotsPreview);
router.post('/seo/robots/reset', P('seo'), audit('update', 'seo', { label: () => 'Robots.txt reset' }), seo.robotsReset);

/* Google services (Task 26) — Search Console submission automation + GA4 funnel (module: seo) */
const google = require('../controllers/googleController');
router.get('/seo/gsc', P('seo'), google.gscStatus);
router.put('/seo/gsc/settings', P('seo'), audit('update', 'seo', { label: () => 'GSC settings' }), google.gscSave);
router.post('/seo/gsc/submit-url', P('seo'), google.gscSubmitUrl);
router.post('/seo/gsc/submit-sitemap', P('seo'), google.gscSubmitSitemap);
router.post('/seo/gsc/index-sitemap', P('seo'), google.gscIndexSitemap);
router.get('/seo/gsc/log', P('seo'), google.gscLog);
router.get('/analytics/funnel', P('seo', 'reports'), google.ga4Funnel);

/* contact messages inbox (module: messages) */
const message = require('../controllers/messageController');
router.get('/messages', P('messages'), message.adminList);
router.patch('/messages/:id', P('messages'), message.markRead);
router.delete('/messages/:id', P('messages'), audit('delete', 'message'), message.remove);

/* file upload system — open to all staff (media pickers live in many modules) */
/* audit fix — the ONLY admin mutation without a module gate: a zero-permission
   subadmin used to be able to write files to storage. Media pickers live in
   these modules, so they define the gate; the upload is now audited too. */
router.post('/uploads', P('products', 'banners', 'homepage', 'content', 'catalog', 'deals', 'ai', 'seo'), upload.single('image'), audit('create', 'upload', { label: (req) => 'Upload: ' + String(req.file?.originalname || '').slice(0, 60) }), admin.uploadImage);

/* production readiness checklist (Task 30) — module: settings */
const system = require('../controllers/systemController');
router.get('/system/status', P('settings'), system.status);
/* Step 7 — thumbnail backfill (#6) + prefetch-queue stats (#11). The backfill
   is a bulk ops job: POST derives thumbs for every pre-Step-6 upload (queue
   off the request path; ?wait=1 drains inline for QA), GET exposes the queue. */
router.post('/system/backfill-thumbs', P('settings'), audit('update', 'system', { label: () => 'Thumbnail backfill job' }), system.backfillThumbs);
router.get('/system/thumb-queue', P('settings'), system.thumbQueueStatus);

/* ── Task 39 — team management + audit trail (OWNER only, never sub-admins) ── */
router.get('/team', ownerOnly, team.list);
router.get('/system/backup', ownerOnly, audit('export', 'database', { label: () => 'Database backup downloaded' }), admin.backupDatabase); // Task 57 — one-click JSON export
router.post('/team', ownerOnly, audit('team.create', 'subadmin', { label: (req, b, ent) => `Sub-admin ${ent?.email || req.body?.email || ''}` }), team.create);
router.put('/team/:id', ownerOnly, audit('team.update', 'subadmin'), team.update);
router.delete('/team/:id', ownerOnly, audit('team.delete', 'subadmin'), team.remove);
router.get('/audit', ownerOnly, team.auditList);

/* ═══════════ AI SYSTEM (Phase 9 — modular AI stack) ═══════════
   AI product import · knowledge sources · support-chat history ·
   analytics · AI settings. Whole block gated by the 'ai' module —
   the owner grants it to a sub-admin from Admin → Team. */
const aiAdmin = require('../controllers/aiAdminController');
const AI_AUDIT = { label: () => 'AI console update' };

router.get('/ai/settings', P('ai'), aiAdmin.settingsGet);
router.put('/ai/settings', P('ai'), audit('update', 'ai-settings', AI_AUDIT), aiAdmin.settingsPut);

/* AI product import — staging queue + approval */
router.post('/ai/imports', P('ai'), audit('create', 'ai-import', { label: (req) => `AI import queued (${(req.body?.urls || [req.body?.url]).filter(Boolean).length} URL(s))` }), aiAdmin.importCreate);
router.get('/ai/imports', P('ai'), aiAdmin.importList);
router.get('/ai/imports/:id', P('ai'), aiAdmin.importGet);
router.put('/ai/imports/:id', P('ai'), audit('update', 'ai-import'), aiAdmin.importEdit);
router.post('/ai/imports/:id/approve', P('ai'), audit('approve', 'ai-import', { label: () => 'AI import approved → product created' }), aiAdmin.importApprove);
router.post('/ai/imports/bulk-approve', P('ai'), audit('approve', 'ai-import', { label: (req) => `Bulk approve (${(req.body?.items || req.body?.ids || []).length} import(s))` }), aiAdmin.importBulkApprove);
router.post('/ai/imports/:id/suggest-mapping', P('ai'), aiAdmin.importSuggestMapping);
/* Step 7 — update-mode diff preview: side-by-side staged vs current for the
   flagged-duplicate target BEFORE the refresh is applied (pure read) */
router.get('/ai/imports/:id/diff', P('ai'), aiAdmin.importUpdateDiff);
router.post('/ai/imports/:id/reject', P('ai'), audit('reject', 'ai-import'), aiAdmin.importReject);
router.post('/ai/imports/:id/retry', P('ai'), audit('update', 'ai-import', { label: () => 'AI import retry' }), aiAdmin.importRetry);
router.delete('/ai/imports/:id', P('ai'), audit('delete', 'ai-import'), aiAdmin.importDelete);

/* knowledge sources (FAQ CRUD + coverage stats) */
router.get('/ai/faqs', P('ai'), aiAdmin.faqList);
router.post('/ai/faqs', P('ai'), audit('create', 'ai-faq', AI_AUDIT), aiAdmin.faqCreate);
router.put('/ai/faqs/:id', P('ai'), audit('update', 'ai-faq', AI_AUDIT), aiAdmin.faqUpdate);
router.delete('/ai/faqs/:id', P('ai'), audit('delete', 'ai-faq'), aiAdmin.faqDelete);
router.get('/ai/knowledge/stats', P('ai'), aiAdmin.knowledgeStats);

/* chat history + admin test console */
router.get('/ai/chats', P('ai'), aiAdmin.chatList);
router.get('/ai/chats/:id', P('ai'), aiAdmin.chatGet);
router.delete('/ai/chats/:id', P('ai'), audit('delete', 'ai-chat'), aiAdmin.chatDelete);
router.post('/ai/chat/test', P('ai'), aiAdmin.chatTest);

/* analytics */
router.get('/ai/analytics', P('ai'), aiAdmin.analytics);

module.exports = router;

