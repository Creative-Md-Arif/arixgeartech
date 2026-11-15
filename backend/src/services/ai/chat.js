/* ════════════════════════════════════════════════════════════════════
   AI CHAT PIPELINE — Smart Customer Support.

   message → language detect → intent classify (free, rule-based — the
   LLM is NEVER used for routing) → RAG retrieval → grounded composition:

     · LLM configured  → strict system prompt: answer ONLY from the
       FACTS block; unknown ⇒ admit it + offer human chat. Personal
       data is masked out of the prompt.
     · no LLM (rules mode / failure) → deterministic composer builds
       the answer from the SAME retrieved facts. It cannot invent.

   Follow-ups: short replies ("and the second one?", "দ্বিতীয়টার দাম?")
   resolve against the products attached to the session's previous turn.
   Comparisons, budget recommendations and order-status questions each
   have their own composer — all grounded in DB reads.
   ════════════════════════════════════════════════════════════════════ */

const AiSetting = require('../../models/AiSetting');
const AiChat = require('../../models/AiChat');
const AiStat = require('../../models/AiStat');
const provider = require('./provider');
const rag = require('./rag');

const BN_RE = /[\u0980-\u09FF]/;
const detectLang = (t) => (BN_RE.test(String(t || '')) ? 'bn' : 'en');

const INTENTS = {
  order: /(?:order\s*(?:no|number|id|status)?|track|shipping\s+status|ARG-[A-Z0-9]+|অর্ডার|ট্র্যাক|অর্ডারের\s*অবস্থা)/i,
  compare: /\b(?:vs\.?|versus|compare|comparison|difference(?:\s+between)?|better)\b|তুলনা|পার্থক্য|কোনটা?\s*(?:ভাল|ভালো)/i,
  deals: /\b(?:deal|deals|offer|offers|discount|sale|promo|campaign)\b|ডিল|অফার|ছাড়|সেল|ক্যাম্পেইন/i,
  policy: /\b(?:deliver|delivery|shipping|ship|charge|courier|warranty|warrant|guarantee|return|refund|replace|payment|pay|cod|bkash|nagad|rocket|installment|emi)\b|ডেলিভারি|শিপিং|ওয়ারেন্টি|গ্যারান্টি|রিটার্ন|রিফান্ড|পেমেন্ট|কুরিয়ার|ইএমআই/i,
  greeting: /^\s*(?:hi+|hello+|hey+|yo|assalam(?:u)?\s*alaikum|salam|good\s*(?:morning|evening|afternoon)|হ্যালো|হাই|আসসালামু?\s*আলাইকুম|সালাম)\s*[!.?]*\s*(?:there|arixgear)?\s*$/i,
  recommend: /\b(?:best|top|suggest|suggestion|recommend|recommendation|good|budget|under|within|cheap(?:est)?|value|which|looking\s+for|show\s*me|any)\b|সুপারিশ|ভালো?টা|কোন(?:টা|টি)?\s*(?:ল্যাপটপ|ফোন|মনিটর|নেওয়া)?|বাজেট|মধ্যে|দাম\s*কত/i,
};

const ORDER_NO_RE = /\b([A-Z]{2,8}-[A-Z0-9]{2,12})\b/i;
const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const normalizeBnDigits = (t) => String(t).replace(/[০-৯]/g, (d) => BN_DIGITS[d] || d);
/* "under 60000" · "৳50k" · "within 1,20,000 tk" · "৫০ হাজারের মধ্যে" · "১ লাখের মধ্যে" */
function parseBudget(textRaw) {
  const text = normalizeBnDigits(textRaw);
  const t = String(text || '').toLowerCase();
  let m = t.match(/(?:under|below|within|upto|up\s*to|max|less\s*than)\s*(?:৳|tk\.?|bdt)?\s*([\d,]+(?:\.\d+)?)\s*(k\b|thousand|হাজার|লাখ|lakh|কোটি|crore)?/);
  if (!m) m = t.match(/([\d,]+(?:\.\d+)?)\s*(k\b|thousand|হাজার|লাখ|lakh|কোটি|crore)\s*(?:মধ্যে|এর\s*মধ্যে|budget|টাকার)?/);
  if (!m) m = t.match(/(?:৳|tk\.?|bdt)\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(n)) return null;
  const unit = (m[2] || '') + m[0];
  if (/লাখ|lakh/.test(unit)) n *= 100000;
  else if (/কোটি|crore/.test(unit)) n *= 10000000;
  else if (/k\b|thousand|হাজার/.test(unit)) n *= 1000;
  return n > 500 && n < 100000000 ? Math.round(n) : null;
}

