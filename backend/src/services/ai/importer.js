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
const fs = require('fs');
const { randomUUID, createHash } = require('crypto');
const AiImport = require('../../models/AiImport');
const AiSetting = require('../../models/AiSetting');
const AiStat = require('../../models/AiStat');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const provider = require('./provider');
const { slugify, skuFor } = require('../../controllers/admin/_shared');

/* Optional JS renderer. The package is lightweight; the deployment supplies
   Chrome/Chromium through AI_IMPORT_BROWSER_PATH (or a system installation).
   If no browser exists, the importer remains fully functional with raw HTML. */
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch (_e) { /* optional */ }
let renderBrowser = null;
const browserCandidates = process.platform === 'win32'
  ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
function browserPath() {
  const configured = String(process.env.AI_IMPORT_BROWSER_PATH || '').trim();
  if (configured && fs.existsSync(configured)) return configured;
  return browserCandidates.find((p) => fs.existsSync(p)) || '';
}

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
async function renderDoc(url) {
  if (!chromium || process.env.AI_IMPORT_RENDER_JS === 'false') return null;
  const executablePath = browserPath();
  if (!executablePath) return null;
  try {
    if (!renderBrowser || !renderBrowser.isConnected()) {
      renderBrowser = await chromium.launch({ executablePath, headless: true });
    }
    const page = await renderBrowser.newPage({ serviceWorkers: 'block' });
    /* A rendered page can issue its own requests, so apply the SSRF guard to
       every browser request too. Non-HTTP assets are safe to keep local. */
    await page.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(data|blob|about):/i.test(requestUrl)) return route.continue();
      try { await assertFetchable(requestUrl); return route.continue(); }
      catch (_e) { return route.abort(); }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const html = await page.content();
    const finalUrl = page.url();
    await page.close();
    await assertFetchable(finalUrl);
    return { html, finalUrl };
  } catch (e) {
    console.warn('[ai-import] JS rendering unavailable, using raw HTML:', e.message);
    if (renderBrowser && !renderBrowser.isConnected()) renderBrowser = null;
    return null;
  }
}

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
      const raw = { html: Buffer.concat(chunks).toString('utf-8'), finalUrl: res.url || url };
      const hasProductMarkup = /application\/ld\+json|<h1\b|<table\b|product:(?:price|brand|sku)/i.test(raw.html);
      const shouldRender = process.env.AI_IMPORT_RENDER_JS === 'true' || !hasProductMarkup;
      const rendered = shouldRender ? await renderDoc(raw.finalUrl) : null;
      return rendered || raw;
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
      const graph = data && data['@graph'];
      const nodes = Array.isArray(data) ? data : Array.isArray(graph) ? graph : graph ? [graph] : [data];
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
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&#(\d+);?/g, (_m, decimal) => {
      const code = Number(decimal);
      return code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    });
}

function stripTags(s) {
  return decodeEntities(String(s || '')
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/p|\/li|\/tr|\/div|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t\f\r]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim());
}

