/* ArixGear — Google API service (Task 26)
   One GCP service account powers everything Google-related:
   • Indexing API       — urlNotifications:publish (URL_UPDATED / URL_DELETED)
   • Search Console API — sitemaps.submit + sitemaps.list (submission automation)
   • GA4 Data API       — runReport (e-commerce funnel on the admin dashboard)
   Auth = RS256 JWT signed with the node `crypto` module, exchanged at the
   OAuth2 token endpoint (zero extra dependencies, Node 18+ global fetch).
   No credentials configured → every call becomes a logged DRY-RUN, so the
   whole automation is testable end-to-end before Google is ever touched.  */
const crypto = require('crypto');
const { SeoSite } = require('../models/Seo');
const GscLog = require('../models/GscLog');

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/indexing',       // Indexing API (URL submission)
  'https://www.googleapis.com/auth/webmasters',     // Search Console (sitemams submit/list)
  'https://www.googleapis.com/auth/analytics.readonly', // GA4 Data API (funnel report)
].join(' ');

/* Google Indexing API quota is 200 publishes/day by default — batch caps at
   half that so one click can never burn the whole quota.                   */
const INDEX_CAP = 100;

/* ─────────────── helpers ─────────────── */

const normalizeKey = (pem) => String(pem || '').replace(/\\n/g, '\n').trim();

function isConfigured(site) {
  return !!(site && site.googleService && site.googleService.clientEmail && site.googleService.privateKey);
}

/* doc with the private key included (key is select:false on the schema) */
async function loadSite() {
  return SeoSite.findOne({ key: 'seo' }).select('+googleService.privateKey') || SeoSite.get();
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/* token cache — one RSA sign + token round-trip per hour, not per call */
let tokenCache = { token: '', exp: 0, sig: '' };

function assertPem(pem) {
  crypto.createSign('RSA-SHA256');
  const key = normalizeKey(pem);
  if (!key.includes('PRIVATE KEY')) {
    const err = new Error('The service account key must be the full PEM private key from the Google JSON file');
    err.status = 400;
    throw err;
  }
  return key;
}

async function getAccessToken(site) {
  const now = Math.floor(Date.now() / 1000);
  const sig = site.googleService.clientEmail + '|' + site.googleService.privateKey.length;
  if (tokenCache.token && tokenCache.exp > now + 60 && tokenCache.sig === sig) return tokenCache.token;

  const key = assertPem(site.googleService.privateKey);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: site.googleService.clientEmail,
    scope: SCOPES,
    aud: OAUTH_URL,
    iat: now,
    exp: now + 3600,
  }));
  let signed;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    signed = signer.sign(key);
  } catch (e) {
    const err = new Error('Service account private key could not be parsed — paste the "private_key" value from the JSON file');
    err.status = 400;
    throw err;
  }
  const assertion = `${header}.${claim}.${b64url(signed)}`;

  let res, data;
  try {
    res = await fetch(OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(12000),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    const err = new Error('Could not reach Google OAuth — ' + (e.cause?.code || e.name || 'network error'));
    err.tokenError = true;
    throw err;
  }
  if (!res.ok) {
    const err = new Error('Google rejected the service account — ' + (data.error_description || data.error || `HTTP ${res.status}`));
    err.tokenError = true;
    throw err;
  }
  tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600), sig };
  return tokenCache.token;
}

/* authenticated JSON call — returns { ok, status, data } (never throws) */
async function gFetch(url, { method = 'GET', token, body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: {}, error: e.cause?.code || e.name || 'network error' };
  }
}

const gErr = (r) => (r.data && r.data.error && r.data.error.message) || (r.error ? r.error + ' (network)' : `HTTP ${r.status}`);

/* ─────────────── Indexing API (URL submission) ─────────────── */

/* Submit one URL to Google. Logs every attempt (live or dry-run) and always
   resolves — callers never need try/catch.                                 */
async function publishUrl({ url, type = 'URL_UPDATED', note = '' }) {
  const site = await loadSite();
  const configured = isConfigured(site);
  const entry = {
    kind: 'url', target: url, type,
    mode: configured ? 'live' : 'dry-run',
    ok: false, status: 0, message: '',
  };
  if (!note) entry.message = '';
  if (!configured) {
    entry.ok = true; /* dry-run is a success — it proves the pipeline works */
    entry.message = ['Dry-run — service account not configured', note].filter(Boolean).join(' · ');
    await GscLog.log(entry);
    return entry;
  }
  if (!/^https?:\/\//i.test(url)) {
    entry.message = 'Rejected — URL must be absolute (https://…)' + (note ? ` · ${note}` : '');
    await GscLog.log(entry);
    return entry;
  }
  try {
    const token = await getAccessToken(site);
    const r = await gFetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST', token, body: { url, type },
    });
    entry.ok = r.ok;
    entry.status = r.status;
    entry.message = [
      r.ok ? 'Accepted by Google' : gErr(r),
      note,
    ].filter(Boolean).join(' · ');
    /* 403 here almost always means the SA was not added as an owner in GSC */
    if (!r.ok && r.status === 403) entry.message += ' — add the service account email as an Owner of this property in Search Console';
  } catch (e) {
    entry.message = [String(e.message || e), note].filter(Boolean).join(' · ');
  }
  await GscLog.log(entry);
  return entry;
}