function classify(text) {
  const t = String(text || '');
  if (ORDER_NO_RE.test(t) && INTENTS.order.test(t)) return 'order';
  if (ORDER_NO_RE.test(t)) return 'order';
  if (INTENTS.compare.test(t)) return 'compare';
  if (INTENTS.order.test(t)) return 'order';
  if (INTENTS.greeting.test(t)) return 'greeting';
  if (INTENTS.deals.test(t)) return 'deals';
  if (INTENTS.policy.test(t)) return 'policy';
  if (INTENTS.recommend.test(t)) return 'recommend';
  return 'product';
}

/* follow-up resolution — "what about the second one?" */
const ORDINAL = { first: 0, second: 1, third: 2, '2nd': 1, '3rd': 2, '1st': 0, 'প্রথম': 0, 'দ্বিতীয়': 1, 'তৃতীয়': 2 };
function resolveFollowUp(text, lastProducts) {
  if (!lastProducts || !lastProducts.length) return null;
  const t = String(text || '').toLowerCase();
  const short = t.trim().split(/\s+/).length <= 8;
  const isFollow = short && /(it|this|that|the\s*(?:first|second|third)|\b[123](?:st|nd|rd)\b|এটা|এটি|ওটা|প্রথম|দ্বিতীয়|তৃতীয়)/.test(t) && !/order|অর্ডার/.test(t);
  if (!isFollow) return null;
  for (const [w, i] of Object.entries(ORDINAL)) if (t.includes(w)) return lastProducts[Math.min(i, lastProducts.length - 1)];
  return lastProducts[0];
}

/* split "A vs B" into two sides */
function compareSides(text) {
  const t = String(text || '').replace(/\b(?:compare|comparison|difference\s+between|between|and|versus|তুলনা\s*করো?|এর\s*সাথে|পার্থক্য)\b/gi, ' ');
  const parts = t.split(/\s*(?:\bvs\.?\b|\bversus\b|বনাম|নাকি)\s*/i).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts.slice(1).join(' ')] : null;
}

