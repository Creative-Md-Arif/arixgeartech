/* ════════════════════════════════════════════════════════════════════
   AI PRODUCT IMPORT — paste a URL, get an approved-ready product draft.

   Pipeline (per URL, staged in the AiImport collection):
     1. GUARD    — SSRF-safe fetch: https/http only, private ranges and
                   localhost blocked; an explicit admin allowlist (DB or
                   AI_IMPORT_ALLOW_HOSTS env) opens narrow exceptions
                   (QA fixtures, trusted vendor feeds).
     2. EXTRACT  — schema.org JSON-LD → OpenGraph/meta → DOM heuristics
                   (title/h1, ৳|Tk|BDT price scan, spec tables, images).
     3. DEDUPE   — exact sourceUrl hit → strong duplicate; normalized
                   title-token similarity ≥ 0.6 → flagged for review.
     4. REWRITE  — LLM (Gemini / open-source endpoint) produces UNIQUE,
                   SEO-friendly Bangla + English copy as strict JSON.
                   Without an LLM a grounded template composer fills the
                   same fields from extracted facts — no invention.
     5. RE-HOST  — Cloudinary upload when configured (cap maxImages);
                   otherwise remote URLs are kept.
     6. STAGE    — everything parks as status 'ready' for the admin:
                   approve() creates the real Product (v2 catalog fields,
                   resolved categoryRef/categoryPath/brand/slug/sku).
   Bulk = many URLs in one POST; items process sequentially with live
   progress; the queue never blocks the request.
   ════════════════════════════════════════════════════════════════════ */

const net = require('net');
const dns = require('dns').promises;
const AiImport = require('../../models/AiImport');
const AiSetting = require('../../models/AiSetting');
const AiStat = require('../../models/AiStat');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const provider = require('./provider');
const { slugify, skuFor } = require('../../controllers/admin/_shared');

/* ---------- 1. SSRF guard ---------- */
function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const parsed = new URL(u);
  parsed.hash = '';
  return parsed.toString();
}

/* audit fix — full IANA special-purpose range check for any resolved address */
function isPrivateIp(ip) {
  const v = String(ip || '').toLowerCase();
  if (net.isIPv4(v)) {
    const n = v.split('.').reduce((acc, o) => ((acc << 8) + (+o)) >>> 0, 0);
    const inRange = (base, bits) => ((n ^ ipToInt(base)) >>> (32 - bits)) === 0;
    return inRange('0.0.0.0', 8) || inRange('10.0.0.0', 8) || inRange('100.64.0.0', 10) ||
      inRange('127.0.0.0', 8) || inRange('169.254.0.0', 16) || inRange('172.16.0.0', 12) ||
      inRange('192.0.0.0', 24) || inRange('192.168.0.0', 16) || inRange('198.18.0.0', 15) ||
      inRange('224.0.0.0', 4) || inRange('240.0.0.0', 4);
  }
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7)); // IPv4-mapped
  if (/^fe[89ab]/.test(v) || /^f[cd]/.test(v) || /^ff/.test(v)) return true; // link-local / ULA / multicast
  return false;
}
function ipToInt(ip) { return ip.split('.').reduce((acc, o) => ((acc << 8) + (+o)) >>> 0, 0); }

async function assertFetchable(urlStr) {
  const parsed = new URL(urlStr);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only http/https URLs can be imported');
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const cfg = await AiSetting.get();
  const allow = new Set(
    [
      ...(process.env.AI_IMPORT_ALLOW_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      ...(cfg.import?.allowHosts || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    ]
  );
  if (allow.has(host)) return; // explicit admin/env exception (QA fixtures, trusted feeds)
  if (/^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`Blocked host "${host}" — private network addresses are never fetched`);
  }
  /* audit fix — resolve the hostname and validate EVERY address against the
     full IANA special-purpose ranges. The old regex-only guard missed
     IPv4-mapped IPv6 ([::ffff:127.0.0.1]), CGNAT (100.64/10), benchmark
     (198.18/15), 0.0.0.0/24 and reserved 224/4+240/4 — and DNS names were
     never resolved at all (rebinding to a private A record sailed through). */
  let addrs;
  if (net.isIPv4(host) || net.isIPv6(host)) addrs = [host];
  else {
    try {
      addrs = (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch (_e) {
      throw new Error(`Cannot resolve host "${host}"`);
    }
  }
  if (!addrs.length) throw new Error(`Cannot resolve host "${host}"`);
  for (const a of addrs) {
    if (isPrivateIp(a)) throw new Error(`Blocked host "${host}" — private network addresses are never fetched`);
  }
}

/* ---------- 2. fetch + extract ---------- */
/* audit fix — redirect: 'follow' followed 30x straight into 169.254.169.254
   AFTER the initial URL had been validated. Hops are now followed manually,
   re-running the full guard (DNS included) on every hop, and the body is
   streamed with a hard 4MB cap instead of buffering blindly. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
async function fetchDoc(urlStr) {
  let url = urlStr;
  for (let hop = 0; hop < 4; hop++) {
    await assertFetchable(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ArixGearImportBot/1.0 (+https://arixgear.tech/ai-import)', Accept: 'text/html,application/xhtml+xml' },
        redirect: 'manual',
      });
      if (REDIRECT_STATUSES.has(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error(`Source returned HTTP ${res.status} without a redirect target`);
        url = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Source returned HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml|text\/plain|application\/json/.test(type)) throw new Error('Source is not an HTML/JSON page');
      let size = 0;
      const chunks = [];
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) throw new Error('Page too large (>4MB)');
        chunks.push(Buffer.from(chunk));
      }
      return { html: Buffer.concat(chunks).toString('utf-8'), finalUrl: res.url || url };
    } finally { clearTimeout(t); }
  }
  throw new Error('Too many redirects');
}

function absolutize(src, base) {
  try { return new URL(src, base).toString(); } catch (_) { return ''; }
}

function jsonLdProducts(html, base) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]/g, ' '));
      const nodes = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const n of nodes) {
        const t = n && (n['@type'] || '');
        const types = Array.isArray(t) ? t : [t];
        if (types.some((x) => /product/i.test(String(x)))) out.push(n);
      }
    } catch (_) { /* malformed block — skip */ }
  }
  return out;
}

