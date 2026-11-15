const mongoose = require('mongoose');
const { GEMINI_DEFAULT_MODEL, normalizeGeminiModel } = require('../config/aiModels');

/* ════════════════════════════════════════════════════════════════════
   AI SYSTEM — singleton settings document (key = 'ai').

   Everything the AI stack needs at runtime, admin-managed from
   Admin → AI Console → Settings with NO redeploy:

     provider … 'auto' (DB config → env key → deterministic rules),
                'gemini' (Google AI Studio REST), 'openai' (ANY
                OpenAI-compatible endpoint: Ollama / vLLM / LM Studio /
                OpenRouter — open-source models), 'rules' (zero-cost,
                fully grounded template composer — can never hallucinate).

   SECURITY MODEL
     · The API key lives server-side only (DB, or GEMINI_API_KEY env as
       fallback). Every admin GET returns it masked '••••••••'; saving
       while the mask is present keeps the stored value (same pattern as
       the SSLCOMMERZ gateway storePasswd).
     · The LLM NEVER talks to MongoDB. All facts flow through the RAG
       layer (services/ai/rag.js) which projects whitelisted fields and
       strips every private customer attribute (phones, addresses,
       emails, payment details) before anything reaches a prompt.
   ════════════════════════════════════════════════════════════════════ */

const aiSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'ai', unique: true },

    enabled: { type: Boolean, default: true }, // master switch — off hides the widget + 503s the chat API

    provider: { type: String, enum: ['auto', 'gemini', 'openai', 'rules'], default: 'auto' },
    model: { type: String, default: GEMINI_DEFAULT_MODEL, trim: true, maxlength: 80 },
    apiKey: { type: String, default: '', trim: true }, // server-side only — masked on every GET
    openai: {
      baseUrl: { type: String, default: '', trim: true, maxlength: 300 }, // e.g. http://127.0.0.1:11434/v1 (Ollama)
      model: { type: String, default: '', trim: true, maxlength: 80 },
      apiKey: { type: String, default: '', trim: true }, // optional for local servers — masked on GET
    },
    temperature: { type: Number, default: 0.4, min: 0, max: 1 },
    maxOutputTokens: { type: Number, default: 700, min: 100, max: 4000 },
    timeoutMs: { type: Number, default: 30000, min: 3000, max: 60000 },

    features: {
      chat: { type: Boolean, default: true },      // customer support assistant
      import: { type: Boolean, default: true },    // AI product import
      recommend: { type: Boolean, default: true }, // recommendations & comparisons inside chat
    },

    chat: {
      greeting: { type: String, default: 'Hi! I am the ArixGear AI assistant. Ask me about any product, price, stock, order status or delivery — Bangla or English.', trim: true, maxlength: 400 },
      greetingBn: { type: String, default: 'আসসালামু আলাইকুম! আমি ArixGear এআই অ্যাসিস্ট্যান্ট। যেকোনো প্রোডাক্ট, দাম, স্টক, অর্ডার স্ট্যাটাস বা ডেলিভারি নিয়ে বাংলা বা ইংরেজিতে প্রশ্ন করুন।', trim: true, maxlength: 400 },
      suggestions: { type: [String], default: ['Best gaming laptop under 150000', 'Any deals running now?', 'Delivery time outside Dhaka?'] },
      suggestionsBn: { type: [String], default: ['১ লাখের মধ্যে গেমিং ল্যাপটপ?', 'এখন কোন অফার চলছে?', 'ঢাকার বাইরে ডেলিভারি কত দিন?'] },
      maxHistory: { type: Number, default: 8, min: 2, max: 24 }, // follow-up context window (messages)
      systemPrompt: { type: String, default: '', maxlength: 2000 }, // optional override appended to the base grounding rules
    },

    import: {
      maxBatch: { type: Number, default: 10, min: 1, max: 25 },       // URLs per bulk request
      maxImages: { type: Number, default: 8, min: 1, max: 12 },       // images kept per import
      uploadToCloudinary: { type: Boolean, default: true },            // re-host extracted images when Cloudinary is configured
      defaultCategory: { type: String, default: '', trim: true, lowercase: true, maxlength: 80 },
      allowHosts: { type: String, default: '', trim: true, maxlength: 300 }, // extra fetch allowlist (QA / trusted sources) — prod keeps this empty
    },

    knowledge: {
      maxProducts: { type: Number, default: 6, min: 1, max: 12 },   // product cards packed into one answer context
      maxFaqs: { type: Number, default: 4, min: 0, max: 10 },
      includeDeals: { type: Boolean, default: true },
      includePolicies: { type: Boolean, default: true },            // shipping / payment / store facts from Settings
    },
  },
  { timestamps: true }
);

aiSettingSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'ai' });
  if (!doc) doc = await this.create({ key: 'ai' });
  const normalized = normalizeGeminiModel(doc.model);
  if (doc.model !== normalized || doc.timeoutMs < 30000) {
    doc.model = normalized;
    if (doc.timeoutMs < 30000) doc.timeoutMs = 30000;
    await doc.save();
  }
  return doc;
};

/** Effective provider resolution — DB config first, env fallback, rules floor.
 *  Returned shape: { provider, model, key, keySource, baseUrl } */
aiSettingSchema.statics.resolveProvider = async function () {
  const s = await this.get();
  const envGemini = process.env.GEMINI_API_KEY || '';
  const envOpenai = process.env.OPENAI_API_KEY || '';
  const envBase = process.env.OPENAI_BASE_URL || '';

  const want = s.provider === 'auto' ? (process.env.AI_PROVIDER || 'auto') : s.provider;
  let provider = want === 'auto' ? 'rules' : want;
  let model = normalizeGeminiModel(s.model || process.env.AI_MODEL || GEMINI_DEFAULT_MODEL);
  let key = s.apiKey || envGemini;
  let keySource = s.apiKey ? 'db' : envGemini ? 'env' : 'none';
  let baseUrl = s.openai.baseUrl || envBase;
  let openaiModel = s.openai.model || process.env.OPENAI_MODEL || '';
  let openaiKey = s.openai.apiKey || envOpenai;

  if (want === 'auto') {
    if (key) { provider = 'gemini'; }
    else if (baseUrl) { provider = 'openai'; }
    else provider = 'rules';
  }
  if (provider === 'gemini' && !key) provider = 'rules';
  if (provider === 'openai' && !baseUrl) provider = 'rules';

  return { provider, model, key, keySource, baseUrl, openaiModel, openaiKey, temperature: s.temperature, maxOutputTokens: s.maxOutputTokens, timeoutMs: s.timeoutMs };
};

/** Admin-facing view — secrets masked. A save carrying the mask keeps the stored value. */
aiSettingSchema.statics.adminView = async function () {
  const s = await this.get();
  const rt = await this.resolveProvider();
  return {
    settings: s,
    runtime: {
      effectiveProvider: rt.provider,
      keyConfigured: rt.keySource !== 'none' || Boolean(rt.openaiKey),
      keySource: rt.keySource,
      cloudinary: Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)),
      rulesMode: rt.provider === 'rules',
    },
  };
};

/** Apply a partial admin update — masks stay opaque, enums guarded. */
aiSettingSchema.statics.applyUpdate = function (doc, body) {
  const MASK = '••••••••';
  const b = body || {};
  const pick = (o, keys) => { const out = {}; for (const k of keys) if (o[k] !== undefined) out[k] = o[k]; return out; };

  const top = pick(b, ['enabled', 'provider', 'model', 'temperature', 'maxOutputTokens', 'timeoutMs']);
  for (const k of Object.keys(top)) doc[k] = k === 'model' ? normalizeGeminiModel(top[k]) : top[k];
  if (b.apiKey !== undefined && b.apiKey !== MASK) doc.apiKey = String(b.apiKey).trim();
  if (b.openai) {
    const o = pick(b.openai, ['baseUrl', 'model']);
    for (const k of Object.keys(o)) doc.openai[k] = o[k];
    if (b.openai.apiKey !== undefined && b.openai.apiKey !== MASK) doc.openai.apiKey = String(b.openai.apiKey).trim();
  }
  for (const block of ['features', 'chat', 'import', 'knowledge']) {
    if (b[block] && typeof b[block] === 'object') {
      for (const k of Object.keys(b[block])) {
        if (doc[block][k] !== undefined) doc[block][k] = b[block][k];
      }
    }
  }
  return doc;
};

module.exports = mongoose.model('AiSetting', aiSettingSchema);