/* ---------- PII masking for anything that reaches a prompt ---------- */
function maskPII(text) {
  return String(text || '')
    .replace(/(?:\+?88)?01[3-9]\d{8}/g, '[phone]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    /* audit fix — the card pattern only matched 12 of 16 digits and missed
       dash separators; a full card number leaked its last 4 digits */
    .replace(/\b(?:\d{4}[\s-]?){3}\d{4}\b/g, '[card]');
}

/* ---------- facts → prompt block ---------- */
function factsBlock({ facts = [], cards = [], deals = [], bundles = [], faqs = [], orders = [] }) {
  const lines = [];
  for (const f of facts) lines.push('- ' + f);
  for (const o of orders) {
    if (o.needsPhone) { lines.push(`- Order ${o.orderNo}: details are phone-verified only — tell the customer to send the last 6 digits of their checkout phone.`); continue; }
    lines.push(`- Order ${o.orderNo}: status "${o.status}" (payment: ${o.paymentStatus || 'n/a'}, ${o.method || ''}), placed ${o.placedAt ? new Date(o.placedAt).toISOString().slice(0, 10) : '?'}, total ${o.grandLabel}. Items: ${(o.items || []).map((i) => `${i.name} x${i.qty}`).join(', ') || 'n/a'}.`);
    if (o.timeline?.length) lines.push(`  timeline: ${o.timeline.map((t) => `${t.status} @ ${new Date(t.at).toISOString().slice(0, 16).replace('T', ' ')}`).join(' → ')}`);
  }
  for (const p of cards) {
    lines.push(`- PRODUCT ${p.name}${p.nameBn ? ' / ' + p.nameBn : ''} [${p.slug}] — price ${p.priceLabel}${p.comparePrice ? ' (was ' + rag.money(p.comparePrice) + ')' : ''}, ${p.inStock ? 'in stock (' + p.stock + ')' : 'out of stock'}, rating ${p.rating}/5 (${p.reviews} reviews)${p.warrantyMonths ? ', ' + p.warrantyMonths + '-month warranty' : ''}${p.brandName ? ', brand ' + p.brandName : ''}${p.category ? ', category ' + p.category : ''}. ${p.shortDesc || ''}`);
  }
  for (const d of deals) {
    const w = d.window || {};
    lines.push(`- DEAL ${d.name}${d.nameBn ? ' / ' + d.nameBn : ''} [${d.slug}] type=${d.type}${d.badge ? ' badge=' + d.badge : ''}: ${(d.discount?.kind === 'fixed' ? '৳' + d.discount?.value + ' off' : d.discount?.value ? d.discount?.value + '% off' : '') || (d.bogo ? `buy ${d.bogo.buyQty} get ${d.bogo.getQty} free` : '')}${w.endsAt ? ' — ends ' + new Date(w.endsAt).toISOString().slice(0, 10) : ''}`);
  }
  for (const b of bundles) lines.push(`- COMBO BUNDLE ${b.title}${b.titleBn ? ' / ' + b.titleBn : ''} [${b.slug}] — bundle price ${rag.money(b.price)}, components: ${(b.items || []).map((i) => `${(i.name || 'item')} x${i.qty || 1}`).join(' + ')}`);
  for (const f of faqs) lines.push(`- FAQ Q: ${f.q}${f.qBn ? ' / ' + f.qBn : ''} → A: ${f.a}${f.aBn ? ' / ' + f.aBn : ''}`);
  return lines.join('\n');
}

/* ---------- grounded system prompt ---------- */
function systemPrompt(lang, extra) {
  return [
    'You are the ArixGear AI support assistant for arixgear.tech — a Bangladeshi tech & gadget e-commerce store (BDT ৳ pricing).',
    'RULES (absolute):',
    '1. Answer ONLY from the FACTS block provided with this message. Never invent products, prices, stock, order numbers, policies or dates.',
    '2. If the FACTS block does not contain the answer, say you do not have that information and suggest the human contact options.',
    '3. NEVER reveal, mention or hint at any customer personal data (names, phones, emails, addresses).',
    '4. ' + (lang === 'bn' ? 'Reply in natural Bangla (Bengali script).' : 'Reply in natural English.') + ' Keep it short, warm and practical (max ~120 words).',
    '5. Currency is Bangladeshi Taka — write prices like ৳74,500. Never convert currencies.',
    '6. You may recommend only products present in the FACTS block, matching what the customer asked for.',
    extra ? 'EXTRA STORE GUIDANCE: ' + extra : '',
  ].filter(Boolean).join('\n');
}

/* ---------- deterministic rules composer (zero-cost, zero-hallucination) ---------- */
function composeGreeting(cfg, lang) {
  return lang === 'bn' ? (cfg.chat.greetingBn || cfg.chat.greeting) : cfg.chat.greeting;
}

function composeProducts(cards, lang, opts = {}) {
  if (!cards.length) {
    return lang === 'bn'
      ? 'দুঃখিত — আপনার প্রশ্নের সাথে মিলে যাওয়া কোনো প্রোডাক্ট খুঁজে পেলাম না। অন্য কোনো নাম বা ক্যাটাগরি দিয়ে চেষ্টা করুন, অথবা হিউম্যান সাপোর্টে মেসেজ করুন।'
      : "I couldn't find a product matching that in the catalog. Try another name or category — or leave us a message and a human will reply within an hour.";
  }
  const head = opts.budget
    ? (lang === 'bn' ? `৳${opts.budget.toLocaleString('en-US')}-এর মধ্যে যেগুলো আছে:` : `Within ৳${opts.budget.toLocaleString('en-US')}, here is what we have:`)
    : (lang === 'bn' ? 'এগুলো মিলে গেছে:' : 'Here is what matched:');
  const lines = cards.map((p, i) => {
    const st = p.inStock ? (lang === 'bn' ? 'স্টকে আছে' : 'in stock') : (lang === 'bn' ? 'স্টক শেষ' : 'out of stock');
    const w = p.warrantyMonths ? (lang === 'bn' ? `, ${p.warrantyMonths} মাস ওয়ারেন্টি` : `, ${p.warrantyMonths}-month warranty`) : '';
    return `${i + 1}. ${lang === 'bn' && p.nameBn ? p.nameBn : p.name} — ${p.priceLabel}${p.comparePrice ? ` (was ${rag.money(p.comparePrice)})` : ''}, ${st}${w}${p.rating ? `, ★${p.rating}` : ''}`;
  });
  const foot = lang === 'bn' ? 'যেকোনোটার ছবিতে ক্লিক করে বিস্তারিত দেখুন।' : 'Tap any card for full details, specs and variants.';
  return [head, ...lines, foot].join('\n');
}

function composeOrder(o, lang) {
  if (!o) {
    return lang === 'bn'
      ? 'এই অর্ডার নম্বর দিয়ে কিছু খুঁজে পেলাম না। নম্বরটি একবার চেক করুন (যেমন ARG-XXXXXX) — অথবা ট্র্যাক অর্ডার পেজ ব্যবহার করুন।'
      : "I couldn't find that order number. Double-check it (like ARG-XXXXXX) or use the Track Order page.";
  }
  /* audit fix — privacy gate: without the checkout phone the assistant only
     confirms the order EXISTS; status/items/totals need the last-6 proof. */
  if (o.needsPhone) {
    return lang === 'bn'
      ? `অর্ডার ${o.orderNo} খুঁজে পেয়েছি — তবে গোপনীয়তার খাতিরে বিস্তারিত দেখাতে যে ফোন নম্বর দিয়ে অর্ডার করা হয়েছিল তার শেষ ৬ ডিজিট লিখুন।`
      : `I found order ${o.orderNo} — to protect your privacy, send the last 6 digits of the phone number used at checkout and I'll share its status.`;
  }
  const st = lang === 'bn' ? `অর্ডার ${o.orderNo} এখন "${o.status}" অবস্থায় আছে` : `Order ${o.orderNo} is currently "${o.status}"`;
  const pay = o.paymentStatus ? (lang === 'bn' ? `, পেমেন্ট: ${o.paymentStatus} (${o.method || ''})` : `, payment ${o.paymentStatus} (${o.method || ''})`) : '';
  const items = (o.items || []).map((i) => `${i.name} ×${i.qty}`).join(', ');
  const total = lang === 'bn' ? `, মোট ${o.grandLabel}` : `, total ${o.grandLabel}`;
  const tl = (o.timeline || []).length ? (lang === 'bn' ? `\nটাইমলাইন: ${o.timeline.map((t) => t.status).join(' → ')}` : `\nTimeline: ${o.timeline.map((t) => t.status).join(' → ')}`) : '';
  return `${st}${pay}${total}.${items ? '\n' + (lang === 'bn' ? 'আইটেম: ' : 'Items: ') + items : ''}${tl}`;
}

function composeCompare(a, b, lang) {
  if (!a || !b) {
    return lang === 'bn'
      ? 'তুলনা করার জন্য দুটো প্রোডাক্টের নাম দিন — যেমন "ASUS TUF vs Lenovo IdeaPad"।'
      : 'Give me two product names to compare — e.g. "ASUS TUF vs Lenovo IdeaPad".';
  }
  const L = (p) => (lang === 'bn' && p.nameBn ? p.nameBn : p.name);
  const price = (p) => p.priceLabel;
  const stock = (p) => (p.inStock ? (lang === 'bn' ? 'স্টকে' : 'in stock') : (lang === 'bn' ? 'স্টক শেষ' : 'out of stock'));
  return [
    lang === 'bn' ? `তুলনা — ${L(a)} বনাম ${L(b)}:` : `Comparison — ${L(a)} vs ${L(b)}:`,
    `• ${lang === 'bn' ? 'দাম' : 'Price'}: ${price(a)} ${lang === 'bn' ? 'বনাম' : 'vs'} ${price(b)}`,
    `• ${lang === 'bn' ? 'স্টক' : 'Stock'}: ${stock(a)} ${lang === 'bn' ? 'বনাম' : 'vs'} ${stock(b)}`,
    `• ${lang === 'bn' ? 'রেটিং' : 'Rating'}: ★${a.rating || 0} (${a.reviews || 0}) ${lang === 'bn' ? 'বনাম' : 'vs'} ★${b.rating || 0} (${b.reviews || 0})`,
    `• ${lang === 'bn' ? 'ওয়ারেন্টি' : 'Warranty'}: ${a.warrantyMonths || 0}m ${lang === 'bn' ? 'বনাম' : 'vs'} ${b.warrantyMonths || 0}m`,
    a.price !== b.price
      ? (lang === 'bn' ? `→ দামে সেরা: ${a.price < b.price ? L(a) : L(b)}` : `→ Better on price: ${a.price < b.price ? L(a) : L(b)}`)
      : '',
  ].filter(Boolean).join('\n');
}

function composeDeals(deals, bundles, lang) {
  if (!deals.length && !bundles.length) {
    return lang === 'bn'
      ? 'এই মুহূর্তে কোনো চালু অফার নেই — তবে নতুন ক্যাম্পেইন শুরু হলেই Deals পেজে দেখা যাবে।'
      : 'No campaign is live at this moment — new deals appear on the Deals page as soon as they start.';
  }
  const dl = deals.map((d) => {
    const off = d.discount?.kind === 'fixed' ? `৳${d.discount.value} OFF` : d.discount?.value ? `${d.discount.value}% OFF` : (d.bogo ? `Buy ${d.bogo.buyQty} Get ${d.bogo.getQty} Free` : '');
    const w = d.window?.endsAt ? (lang === 'bn' ? ` (${new Date(d.window.endsAt).toISOString().slice(0, 10)} পর্যন্ত)` : ` (until ${new Date(d.window.endsAt).toISOString().slice(0, 10)})`) : '';
    return `• ${d.name}${d.badge ? ` [${d.badge}]` : ''} — ${off}${w}`;
  });
  const bl = bundles.map((b) => `• ${lang === 'bn' && b.titleBn ? b.titleBn : b.title} — ${lang === 'bn' ? 'কম্বো মূল্য' : 'bundle price'} ${rag.money(b.price)}`);
  const head = lang === 'bn' ? 'চলমান অফারগুলো:' : 'Live right now:';
  return [head, ...dl, ...bl, lang === 'bn' ? 'বিস্তারিত: Deals পেজ দেখুন।' : 'Details on the Deals page.'].join('\n');
}

function composePolicy(faqs, facts, lang) {
  if (faqs.length) {
    const f = faqs[0];
    const ans = lang === 'bn' && f.aBn ? f.aBn : f.a;
    return (lang === 'bn' ? f.qBn || f.q : f.q) + '\n' + ans;
  }
  if (facts.length) {
    return lang === 'bn' ? 'আমাদের নিয়ম:\n' + facts.slice(0, 3).map((s) => '• ' + s).join('\n') : 'Here is what we can confirm:\n' + facts.slice(0, 3).map((s) => '• ' + s).join('\n');
  }
  return lang === 'bn'
    ? 'এই বিষয়ে নিশ্চিত তথ্য আমার কাছে নেই — হিউম্যান সাপোর্টে মেসেজ করুন, এক ঘণ্টার মধ্যে উত্তর পাবেন।'
    : "I don't have confirmed information on that — leave a message for the human team and they will reply within an hour.";
}

/* ═══════════ main entry ═══════════ */
async function respond({ message, sessionKey, user, channel = 'web', langHint } = {}) {
  const cfg = await AiSetting.get();
  if (!cfg.enabled) { const e = new Error('AI assistant is currently disabled'); e.status = 503; throw e; }
  if (!cfg.features.chat) { const e = new Error('AI chat is disabled by the store'); e.status = 503; throw e; }

  const text = String(message || '').trim().slice(0, 2000);
  if (!text) { const e = new Error('Message is required'); e.status = 400; throw e; }

  const session = await AiChat.findOrCreate({ sessionKey, user, channel });
  const isFirst = session.messageCount === 0;
  const lang = langHint === 'bn' || langHint === 'en' ? langHint : detectLang(text);
  let intent = classify(text);

  /* ---------- retrieval ---------- */
  let cards = [];
  let deals = [];
  let bundles = [];
  let faqs = [];
  let facts = [];
  let orders = [];
  const lastProducts = session.messages.filter((m) => m.role === 'assistant' && m.refs?.length).slice(-1)[0]?.refs || [];

  let follow = resolveFollowUp(text, lastProducts);
  if (follow) { /* refs store slugs — load the actual product doc */ follow = (await rag.productsBySlugs([follow]))[0] || null; }

  const budget = parseBudget(text);
  const kcfg = cfg.knowledge || {};

  if (intent === 'order') {
    const m = text.match(ORDER_NO_RE);
    /* audit fix — phone proof: take the last 6 digits of the longest digit
       run that is NOT part of the order-number token (the checkout phone). */
    const runs = [...text.replace(m ? m[0] : '', ' ').matchAll(/(\d{6,})/g)].map((x) => x[1]);
    const phoneSuffix = runs.length ? runs[runs.length - 1].slice(-6) : null;
    const o = m ? await rag.orderStatusByNo(m[1], phoneSuffix) : null;
    if (o) orders = [o];
    if (!o && cfg.features.recommend !== false) { cards = await rag.searchProducts(text, { limit: 2 }); }
  } else if (intent === 'compare') {
    const sides = compareSides(text);
    if (sides) {
      const [a, b] = await Promise.all([rag.searchProducts(sides[0], { limit: 1 }), rag.searchProducts(sides[1], { limit: 1 })]);
      if (a[0] && b[0] && String(a[0]._id) !== String(b[0]._id)) cards = [a[0], b[0]];
      else if (a[0] || b[0]) cards = [a[0] || b[0]];
    }
    if (!cards.length && follow) cards = [follow];
  } else if (intent === 'deals') {
    if (kcfg.includeDeals !== false) { deals = await rag.liveDeals(5); bundles = await rag.liveBundles(3); }
  } else if (intent === 'greeting') {
    /* nothing to retrieve */
  } else if (intent === 'policy') {
    if (kcfg.includePolicies !== false) { faqs = await rag.searchFaqs(text, kcfg.maxFaqs ?? 4); if (!faqs.length) facts = await rag.storeFacts(); }
  } else {
    /* product / recommend */
    if (cfg.features.recommend === false && intent === 'recommend') intent = 'product';
    if (follow) cards = [follow];
    else {
      cards = await rag.searchProducts(text, { limit: kcfg.maxProducts ?? 6, maxPrice: budget || undefined, inStockOnly: false });
      if (budget) cards = cards.filter((p) => rag.livePrice(p) <= budget);
    }
    if (!cards.length && budget) cards = await rag.searchProducts('', { limit: kcfg.maxProducts ?? 6, maxPrice: budget });
    /* graceful floor: a product-shaped question that matched NO product but
       DOES match knowledge FAQs (e.g. "emi acche ki?") answers from the FAQ
       knowledge base instead of a dead end — still fully grounded. */
    if (!cards.length) {
      faqs = await rag.searchFaqs(text, 2);
      if (faqs.length) intent = 'policy';
    }
  }

  if (facts.length === 0 && (intent === 'policy' || intent === 'greeting') && kcfg.includePolicies !== false) facts = await rag.storeFacts();
  if (intent === 'deals' && !deals.length && kcfg.includePolicies !== false) facts = await rag.storeFacts();

  /* ---------- compose ---------- */
  let reply = '';
  let usedProvider = 'rules';
  let grounded = true;
  let usage = { promptTokens: 0, completionTokens: 0 };
  const rt = await provider.resolve();

  if (rt.provider !== 'rules') {
    const factsText = maskPII(factsBlock({ facts, cards, deals, bundles, faqs, orders })) || '- (no catalog facts matched this question)';
    /* audit fix — prior turns were replayed to the provider UNMASKED; the
       customer's own earlier phone/email/card text would ship to the LLM */
    const history = session.messages.slice(-(cfg.chat.maxHistory || 8)).map((m) => ({ role: m.role, content: maskPII(m.text) }));
    try {
      const out = await provider.complete({
        system: systemPrompt(lang, cfg.chat.systemPrompt),
        messages: [...history, { role: 'user', content: `[FACTS]\n${factsText}\n\n[QUESTION] ${maskPII(text)}\nAnswer following the RULES. If the FACTS block lacks the answer, say so honestly.` }],
      });
      if (out.text) {
        reply = out.text;
        usedProvider = out.provider;
        usage = { promptTokens: out.promptTokens, completionTokens: out.completionTokens };
      }
    } catch (_) { /* fall through to rules composer */ }
  }

  if (!reply) {
    /* deterministic composer — same facts, zero invention.
       Cards are converted to the public card view so prices/labels match
       exactly what the UI will show. */
    const cardViews = cards.map((c) => rag.toCard(c));
    if (intent === 'greeting') reply = composeGreeting(cfg, lang);
    else if (intent === 'order') reply = composeOrder(orders[0] || null, lang);
    else if (intent === 'compare') reply = composeCompare(cardViews[0], cardViews[1], lang);
    else if (intent === 'deals') reply = composeDeals(deals, bundles, lang);
    else if (intent === 'policy') reply = composePolicy(faqs, facts, lang);
    else reply = composeProducts(cardViews, lang, { budget });
  }

  /* ---------- persist + stats ---------- */
  const refs = cards.map((c) => c.slug);
  session.messages.push({ role: 'user', text, at: new Date(), intent, lang });
  session.messages.push({ role: 'assistant', text: reply.slice(0, 4000), at: new Date(), intent, lang, provider: usedProvider, grounded, refs });
  if (session.messages.length > AiChat.MAX_MESSAGES) session.messages = session.messages.slice(-AiChat.MAX_MESSAGES);
  session.messageCount = session.messages.length;
  session.lastIntent = intent;
  session.lang = lang;
  session.lastMessageAt = new Date();
  await session.save();

  AiStat.bump({
    chats: 1, sessions: isFirst ? 1 : 0, intent, lang, provider: usedProvider,
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
  });

  /* ---------- response ---------- */
  return {
    reply,
    lang,
    intent,
    provider: usedProvider,
    grounded,
    sessionId: session.sessionKey,
    products: cards.map((c) => rag.toCard(c)),
    links: intent === 'deals' ? deals.map((d) => ({ label: d.name, url: '/deals' })) : [],
    order: orders[0] || null,
  };
}

module.exports = { respond, classify, parseBudget, detectLang, maskPII, compareSides, resolveFollowUp, factsBlock, systemPrompt };