/* ─────────────── Search Console API (sitemap submission) ─────────────── */

async function submitSitemap(site) {
  const configured = isConfigured(site);
  const sitemapUrl = (site.siteUrl || '').replace(/\/+$/, '') + '/sitemap.xml';
  const entry = {
    kind: 'sitemap', target: sitemapUrl, type: 'SITEMAP_SUBMIT',
    mode: configured ? 'live' : 'dry-run', ok: false, status: 0, message: '',
  };
  if (!configured) {
    entry.ok = true;
    entry.message = 'Dry-run — service account not configured';
    await GscLog.log(entry);
    return entry;
  }
  if (!site.gsc || !site.gsc.siteUrl) {
    entry.message = 'Rejected — set the GSC property (siteUrl) first';
    await GscLog.log(entry);
    return entry;
  }
  try {
    const token = await getAccessToken(site);
    const base = encodeURIComponent(site.gsc.siteUrl);
    const feed = encodeURIComponent(sitemapUrl);
    const r = await gFetch(`https://www.googleapis.com/webmasters/v3/sites/${base}/sitemaps/${feed}`, { method: 'PUT', token });
    entry.ok = r.ok;
    entry.status = r.status;
    entry.message = r.ok ? 'Sitemap submitted to Search Console' : gErr(r);
  } catch (e) {
    entry.message = String(e.message || e);
  }
  await GscLog.log(entry);
  return entry;
}

/* list sitemaps Google already knows about (status chips in the admin UI) */
async function listSitemaps(site) {
  const configured = isConfigured(site);
  if (!configured || !site.gsc || !site.gsc.siteUrl) return { sitemap: [] };
  try {
    const token = await getAccessToken(site);
    const base = encodeURIComponent(site.gsc.siteUrl);
    const r = await gFetch(`https://www.googleapis.com/webmasters/v3/sites/${base}/sitemaps`, { token });
    if (!r.ok) return { error: gErr(r) };
    return { sitemap: r.data.sitemap || [] };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

/* ─────────────── GA4 Data API (dashboard funnel) ─────────────── */

async function ga4RunReport(site, propertyId, body) {
  const token = await getAccessToken(site);
  const r = await gFetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: 'POST', token, body,
  });
  if (!r.ok) {
    const err = new Error(gErr(r));
    err.status = r.status;
    err.ga4 = true;
    if (r.status === 403) err.message += ' — add the service account email as a Viewer in GA4 → Admin → Property access management';
    throw err;
  }
  return r.data;
}

/* ─────────────── automations (fire-and-forget hooks) ─────────────── */

/* Called by adminController on product create/update/delete. PDP is a
   client-side modal over /shop, so /shop is the indexable product URL —
   re-pinging it tells Google the product listing changed. Never blocks,
   never throws, silently no-ops until the admin opts in.                  */
function autoNotifyProduct(event, product) {
  (async () => {
    const site = await loadSite();
    if (!site.gsc || !site.gsc.autoSubmitProducts) return;
    if (!site.siteUrl) return;
    const base = site.siteUrl.replace(/\/+$/, '');
    /* publishUrl handles the no-credentials case as a logged dry-run */
    await publishUrl({
      url: `${base}/shop`,
      type: 'URL_UPDATED',
      note: `auto: product ${event} (${product.slug || product._id})`,
    });
  })().catch(() => {});
}

/* Called by seoController when sitemap settings change + toggle is on */
async function autoSubmitSitemap() {
  try {
    const site = await loadSite();
    if (!site.gsc || !site.gsc.autoSubmitSitemap) return;
    if (!site.gsc.siteUrl || !site.siteUrl) return;
    /* submitSitemap handles the no-credentials case as a logged dry-run */
    await submitSitemap(site);
  } catch (_) { /* automation must never break the request */ }
}

module.exports = {
  INDEX_CAP,
  normalizeKey,
  isConfigured,
  loadSite,
  getAccessToken,
  publishUrl,
  submitSitemap,
  listSitemaps,
  ga4RunReport,
  autoNotifyProduct,
  autoSubmitSitemap,
};
