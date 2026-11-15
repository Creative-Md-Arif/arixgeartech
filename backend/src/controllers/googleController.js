/* ArixGear controller — Google services (Task 26)
   • Search Console submission automation: status / settings / submit URL /
     submit sitemap / batch-index every sitemap URL / submission log
   • GA4 Data API funnel report for the admin dashboard
   Everything is adminOnly (mounted under /api/admin).                      */
const crypto = require('crypto');
const { SeoSite } = require('../models/Seo');
const GscLog = require('../models/GscLog');
const google = require('../services/googleApi');
const seo = require('./seoController');

/* ─────────────── GSC: status + settings ─────────────── */

// GET /api/admin/seo/gsc — connection state + sitemaps Google knows about
exports.gscStatus = async (_req, res, next) => {
  try {
    /* +privateKey so hasKey/isConfigured are correct — the key itself is
       NEVER returned, only its presence */
    const site = (await SeoSite.findOne({ key: 'seo' }).select('+googleService.privateKey')) || (await SeoSite.get());
    const configured = google.isConfigured(site);
    let sitemaps = [];
    let sitemapsError = '';
    if (configured && site.gsc && site.gsc.siteUrl) {
      const r = await google.listSitemaps(site);
      if (r.error) sitemapsError = r.error;
      else sitemaps = r.sitemap || [];
    }
    res.json({
      configured,
      hasKey: !!(site.googleService && site.googleService.privateKey),
      clientEmail: (site.googleService && site.googleService.clientEmail) || '',
      gsc: site.gsc || {},
      ga4PropertyId: (site.ga4 && site.ga4.propertyId) || '',
      sitemaps,
      sitemapsError,
      indexCap: google.INDEX_CAP,
    });
  } catch (e) { next(e); }
};

// PUT /api/admin/seo/gsc/settings — service account + GSC property + automations
exports.gscSave = async (req, res, next) => {
  try {
    const site = await SeoSite.findOne({ key: 'seo' }).select('+googleService.privateKey') || await SeoSite.get();
    const b = req.body || {};

    const email = String(b.clientEmail || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Service account email is not valid' });
    }
    /* private key is write-only: non-empty = replace, empty = keep existing.
       Clearing the email clears the whole pair (email+key go together).   */
    const keyRaw = String(b.privateKey || '').trim();
    if (email) {
      if (keyRaw) {
        try { crypto.createSign('RSA-SHA256').sign(google.normalizeKey(keyRaw)); }
        catch (_) { return res.status(400).json({ message: 'Private key is not a valid PEM key — paste the full "private_key" value from the Google JSON file' }); }
        site.googleService.privateKey = google.normalizeKey(keyRaw).slice(0, 4000);
      }
      site.googleService.clientEmail = email;
    } else {
      site.googleService.clientEmail = '';
      site.googleService.privateKey = '';
    }

    /* GSC property — normal https URL (trailing slash trimmed) or sc-domain:… */
    const prop = String(b.gscSiteUrl || '').trim();
    if (prop && !/^https:\/\/[^\s]+$|^sc-domain:[^\s]+$/i.test(prop)) {
      return res.status(400).json({ message: 'GSC property must be https://… or sc-domain:example.com' });
    }
    site.gsc = {
      siteUrl: prop.replace(/\/+$/, ''),
      autoSubmitProducts: !!b.autoSubmitProducts,
      autoSubmitSitemap: !!b.autoSubmitSitemap,
    };

    /* GA4 reporting property — numeric only */
    const pid = String(b.ga4PropertyId || '').trim();
    if (pid && !/^\d{4,20}$/.test(pid)) {
      return res.status(400).json({ message: 'GA4 Property ID must be numeric (GA4 → Admin → Property settings)' });
    }
    site.ga4 = { propertyId: pid };

    await site.save();
    res.json({
      ok: true,
      hasKey: !!site.googleService.privateKey,
      clientEmail: site.googleService.clientEmail,
      gsc: site.gsc,
      ga4PropertyId: site.ga4.propertyId,
    });
  } catch (e) { next(e); }
};

