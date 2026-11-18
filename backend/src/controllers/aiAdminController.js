/* AI SYSTEM — admin console endpoints (mounted at /api/admin/ai).
   Every route is behind protect + adminOnly + P('ai') (see adminRoutes.js),
   so sub-admins only reach it when the owner grants the 'ai' module. */

const AiSetting = require('../models/AiSetting');
const AiImport = require('../models/AiImport');
const AiFaq = require('../models/AiFaq');
const AiChat = require('../models/AiChat');
const AiStat = require('../models/AiStat');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Deal = require('../models/Deal');
const importer = require('../services/ai/importer');
const chatService = require('../services/ai/chat');
const provider = require('../services/ai/provider');

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); // Step 6 — suggest-mapping category lookup

const MASK = '••••••••';

/* ───────────── settings ───────────── */
async function settingsGet(_req, res) {
  const view = await AiSetting.adminView();
  const s = view.settings;
  res.json({
    ...view,
    settings: { ...s.toObject(), apiKey: s.apiKey ? MASK : '', openai: { ...s.openai, apiKey: s.openai.apiKey ? MASK : '' } },
  });
}

async function settingsPut(req, res) {
  const s = await AiSetting.get();
  AiSetting.applyUpdate(s, req.body);
  await s.save();
  provider.invalidate();
  const view = await AiSetting.adminView();
  res.json({ ...view, settings: { ...s.toObject(), apiKey: s.apiKey ? MASK : '', openai: { ...s.openai, apiKey: s.openai.apiKey ? MASK : '' } } });
}

/* ───────────── AI product import ───────────── */
async function importCreate(req, res) {
  const cfg = await AiSetting.get();
  if (!cfg.enabled || !cfg.features.import) return res.status(503).json({ message: 'AI import is disabled in settings' });
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : (req.body?.url ? [req.body.url] : []);
  if (!urls.length) return res.status(400).json({ message: 'Paste at least one product URL' });
  try {
    const docs = await importer.stage(urls);
    res.status(201).json({ items: docs.map((d) => d.toJSON()), queued: docs.length });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
}

async function importList(req, res) {
  const { status, limit = 40, page = 1 } = req.query;
  const q = status && status !== 'all' ? { status } : {};
  const parsedLimit = parseInt(limit, 10);
  const parsedPage = parseInt(page, 10);
  const lim = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 40;
  const currentPage = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
  const skip = (currentPage - 1) * lim;
  const [items, total, counts] = await Promise.all([
    AiImport.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim).populate('duplicates.productId', 'name slug').populate('brand', 'name slug').lean(),
    AiImport.countDocuments(q),
    AiImport.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    items, total, page: currentPage, limit: lim, pages: Math.ceil(total / lim) || 1,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  });
}

async function importGet(req, res) {
  const doc = await AiImport.findById(req.params.id).populate('duplicates.productId', 'name slug images').populate('brand', 'name slug').populate('result.productId', 'name slug').lean();
  if (!doc) return res.status(404).json({ message: 'Import not found' });
  res.json({ item: doc });
}