function extractPrice(text) {
  const t = String(text || '');
  const re = /(?:৳|tk\.?|bdt)\s*([\d,]+(?:\.\d+)?)/gi;
  const candidates = [];
  let m;
  while ((m = re.exec(t))) {
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (!(value >= 50 && value <= 100000000)) continue;
    const before = t.slice(Math.max(0, m.index - 80), m.index).toLowerCase();
    const context = t.slice(Math.max(0, m.index - 100), Math.min(t.length, re.lastIndex + 30)).toLowerCase();
    if (/(?:emi|installment|monthly|per\s+month|month(?:ly)?|down\s+payment)\s*(?:price)?\s*$/i.test(before)) continue;
    const isOldPrice = /\b(?:regular|original|mrp|list|old|was)\s+price\b/i.test(context);
    const isCurrentPrice = /\b(?:special|sale|selling|current|offer|our)\s+price\b/i.test(context);
    candidates.push({ value, score: isCurrentPrice ? 3 : isOldPrice ? 1 : 2 });
  }
  if (!candidates.length) return null;
  const bestScore = Math.max(...candidates.map((x) => x.score));
  return Math.round(Math.min(...candidates.filter((x) => x.score === bestScore).map((x) => x.value)));
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

function extractSpecs(html, ld = {}, products = []) {
  const source = String(html || '');
  const specs = [];
  const add = (k, v) => {
    const key = stripTags(k).replace(/[:：]\s*$/, '').trim();
    const value = stripTags(v).replace(/^[：:]\s*/, '').trim();
    if (!key || !value || key.length > 80 || value.length > 300) return;
    if (/^(?:(?:technical )?(?:specifications?|details?)|attributes?|features?|name|value|select|choose)$/i.test(key)) return;
    if (/^(?:-|—|n\/?a|not specified|none|null)$/i.test(value)) return;
    if (!specs.some((s) => s.k.toLowerCase() === key.toLowerCase())) specs.push({ k: key, v: value });
  };
  const textValue = (value) => {
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ');
    if (value && typeof value === 'object') {
      return textValue(value.name ?? value.value ?? value.valueName ?? value.text ?? '');
    }
    return value == null ? '' : String(value);
  };
  const addStructured = (value, depth = 0) => {
    if (depth > 6 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => addStructured(item, depth + 1));
      return;
    }
    if (typeof value === 'string') {
      const pair = value.match(/^([^:：]{2,70})\s*[:：]\s*(.{1,300})$/);
      if (pair) add(pair[1], pair[2]);
      return;
    }
    if (typeof value !== 'object') return;
    const key = value.name || value.propertyID || value.key || value.label || value.attribute || value.title;
    const rawValue = value.value ?? value.valueText ?? value.valueName ?? value.text;
    if (key && rawValue != null) {
      const unit = value.unitText || value.unit || '';
      const parsedValue = textValue(rawValue);
      add(key, unit && parsedValue && !parsedValue.toLowerCase().includes(String(unit).toLowerCase())
        ? `${parsedValue} ${unit}`
        : parsedValue);
      return;
    }
    for (const [k, child] of Object.entries(value)) {
      if (child == null || typeof child === 'boolean') continue;
      if (typeof child !== 'object') add(k, child);
      else if (child.value != null) {
        const unit = child.unitText || child.unit || '';
        const parsedValue = textValue(child.value);
        add(k, unit && parsedValue && !parsedValue.toLowerCase().includes(String(unit).toLowerCase())
          ? `${parsedValue} ${unit}`
          : parsedValue);
      }
      else addStructured(child, depth + 1);
    }
  };
  const visitStructured = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 10) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visitStructured(item, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (/(?:spec|technicaldetail|productattribute|additionalproperty)/i.test(key)) addStructured(child);
      else if (child && typeof child === 'object') visitStructured(child, depth + 1);
    }
  };
  for (const product of [ld, ...products]) {
    if (!product || typeof product !== 'object') continue;
    addStructured(product.additionalProperty);
    addStructured(product.specification);
    addStructured(product.specifications);
    addStructured(product.specs);
    addStructured(product.technicalDetails);
    addStructured(product.productAttributes);
  }
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let script;
  while ((script = scriptRe.exec(source))) {
    if (!/application\/(?:ld\+)?json|__NEXT_DATA__/i.test(script[1])) continue;
    try { visitStructured(JSON.parse(script[2].trim())); } catch (_e) { /* non-JSON script — skip */ }
  }

  /* Key/value rows used by WooCommerce, Magento, and common vendor tables. */
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(source)) && specs.length < 100) {
    const cells = [...m[1].matchAll(/<(t[dh])\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];
    for (const cell of cells) {
      const label = (cell[2].match(/\bdata-(?:label|title|spec-name)=["']([^"']+)["']/i) || [])[1];
      if (label) add(label, cell[3]);
    }
    if (cells.length >= 2) add(cells[0][3], cells[1][3]);
  }

  /* Definition lists often wrap labels and values in extra markup. */
  const dlRe = /<dt\b[^>]*>([\s\S]*?)<\/dt>[\s\S]{0,300}?<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  while ((m = dlRe.exec(source)) && specs.length < 100) add(m[1], m[2]);

  /* Responsive product pages encode each attribute as a labelled cell. */
  const attrRe = /<([a-z][\w:-]*)\b([^>]*?)>/gi;
  const lowerSource = source.toLowerCase();
  let tag;
  while ((tag = attrRe.exec(source)) && specs.length < 100) {
    const attrs = tag[2];
    const dataKey = (attrs.match(/\bdata-(?:spec-name|attribute|label)=["']([^"']+)["']/i) || [])[1];
    const dataValue = (attrs.match(/\bdata-(?:spec-value|value)=["']([^"']+)["']/i) || [])[1];
    if (dataKey && dataValue) add(dataKey, dataValue);
    const itemprop = (attrs.match(/\bitemprop=["']([^"']+)["']/i) || [])[1];
    if (itemprop === 'additionalProperty') {
      const close = lowerSource.indexOf(`</${tag[1].toLowerCase()}`, attrRe.lastIndex);
      if (close >= 0) {
        const inner = source.slice(attrRe.lastIndex, close);
        const propertyName = (inner.match(/itemprop=["'](?:name|propertyID)["'][^>]*>([\s\S]*?)<\/[^>]+>/i) || [])[1];
        const propertyValue = (inner.match(/itemprop=["']value["'][^>]*>([\s\S]*?)<\/[^>]+>/i) || [])[1];
        if (propertyName && propertyValue) add(propertyName, propertyValue);
      }
    }
    const className = (attrs.match(/\bclass=["']([^"']+)["']/i) || [])[1] || '';
    if (!/(?:spec|technical|attribute)/i.test(className)) continue;
    const close = lowerSource.indexOf(`</${tag[1].toLowerCase()}`, attrRe.lastIndex);
    if (close < 0) continue;
    const inner = source.slice(attrRe.lastIndex, close);
    const children = [...inner.matchAll(/<(span|strong|b|label|dt|dd|th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((child) => stripTags(child[2])).filter(Boolean);
    if (children.length >= 2) add(children[0], children[1]);
    else {
      const line = stripTags(inner);
      const pair = line.match(/^([^:：]{2,70})\s*[:：]\s*(.{1,300})$/);
      if (pair) add(pair[1], pair[2]);
    }
  }

  const listRe = /<(ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  while ((m = listRe.exec(source)) && specs.length < 100) {
    if (!/(?:spec|technical|attribute)/i.test(m[2])) continue;
    const itemRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let item;
    while ((item = itemRe.exec(m[3])) && specs.length < 100) {
      const boldLabel = item[1].match(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>\s*([\s\S]*)/i);
      if (boldLabel) add(boldLabel[2], boldLabel[3]);
      else {
        const line = stripTags(item[1]);
        const pair = line.match(/^([^:：]{2,70})\s*[:：]\s*(.{1,300})$/);
        if (pair) add(pair[1], pair[2]);
      }
    }
  }

  return specs.slice(0, 100);
}

function featuresFromSpecs(specs, evidence = '') {
  const featureKeys = /^(?:other|others|feature|features|key\s+features|highlights?|special\s+features?)$/i;
  const lines = [];
  for (const row of specs || []) {
    if (!featureKeys.test(String(row.k || '').trim())) continue;
    for (const line of String(row.v || '').split(/\n|•|·|\s{2,}/)) {
      if (line.trim()) lines.push(line.trim());
    }
  }
  const noise = /^(shipping|return|refund|warranty policy|payment|delivery|terms|privacy|sign in|login|cart|contact us|home|menu|search|compare|wishlist|add to cart|buy now)$/i;
  return [...new Set(lines.map((line) => String(line).replace(/\s+/g, ' ').trim()))]
    .filter((line) => line.length >= 3 && line.length <= 220 && !noise.test(line))
    .slice(0, 12);
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
  const products = jsonLdProducts(html, pageUrl);
  const ld = products.find((product) => product.name) || products[0] || {};
  const offers = Array.isArray(ld.offers) ? (ld.offers[0] || {}) : (ld.offers || {});
  const ldImages = [].concat(ld.image || []).filter(Boolean).map((i) => (typeof i === 'string' ? i : i.url)).filter(Boolean);

  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const ogTitle = metaContent(html, 'og:title');
  const docTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const name = stripTags(ld.name || ogTitle || h1 || decodeEntities(docTitle || ''))
    .replace(/\s*[-|]\s*(?:arixgear|startech|ryans|star ?tech|buy[^|]*)$/i, '')
    .slice(0, 220);
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
  const brandValue = Array.isArray(ld.brand) ? ld.brand[0] : ld.brand;
  const brandGuess = stripTags(
    brandValue && typeof brandValue === 'object' ? brandValue.name || brandValue.value : brandValue,
  ) || metaContent(html, 'product:brand') || metaContent(html, 'product:manufacturer') ||
    metaContent(html, 'og:brand') || metaContent(html, 'brand');
  const categoryValue = Array.isArray(ld.category) ? ld.category.join(', ') : ld.category;
  const categoryGuess = stripTags(categoryValue && typeof categoryValue === 'object'
    ? categoryValue.name || categoryValue.value
    : categoryValue) || metaContent(html, 'product:category') ||
    metaContent(html, 'product:category_name') || metaContent(html, 'og:category') ||
    metaContent(html, 'article:section');
  const productIdText = bodyText.match(/(?:product\s*(?:id|code)|sku|model\s*(?:no|number)|part\s*(?:no|number))\s*[:#-]?\s*([a-z0-9][a-z0-9._/-]{2,60})/i);
  const specs = extractSpecs(html, ld, products);

  return {
    name,
    brandGuess,
    categoryGuess,
    price: parseFloat(offers.price || metaContent(html, 'product:price:amount')) || extractPrice(bodyText),
    comparePrice: extractComparePrice(html, ld, parseFloat(offers.price || metaContent(html, 'product:price:amount')) || extractPrice(bodyText)),
    currency: offers.priceCurrency || metaContent(html, 'product:price:currency') || 'BDT',
    availability: /instock|in[_-]?stock/i.test(String(offers.availability || '')) ? 'in_stock' : (/preorder/i.test(String(offers.availability || '')) ? 'preorder' : ''),
    sku: String(ld.sku || metaContent(html, 'product:sku') || metaContent(html, 'sku') || (productIdText && productIdText[1]) || '').slice(0, 60),
    shortDesc: (stripTags(ld.description || ogDesc) || '').slice(0, 600),
    specs,
    features: [...new Set([...extractFeatures(html, evidence), ...featuresFromSpecs(specs, evidence)])].slice(0, 12), // product-specific bullets + multiline feature rows
    images: [...new Set([...ldImages, ...imgs])].slice(0, 12),
    ldPriceCurrencyOk: !offers.price || String(offers.priceCurrency || 'BDT').toUpperCase() === 'BDT',
  };
}

/* ---------- 4. rewrite ---------- */
function normalizedSpecPairs(...sources) {
  const out = [];
  const seen = new Set();
  for (const source of sources) {
    for (const row of Array.isArray(source) ? source : []) {
      const k = String(row?.k ?? row?.[0] ?? '').trim().slice(0, 80);
      const v = String(row?.v ?? row?.[1] ?? '').trim().slice(0, 300);
      const key = k.toLowerCase();
      if (!k || !v || seen.has(key)) continue;
      seen.add(key);
      out.push({ k, v });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

function templateRewrite(ex) {
  const specs = normalizedSpecPairs(ex.specs);
  const specLines = specs.slice(0, 8).map((s) => `${s.k}: ${s.v}`).join(' · ');
  const name = String(ex.name || '').trim();
  const shortDesc = String(ex.shortDesc || '').trim();
  const descParts = [];
  if (shortDesc) descParts.push(shortDesc);
  if (specLines) descParts.push(`Key specifications — ${specLines}.`);
  return {
    name,
    nameBn: '',
    shortDesc,
    shortDescBn: '',
    description: descParts.join('\n\n').slice(0, 4000),
    descriptionBn: '',
    specs,
    specsBn: [],
    features: ex.features || [], // Step 5 — bullets ride through verbatim
    featuresBn: [],
    seo: {
      metaTitle: name ? `${name} | ArixGear`.slice(0, 200) : '',
      metaDescription: shortDesc.slice(0, 300),
      metaKeywords: [name, ex.brandGuess].filter(Boolean).join(', ').slice(0, 500),
    },
    source: 'template',
  };
}

function shortlistCatalog(items, query, limit) {
  const terms = new Set(searchTokens(query));
  return (items || [])
    .map((item) => {
      const text = [item.slug, item.name, item.nameBn, item.path].filter(Boolean).join(' ');
      const score = searchTokens(text).reduce((sum, token) => sum + (terms.has(token) ? 1 : 0), 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || String(a.item.name || a.item.slug).localeCompare(String(b.item.name || b.item.slug)))
    .slice(0, limit)
    .map(({ item }) => item);
}

async function aiRewrite(ex, catalog = {}) {
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' },
      nameBn: { type: 'STRING' },
      shortDesc: { type: 'STRING' },
      shortDescBn: { type: 'STRING' },
      description: { type: 'STRING' },
      descriptionBn: { type: 'STRING' },
      specs: { type: 'ARRAY', items: { type: 'OBJECT', properties: { k: { type: 'STRING' }, v: { type: 'STRING' } }, required: ['k', 'v'] } },
      specsBn: { type: 'ARRAY', items: { type: 'OBJECT', properties: { k: { type: 'STRING' }, v: { type: 'STRING' } }, required: ['k', 'v'] } },
      features: { type: 'ARRAY', items: { type: 'STRING' } },
      featuresBn: { type: 'ARRAY', items: { type: 'STRING' } },
      categorySlug: { type: 'STRING' },
      categoryConfidence: { type: 'NUMBER' },
      brandSlug: { type: 'STRING' },
      brandConfidence: { type: 'NUMBER' },
      seo: {
        type: 'OBJECT',
        properties: {
          metaTitle: { type: 'STRING' },
          metaDescription: { type: 'STRING' },
          metaKeywords: { type: 'STRING' },
        },
      },
    },
    required: ['name'],
  };
  const facts = {
    extractedName: ex.name, brand: ex.brandGuess, price: ex.price, currency: ex.currency,
    sourceDescription: (ex.shortDesc || '').slice(0, 1200),
    specifications: (ex.specs || []).slice(0, 14),
    keyFeatures: (ex.features || []).slice(0, 8), // Step 5
  };
  const allCategories = (catalog.categories || []).map((c) => ({
    slug: c.slug,
    name: c.name,
    nameBn: c.nameBn || '',
    path: (c.path || []).join(' > '),
  }));
  const allBrands = (catalog.brands || []).map((b) => ({ slug: b.slug, name: b.name }));
  const catalogQuery = [ex.name, ex.brandGuess, ex.categoryGuess, ex.shortDesc, ...(ex.specs || []).slice(0, 8).map((s) => `${s.k} ${s.v}`)].join(' ');
  const categories = shortlistCatalog(allCategories, catalogQuery, 40);
  const brands = shortlistCatalog(allBrands, `${ex.name} ${ex.brandGuess}`, 30);

  /* Catalog detection is a separate small request. The previous single
     request sent every category and brand alongside the rewrite prompt and
     could exceed a hosted provider's TPM limit. */
  const detectionSchema = {
    type: 'OBJECT',
    properties: {
      categorySlug: { type: 'STRING' },
      categoryConfidence: { type: 'NUMBER' },
      brandSlug: { type: 'STRING' },
      brandConfidence: { type: 'NUMBER' },
    },
  };
  let detected = { categorySlug: '', categoryConfidence: 0, brandSlug: '', brandConfidence: 0 };
  try {
    const detectionOut = await provider.complete({
      system: 'Choose the best exact category and brand slug from the supplied short candidate lists. Return strict JSON only. Use an empty slug and confidence 0 when uncertain.',
      messages: [{
        role: 'user',
        content: 'PRODUCT: ' + JSON.stringify({ name: ex.name, brand: ex.brandGuess, category: ex.categoryGuess, specs: (ex.specs || []).slice(0, 8) }) +
          '\nCATEGORY CANDIDATES: ' + JSON.stringify(categories) +
          '\nBRAND CANDIDATES: ' + JSON.stringify(brands),
      }],
      json: true,
      responseSchema: detectionSchema,
      temperature: 0,
      maxTokens: 300,
    });
    const d = provider.parseJsonLoose(detectionOut.text) || {};
    detected = {
      categorySlug: String(d.categorySlug || ''),
      categoryConfidence: d.categoryConfidence,
      brandSlug: String(d.brandSlug || ''),
      brandConfidence: d.brandConfidence,
    };
  } catch (error) {
    console.warn('[ai-import] catalog detection unavailable; continuing without AI detection:', error.message);
  }
  const detectedCategory = validateCatalogGuess(detected.categorySlug, detected.categoryConfidence, categories);
  const detectedBrand = validateCatalogGuess(detected.brandSlug, detected.brandConfidence, brands);
  const selectedCategory = categories.find((c) => c.slug === detectedCategory.slug) || null;
  const selectedBrand = brands.find((b) => b.slug === detectedBrand.slug) || null;
  const out = await provider.complete({
    system: [
      'You are the SEO copywriter for arixgear.tech, a Bangladeshi tech & gadget store (BDT ৳).',
      'Rewrite the supplied RAW PRODUCT DATA into unique, original storefront copy.',
      'Hard rules: use ONLY facts present in the raw data — never invent specs, numbers or features;',
      'do not mention the source website; do not copy the source description verbatim — rephrase;',
      'write natural, professional English AND natural Bangla (Bengali script).',
      'Use only the supplied selected category and brand values; do not create categories or brands.',
      'Return categoryConfidence and brandConfidence as numbers from 0 to 1; keep them low when evidence is weak.',
      'Return STRICT JSON only, matching this valid JSON shape: {"name":"...","nameBn":"...","shortDesc":"...","shortDescBn":"...","description":"...","descriptionBn":"...",',
      '"specs":[{"k":"...","v":"..."}],"specsBn":[{"k":"...","v":"..."}],"features":["..."],"featuresBn":["..."],',
      '"categorySlug":"...","categoryConfidence":0,"brandSlug":"...","brandConfidence":0,',
      '"seo":{"metaTitle":"...","metaDescription":"...","metaKeywords":"..."}}',
    ].join(' '),
    messages: [{
      role: 'user',
      content: 'RAW PRODUCT DATA AND SELECTED CATALOG VALUES:\n' + JSON.stringify({ facts, selectedCategory, selectedBrand }, null, 1),
    }],
    json: true,
    responseSchema,
    temperature: 0.5,
    maxTokens: 1100,
  });
  const j = provider.parseJsonLoose(out.text);
  if (!j || !j.name) throw new Error('AI rewrite returned unusable JSON');
  const category = validateCatalogGuess(j.categorySlug || detectedCategory.slug, j.categoryConfidence ?? detectedCategory.confidence, allCategories);
  const brand = validateCatalogGuess(j.brandSlug || detectedBrand.slug, j.brandConfidence ?? detectedBrand.confidence, allBrands);
  const strArr = (x) => (Array.isArray(x) ? x.map((s) => String(s || '').trim().slice(0, 300)).filter(Boolean).slice(0, 12) : []);
  const template = templateRewrite(ex);
  const textOr = (value, fallback) => String(value || '').trim() || String(fallback || '').trim();
  const name = textOr(j.name, ex.name);
  const shortDesc = textOr(j.shortDesc, ex.shortDesc || name);
  const shortDescBn = textOr(j.shortDescBn, j.nameBn || shortDesc);
  const description = textOr(j.description, template.description || shortDesc);
  const descriptionBn = textOr(j.descriptionBn, shortDescBn || description);
  const seoTitle = textOr(j.seo?.metaTitle, `${name} | ArixGear`).slice(0, 200);
  const seoDescription = textOr(j.seo?.metaDescription, shortDesc || description).slice(0, 300);
  const specs = normalizedSpecPairs(ex.specs);
  /* If extraction found no pairs, retain a model-returned spec list as a
     secondary fallback. When extraction did find specs, it remains the source
     of truth and model output cannot replace it with invented rows. */
  if (!specs.length) specs.push(...normalizedSpecPairs(j.specs));
  return {
    content: {
      name: name.slice(0, 220),
      nameBn: textOr(j.nameBn, name).slice(0, 220),
      shortDesc: shortDesc.slice(0, 500),
      shortDescBn: shortDescBn.slice(0, 500),
      description: description.slice(0, 6000),
      descriptionBn: descriptionBn.slice(0, 6000),
      specs,
      specsBn: [],
      /* Raw extracted bullets are the source of truth for product features;
         the model may rewrite copy, but must not invent or mix feature lists. */
      features: (ex.features || []).slice(0, 12),
      featuresBn: strArr(j.featuresBn).slice(0, (ex.features || []).length),
      seo: {
        metaTitle: seoTitle,
        metaDescription: seoDescription,
        metaKeywords: textOr(j.seo?.metaKeywords, [name, ex.brandGuess].filter(Boolean).join(', ')).slice(0, 500),
      },
      source: 'ai',
    },
    detection: {
      categorySlug: category.slug,
      categoryConfidence: category.confidence,
      brandSlug: brand.slug,
      brandConfidence: brand.confidence,
      provider: out.provider || 'ai',
      model: out.model || '',
    },
    usage: { promptTokens: out.promptTokens, completionTokens: out.completionTokens },
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
async function fetchImageBuffer(url) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertFetchable(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'ArixGearImportBot/1.0 (+https://arixgear.tech/ai-import)',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get('location');
        if (!location) throw new Error(`Image redirect ${res.status} has no target`);
        current = new URL(location, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Image source returned HTTP ${res.status}`);
      const type = String(res.headers.get('content-type') || '').toLowerCase();
      if (!type.startsWith('image/')) throw new Error(`Image source returned ${type || 'an unknown content type'}`);
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > 12 * 1024 * 1024) throw new Error('Image is larger than 12MB');
      let size = 0;
      const chunks = [];
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) throw new Error('Image is larger than 12MB');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } finally { clearTimeout(timer); }
  }
  throw new Error('Too many image redirects');
}

function uploadImageBuffer(cloudinary, buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'arixgear/imports', overwrite: false, resource_type: 'image' },
      (error, result) => error ? reject(error) : resolve(result),
    );
    stream.end(buffer);
  });
}

async function uploadRemoteImage(cloudinary, url) {
  try {
    return await cloudinary.uploader.upload(url, { folder: 'arixgear/imports', overwrite: false, timeout: 20000 });
  } catch (directError) {
    /* Some origins reject Cloudinary's fetcher but allow a normal server-side
       request. Download through the guarded backend and upload the bytes. */
    const buffer = await fetchImageBuffer(url);
    try { return await uploadImageBuffer(cloudinary, buffer); }
    catch (bufferError) {
      bufferError.message = `${directError.message}; buffered upload: ${bufferError.message}`;
      throw bufferError;
    }
  }
}

async function rehostImages(images, maxImages) {
  const { cloudinary, isCloudinaryEnabled } = require('../../config/cloudinary');
  const list = [...new Set((images || []).filter((u) => /^https?:\/\//i.test(u)))].slice(0, maxImages);
  if (!isCloudinaryEnabled) return list.map((url) => ({ url, publicId: '' }));
  const out = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      const url = list[index];
      try {
        const r = await uploadRemoteImage(cloudinary, url);
        out[index] = { url: r.secure_url, publicId: r.public_id };
      } catch (e) {
        console.warn('[ai-import] cloudinary upload failed, keeping remote URL:', e.message);
        out[index] = { url, publicId: '' };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, list.length) }, () => worker()));
  return out.filter(Boolean);
}

/* ---------- imports (top of file already has specsUtil via lazy require) ---------- */
const specsUtil = require('../../utils/specs'); // Step 5 — dynamic spec system
const cache = require('../../services/cache');   // Step 5 — schema changes drop facet cache
const { auditSchemaMutation } = require('../specAudit'); // Step 6 — AI auto-create is audited too
const mongoose = require('mongoose');

/* ---------- category / brand guessing ---------- */
const DETECT_STOP_WORDS = new Set(['and', 'for', 'the', 'with', 'from', 'new', 'product', 'series', 'model', 'price', 'official']);

function searchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchTokens(value) {
  return searchText(value).split(' ').filter(Boolean).map((word) => {
    if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1);
    return word;
  });
}

function validateCatalogGuess(value, rawConfidence, catalog) {
  const confidence = Number(rawConfidence);
  const slug = typeof value === 'string' ? value.trim() : '';
  if (!slug || !catalog.some((item) => item.slug === slug) || !Number.isFinite(confidence) || confidence < 0.6 || confidence > 1) {
    return { slug: '', confidence: 0 };
  }
  return { slug, confidence };
}

function guessCategory(ex, categories = []) {
  const source = [
    ex.name,
    ex.shortDesc,
    ex.categoryGuess,
    ...(ex.specs || []).flatMap((s) => [s.k, s.v]),
    ...(ex.features || []),
  ].filter(Boolean).join(' ');
  const sourceText = searchText(source);
  const sourceTokens = new Set(searchTokens(source));
  const hint = searchText(ex.categoryGuess);
  let best = null;
  let bestScore = 0;
  let bestDepth = -1;
  let bestExactHint = false;
  let bestPhraseMatch = false;

  for (const category of categories) {
    const ownValues = [category.slug, category.name, category.nameBn].filter(Boolean);
    const ownText = ownValues.map(searchText);
    const ownTokens = new Set(ownValues.flatMap(searchTokens).filter((w) => w.length > 2 && !DETECT_STOP_WORDS.has(w)));
    let score = 0;
    for (const word of ownTokens) {
      if (sourceTokens.has(word)) score += word.length >= 5 ? 1.5 : 1;
    }

    const exactHint = !!hint && ownText.some((value) => value === hint || value.replace(/\s+/g, '-') === hint.replace(/\s+/g, '-'));
    const phraseMatch = ownText.some((value) => value.length >= 4 && sourceText.includes(value));
    if (exactHint) score += 10;
    else if (phraseMatch) score += 3;

    const depth = Array.isArray(category.path) ? category.path.length : 0;
    score += Math.min(depth, 4) * 0.05;
    if (score > bestScore || (score === bestScore && depth > bestDepth)) {
      best = category;
      bestScore = score;
      bestDepth = depth;
      bestExactHint = exactHint;
      bestPhraseMatch = phraseMatch;
    }
  }

  if (!best || bestScore < 1.5) return { slug: '', confidence: 0 };
  const confidence = bestExactHint ? 0.98 : bestPhraseMatch ? 0.82 : bestScore >= 4 ? 0.72 : 0.58;
  return { slug: best.slug, confidence };
}

function guessBrand(ex, brands = []) {
  const explicit = searchText(ex.brandGuess);
  const productTokens = new Set(searchTokens(`${ex.name || ''} ${ex.shortDesc || ''}`));
  const candidates = [...brands].sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  for (const brand of candidates) {
    const name = searchText(brand.name);
    const slug = searchText(brand.slug);
    const tokens = searchTokens(name).filter((word) => word.length > 1);
    const explicitMatch = explicit && (explicit === name || explicit === slug || explicit.includes(name));
    const titleMatch = tokens.length && tokens.every((word) => productTokens.has(word));
    if (explicitMatch || titleMatch) {
      return { slug: brand.slug, id: brand._id, confidence: explicitMatch ? 0.96 : 0.82 };
    }
  }
  return { slug: '', id: null, confidence: 0 };
}

function catalogSlug(value, prefix) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return slugify(raw) || `${prefix}-${createHash('sha1').update(raw.toLowerCase()).digest('hex').slice(0, 8)}`;
}

function resolveImportDetection(ex, ruleCategory, ruleBrand, ai = {}) {
  const categoryFromAi = String(ai.categorySlug || '').trim();
  const brandFromAi = String(ai.brandSlug || '').trim();
  const categorySlug = categoryFromAi || ruleCategory.slug || catalogSlug(ex.categoryGuess, 'category');
  const brandSlug = brandFromAi || ruleBrand.slug || catalogSlug(ex.brandGuess, 'brand');
  return {
    categorySlug,
    categoryConfidence: categoryFromAi ? ai.categoryConfidence : ruleCategory.slug ? ruleCategory.confidence : 0,
    categorySource: categoryFromAi ? (ai.provider || 'ai') : ruleCategory.slug ? 'rules' : categorySlug ? 'source' : 'none',
    brandSlug,
    brandConfidence: brandFromAi ? ai.brandConfidence : ruleBrand.slug ? ruleBrand.confidence : 0,
    brandSource: brandFromAi ? (ai.provider || 'ai') : ruleBrand.slug ? 'rules' : brandSlug ? 'source' : 'none',
    provider: ai.provider || 'rules',
    model: ai.model || '',
  };
}

const titleFromSlug = (value) => String(value || '').split('-').filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');

async function ensureImportCategory(slug, label, parentSlug = '') {
  const clean = catalogSlug(slug || label, 'category');
  if (!clean) return { categoryRef: null, categoryPath: [] };
  let doc = await Category.findOne({ slug: clean });
  if (!doc) {
    let parent = null;
    const cleanParent = catalogSlug(parentSlug, 'category');
    if (cleanParent) {
      parent = await Category.findOne({ slug: cleanParent });
      if (!parent) {
        const error = new Error('Selected parent category no longer exists');
        error.status = 400;
        throw error;
      }
      if (parent.slug === clean) {
        const error = new Error('A category cannot be its own parent');
        error.status = 400;
        throw error;
      }
    }
    const parentPath = parent
      ? (parent.path && parent.path.length ? parent.path : [parent.slug])
      : [];
    try {
      doc = await Category.create({
        name: String(label || titleFromSlug(clean)).trim().slice(0, 80),
        slug: clean,
        parent: parent ? parent._id : null,
        path: [...parentPath, clean],
        active: true,
        order: 999,
      });
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
  const clean = catalogSlug(raw || fallbackName, 'brand');
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

function selectedBrandSource(edits, doc) {
  if (edits.brandId !== undefined) {
    if (edits.brandId === 'none' || !edits.brandId) return '';
    if (edits.brandId === 'create') return String(edits.brandName || doc.brandName || doc.extracted?.brandGuess || '').trim();
    return edits.brandId;
  }
  if (edits.brandName !== undefined) return String(edits.brandName || '').trim();
  return doc.brand || doc.brandName || doc.brandGuessSlug || '';
}

/* ---------- queue ---------- */
const IMPORT_STALE_MS = 10 * 60 * 1000;
const processing = new Map();
let recoveringPending = false;

async function processImport(id) {
  const key = String(id);
  const activeRun = processing.get(key);
  if (activeRun && Date.now() - activeRun.startedAt < IMPORT_STALE_MS) return;
  const runToken = randomUUID();
  processing.set(key, { token: runToken, startedAt: Date.now() });
  const started = Date.now();
  let usage = { promptTokens: 0, completionTokens: 0 };
  let metaProvider = 'template';
  let claimed = false;
  const persist = async (fields, finish = false) => {
    const update = { $set: fields };
    if (finish) update.$unset = { processingToken: 1 };
    const result = await AiImport.updateOne(
      { _id: id, processingToken: runToken },
      update,
    );
    if (result.matchedCount !== 1) {
      throw new Error('Import run was superseded; its result was discarded');
    }
    return result;
  };
  try {
    const doc = await AiImport.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        $set: {
          status: 'processing',
          progress: 10,
          error: '',
          processingToken: runToken,
        },
      },
      { new: true },
    );
    if (!doc) return;
    claimed = true;

    await assertFetchable(doc.sourceUrl);
    const { html, finalUrl } = await fetchDoc(doc.sourceUrl);
    await persist({ progress: 30 });

    const ex = extract(html, finalUrl);
    const extracted = { ...ex, specs: ex.specs, images: ex.images, features: ex.features };
    const host = new URL(finalUrl).hostname;
    await persist({ extracted, host, progress: 55 });
    /* Image re-hosting is independent of AI rewriting; start it now so a slow
       provider does not add the image-upload time to the import critical path. */
    const cfgPromise = AiSetting.get();
    const imagesPromise = cfgPromise.then((cfg) => rehostImages(ex.images, cfg.import?.maxImages || 8));

    const dups = await detectDuplicates(ex, doc.sourceUrl);
    const duplicates = dups.filter((d) => d.productId);
    const duplicateOf = dups[0] && dups[0].score >= 0.95 && dups[0].productId ? dups[0].productId : null;
    await persist({ duplicates, duplicateOf });

    const [categories, brands] = await Promise.all([
      Category.find({}).select('name nameBn slug path').lean(),
      Brand.find({}).select('name slug').lean(),
    ]);
    const ruleCategory = guessCategory(ex, categories);
    const ruleBrand = guessBrand(ex, brands);
    let detection = resolveImportDetection(ex, ruleCategory, ruleBrand);

    /* rewrite: AI when available, grounded template otherwise */
    let content;
    if (!ex.name) {
      content = templateRewrite(ex);
      metaProvider = 'template';
    } else {
      try {
        const result = await aiRewrite(ex, { categories, brands });
        content = result.content;
        detection = resolveImportDetection(ex, ruleCategory, ruleBrand, result.detection);
        usage = result.usage || usage;
        metaProvider = content.source;
      } catch (e) {
        console.warn('[ai-import] AI rewrite unavailable → template:', e.message);
        content = templateRewrite(ex);
        metaProvider = 'template';
      }
    }
    /* Keep extraction as the final source of truth for specs. This also
       repairs older/staged imports whose template content was saved without
       the specs array, so approval can still auto-create the schema fields. */
    content.specs = normalizedSpecPairs(content.specs, ex.specs);
    const autoDetect = {
      categorySource: detection.categorySource,
      categoryConfidence: detection.categoryConfidence,
      brandSource: detection.brandSource,
      brandConfidence: detection.brandConfidence,
      model: detection.model,
    };
    await persist({ aiContent: content, autoDetect, progress: 80 });

    /* pricing + guesses (admin-editable before approval) */
    const price = doc.price ?? ex.price ?? null;
    const comparePrice = doc.comparePrice ?? ex.comparePrice ?? null;
    const categoryGuess = detection.categorySlug;
    const brandGuessSlug = detection.brandSlug;
    const category = doc.category || categoryGuess;
    let brand = doc.brand;
    if (!brand && brandGuessSlug) {
      const matchedBrand = brands.find((b) => b.slug === brandGuessSlug);
      if (matchedBrand) brand = matchedBrand._id;
    }

    const images = await imagesPromise;
    await persist({
      price,
      comparePrice,
      category,
      categoryGuess,
      brandGuessSlug,
      ...(brand ? { brand } : {}),
      images,
      progress: 100,
      status: 'ready',
      meta: {
        provider: metaProvider,
        durationMs: Date.now() - started,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
    }, true);
    AiStat.bump({ importEvent: duplicateOf ? 'duplicates' : 'staged' });
  } catch (e) {
    if (claimed) {
      try {
        const result = await AiImport.updateOne(
          { _id: id, processingToken: runToken },
          {
            $set: {
              status: 'failed',
              error: String(e.message || e).slice(0, 600),
            },
            $unset: { processingToken: 1 },
          },
        );
        if (result.matchedCount) AiStat.bump({ importEvent: 'failed' });
      } catch (persistError) {
        console.error(`[ai-import] failed to persist failure for ${id}:`, persistError.message);
      }
    }
  } finally {
    if (processing.get(key)?.token === runToken) processing.delete(key);
  }
}

async function recoverStuckImports() {
  const cutoff = new Date(Date.now() - IMPORT_STALE_MS);
  const stale = await AiImport.updateMany(
    { status: 'processing', updatedAt: { $lt: cutoff } },
    {
      $set: {
        status: 'failed',
        error: 'Import was interrupted or stalled. Retry this import.',
      },
      $unset: { processingToken: 1 },
    },
  );
  const pending = await AiImport.find({ status: 'pending' }).select('_id').lean();
  let resumed = 0;
  if (pending.length && !recoveringPending) {
    recoveringPending = true;
    resumed = pending.length;
    (async () => {
      for (const item of pending) await processImport(item._id);
    })()
      .catch((error) => console.error('[ai-import] could not resume pending imports:', error.message))
      .finally(() => { recoveringPending = false; });
  }
  return {
    failed: stale.modifiedCount || 0,
    resumed,
  };
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

  const name = String(b.name ?? content.name ?? doc.extracted?.name ?? '').trim();
  if (!name) { const e = new Error('Product name was not extracted — enter a product name before approval'); e.status = 400; throw e; }
  const price = Number(b.price ?? doc.price ?? doc.extracted?.price ?? 0);
  if (!price || price <= 0) { const e = new Error('A valid price is required before approval'); e.status = 400; throw e; }

  const settings = await AiSetting.get();
  const categoryManual = b.categoryManual ?? doc.categoryManual ?? false;
  const categoryLabel = String(categoryManual
    ? (Object.prototype.hasOwnProperty.call(b, 'category') ? b.category : doc.manualCategoryName || doc.category)
    : b.category || doc.category || doc.categoryGuess || settings.import?.defaultCategory || '').trim();
  if (categoryManual && !categoryLabel) {
    const e = new Error('Enter a category name before approving this import'); e.status = 400; throw e;
  }
  const category = catalogSlug(categoryLabel, 'category');
  if (!category) { const e = new Error('Choose a category before approving this import'); e.status = 400; throw e; }
  const sourceCategory = String(doc.extracted?.categoryGuess || '').trim();
  const categoryName = !categoryManual && sourceCategory && catalogSlug(sourceCategory, 'category') === category
    ? sourceCategory
    : categoryLabel;
  const categoryParent = categoryManual ? String(b.categoryParent ?? doc.categoryParent ?? '').trim() : '';
  const catRefs = await ensureImportCategory(category, categoryName, categoryParent);
  const brandSource = selectedBrandSource(b, doc);
  if (b.brandId === 'create' && !brandSource) { const e = new Error('Enter a brand name before creating it'); e.status = 400; throw e; }
  const brandId = brandSource
    ? await ensureImportBrand(brandSource, b.brandName || doc.brandName || doc.extracted?.brandGuess || brandSource)
    : null;
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
  const specs = normalizedSpecPairs(b.specs, content.specs, doc.extracted?.specs);

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
  if ((edits.categoryManual ?? doc.categoryManual) && !String(edits.category ?? doc.manualCategoryName ?? '').trim()) {
    const e = new Error('Enter a category name before updating this product'); e.status = 400; throw e;
  }
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
    const slugC = catalogSlug(b.category, 'category');
    if (slugC && slugC !== target.category) {
      target.category = slugC;
      const sourceCategory = String(doc.extracted?.categoryGuess || '').trim();
      const categoryName = !(b.categoryManual ?? doc.categoryManual) && sourceCategory && catalogSlug(sourceCategory, 'category') === slugC
        ? sourceCategory
        : b.category;
      const categoryParent = (b.categoryManual ?? doc.categoryManual)
        ? String(b.categoryParent ?? doc.categoryParent ?? '').trim()
        : '';
      Object.assign(target, await ensureImportCategory(slugC, categoryName, categoryParent));
    }
  }
  if (b.brandId !== undefined || b.brandName !== undefined || !target.brand) {
    const brandSource = selectedBrandSource(b, doc);
    if (b.brandId === 'create' && !brandSource) { const e = new Error('Enter a brand name before creating it'); e.status = 400; throw e; }
    target.brand = brandSource
      ? await ensureImportBrand(brandSource, b.brandName || doc.brandName || doc.extracted?.brandGuess || brandSource)
      : null;
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
  const specs = normalizedSpecPairs(b.specs, content.specs, doc.extracted?.specs);
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

module.exports = {
  stage,
  processImport,
  recoverStuckImports,
  IMPORT_STALE_MS,
  approveImport,
  updateExistingImport,
  updateDiff,
  normalizeUrl,
  assertFetchable,
  extract,
  detectDuplicates,
  templateRewrite,
  aiRewrite,
  similarity,
  extractPrice,
  guessCategory,
  guessBrand,
  ensureImportCategory,
  ensureImportBrand,
  resolveImportDetection,
  validateCatalogGuess,
};