/* ─────────────── GSC: submission actions ─────────────── */

// POST /api/admin/seo/gsc/submit-url { url, type? } — Indexing API
exports.gscSubmitUrl = async (req, res, next) => {
  try {
    const b = req.body || {};
    let url = String(b.url || '').trim();
    const type = b.type === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED';
    if (!url) return res.status(400).json({ message: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) {
      const site = await SeoSite.get();
      if (!site.siteUrl) return res.status(400).json({ message: 'Relative URLs need a Site URL — set it in Site & Schema first' });
      url = site.siteUrl.replace(/\/+$/, '') + (url.startsWith('/') ? url : '/' + url);
    }
    const entry = await google.publishUrl({ url, type, note: 'manual submit' });
    res.json(entry);
  } catch (e) { next(e); }
};

// POST /api/admin/seo/gsc/submit-sitemap — Search Console sitemaps.submit
exports.gscSubmitSitemap = async (_req, res, next) => {
  try {
    /* needs the private key — SeoSite.get() hides it (select:false) */
    const site = (await SeoSite.findOne({ key: 'seo' }).select('+googleService.privateKey')) || (await SeoSite.get());
    if (!site.siteUrl) return res.status(400).json({ message: 'Set the Site URL in Site & Schema first' });
    const entry = await google.submitSitemap(site);
    res.json(entry);
  } catch (e) { next(e); }
};

// POST /api/admin/seo/gsc/index-sitemap — batch: every sitemap URL → Indexing API
exports.gscIndexSitemap = async (_req, res, next) => {
  try {
    const site = await SeoSite.get();
    const base = (site.siteUrl || '').replace(/\/+$/, '');
    if (!base) return res.status(400).json({ message: 'Set the Site URL in Site & Schema first' });
    const urls = await seo.sitemapUrls(site, base);
    if (!urls.length) return res.json({ submitted: 0, total: 0, okCount: 0, failCount: 0, mode: google.isConfigured(site) ? 'live' : 'dry-run', message: 'Sitemap is empty — nothing to submit' });

    const list = urls.slice(0, google.INDEX_CAP);
    const results = [];
    let fatal = '';
    for (const u of list) {
      const r = await google.publishUrl({ url: u.loc, type: 'URL_UPDATED', note: 'sitemap batch' });
      results.push(r);
      /* auth is fatal for the whole batch — no point hammering Google */
      if (!r.ok && r.mode === 'live' && /token|private key|PEM|OAuth|rejected|network/i.test(r.message)) { fatal = r.message; break; }
    }
    const okCount = results.filter((r) => r.ok).length;
    const mode = results[0] ? results[0].mode : 'dry-run';
    await GscLog.log({
      kind: 'batch',
      target: `${results.length} of ${urls.length} sitemap URLs`,
      type: 'INDEX_BATCH',
      mode,
      ok: okCount === results.length,
      status: 0,
      message: fatal
        ? `Stopped after ${results.length}: ${fatal}`
        : `Batch complete — ${okCount}/${results.length} accepted (${mode})`,
    });
    res.json({
      submitted: results.length,
      total: urls.length,
      okCount,
      failCount: results.length - okCount,
      mode,
      fatal,
      truncated: urls.length > google.INDEX_CAP ? urls.length - google.INDEX_CAP : 0,
    });
  } catch (e) { next(e); }
};

// GET /api/admin/seo/gsc/log — latest 50 submission attempts
exports.gscLog = async (_req, res, next) => {
  try {
    const items = await GscLog.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

/* ─────────────── GA4 Data API — e-commerce funnel report ─────────────── */

const FUNNEL_STEPS = [
  { key: 'view_item', label: 'View item' },
  { key: 'add_to_cart', label: 'Add to cart' },
  { key: 'begin_checkout', label: 'Begin checkout' },
  { key: 'purchase', label: 'Purchase' },
];

const rowsOf = (data) => data.rows || [];
const metricAt = (row, i) => Number((row.metricValues && row.metricValues[i] && row.metricValues[i].value) || 0);
const dimAt = (row, i) => (row.dimensionValues && row.dimensionValues[i] && row.dimensionValues[i].value) || '';

// GET /api/admin/analytics/funnel?days=28
exports.ga4Funnel = async (req, res, next) => {
  try {
    const days = Math.floor(Number(req.query.days) || 0);
    if (!days || days < 1 || days > 400) return res.status(400).json({ message: 'days must be between 1 and 400' });

    const site = await google.loadSite();
    const propertyId = (site.ga4 && site.ga4.propertyId) || '';
    const configured = propertyId && google.isConfigured(site);
    if (!configured) {
      return res.json({
        configured: false,
        days,
        missing: { propertyId: !propertyId, serviceAccount: !google.isConfigured(site) },
      });
    }

    const range = [{ startDate: `${days}daysAgo`, endDate: 'today' }];
    try {
      const [funnelR, overviewR, trendR, topR] = await Promise.all([
        /* funnel — users per commerce event */
        google.ga4RunReport(site, propertyId, {
          dateRanges: range,
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'activeUsers' }],
          dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_STEPS.map((s) => s.key) } } },
          limit: 20,
        }),
        /* totals */
        google.ga4RunReport(site, propertyId, {
          dateRanges: range,
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'purchaseRevenue' }, { name: 'transactions' }, { name: 'screenPageViews' }],
        }),
        /* daily revenue trend */
        google.ga4RunReport(site, propertyId, {
          dateRanges: range,
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'purchaseRevenue' }, { name: 'transactions' }, { name: 'sessions' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
          limit: 400,
        }),
        /* top products by revenue */
        google.ga4RunReport(site, propertyId, {
          dateRanges: range,
          dimensions: [{ name: 'itemName' }],
          metrics: [{ name: 'purchaseRevenue' }, { name: 'transactions' }],
          orderBys: [{ metric: { metricName: 'purchaseRevenue' }, desc: true }],
          limit: 5,
        }),
      ]);

      /* funnel — GA4 returns only events that happened; missing = 0 */
      const byEvent = {};
      for (const row of rowsOf(funnelR)) byEvent[dimAt(row, 0)] = metricAt(row, 0);
      const funnel = FUNNEL_STEPS.map((s) => ({ ...s, users: byEvent[s.key] || 0 }));

      const ov = rowsOf(overviewR)[0] || { metricValues: [{}] };
      const sessions = metricAt(ov, 0);
      const revenue = metricAt(ov, 2);
      const transactions = metricAt(ov, 3);
      const overview = {
        sessions,
        users: metricAt(ov, 1),
        revenue,
        transactions,
        pageviews: metricAt(ov, 4),
        aov: transactions ? revenue / transactions : 0,
        convRate: sessions ? (transactions / sessions) * 100 : 0,
      };

      const trend = rowsOf(trendR).map((row) => ({
        date: String(dimAt(row, 0)),
        revenue: metricAt(row, 0),
        transactions: metricAt(row, 1),
        sessions: metricAt(row, 2),
      }));

      const topProducts = rowsOf(topR).map((row) => ({
        name: dimAt(row, 0),
        revenue: metricAt(row, 0),
        transactions: metricAt(row, 1),
      }));

      res.json({ configured: true, days, propertyId, funnel, overview, trend, topProducts, fetchedAt: new Date().toISOString() });
    } catch (e) {
      /* GA4 configured but the API call failed — surface it in the UI
         instead of breaking the dashboard */
      res.json({ configured: true, days, propertyId, error: String(e.message || e).slice(0, 300) });
    }
  } catch (e) { next(e); }
};