async function importEdit(req, res) {
  const doc = await AiImport.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Import not found' });
  const b = req.body || {};
  if (b.price !== undefined) doc.price = Math.max(0, Number(b.price) || 0);
  if (b.comparePrice !== undefined) doc.comparePrice = b.comparePrice === null || b.comparePrice === '' ? null : Math.max(0, Number(b.comparePrice) || 0);
  if (b.category !== undefined) doc.category = String(b.category).toLowerCase().trim();
  if (b.categoryManual !== undefined) {
    doc.categoryManual = b.categoryManual === true;
    doc.manualCategoryName = doc.categoryManual ? String(b.category || '').trim().slice(0, 80) : '';
  }
  if (b.categoryParent !== undefined) doc.categoryParent = String(b.categoryParent || '').toLowerCase().trim().slice(0, 80);
  if (b.brandId !== undefined) doc.brand = b.brandId && !['none', 'create'].includes(b.brandId) ? b.brandId : null;
  if (b.brandName !== undefined) doc.brandName = String(b.brandName || '').trim().slice(0, 80);
  if (b.warrantyMonths !== undefined) doc.warrantyMonths = Math.max(0, Math.min(240, parseInt(b.warrantyMonths, 10) || 0));
  if (Array.isArray(b.images)) {
    doc.images = b.images
      .filter((image) => image && typeof image.url === 'string' && image.url.trim())
      .slice(0, 12)
      .map((image) => ({
        url: image.url.trim().slice(0, 1200),
        publicId: String(image.publicId || '').slice(0, 300),
      }));
    if (!doc.images.length) return res.status(400).json({ message: 'At least one image is required' });
  }
  if (b.aiContent) {
    for (const k of ['name', 'nameBn', 'shortDesc', 'shortDescBn', 'description', 'descriptionBn']) {
      if (b.aiContent[k] !== undefined) doc.aiContent[k] = b.aiContent[k];
    }
    for (const k of ['specs', 'specsBn']) {
      if (b.aiContent[k] !== undefined) doc.aiContent[k] = b.aiContent[k].map((s) => ({ k: String(s.k).slice(0, 80), v: String(s.v).slice(0, 300) }));
    }
    /* Step 5 — key features are editable before approval too */
    for (const k of ['features', 'featuresBn']) {
      if (b.aiContent[k] !== undefined && Array.isArray(b.aiContent[k])) {
        doc.aiContent[k] = b.aiContent[k].map((f) => String(f || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);
      }
    }
    if (b.aiContent.seo) {
      for (const k of ['metaTitle', 'metaDescription', 'metaKeywords']) {
        if (b.aiContent.seo[k] !== undefined) doc.aiContent.seo[k] = b.aiContent.seo[k];
      }
    }
    doc.aiContent.source = 'admin';
  }
  await doc.save();
  res.json({ item: doc });
}

async function importApprove(req, res) {
  try {
    const b = req.body || {};
    /* Step 6 — UPDATE MODE: a flagged-duplicate import can refresh the EXISTING
       product instead of creating a second one (name/price/images/specs/
       features refresh; stock/sold/rating/sku stay untouched). */
    if (b.mode === 'update') {
      const product = await importer.updateExistingImport(req.params.id, b, req.user, b.targetProductId);
      return res.json({ ok: true, mode: 'update', product: { _id: product._id, name: product.name, slug: product.slug, price: product.price } });
    }
    const product = await importer.approveImport(req.params.id, b, req.user);
    res.json({ ok: true, product: { _id: product._id, name: product.name, slug: product.slug, price: product.price } });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
}

/* Step 6 — IMPORT QUEUE BULK APPROVE. One call approves up to 20 'ready'
   imports with a SHARED category/brand resolution (per-doc guesses still
   apply when the shared values are omitted). Per-item try/catch: one bad
   URL must never sink the batch.
   Step 7 — PER-ROW CATEGORY OVERRIDE (#5): mixed queues no longer need N
   single approvals — items[{id, category?, brandId?}] lets each row land in
   its own category (row values win over shared; rows without an override
   keep the import's own guess). Legacy ids[] + shared fields stay accepted. */
async function importBulkApprove(req, res) {
  try {
    const b = req.body || {};
    /* QA caught the Step 6 silent-truncation: a 25-row call used to approve
       20 and DROP 5 without a word — now the caller gets an explicit 400. */
    if ((Array.isArray(b.items) && b.items.length > 20) || (Array.isArray(b.ids) && b.ids.length > 20)) {
      return res.status(400).json({ message: 'Bulk approve is capped at 20 imports per call — split the queue' });
    }
    let jobs = [];
    if (Array.isArray(b.items)) {
      jobs = b.items.map((it) => ({
        id: String((it && it.id) || ''),
        category: it && it.category !== undefined && String(it.category).trim() ? String(it.category).trim().toLowerCase() : undefined,
        brandId: it && it.brandId !== undefined ? it.brandId : undefined,
      })).filter((j) => /^[a-f\d]{24}$/i.test(j.id));
    } else if (Array.isArray(b.ids)) {
      jobs = b.ids.map((x) => String(x)).filter((x) => /^[a-f\d]{24}$/i.test(x)).map((id) => ({ id }));
    }
    if (!jobs.length) return res.status(400).json({ message: 'Provide ids[] (legacy) or items[{id, category?, brandId?}] — up to 20 import ids per call' });
    const shared = {};
    if (b.category !== undefined && String(b.category).trim()) shared.category = String(b.category).trim().toLowerCase();
    if (b.brandId !== undefined) shared.brandId = b.brandId;
    if (b.active !== undefined) shared.active = b.active;
    const approved = [], failed = [];
    for (const j of jobs) {
      const payload = { ...shared };
      if (j.category) payload.category = j.category;
      if (j.brandId !== undefined) payload.brandId = j.brandId;
      try {
        const p = await importer.approveImport(j.id, payload, req.user);
        approved.push({ id: j.id, slug: p.slug, name: p.name, category: p.category });
      } catch (e) { failed.push({ id: j.id, error: e.message }); }
    }
    res.json({ ok: failed.length === 0, approved, failed, requested: jobs.length });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
}

/* Step 6 — AI-ASSISTED SCHEMA MAPPING. When approving an import, the admin
   gets a per-attribute suggestion: what TYPE the field should be and whether
   it should be a shop filter (RAM → yes, battery weight → no). With an LLM
   configured the model answers first (strict JSON, grounded ONLY in the
   extracted attributes); rules mode / any failure falls back to deterministic
   heuristics — the endpoint ALWAYS answers. */
function heuristicMapping(specs) {
  const NOT_FILTER = /weight|dimension|dimension|warranty|serial|model|note|desc|upc|barcode|asin|sku/i;
  const UNIT_RE = /(%|gb|mb|tb|ghz|mhz|hz|w\b|watt|mah|wh|v\b|inch|"|mm|cm|km|kg|g\b|lb|l\b|ml|rpm| lum|nit|ansi)/i;
  const BOOL_RE = /^(yes|no|true|false|y|n|হ্যাঁ|না)$/i;
  return (Array.isArray(specs) ? specs : []).map((s) => {
    const k = String((s && s.k) || '').trim();
    const v = String((s && s.v) == null ? '' : s.v).trim();
    let type = 'text';
    if (BOOL_RE.test(v)) type = 'boolean';
    else if (/^-?\d+(\.\d+)?$/.test(v.replace(/\s/g, '')) || (UNIT_RE.test(v) && /^\d/.test(v))) type = 'number';
    else if (v.length <= 24 && !/[.;।]/.test(v)) type = 'select';
    const filterable = !NOT_FILTER.test(k) && v.length <= 40 && (type === 'number' || type === 'select' || type === 'boolean');
    return { k, type, filterable, reason: type === 'number' ? 'numeric value' : type === 'boolean' ? 'yes/no value' : type === 'select' ? 'short categorical value' : 'free text', source: 'rules' };
  });
}

async function importSuggestMapping(req, res) {
  try {
    const doc = await AiImport.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Import not found' });
    const pickList = (...cands) => cands.find((x) => Array.isArray(x) && x.length) || [];
    const specs = pickList(doc.aiContent && doc.aiContent.specs, doc.extracted && doc.extracted.specs)
      .map((s) => ({ k: String(s.k || ''), v: String(s.v == null ? '' : s.v) }));
    if (!specs.length) return res.json({ suggestions: [], provider: 'none' });

    /* category context — existing field keys keep the suggestions grounded */
    const catSlug = slugify(doc.category || doc.categoryGuess || '');
    let existingKeys = [];
    if (catSlug) {
      const cat = await Category.findOne({ slug: catSlug }).select('specGroups').lean();
      existingKeys = cat ? (cat.specGroups || []).flatMap((g) => (g.fields || []).map((f) => ({ k: f.key, label: f.label, type: f.type, filterable: !!f.filterable }))) : [];
    }

    let suggestions = null, providerUsed = 'rules';
    try {
      const rt = await provider.resolve();
      if (rt.provider !== 'rules') {
        const out = await provider.complete({
          system: 'You map e-commerce spec attributes onto a product schema. Answer STRICT JSON only: {"suggestions":[{"k":"<attribute name>","type":"text|number|select|boolean","filterable":true|false}]}. Rules: short categorical values (RAM size, color, brand) → filterable=true; free text, weights, dimensions, serials, long values → filterable=false. Numbers with units → type number. Yes/no values → type boolean. ONLY use attribute names from the provided list.',
          messages: [{ role: 'user', content: 'Extracted attributes:\n' + specs.map((s) => `- k: ${s.k} · v: ${s.v.slice(0, 60)}`).join('\n') + '\n\nExisting schema fields: ' + JSON.stringify(existingKeys.slice(0, 30)) }],
          json: true,
          temperature: 0.2,
          maxTokens: 700,
          timeoutMs: 12000,
        });
        const parsed = provider.parseJsonLoose(out.text);
        const list = parsed && Array.isArray(parsed.suggestions) ? parsed.suggestions : (Array.isArray(parsed) ? parsed : null);
        if (list) {
          const known = new Set(specs.map((s) => s.k.toLowerCase()));
          suggestions = list
            .filter((s) => s && known.has(String(s.k || '').toLowerCase()))
            .map((s) => ({
              k: String(s.k).trim(),
              type: ['text', 'number', 'select', 'boolean'].includes(s.type) ? s.type : 'text',
              filterable: Boolean(s.filterable),
              reason: 'AI suggested',
              source: rt.provider,
            }));
          providerUsed = rt.provider;
        }
      }
    } catch (_e) { /* provider unavailable → rules fallback */ }
    if (!suggestions) suggestions = heuristicMapping(specs);

    /* merge: AI suggestions first; attributes the model skipped keep rules */
    const aiKeys = new Set(suggestions.map((s) => s.k.toLowerCase()));
    const merged = [...suggestions, ...heuristicMapping(specs).filter((s) => !aiKeys.has(s.k.toLowerCase()))];
    res.json({ suggestions: merged, provider: providerUsed, category: catSlug || null, existing: existingKeys.length });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function importReject(req, res) {
  const doc = await AiImport.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true });
  if (!doc) return res.status(404).json({ message: 'Import not found' });
  res.json({ item: doc });
}

/* Step 7 — UPDATE-MODE DIFF VIEW (#4): side-by-side "staged vs current" for
   the flagged-duplicate target BEFORE the admin applies the refresh. Pure
   read (importer.updateDiff) — rows, specs delta, schema-growth preview. */
async function importUpdateDiff(req, res) {
  try {
    res.json(await importer.updateDiff(req.params.id, req.query.target));
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
}

async function importRetry(req, res) {
  const doc = await AiImport.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Import not found' });
  const updatedAt = new Date(doc.updatedAt || doc.createdAt).getTime();
  const stale = ['pending', 'processing'].includes(doc.status) &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt >= importer.IMPORT_STALE_MS;
  if (doc.status !== 'failed' && !stale) {
    return res.status(409).json({ message: 'Only failed or stalled imports can be retried' });
  }
  const queued = await AiImport.findOneAndUpdate(
    { _id: doc._id, status: doc.status, updatedAt: doc.updatedAt },
    {
      $set: { status: 'pending', error: '', progress: 0 },
      $unset: { processingToken: 1 },
    },
    { new: true },
  );
  if (!queued) return res.status(409).json({ message: 'Import changed before it could be retried' });
  importer.processImport(queued._id).catch((error) => {
    console.error(`[ai-import] retry failed for ${queued._id}:`, error.message);
  });
  res.json({ item: queued });
}

async function importDelete(req, res) {
  const doc = await AiImport.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Import not found' });
  res.json({ ok: true });
}

/* ───────────── knowledge sources ───────────── */
async function faqList(_req, res) {
  const items = await AiFaq.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
  res.json({ items });
}

function faqPayload(b) {
  return {
    q: String(b.q || '').trim(),
    a: String(b.a || '').trim(),
    qBn: String(b.qBn || '').trim(),
    aBn: String(b.aBn || '').trim(),
    topic: String(b.topic || 'general').toLowerCase().trim().slice(0, 40),
    tags: (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10),
    active: b.active !== false,
    sortOrder: parseInt(b.sortOrder, 10) || 0,
  };
}

async function faqCreate(req, res) {
  const p = faqPayload(req.body || {});
  if (!p.q || !p.a) return res.status(400).json({ message: 'Question and answer are required' });
  res.status(201).json({ item: await AiFaq.create(p) });
}

async function faqUpdate(req, res) {
  const doc = await AiFaq.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'FAQ not found' });
  const p = faqPayload({ ...doc.toObject(), ...req.body });
  if (!p.q || !p.a) return res.status(400).json({ message: 'Question and answer are required' });
  Object.assign(doc, p);
  await doc.save();
  res.json({ item: doc });
}

async function faqDelete(req, res) {
  const doc = await AiFaq.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'FAQ not found' });
  res.json({ ok: true });
}

/* knowledge coverage snapshot — what the assistant can actually see */
async function knowledgeStats(_req, res) {
  const [products, categories, brands, deals, faqs, bundles, imports] = await Promise.all([
    Product.countDocuments({ active: { $ne: false } }),
    Category.countDocuments({}),
    Brand.countDocuments({}),
    Deal.countDocuments({ published: true, active: true }),
    AiFaq.countDocuments({ active: true }),
    require('../models/ComboBundle').countDocuments({ active: true }),
    AiImport.countDocuments({}),
  ]);
  const cfg = await AiSetting.get();
  res.json({
    sources: { products, categories, brands, deals, faqs, bundles, imports },
    knowledge: cfg.knowledge,
    note: 'Retrieval reads ONLY whitelisted public projections — customer PII never enters AI context.',
  });
}

/* ───────────── chat history ───────────── */
async function chatList(req, res) {
  const { limit = 40, page = 1, channel, q } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 40, 100);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
  const query = {};
  if (channel && channel !== 'all') query.channel = channel;
  if (q) query['messages.text'] = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [items, total] = await Promise.all([
    AiChat.find(query).sort({ lastMessageAt: -1 }).skip(skip).limit(lim)
      .select('sessionKey user channel lang lastIntent messageCount lastMessageAt messages.0 messages.1 createdAt')
      .populate('user', 'name email').lean(),
    AiChat.countDocuments(query),
  ]);
  res.json({ items, total, page: parseInt(page, 10) || 1, pages: Math.ceil(total / lim) || 1 });
}

