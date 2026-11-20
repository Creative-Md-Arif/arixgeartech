/* AI SYSTEM — public storefront endpoints (mounted at /api/ai).
   Guest-friendly; a customer JWT (when present) personalizes session
   ownership but the assistant NEVER returns private data to anyone. */

const AiSetting = require('../models/AiSetting');
const AiFaq = require('../models/AiFaq');
const chatService = require('../services/ai/chat');

/* GET /api/ai/config — widget bootstrap (enabled flag, greeting, suggestions) */
async function config(_req, res) {
  const cfg = await AiSetting.get();
  const rt = await AiSetting.resolveProvider();
  res.json({
    enabled: Boolean(cfg.enabled && cfg.features.chat),
    greeting: cfg.chat.greeting,
    greetingBn: cfg.chat.greetingBn,
    suggestions: (cfg.chat.suggestions || []).filter(Boolean),
    suggestionsBn: (cfg.chat.suggestionsBn || []).filter(Boolean),
    provider: rt.provider === 'rules' ? 'grounded' : rt.provider, 
  });
}

/* POST /api/ai/chat — one customer turn (sessionKey carries the follow-up thread) */
async function chat(req, res) {
  try {
    const out = await chatService.respond({
      message: req.body?.message,
      sessionKey: String(req.body?.sessionKey || '').slice(0, 80) || `web-${req.ip}-${Date.now().toString(36)}`,
      user: req.user?._id || null,
      channel: 'web',
    });
    res.json(out);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[ai] chat failed:', e.message);
    res.status(status).json({ message: status >= 500 ? 'The assistant is unavailable right now — please try again or leave us a message.' : e.message });
  }
}

/* GET /api/ai/faqs — knowledge FAQs the widget can show without asking */
async function faqs(_req, res) {
  const rows = await AiFaq.find({ active: true }).sort({ sortOrder: 1, createdAt: -1 }).limit(30).lean();
  res.json({ items: rows.map((f) => ({ _id: f._id, q: f.q, a: f.a, qBn: f.qBn, aBn: f.aBn, topic: f.topic })) });
}

/* Express 4 async-safety wrapper (see aiAdminController for rationale) */
const W = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  if (res && !res.headersSent) res.status(e.status || 500).json({ message: e.message || 'AI assistant error' });
});

module.exports = { config: W(config), chat: W(chat), faqs: W(faqs) };