function metaContent(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']*)["']`, 'i');
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
  const m = html.match(re) || html.match(alt);
  return m ? decodeEntities(m[1]) : '';
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractPrice(text) {
  const t = String(text || '');
  const re = /(?:৳|tk\.?|bdt)\s*([\d,]+(?:\.\d+)?)/gi;
  const nums = [];
  let m;
  while ((m = re.exec(t))) nums.push(parseFloat(m[1].replace(/,/g, '')));
  const valid = nums.filter((n) => n >= 50 && n <= 100000000);
  if (!valid.length) return null;
  return Math.round(Math.min(...valid)); // lowest price found = actual price (highest is usually the crossed-out one)
}

function extractComparePrice(html, ld, currentPrice) {
  const base = Number(currentPrice) || 0;
  const candidates = [];
  const offers = ld && ld.offers ? ld.offers : {};
  const push = (v) => {
    const n = Number(String(v || '').replace(/,/g, ''));
    if (n > base && n >= 50 && n <= 100000000) candidates.push(n);
  };
  push(offers.highPrice);
  for (const spec of [].concat(offers.priceSpecification || [])) push(spec && spec.price);
  push(metaContent(html, 'product:original_price:amount'));
  push(metaContent(html, 'product:price:high'));
  const labelled = /(?:compare[-_ ]?at|compare[-_ ]?price|original price|regular price|list price|mrp|was price|old price)[^0-9]{0,80}(?:[৳$]|tk\.?|bdt)?\s*([\d,]+(?:\.\d+)?)/gi;
  let m;
  while ((m = labelled.exec(String(html || '')))) push(m[1]);
  return candidates.length ? Math.max(...candidates) : null;
}

function extractSpecs(html, ld = {}) {
  const specs = [];
  const add = (k, v) => {
    const key = stripTags(k); const value = stripTags(v);
    if (key && value && key.length < 80 && value.length < 300 && !specs.some((s) => s.k.toLowerCase() === key.toLowerCase())) specs.push({ k: key, v: value });
  };
  for (const prop of [].concat(ld.additionalProperty || [])) {
    if (prop && (prop.name || prop.propertyID) && prop.value != null) add(prop.name || prop.propertyID, prop.value);
  }
  /* table rows */
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) && specs.length < 30) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1]));
    if (cells.length >= 2) add(cells[0], cells[1]);
  }
  /* dl / dt / dd */
  if (specs.length < 4) {
    const dlRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
    while ((m = dlRe.exec(html)) && specs.length < 30) {
      const k = stripTags(m[1]); const v = stripTags(m[2]);
      add(k, v);
    }
  }
  return specs.slice(0, 18);
}

/* Step 5 — KEY FEATURES extraction: product-page bullet lists (<ul>/<ol> <li>).
   Marketing noise (shipping/legal nav bullets) is filtered by length + pattern;
   result feeds Product.features through the rewrite + approval pipeline. */
function cleanFeatures(list, evidence = '') {
  const evidenceText = String(evidence || '').toLowerCase();
  const noise = /^(shipping|return|refund|warranty policy|payment|delivery|terms|privacy|sign in|login|cart|contact us|home|menu|search|compare|wishlist|add to cart|buy now|free delivery|cash on delivery|emi available)/i;
  const out = [];
  for (const raw of list || []) {
    const text = String(raw || '').replace(/^[\\-•·\\s]+/, '').replace(/\\s+/g, ' ').trim();
    if (text.length < 15 || text.length > 220 || noise.test(text)) continue;
    const words = text.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) || [];
    const relevant = words.some((w) => evidenceText.includes(w)) || /\d|gb|tb|hz|inch|watt|w\b|mah|mp|rtx|ryzen|core|intel|amd|usb|wifi|bluetooth|hdmi/i.test(text);
    if (!relevant) continue;
    if (!out.some((f) => f.toLowerCase() === text.toLowerCase())) out.push(text);
    if (out.length >= 8) break;
  }
  return out;
}

function extractFeatures(html, evidence = '') {
  const out = [];
  const listRe = /<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi;
  let m;
  while ((m = listRe.exec(html)) && out.length < 14) {
    const lis = m[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    for (const li of lis) {
      const text = stripTags(li).replace(/^[-•·\s]+/, '').trim();
      if (text.length < 15 || text.length > 200) continue;
      if (/^(shipping|return|refund|warranty policy|payment|delivery|terms|privacy|sign in|login|cart|contact us)/i.test(text)) continue;
      if (!out.some((f) => f.toLowerCase() === text.toLowerCase())) out.push(text);
      if (out.length >= 8) break;
    }
  }
  return cleanFeatures(out, evidence);
}

function extract(html, pageUrl) {
  const ld = jsonLdProducts(html, pageUrl)[0] || {};
  const offers = Array.isArray(ld.offers) ? (ld.offers[0] || {}) : (ld.offers || {});
  const ldImages = [].concat(ld.image || []).filter(Boolean).map((i) => (typeof i === 'string' ? i : i.url)).filter(Boolean);

  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const ogTitle = metaContent(html, 'og:title');
  const docTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const name = stripTags(ld.name || ogTitle || h1 || decodeEntities(docTitle || ''))
    .replace(/\s*[-|]\s*(?:arixgear|startech|ryans|star ?tech|buy[^|]*)$/i, '')
    .slice(0, 220) || 'Untitled import';
  const evidence = `${name} ${stripTags(ld.description || '')} ${JSON.stringify(ld)}`;

  const isImageUrl = (u) => /^https?:/i.test(u) && /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(u) && !/sprite|logo|icon|placeholder|avatar|banner/i.test(u);
  const attr = (tag, name) => {
    const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i');
    return (tag.match(re) || [])[1] || '';
  };
  const bestSrcset = (value) => {
    const candidates = String(value || '').split(',').map((part) => {
      const bits = part.trim().split(/\s+/);
      const score = /([0-9]+)w$/i.exec(bits[1] || '');
      return { url: bits[0], width: score ? Number(score[1]) : 0 };
    }).filter((x) => x.url);
    return candidates.sort((a, b) => b.width - a.width)[0]?.url || '';
  };

  /* Product pages commonly expose a tiny lazy-load src plus the real shot in
     srcset/data-large-image/data-zoom-image. Pick the highest-resolution
     candidate before re-hosting; otherwise Cloudinary faithfully preserves a
     thumbnail and the approved product looks blurry forever. */
  const imgRe = /<img\b[^>]*>/gi;
  const imgs = [];
  let im;
  while ((im = imgRe.exec(html)) && imgs.length < 80) {
    const tag = im[0];
    const raw = bestSrcset(attr(tag, 'srcset')) || bestSrcset(attr(tag, 'data-srcset')) || attr(tag, 'data-zoom-image') || attr(tag, 'data-large-image') || attr(tag, 'data-original') || attr(tag, 'data-lazy-src') || attr(tag, 'data-image') || attr(tag, 'data-src') || attr(tag, 'src');
    const u = absolutize(decodeEntities(raw), pageUrl);
    if (isImageUrl(u)) imgs.push(u);
  }

  const ogDesc = metaContent(html, 'og:description') || metaContent(html, 'description');
  const bodyText = stripTags(html).slice(0, 20000);

  return {
    name,
    brandGuess: stripTags(ld.brand && (ld.brand.name || ld.brand)) || metaContent(html, 'product:brand') || '',
    categoryGuess: stripTags(ld.category || metaContent(html, 'product:category') || ''),
    price: parseFloat(offers.price || metaContent(html, 'product:price:amount')) || extractPrice(bodyText),
    comparePrice: extractComparePrice(html, ld, parseFloat(offers.price || metaContent(html, 'product:price:amount')) || extractPrice(bodyText)),
    currency: offers.priceCurrency || metaContent(html, 'product:price:currency') || 'BDT',
    availability: /instock|in[_-]?stock/i.test(String(offers.availability || '')) ? 'in_stock' : (/preorder/i.test(String(offers.availability || '')) ? 'preorder' : ''),
    sku: String(ld.sku || metaContent(html, 'product:original_price:amount') || '').slice(0, 60),
    shortDesc: (stripTags(ld.description || ogDesc) || '').slice(0, 600),
    specs: extractSpecs(html, ld),
    features: extractFeatures(html, evidence), // product-specific bullet lists
    images: [...new Set([...ldImages, ...imgs])].slice(0, 12),
    ldPriceCurrencyOk: !offers.price || String(offers.priceCurrency || 'BDT').toUpperCase() === 'BDT',
  };
}

/* ---------- 4. rewrite ---------- */
function templateRewrite(ex) {
  const specLines = (ex.specs || []).slice(0, 8).map((s) => `${s.k}: ${s.v}`).join(' · ');
  const descParts = [];
  if (ex.shortDesc) descParts.push(ex.shortDesc);
  if (specLines) descParts.push(`Key specifications — ${specLines}.`);
  descParts.push(`Imported and verified by the ArixGear team. Warranty and after-sales support handled by ArixGear service centers across Bangladesh.`);
  return {
    name: ex.name,
    nameBn: '',
    shortDesc: ex.shortDesc || `${ex.name} — available at ArixGear.`,
    shortDescBn: '',
    description: descParts.join('\n\n').slice(0, 4000),
    descriptionBn: '',
    specs: ex.specs || [],
    specsBn: [],
    features: ex.features || [], // Step 5 — bullets ride through verbatim
    featuresBn: [],
    seo: {
      metaTitle: `${ex.name} — Price in Bangladesh | ArixGear`.slice(0, 200),
      metaDescription: (ex.shortDesc || `${ex.name} at the best price in Bangladesh. Genuine product, fast delivery, ArixGear warranty support.`).slice(0, 300),
      metaKeywords: [ex.name, ex.brandGuess, 'arixgear', 'price in bangladesh'].filter(Boolean).join(', ').slice(0, 500),
    },
    source: 'template',
  };
}

async function aiRewrite(ex) {
  const facts = {
    extractedName: ex.name, brand: ex.brandGuess, price: ex.price, currency: ex.currency,
    sourceDescription: (ex.shortDesc || '').slice(0, 1200),
    specifications: (ex.specs || []).slice(0, 14),
    keyFeatures: (ex.features || []).slice(0, 8), // Step 5
  };
  const out = await provider.complete({
    system: [
      'You are the SEO copywriter for arixgear.tech, a Bangladeshi tech & gadget store (BDT ৳).',
      'Rewrite the supplied RAW PRODUCT DATA into unique, original storefront copy.',
      'Hard rules: use ONLY facts present in the raw data — never invent specs, numbers or features;',
      'do not mention the source website; do not copy the source description verbatim — rephrase;',
      'write natural, professional English AND natural Bangla (Bengali script).',
      'Return STRICT JSON only: {"name","nameBn","shortDesc","shortDescBn","description","descriptionBn",',
      '"specs":[{"k","v"}],"specsBn":[{"k","v"}],"features":["..."],"featuresBn":["..."],"seo":{"metaTitle","metaDescription","metaKeywords"}}',
    ].join(' '),
    messages: [{ role: 'user', content: 'RAW PRODUCT DATA:\n' + JSON.stringify(facts, null, 1) }],
    json: true,
    temperature: 0.5,
    maxTokens: 1600,
  });
  const j = provider.parseJsonLoose(out.text);
  if (!j || !j.name) throw new Error('AI rewrite returned unusable JSON');
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => s && s.k && s.v).map((s) => ({ k: String(s.k).slice(0, 80), v: String(s.v).slice(0, 200) })).slice(0, 18) : []);
  const strArr = (x) => (Array.isArray(x) ? x.map((s) => String(s || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12) : []);
  return {
    name: String(j.name).slice(0, 220),
    nameBn: String(j.nameBn || '').slice(0, 220),
    shortDesc: String(j.shortDesc || '').slice(0, 500),
    shortDescBn: String(j.shortDescBn || '').slice(0, 500),
    description: String(j.description || '').slice(0, 6000),
    descriptionBn: String(j.descriptionBn || '').slice(0, 6000),
    specs: arr(j.specs),
    specsBn: arr(j.specsBn),
    /* Raw extracted bullets are the source of truth for product features;
       the model may rewrite copy, but must not invent or mix feature lists. */
    features: (ex.features || []).slice(0, 12),
    featuresBn: strArr(j.featuresBn).slice(0, (ex.features || []).length),
    seo: {
      metaTitle: String(j.seo?.metaTitle || '').slice(0, 200),
      metaDescription: String(j.seo?.metaDescription || '').slice(0, 300),
      metaKeywords: String(j.seo?.metaKeywords || '').slice(0, 500),
    },
    source: 'ai',
    _usage: { promptTokens: out.promptTokens, completionTokens: out.completionTokens },
  };
}

/* ---------- 3. dedupe ---------- */
function titleTokens(s) {
  return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1));
}
function similarity(a, b) {
  const A = titleTokens(a); const B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function detectDuplicates(ex, sourceUrl) {
  const dups = [];
  /* exact source URL match (import history + catalog provenance) */
  const [sameUrlImport, sameUrlProduct] = await Promise.all([
    AiImport.findOne({ sourceUrl: sourceUrl, status: { $in: ['ready', 'imported'] } }).select('result status').lean(),
    Product.findOne({ sourceUrl: sourceUrl }).select('name slug _id').lean(),
  ]);
  if (sameUrlProduct) dups.push({ productId: sameUrlProduct._id, name: sameUrlProduct.name, slug: sameUrlProduct.slug, score: 1, reason: 'source URL already in catalog' });
  else if (sameUrlImport && sameUrlImport.status === 'imported') dups.push({ productId: sameUrlImport.result?.productId, name: '(previous import)', slug: sameUrlImport.result?.slug || '', score: 0.98, reason: 'same URL imported earlier' });
  else if (sameUrlImport && sameUrlImport.status === 'ready') dups.push({ productId: sameUrlImport._id, name: '(staged import)', slug: '', score: 0.95, reason: 'same URL already staged in the import queue' });

  /* fuzzy title match against the catalog */
  const firstToks = [...titleTokens(ex.name)].slice(0, 3);
  if (firstToks.length) {
    const re = firstToks.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const candidates = await Product.find({ name: new RegExp(re, 'i') }).select('name slug _id').limit(8).lean();
    for (const c of candidates) {
      const s = similarity(ex.name, c.name);
      if (s >= 0.6 && !dups.some((d) => String(d.productId) === String(c._id))) {
        dups.push({ productId: c._id, name: c.name, slug: c.slug, score: Math.round(s * 100) / 100, reason: `similar name (${Math.round(s * 100)}% match)` });
      }
    }
  }
  dups.sort((a, b) => b.score - a.score);
  return dups;
}

/* ---------- 5. images ---------- */
async function rehostImages(images, maxImages) {
  const { cloudinary, isCloudinaryEnabled } = require('../../config/cloudinary');
  const list = images.filter((u) => /^https?:\/\//i.test(u)).slice(0, maxImages);
  if (!isCloudinaryEnabled) return list.map((url) => ({ url, publicId: '' }));
  const out = [];
  for (const url of list) {
    try {
      const r = await cloudinary.uploader.upload(url, { folder: 'arixgear/imports', overwrite: false, timeout: 20000 });
      out.push({ url: r.secure_url, publicId: r.public_id });
    } catch (e) {
      console.warn('[ai-import] cloudinary upload failed, keeping remote URL:', e.message);
      out.push({ url, publicId: '' });
    }
  }
  return out;
}

/* ---------- imports (top of file already has specsUtil via lazy require) ---------- */
const specsUtil = require('../../utils/specs'); // Step 5 — dynamic spec system
const cache = require('../../services/cache');   // Step 5 — schema changes drop facet cache
const { auditSchemaMutation } = require('../specAudit'); // Step 6 — AI auto-create is audited too
const mongoose = require('mongoose');

/* ---------- category / brand guessing ---------- */
async function guessCategory(ex) {
  const hay = `${ex.name} ${ex.shortDesc}`.toLowerCase();
  const cats = await Category.find({}).select('name nameBn slug path').lean();
  let best = null; let bestScore = 0;
  for (const c of cats) {
    const words = String(c.slug).split('-');
    let s = 0;
    for (const w of words) if (w.length > 2 && hay.includes(w)) s += 2;
    if (c.name && hay.includes(String(c.name).toLowerCase())) s += 2;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best && bestScore >= 2 ? best.slug : slugify(ex.categoryGuess || '');
}

async function guessBrand(ex) {
  const name = String(ex.brandGuess || ex.name || '').toLowerCase();
  if (!name) return '';
  const brands = await Brand.find({}).select('name slug').lean();
  for (const b of brands) if (name.includes(String(b.name).toLowerCase())) return b.slug;
  return slugify(ex.brandGuess || '');
}

const titleFromSlug = (value) => String(value || '').split('-').filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');

async function ensureImportCategory(slug, label) {
  const clean = slugify(slug || label);
  if (!clean) return { categoryRef: null, categoryPath: [] };
  let doc = await Category.findOne({ slug: clean });
  if (!doc) {
    try {
      doc = await Category.create({ name: String(label || titleFromSlug(clean)).slice(0, 80), slug: clean, parent: null, path: [clean], active: true, order: 999 });
    } catch (e) {
      doc = await Category.findOne({ slug: clean });
      if (!doc) throw e;
    }
  }
  return { categoryRef: doc._id, categoryPath: doc.path && doc.path.length ? doc.path : [doc.slug] };
}

async function ensureImportBrand(value, fallbackName) {
  const raw = String(value || '').trim();
  if (/^[a-f\d]{24}$/i.test(raw)) return raw;
  const clean = slugify(raw || fallbackName);
  if (!clean) return null;
  let doc = await Brand.findOne({ slug: clean });
  if (!doc) {
    try {
      doc = await Brand.create({ name: String(fallbackName || titleFromSlug(clean)).slice(0, 80), slug: clean, active: true, order: 999 });
    } catch (e) {
      doc = await Brand.findOne({ slug: clean });
      if (!doc) throw e;
    }
  }
  return doc._id;
}

/* ---------- queue ---------- */
const processing = new Set();

async function processImport(id) {
  if (processing.has(String(id))) return;
  processing.add(String(id));
  const started = Date.now();
  let usage = { promptTokens: 0, completionTokens: 0 };
  let metaProvider = 'template';
  try {
    const doc = await AiImport.findById(id);
    if (!doc || ['imported', 'rejected'].includes(doc.status)) return;
    doc.status = 'processing';
    doc.progress = 10;
    doc.error = '';
    await doc.save();

    await assertFetchable(doc.sourceUrl);
    const { html, finalUrl } = await fetchDoc(doc.sourceUrl);
    doc.progress = 30;
    await doc.save();

    const ex = extract(html, finalUrl);
    doc.extracted = { ...ex, specs: ex.specs, images: ex.images, features: ex.features };
    doc.host = new URL(finalUrl).hostname;
    doc.progress = 55;
    await doc.save();

    const dups = await detectDuplicates(ex, doc.sourceUrl);
    doc.duplicates = dups.filter((d) => d.productId);
    doc.duplicateOf = dups[0] && dups[0].score >= 0.95 && dups[0].productId ? dups[0].productId : null;

    /* rewrite: AI when available, grounded template otherwise */
    let content;
    try {
      content = await aiRewrite(ex);
      usage = content._usage || usage;
      metaProvider = content.source;
      delete content._usage;
    } catch (e) {
      console.warn('[ai-import] AI rewrite unavailable → template:', e.message);
      content = templateRewrite(ex);
      metaProvider = 'template';
    }
    doc.aiContent = content;
    doc.progress = 80;
    await doc.save();

    /* pricing + guesses (admin-editable before approval) */
    doc.price = doc.price ?? ex.price ?? null;
    doc.comparePrice = doc.comparePrice ?? ex.comparePrice ?? null;
    if (!doc.category) doc.categoryGuess = await guessCategory(ex);
    if (!doc.brand) doc.brandGuessSlug = await guessBrand(ex);
    if (!doc.category && doc.categoryGuess) {
      const refs = await ensureImportCategory(doc.categoryGuess, ex.categoryGuess || doc.categoryGuess);
      if (refs.categoryRef) doc.category = doc.categoryGuess;
    }
    if (!doc.brand && doc.brandGuessSlug) {
      doc.brand = await ensureImportBrand(doc.brandGuessSlug, ex.brandGuess || doc.brandGuessSlug);
    }

    const cfg = await AiSetting.get();
    doc.images = await rehostImages(ex.images, cfg.import?.maxImages || 8);
    doc.progress = 100;
    doc.status = 'ready';
    doc.meta = { provider: metaProvider, durationMs: Date.now() - started, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens };
    await doc.save();
    AiStat.bump({ importEvent: doc.duplicateOf ? 'duplicates' : 'staged' });
  } catch (e) {
    await AiImport.findByIdAndUpdate(id, { status: 'failed', error: String(e.message || e).slice(0, 600) }).catch(() => {});
    AiStat.bump({ importEvent: 'failed' });
  } finally {
    processing.delete(String(id));
  }
}

/** Create staged imports for one or many URLs and kick the queue. */
async function stage(urls) {
  const cfg = await AiSetting.get();
  const list = (Array.isArray(urls) ? urls : [urls])
    .map((u) => normalizeUrl(u)).filter(Boolean)
    .slice(0, cfg.import?.maxBatch || 10);
  if (!list.length) { const e = new Error('No valid URLs provided'); e.status = 400; throw e; }

  const docs = [];
  const queue = [];
  for (const url of list) {
    /* collapse exact re-submits that are already pending/processing/ready */
    const existing = await AiImport.findOne({ sourceUrl: url, status: { $in: ['pending', 'processing', 'ready', 'failed'] } }).sort({ createdAt: -1 });
    if (existing) {
      if (['pending', 'failed'].includes(existing.status)) { existing.status = 'pending'; existing.error = ''; await existing.save(); queue.push(existing._id); }
      docs.push(existing);
      continue;
    }
    const created = await AiImport.create({ sourceUrl: url, status: 'pending' });
    docs.push(created);
    queue.push(created._id);
  }
  /* sequential processing — gentle on source sites + provider quota */
  (async () => {
    for (const id of queue) await processImport(id);
  })().catch(() => {});
  return docs;
}

/* ---------- approval → real Product ---------- */
async function approveImport(id, edits, adminUser) {
  const doc = await AiImport.findById(id);
  if (!doc) { const e = new Error('Import not found'); e.status = 404; throw e; }
  if (doc.status === 'imported') { const e = new Error('Already imported'); e.status = 400; throw e; }
  if (!['ready', 'failed'].includes(doc.status)) { const e = new Error(`Import is still ${doc.status} — wait for it to finish or retry it first`); e.status = 400; throw e; }
  /* merge admin edits (admin fields win over staged values) */
  const b = edits || {};
  const content = { ...doc.aiContent?.toObject?.() || doc.aiContent, ...(b.aiContent || {}) };
  if (b.aiContent?.seo) content.seo = { ...doc.aiContent?.seo, ...b.aiContent.seo };
  if (b.aiContent) content.source = 'admin';

  const name = (b.name || content.name || doc.extracted?.name || 'Imported product').trim();
  const price = Number(b.price ?? doc.price ?? doc.extracted?.price ?? 0);
  if (!price || price <= 0) { const e = new Error('A valid price is required before approval'); e.status = 400; throw e; }

  const categoryLabel = b.category || doc.category || doc.categoryGuess || doc.extracted?.categoryGuess || '';
  const category = slugify(categoryLabel || (await AiSetting.get()).import?.defaultCategory || 'accessories');
  const catRefs = await ensureImportCategory(category, categoryLabel);
  const brandSource = b.brandId && b.brandId !== 'none' ? b.brandId : (doc.brand || doc.brandGuessSlug || doc.extracted?.brandGuess || '');
  const brandId = await ensureImportBrand(brandSource, doc.extracted?.brandGuess || brandSource);
  const warrantyMonths = Math.max(0, Math.min(240, parseInt(b.warrantyMonths ?? doc.warrantyMonths ?? 0, 10) || 0));

  /* unique slug */
  let slug = slugify(name) || `import-${Date.now()}`;
  for (let i = 2; await Product.exists({ slug }); i++) slug = `${slugify(name)}-${i}`;

  const sku = await skuFor(b.sku || doc.extracted?.sku || '');
  const imgs = doc.images?.length ? doc.images : (doc.extracted?.images || []).slice(0, 4).map((url) => ({ url, publicId: '' }));
  if (!imgs.length) { const e = new Error('No images were extracted — add one before approving'); e.status = 400; throw e; }

  /* fallback chain picks the FIRST NON-EMPTY source (model defaults make
     aiContent.specs an empty — truthy — array that used to shadow the
     extraction when an import was staged without a rewrite pass) */
  const pickList = (...cands) => cands.find((x) => Array.isArray(x) && x.length) || [];
  const specs = pickList(b.specs, content.specs, doc.extracted?.specs)
    .map((s) => ({ k: String(s.k).slice(0, 80), v: String(s.v).slice(0, 300) }));

  /* Step 5 — THE AUTO-CREATION HOOK. Every extracted attribute/group that the
     website doesn't have yet is created in the category's specGroups schema
     on approval, then the values map into the product's canonical specValues
     and the flat legacy specs/specsBn arrays regenerate from them — AI Import,
     Product Model, MongoDB schema, PDP and shop filters all stay in sync.
     Missing fields/groups NEVER require developer code changes. */
  const Category = require('../../models/Category');
  const catDoc = await Category.findOne({ slug: category });
  const schema = specsUtil.normalizeSpecGroups((catDoc && catDoc.specGroups) || []);
  const schemaBefore = JSON.stringify(schema);
  const specValues = specsUtil.specValuesFromPairs(schema, specs); // mutates schema (auto-create)
  if (catDoc && JSON.stringify(schema) !== schemaBefore) {
    catDoc.specGroups = schema;
    await auditSchemaMutation(catDoc, 'ai-import', 'AI import auto-created unknown spec field(s) for "' + name + '"', adminUser);
    await catDoc.save();
    cache.bump(); // new schema fields can feed shop facets
  }
  const flatSpecs = specsUtil.flatFromValues(schema, specValues, false);
  const flatSpecsBn = pickList(b.specsBn, content.specsBn).length
    ? pickList(b.specsBn, content.specsBn).map((s) => ({ k: String(s.k).slice(0, 80), v: String(s.v).slice(0, 300) }))
    : specsUtil.flatFromValues(schema, specValues, true);
  /* key features: admin edit > AI rewrite > raw extraction (same non-empty rule) */
  const features = pickList(b.features, content.features, doc.extracted?.features)
    .map((f) => String(f || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);
  const featuresBn = pickList(b.featuresBn, content.featuresBn)
    .map((f) => String(f || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);

  const product = await Product.create({
    name,
    nameBn: b.nameBn ?? content.nameBn ?? '',
    slug,
    category,
    ...catRefs,
    brand: brandId,
    ...(sku ? { sku } : {}),
    price,
    comparePrice: b.comparePrice !== undefined
      ? (b.comparePrice === null ? null : Math.max(0, Number(b.comparePrice) || 0))
      : (doc.comparePrice ?? null),
    images: imgs.map((i) => ({ url: i.url, publicId: i.publicId || undefined })),
    shortDesc: (b.shortDesc ?? content.shortDesc ?? '').slice(0, 500),
    shortDescBn: (b.shortDescBn ?? content.shortDescBn ?? '').slice(0, 500),
    description: b.description ?? content.description ?? '',
    descriptionBn: b.descriptionBn ?? content.descriptionBn ?? '',
    specs: flatSpecs,
    specsBn: flatSpecsBn,
    specValues, // Step 5 — canonical dynamic spec rows
    features,
    featuresBn,
    hideEmptySpecs: true,
    warranty: { months: warrantyMonths, type: warrantyMonths > 0 ? 'manufacturer' : 'none', note: '' },
    stock: Math.max(0, parseInt(b.stock ?? 10, 10) || 0),
    badge: 'new',
    active: b.active !== false,
    seo: {
      metaTitle: content.seo?.metaTitle || '',
      metaDescription: content.seo?.metaDescription || '',
      metaKeywords: content.seo?.metaKeywords || '',
    },
    sourceUrl: doc.sourceUrl,
  });

  doc.status = 'imported';
  doc.result = { productId: product._id, slug: product.slug };
  doc.approvedBy = adminUser?._id || null;
  doc.approvedAt = new Date();
  await doc.save();
  AiStat.bump({ importEvent: 'approved' });
  return product;
}

/* ---------- Step 6 — UPDATE-MODE APPROVAL (import → existing product) ----------
   Re-imports flag duplicates at staging; this action closes the loop: instead
   of minting a second product, the staged source data REFRESHES the chosen
   target. Overwritten (editable commerce fields): name/nameBn,
   price/comparePrice, shortDesc(Bn), description(Bn), images, specs →
   canonical specValues (SAME auto-create hook as approve — unknown attributes
   grow the category schema), features/featuresBn, warranty.
   Untouched (sales-side state): stock, sold, rating, reviews, sku, slug,
   badge, seo override, sourceUrl. edits.category can still re-home the
   product (schema mapping follows the TARGET product's category). */
async function updateExistingImport(id, edits, adminUser, targetId) {
  const doc = await AiImport.findById(id);
  if (!doc) { const e = new Error('Import not found'); e.status = 404; throw e; }
  if (!['ready', 'failed'].includes(doc.status)) { const e = new Error(`Import is still ${doc.status} — wait for it to finish or retry it first`); e.status = 400; throw e; }
  if (!targetId || !/^[a-f\d]{24}$/i.test(String(targetId))) { const e = new Error('targetProductId (a valid Product id) is required for update mode'); e.status = 400; throw e; }
  const target = await Product.findById(targetId);
  if (!target) { const e = new Error('Target product not found'); e.status = 404; throw e; }

  const b = edits || {};
  const content = { ...doc.aiContent?.toObject?.() || doc.aiContent, ...(b.aiContent || {}) };
  const pickList = (...cands) => cands.find((x) => Array.isArray(x) && x.length) || [];

  /* commerce fields — edits win, staged content second, target stays on silence */
  if (b.name || content.name) target.name = String(b.name || content.name).trim().slice(0, 160);
  if (b.nameBn !== undefined || content.nameBn !== undefined) target.nameBn = String(b.nameBn ?? content.nameBn ?? '').trim();
  const price = Number(b.price ?? doc.price ?? doc.extracted?.price ?? target.price);
  if (!price || price <= 0) { const e = new Error('A valid price is required'); e.status = 400; throw e; }
  target.price = price;
  target.comparePrice = b.comparePrice !== undefined ? (b.comparePrice === null ? null : Math.max(0, Number(b.comparePrice) || 0)) : target.comparePrice;
  if (b.shortDesc !== undefined || content.shortDesc !== undefined) target.shortDesc = String(b.shortDesc ?? content.shortDesc ?? '').slice(0, 500);
  if (b.shortDescBn !== undefined || content.shortDescBn !== undefined) target.shortDescBn = String(b.shortDescBn ?? content.shortDescBn ?? '').slice(0, 500);
  if (b.description !== undefined || content.description !== undefined) target.description = String(b.description ?? content.description ?? '');
  if (b.descriptionBn !== undefined || content.descriptionBn !== undefined) target.descriptionBn = String(b.descriptionBn ?? content.descriptionBn ?? '');

  /* optional re-home (schema mapping below follows the NEW category) */
  if (b.category) {
    const slugC = slugify(b.category);
    if (slugC && slugC !== target.category) {
      target.category = slugC;
      Object.assign(target, await ensureImportCategory(slugC, b.category));
    }
  }
  if (b.brandId !== undefined || !target.brand) {
    const brandSource = b.brandId && b.brandId !== 'none' ? b.brandId : (doc.brand || doc.brandGuessSlug || doc.extracted?.brandGuess || '');
    target.brand = await ensureImportBrand(brandSource, doc.extracted?.brandGuess || brandSource);
  }

  /* images: refresh from the import (desktop drag-order payloads can still
     reorder them afterwards) — edits.keepImages=true keeps the current set */
  if (!b.keepImages) {
    const imgs = doc.images?.length ? doc.images : (doc.extracted?.images || []).slice(0, 4).map((url) => ({ url, publicId: '' }));
    if (imgs.length) {
      target.images = imgs.map((i) => ({ url: i.url, publicId: i.publicId || undefined }));
      if (b.imageAlts && typeof b.imageAlts === 'object') {
        target.images.forEach((img, i) => { const a = b.imageAlts['new:' + i] || b.imageAlts[String(i)]; if (a) img.alt = String(a).trim().slice(0, 300); });
      }
    }
  }

  /* specs → canonical specValues against the TARGET's category schema, with
     the auto-create hook (unknown extracted attributes materialize there) */
  const specs = pickList(b.specs, content.specs, doc.extracted?.specs)
    .map((s) => ({ k: String(s.k).slice(0, 80), v: String(s.v).slice(0, 300) }));
  if (specs.length) {
    const catDoc = await Category.findOne({ slug: target.category });
    const schema = specsUtil.normalizeSpecGroups((catDoc && catDoc.specGroups) || []);
    const before = JSON.stringify(schema);
    const specValues = specsUtil.specValuesFromPairs(schema, specs); // mutates schema
    if (catDoc && JSON.stringify(schema) !== before) {
      catDoc.specGroups = schema;
      await auditSchemaMutation(catDoc, 'ai-import', 'AI import update-mode auto-created unknown spec field(s) for "' + target.name + '"', adminUser);
      await catDoc.save();
      cache.bump();
    }
    target.specValues = specValues;
    target.specs = specsUtil.flatFromValues(schema, specValues, false);
    const bnPairs = pickList(b.specsBn, content.specsBn);
    target.specsBn = bnPairs.length
      ? bnPairs.map((s) => ({ k: String(s.k).slice(0, 80), v: String(s.v).slice(0, 300) }))
      : specsUtil.flatFromValues(schema, specValues, true);
  }

  /* key features refresh (same non-empty chain as approve) */
  const features = pickList(b.features, content.features, doc.extracted?.features)
    .map((f) => String(f || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);
  if (features.length || b.features) target.features = features;
  const featuresBn = pickList(b.featuresBn, content.featuresBn)
    .map((f) => String(f || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12);
  if (featuresBn.length || b.featuresBn !== undefined) target.featuresBn = featuresBn;

  /* warranty refresh when the import carries one */
  const wm = parseInt(b.warrantyMonths ?? doc.warrantyMonths ?? NaN, 10);
  if (Number.isFinite(wm)) target.warranty = { months: Math.max(0, Math.min(240, wm)), type: wm > 0 ? 'manufacturer' : 'none', note: target.warranty?.note || '' };

  await target.save();
  cache.bump(); // card/PDP payloads changed

  doc.status = 'imported';
  doc.result = { productId: target._id, slug: target.slug, updated: true };
  doc.approvedBy = adminUser?._id || null;
  doc.approvedAt = new Date();
  await doc.save();
  AiStat.bump({ importEvent: 'approved' });
  return target;
}

/* ---------- Step 7 — UPDATE-MODE DIFF VIEW (#4) ----------
   "What EXACTLY would update mode change?" — pure read, no writes. Resolves
   the SAME staged chains updateExistingImport uses (with no admin-request
   edits, the saved draft IS the staged state) and compares field-by-field
   against the target product: name/price/copy rows, images added/removed,
   specs added/removed/changed (by label), features delta, plus a preview of
   which spec fields would AUTO-CREATE in the target's category schema
   (computed on a cloned schema — never persisted). */
async function updateDiff(id, targetId) {
  const doc = await AiImport.findById(id).lean();
  if (!doc) { const e = new Error('Import not found'); e.status = 404; throw e; }
  if (!targetId || !/^[a-f\d]{24}$/i.test(String(targetId))) { const e = new Error('targetProductId (a valid Product id) is required'); e.status = 400; throw e; }
  const target = await Product.findById(targetId).lean();
  if (!target) { const e = new Error('Target product not found'); e.status = 404; throw e; }

  const content = doc.aiContent || {};
  const pickList = (...cands) => cands.find((x) => Array.isArray(x) && x.length) || [];
  const row = (field, label, current, staged) => ({ field, label, current, staged, changed: String(current ?? '') !== String(staged ?? '') });

  const rows = [
    row('name', 'Name', target.name, content.name || doc.extracted?.name || target.name),
    row('nameBn', 'Name (BN)', target.nameBn || '', content.nameBn || ''),
    row('price', 'Price (৳)', target.price, Number(doc.price ?? doc.extracted?.price ?? target.price)),
    row('shortDesc', 'Short description', target.shortDesc || '', content.shortDesc || ''),
    row('shortDescBn', 'Short description (BN)', target.shortDescBn || '', content.shortDescBn || ''),
    row('description', 'Description', target.description || '', content.description || ''),
    row('descriptionBn', 'Description (BN)', target.descriptionBn || '', content.descriptionBn || ''),
  ];
  const stagedCat = slugify(doc.category || doc.categoryGuess || '');
  rows.push(row('category', 'Category', target.category, stagedCat || target.category));

  const curImgs = (target.images || []).map((i) => String(i.url || ''));
  const stagedImgs = doc.images?.length ? doc.images.map((i) => String(i.url || '')) : (doc.extracted?.images || []).slice(0, 4).map(String);
  rows.push({
    field: 'images', label: 'Images', current: curImgs, staged: stagedImgs,
    added: stagedImgs.filter((u) => u && !curImgs.includes(u)),
    removed: curImgs.filter((u) => u && !stagedImgs.includes(u)),
    changed: JSON.stringify(curImgs) !== JSON.stringify(stagedImgs),
  });

  const stagedSpecs = pickList(content.specs, doc.extracted?.specs)
    .map((s) => ({ k: String((s && s.k) || '').slice(0, 80), v: String((s && s.v) == null ? '' : s.v).slice(0, 300) }))
    .filter((s) => s.k && s.v);
  const curSpecs = (target.specs || []).map((s) => ({ k: String(s.k || ''), v: String(s.v == null ? '' : s.v) }));
  const curByK = new Map(curSpecs.map((s) => [s.k.toLowerCase(), s]));
  const stagByK = new Map(stagedSpecs.map((s) => [s.k.toLowerCase(), s]));
  const specs = {
    added: stagedSpecs.filter((s) => !curByK.has(s.k.toLowerCase())),
    removed: curSpecs.filter((s) => s.k && !stagByK.has(s.k.toLowerCase())),
    changed: stagedSpecs
      .filter((s) => { const c = curByK.get(s.k.toLowerCase()); return c && c.v !== s.v; })
      .map((s) => ({ k: s.k, from: curByK.get(s.k.toLowerCase()).v, to: s.v })),
  };

  /* schema-growth preview on a CLONE of the target category's schema */
  let schemaGrowth = [];
  if (stagedSpecs.length) {
    const catDoc = await Category.findOne({ slug: target.category }).select('specGroups').lean();
    const schema = specsUtil.normalizeSpecGroups((catDoc && catDoc.specGroups) || []);
    const beforeKeys = new Set(schema.flatMap((g) => (g.fields || []).map((f) => f.key)));
    specsUtil.specValuesFromPairs(schema, stagedSpecs); // mutates the clone only
    schemaGrowth = schema
      .flatMap((g) => (g.fields || []).filter((f) => !beforeKeys.has(f.key)).map((f) => ({ key: f.key, label: f.label, group: g.label })));
  }

  const stagedFeats = pickList(content.features, doc.extracted?.features).map((f) => String(f || '').trim()).filter(Boolean).slice(0, 12);
  const curFeats = (target.features || []).map(String);
  rows.push({
    field: 'features', label: 'Key features', current: curFeats, staged: stagedFeats,
    added: stagedFeats.filter((f) => !curFeats.includes(f)),
    removed: curFeats.filter((f) => !stagedFeats.includes(f)),
    changed: JSON.stringify(curFeats) !== JSON.stringify(stagedFeats),
  });
  const wm = parseInt(doc.warrantyMonths ?? NaN, 10);
  rows.push(row('warranty', 'Warranty (months)', target.warranty?.months ?? 0, Number.isFinite(wm) ? Math.max(0, Math.min(240, wm)) : (target.warranty?.months ?? 0)));

  return {
    import: { id: String(doc._id), name: content.name || doc.extracted?.name || '(staged)', price: doc.price, sourceUrl: doc.sourceUrl },
    target: { id: String(target._id), name: target.name, slug: target.slug, price: target.price, category: target.category },
    rows,
    specs,
    schemaGrowth,
    untouched: ['stock', 'sold count', 'rating', 'reviews', 'SKU', 'slug', 'badge', 'SEO override', 'source URL'],
    summary: {
      changedRows: rows.filter((r) => r.changed).length,
      specsTouched: specs.added.length + specs.removed.length + specs.changed.length,
      newFields: schemaGrowth.length,
    },
  };
}

module.exports = { stage, processImport, approveImport, updateExistingImport, updateDiff, normalizeUrl, assertFetchable, extract, detectDuplicates, templateRewrite, similarity, extractPrice };