async function chatGet(req, res) {
  const doc = await AiChat.findById(req.params.id).populate('user', 'name email').lean();
  if (!doc) return res.status(404).json({ message: 'Session not found' });
  res.json({ item: doc });
}

async function chatDelete(req, res) {
  const doc = await AiChat.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Session not found' });
  res.json({ ok: true });
}

/* admin test console — full pipeline, flagged channel so analytics split it out */
async function chatTest(req, res) {
  try {
    const out = await chatService.respond({
      message: req.body?.message,
      sessionKey: String(req.body?.sessionKey || '').slice(0, 80) || `test-${Date.now().toString(36)}`,
      user: null,
      channel: 'admin-test',
    });
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

/* ───────────── analytics ───────────── */
async function analytics(_req, res) {
  const days = await AiStat.range(7);
  const totals = days.reduce(
    (a, d) => ({
      chats: a.chats + (d.chats || 0),
      sessions: a.sessions + (d.sessions || 0),
      promptTokens: a.promptTokens + (d.tokens?.prompt || 0),
      completionTokens: a.completionTokens + (d.tokens?.completion || 0),
    }),
    { chats: 0, sessions: 0, promptTokens: 0, completionTokens: 0 }
  );

  const intentAgg = {};
  const langAgg = {};
  const provAgg = {};
  for (const d of days) {
    for (const [k, v] of Object.entries(d.intents || {})) intentAgg[k] = (intentAgg[k] || 0) + v;
    for (const [k, v] of Object.entries(d.langs || {})) langAgg[k] = (langAgg[k] || 0) + v;
    for (const [k, v] of Object.entries(d.providerCalls || {})) provAgg[k] = (provAgg[k] || 0) + v;
  }

  /* top customer questions (last 100 turns) */
  const sessions = await AiChat.find({ channel: 'web' }).sort({ lastMessageAt: -1 }).limit(60).select('messages').lean();
  const questions = [];
  for (const s of sessions) for (const m of s.messages || []) if (m.role === 'user') questions.push({ text: m.text.slice(0, 120), at: m.at, intent: m.intent, lang: m.lang });
  const topQ = Object.entries(
    questions.reduce((acc, q) => {
      const key = q.text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 70);
      acc[key] = acc[key] || { text: key, n: 0, intent: q.intent, lang: q.lang, last: q.at };
      acc[key].n++;
      if (new Date(q.at) > new Date(acc[key].last)) acc[key].last = q.at;
      return acc;
    }, {})
  ).map(([, v]) => v).sort((a, b) => b.n - a.n).slice(0, 8);

  let importFunnel = {};
  try {
    const rows = await AiImport.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    importFunnel = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  } catch (_) { /* non-fatal */ }

  const cfg = await AiSetting.get();
  const rt = await AiSetting.resolveProvider();
  res.json({
    days: days.map((d) => ({ day: d.day, chats: d.chats || 0, sessions: d.sessions || 0 })),
    totals: { ...totals, costNote: rt.provider === 'rules' ? 'rules mode — 0 tokens, fully grounded' : `${rt.provider} tokens used` },
    intents: intentAgg,
    langs: langAgg,
    providerCalls: provAgg,
    effectiveProvider: rt.provider,
    topQuestions: topQ,
    imports: importFunnel,
    enabled: cfg.enabled,
  });
}

/* Express 4 does not auto-catch async handler throws — an unhandled rejection
   would kill the whole API process (learned the hard way in QA). Wrap every
   AI admin handler so any unexpected error becomes a clean JSON 500. */
const W = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  if (res && !res.headersSent) res.status(e.status || 500).json({ message: e.message || 'AI console error' });
});

module.exports = {
  settingsGet: W(settingsGet), settingsPut: W(settingsPut),
  importCreate: W(importCreate), importList: W(importList), importGet: W(importGet), importEdit: W(importEdit),
  importApprove: W(importApprove), importBulkApprove: W(importBulkApprove), importSuggestMapping: W(importSuggestMapping),
  importUpdateDiff: W(importUpdateDiff),
  importReject: W(importReject), importRetry: W(importRetry), importDelete: W(importDelete),
  faqList: W(faqList), faqCreate: W(faqCreate), faqUpdate: W(faqUpdate), faqDelete: W(faqDelete),
  knowledgeStats: W(knowledgeStats),
  chatList: W(chatList), chatGet: W(chatGet), chatDelete: W(chatDelete), chatTest: W(chatTest),
  analytics: W(analytics),
};

module.exports._raw = {
  settingsGet, settingsPut,
  importCreate, importList, importGet, importEdit, importApprove, importBulkApprove, importSuggestMapping, importUpdateDiff, importReject, importRetry, importDelete,
  faqList, faqCreate, faqUpdate, faqDelete, knowledgeStats,
  chatList, chatGet, chatDelete, chatTest,
  analytics,
};
