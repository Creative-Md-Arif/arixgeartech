const Setting = require('../models/Setting');
const { DIVISIONS } = require('../models/Setting');
const { normalizeGuide, normalizeCategoryGuide } = require('../utils/sizeGuide');
const fcm = require('../services/fcm'); // Phase 4 — FCM push mode

/* Phase 4 — FCM delivery mode for the admin settings page */
function fcmStatus() {
  return { ...fcm.status(), logFile: 'backend/logs/fcm.jsonl' };
}
exports.fcmStatus = fcmStatus;

/* SMS delivery mode — env-driven (credentials never live in the DB).
   Surfaced read-only in the admin settings page. */
function smsStatus() {
  const provider = String(process.env.SMS_PROVIDER || 'sslwireless').toLowerCase();
  const dryRun = String(process.env.SMS_DRY_RUN ?? 'true') !== 'false';
  const configured = Boolean(process.env.SSLWIRELESS_API_TOKEN && process.env.SSLWIRELESS_SID);
  let mode = 'off';
  if (provider !== 'off') mode = dryRun || !configured ? 'dry-run' : 'live';
  return { provider, dryRun, configured, mode, logFile: 'backend/logs/sms.jsonl' };
}
exports.smsStatus = smsStatus;

/* MASK sentinel (Task 43) — admin GETs never return real secrets; a save
   carrying the mask keeps the stored value untouched. */
const MASK = '••••••••';
const keepSecret = (v) => (v == null ? '' : String(v)) === MASK ? null : String(v);

// GET /api/settings/payment — merchant numbers + USSD (public, for checkout page).
// gateway block is credential-free: enabled/sandbox/provider only.
exports.publicPayment = async (_req, res, next) => {
  try {
    const s = await Setting.publicView();
    res.json({
      payments: s.payments,
      currency: s.currency,
      gateway: {
        enabled: Boolean(s.gateway && s.gateway.enabled),
        sandbox: Boolean(s.gateway && s.gateway.sandbox),
        provider: (s.gateway && s.gateway.provider) || 'sslcommerz',
      },
      /* Task 52 — rides the call the checkout page already makes */
      checkout: s.checkout,
    });
  } catch (e) { next(e); }
};

// GET /api/settings/shipping — division-wise charges + free threshold (public)
exports.publicShipping = async (_req, res, next) => {
  try {
    const s = await Setting.publicView();
    res.json({ shipping: s.shipping, currency: s.currency });
  } catch (e) { next(e); }
};

// GET /api/settings/content — editable site content, merged over defaults (public)
exports.publicContent = async (_req, res, next) => {
  try {
    const s = await Setting.get();
    /* Task 57 — maintenance flag rides the boot content call so the SPA can
       switch to the holding screen without an extra round-trip */
    const content = await Setting.publicContent();
    content.maintenance = {
      enabled: Boolean(s.maintenance && s.maintenance.enabled),
      message: (s.maintenance && s.maintenance.message) || '',
    };
    res.json({ content });
  } catch (e) { next(e); }
};

/* GET /api/settings/pixel — Facebook Pixel config for the storefront (public).
   The pixel ID is only revealed while tracking is enabled, so a disabled
   pixel never leaks the ID and the frontend can boot with a single call. */
exports.publicPixel = async (_req, res, next) => {
  try {
    const s = await Setting.get();
    const on = Boolean(s.pixel.enabled) && Boolean(s.pixel.pixelId);
    res.json({ pixel: { enabled: on, pixelId: on ? s.pixel.pixelId : '' } });
  } catch (e) { next(e); }
};

/* GET /api/settings/chat — live chat + WhatsApp/Telegram config (public).
   Raw values; the storefront normalizes them into wa.me / t.me links. */
exports.publicChat = async (_req, res, next) => {
  try {
    const s = await Setting.get();
    res.json({ chat: s.chat });
  } catch (e) { next(e); }
};

/* GET /api/settings/size-guide — PDP size guide sources (public).
   Ships BOTH the global table and the per-category tables (Task 32) in one
   call so the PDP can run its full 3-tier resolution (product custom →
   category → global → default) with a single fetch. Returned even when
   disabled so the storefront can distinguish "disabled → hide" from
   "API down → show legacy default table". */
exports.publicSizeGuide = async (_req, res, next) => {
  try {
    const s = await Setting.get();
    res.json({
      sizeGuide: {
        enabled: s.sizeGuide.enabled,
        title: s.sizeGuide.title,
        note: s.sizeGuide.note,
        titleBn: s.sizeGuide.titleBn || '', // Task 58
        noteBn: s.sizeGuide.noteBn || '',
        headers: s.sizeGuide.headers,
        rows: s.sizeGuide.rows,
      },
      categoryGuides: (s.categoryGuides || []).map((g) => ({
        category: g.category,
        enabled: g.enabled,
        title: g.title,
        note: g.note,
        titleBn: g.titleBn || '', // Task 58
        noteBn: g.noteBn || '',
        headers: g.headers,
        rows: g.rows,
      })),
    });
  } catch (e) { next(e); }
};

/* Meta Pixel IDs are numeric (typically 15–16 digits). Kept tolerant
   (10–20 digits) so legacy/test pixels still pass, spaces/hyphens stripped. */
function sanitizePixelId(v) {
  return String(v == null ? '' : v).replace(/[\s-]/g, '');
}
function validPixelId(v) { return /^\d{10,20}$/.test(v); }

/* Flash sale (Task 42 pack) — public read. enabled=true only when the admin
   switch is on AND endsAt is empty or still in the future. */
exports.publicFlashSale = async (_req, res, next) => {
  try {
    const s = await Setting.get();
    const f = s.flashSale && typeof s.flashSale === 'object' ? s.flashSale : {};
    const ends = f.endsAt ? new Date(f.endsAt) : null;
    const live = Boolean(f.enabled) && (!ends || Number.isNaN(ends.getTime()) || ends.getTime() > Date.now());
    res.json({
      flashSale: {
        enabled: live,
        label: f.label || '',
        sublabel: f.sublabel || '',
        labelBn: f.labelBn || '', // Task 58
        sublabelBn: f.sublabelBn || '',
        link: f.link || '/shop',
        endsAt: f.endsAt || null,
      },
    });
  } catch (e) { next(e); }
};

// GET /api/admin/settings (full)
exports.get = async (_req, res, next) => {
  try {
    const s = await Setting.get();
    res.json({
      setting: {
        currency: s.currency,
        payments: s.payments,
        shipping: { freeThreshold: s.shipping.freeThreshold, divisions: Object.fromEntries(s.shipping.divisions) },
        store: s.store,
        chat: s.chat,
        pixel: { enabled: Boolean(s.pixel.enabled), pixelId: s.pixel.pixelId || '' },
        gateway: {
          enabled: Boolean(s.gateway.enabled),
          provider: s.gateway.provider,
          storeId: s.gateway.storeId || '',
          storePasswd: s.gateway.storePasswd ? MASK : '',
          sandbox: Boolean(s.gateway.sandbox),
        },
        /* audit fix — courier API credentials are secrets; the admin UI only
           ever needs to see whether one is set. Same MASK/keepSecret contract
           as gateway.storePasswd. */
        courier: {
          provider: s.courier.provider,
          autoPushOnShipped: s.courier.autoPushOnShipped,
          steadfast: {
            apiKey: s.courier.steadfast?.apiKey ? MASK : '',
            secretKey: s.courier.steadfast?.secretKey ? MASK : '',
          },
          pathao: {
            baseUrl: s.courier.pathao?.baseUrl || '',
            storeId: s.courier.pathao?.storeId || '',
            clientId: s.courier.pathao?.clientId ? MASK : '',
            clientSecret: s.courier.pathao?.clientSecret ? MASK : '',
            username: s.courier.pathao?.username || '',
            password: s.courier.pathao?.password ? MASK : '',
          },
        },
        checkout: { guestEnabled: !(s.checkout && s.checkout.guestEnabled === false) },
        maintenance: { enabled: Boolean(s.maintenance && s.maintenance.enabled), message: (s.maintenance && s.maintenance.message) || '', messageBn: (s.maintenance && s.maintenance.messageBn) || '' },
        orders: { prefix: (s.orders && s.orders.prefix) || 'ARG' }, // Phase 4 — order prefix config
        fcm: fcmStatus(), // Phase 4 — push mode for the admin panel
        sizeGuide: s.sizeGuide,
        categoryGuides: s.categoryGuides || [],
        content: await Setting.publicContent(),
        sms: smsStatus(),
      },
    });
  } catch (e) { next(e); }
};

// PUT /api/admin/settings — partial update of any block
exports.update = async (req, res, next) => {
  try {
    const s = await Setting.get();
    const b = req.body;

    if (b.payments) {
      for (const m of ['bkash', 'nagad', 'rocket']) {
        if (b.payments[m]) {
          ['label', 'number', 'ussd', 'type'].forEach((f) => {
            if (b.payments[m][f] !== undefined) s.payments[m][f] = b.payments[m][f];
          });
        }
      }
    }

    if (b.shipping) {
      if (b.shipping.freeThreshold !== undefined) s.shipping.freeThreshold = Number(b.shipping.freeThreshold) || 0;
      if (b.shipping.divisions) {
        for (const d of DIVISIONS) {
          if (b.shipping.divisions[d] !== undefined) {
            const v = Number(b.shipping.divisions[d]);
            if (Number.isNaN(v) || v < 0) return res.status(400).json({ message: `Invalid shipping charge for ${d}` });
            s.shipping.divisions.set(d, v);
          }
        }
      }
    }

    if (b.store) ['name', 'email', 'phone', 'address'].forEach((f) => {
      if (b.store[f] !== undefined) s.store[f] = b.store[f];
    });
    if (b.currency) s.currency = b.currency;

    /* Live chat / WhatsApp / Telegram */
    if (b.chat && typeof b.chat === 'object') {
      if (b.chat.whatsapp !== undefined) s.chat.whatsapp = String(b.chat.whatsapp).trim();
      if (b.chat.telegram !== undefined) s.chat.telegram = String(b.chat.telegram).trim();
      if (b.chat.greeting !== undefined) s.chat.greeting = String(b.chat.greeting).trim();
      if (b.chat.greetingBn !== undefined) s.chat.greetingBn = String(b.chat.greetingBn).trim(); // Task 58
      if (b.chat.enabled !== undefined) s.chat.enabled = Boolean(b.chat.enabled);
    }

    /* Facebook Pixel — admin toggle + ID. Saving an empty ID clears it and
       disables tracking (admin panel is the single source of truth). */
    if (b.pixel && typeof b.pixel === 'object') {
      if (b.pixel.pixelId !== undefined) {
        const pid = sanitizePixelId(b.pixel.pixelId);
        if (pid && !validPixelId(pid)) {
          return res.status(400).json({ message: 'Invalid Pixel ID — Meta Pixel IDs are 10–20 digits (Events Manager → Data Sources).' });
        }
        s.pixel.pixelId = pid;
      }
      if (b.pixel.enabled !== undefined) {
        s.pixel.enabled = Boolean(b.pixel.enabled);
        if (s.pixel.enabled && !s.pixel.pixelId) {
          return res.status(400).json({ message: 'Cannot enable the Pixel without a Pixel ID.' });
        }
      }
    }

    /* Online gateway (Task 40) — SSLCOMMERZ. The mask sentinel keeps the
       stored password when the admin only toggles switches; enabling requires
       BOTH credentials to be present (stored or freshly typed). */
    if (b.gateway && typeof b.gateway === 'object') {
      const g = b.gateway;
      if (g.storeId !== undefined) s.gateway.storeId = String(g.storeId).trim().slice(0, 80);
      if (g.storePasswd !== undefined) {
        const v = keepSecret(g.storePasswd);
        if (v !== null) s.gateway.storePasswd = v.trim().slice(0, 80);
      }
      if (g.sandbox !== undefined) s.gateway.sandbox = Boolean(g.sandbox);
      if (g.enabled !== undefined) {
        const want = Boolean(g.enabled);
        if (want && !(s.gateway.storeId && s.gateway.storePasswd)) {
          return res.status(400).json({ message: 'Cannot enable the gateway without Store ID and Store Password.' });
        }
        s.gateway.enabled = want;
      }
    }

    /* Courier integration (Task 28) — Steadfast / Pathao credentials.
       Only whitelisted fields are touched; provider must be a known value. */
    if (b.courier && typeof b.courier === 'object') {
      if (b.courier.provider !== undefined) {
        const p = String(b.courier.provider).toLowerCase();
        if (!['none', 'steadfast', 'pathao'].includes(p)) {
          return res.status(400).json({ message: 'courier.provider must be none | steadfast | pathao' });
        }
        s.courier.provider = p;
      }
      if (b.courier.autoPushOnShipped !== undefined) s.courier.autoPushOnShipped = Boolean(b.courier.autoPushOnShipped);
      /* audit fix — credential fields honour the MASK sentinel: sending back the
         masked value keeps the stored secret untouched (same as storePasswd) */
      if (b.courier.steadfast && typeof b.courier.steadfast === 'object') {
        ['apiKey', 'secretKey'].forEach((f) => {
          if (b.courier.steadfast[f] !== undefined) {
            const v = keepSecret(b.courier.steadfast[f]);
            if (v !== null) s.courier.steadfast[f] = v.trim().slice(0, 120);
          }
        });
      }
      if (b.courier.pathao && typeof b.courier.pathao === 'object') {
        ['baseUrl', 'storeId', 'username'].forEach((f) => {
          if (b.courier.pathao[f] !== undefined) s.courier.pathao[f] = String(b.courier.pathao[f]).trim();
        });
        ['clientId', 'clientSecret', 'password'].forEach((f) => {
          if (b.courier.pathao[f] !== undefined) {
            const v = keepSecret(b.courier.pathao[f]);
            if (v !== null) s.courier.pathao[f] = v.trim().slice(0, 120);
          }
        });
      }
    }

    /* Size Guide (Admin → Settings → 📏 Size Guide) — global table via the
       shared normalizer (Task 32): 1–6 columns, ≤30 rows, rows normalized to
       the header width, blank rows dropped, blank headers auto-named. */
    if (b.sizeGuide && typeof b.sizeGuide === 'object') {
      const n = normalizeGuide(b.sizeGuide, s.sizeGuide.toObject ? s.sizeGuide.toObject() : s.sizeGuide);
      if (n.error) return res.status(400).json({ message: n.error });
      if (n.guide) s.sizeGuide = n.guide;
    }

    /* Category-specific Tables (Task 32) — merge semantics per entry:
       • {category, remove:true}                → delete that entry
       • {category, enabled} (no headers)       → toggle the visibility switch only
       • {category, headers, rows, ...}         → create/replace the table
       A partial enabled-only toggle never wipes a stored table. */
    if (b.categoryGuides !== undefined) {
      if (!Array.isArray(b.categoryGuides)) return res.status(400).json({ message: 'categoryGuides must be an array' });
      const current = (s.categoryGuides || []).map((g) => g.toObject ? g.toObject() : { ...g });
      const byCat = Object.fromEntries(current.map((g) => [g.category, g]));
      const out = {};
      for (const entry of b.categoryGuides) {
        if (!entry || typeof entry !== 'object') return res.status(400).json({ message: 'categoryGuides entries must be objects' });
        const cat = String(entry.category == null ? '' : entry.category).trim().toLowerCase();
        if (!cat) return res.status(400).json({ message: 'categoryGuides entry needs a category' });
        if (entry.remove === true) { delete byCat[cat]; continue; }
        const prev = byCat[cat];
        if (entry.headers === undefined) {
          /* enabled-only toggle — requires an existing table */
          if (!prev) return res.status(400).json({ message: `No size guide table exists for category "${cat}" — send headers/rows first` });
          if (entry.enabled !== undefined) prev.enabled = Boolean(entry.enabled);
          continue;
        }
        const n = normalizeCategoryGuide(entry, prev);
        if (n.error) return res.status(400).json({ message: n.error });
        byCat[cat] = n.guide;
      }
      for (const cat of Object.keys(byCat)) {
        const g = byCat[cat];
        if (!g || !g.headers || !g.headers.length) continue; // safety — never persist an empty table
        out[cat] = { category: cat, enabled: g.enabled !== false, title: g.title || 'Size Guide', note: g.note || '', titleBn: g.titleBn || '', noteBn: g.noteBn || '', headers: g.headers, rows: g.rows || [] }; // Task 58 — Bn twins
      }
      s.categoryGuides = Object.values(out);
    }

    /* Site content — blocks replace wholesale (arrays too), one level merge
       for plain objects so the editor can save a single block at a time. */
    if (b.content && typeof b.content === 'object' && !Array.isArray(b.content)) {
      const cur = (s.content && typeof s.content === 'object') ? { ...s.content } : {};
      for (const k of Object.keys(b.content)) {
        const v = b.content[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && cur[k] && typeof cur[k] === 'object' && !Array.isArray(cur[k])) {
          cur[k] = { ...cur[k], ...v };
        } else {
          cur[k] = v;
        }
      }
      s.content = cur;
    }

    /* Task 52 — checkout rules (guest kill-switch). Partial merge, boolean
       coerced; anything but an object is ignored so legacy clients are safe. */
    if (b.checkout && typeof b.checkout === 'object') {
      if (b.checkout.guestEnabled !== undefined) s.checkout.guestEnabled = Boolean(b.checkout.guestEnabled);
    }

    /* Task 57 — maintenance mode kill-switch (same merge discipline) */
    if (b.maintenance && typeof b.maintenance === 'object') {
      if (b.maintenance.enabled !== undefined) s.maintenance.enabled = Boolean(b.maintenance.enabled);
      if (b.maintenance.message !== undefined) s.maintenance.message = String(b.maintenance.message).slice(0, 500);
      if (b.maintenance.messageBn !== undefined) s.maintenance.messageBn = String(b.maintenance.messageBn).slice(0, 500); // Task 58
    }

    /* Flash sale banner (Task 42 pack) — partial merge. endsAt must be
       null/empty or a parseable date; anything else is a 400. */
    if (b.flashSale && typeof b.flashSale === 'object') {
      const f = b.flashSale;
      if (f.label !== undefined) s.flashSale.label = String(f.label).trim().slice(0, 60);
      if (f.sublabel !== undefined) s.flashSale.sublabel = String(f.sublabel).trim().slice(0, 120);
      if (f.labelBn !== undefined) s.flashSale.labelBn = String(f.labelBn).trim().slice(0, 60); // Task 58
      if (f.sublabelBn !== undefined) s.flashSale.sublabelBn = String(f.sublabelBn).trim().slice(0, 120);
      if (f.link !== undefined) s.flashSale.link = String(f.link).trim().slice(0, 200) || '/shop';
      if (f.endsAt !== undefined) {
        if (f.endsAt === null || f.endsAt === '') {
          s.flashSale.endsAt = null;
        } else {
          const d = new Date(f.endsAt);
          if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid flashSale.endsAt — use an ISO date or null' });
          s.flashSale.endsAt = d;
        }
      }
      if (f.enabled !== undefined) s.flashSale.enabled = Boolean(f.enabled);
    }

    /* Phase 4 (4.4) — order number prefix (validated against the schema rule) */
    if (b.orders && typeof b.orders === 'object') {
      if (b.orders.prefix !== undefined) {
        const p = String(b.orders.prefix).toUpperCase().trim();
        if (!/^(?!-)[A-Z0-9-]{2,8}$/.test(p)) {
          return res.status(400).json({ message: 'Order prefix must be 2–8 chars: A-Z, 0-9, inner hyphens (no leading hyphen)' });
        }
        s.orders.prefix = p;
      }
    }

    await s.save();
    res.json({
      setting: {
        currency: s.currency,
        payments: s.payments,
        shipping: { freeThreshold: s.shipping.freeThreshold, divisions: Object.fromEntries(s.shipping.divisions) },
        store: s.store,
        chat: s.chat,
        pixel: { enabled: Boolean(s.pixel.enabled), pixelId: s.pixel.pixelId || '' },
        gateway: {
          enabled: Boolean(s.gateway.enabled),
          provider: s.gateway.provider,
          storeId: s.gateway.storeId || '',
          storePasswd: s.gateway.storePasswd ? MASK : '',
          sandbox: Boolean(s.gateway.sandbox),
        },
        /* audit fix — masked courier credentials (see the public GET above) */
        courier: {
          provider: s.courier.provider,
          autoPushOnShipped: s.courier.autoPushOnShipped,
          steadfast: {
            apiKey: s.courier.steadfast?.apiKey ? MASK : '',
            secretKey: s.courier.steadfast?.secretKey ? MASK : '',
          },
          pathao: {
            baseUrl: s.courier.pathao?.baseUrl || '',
            storeId: s.courier.pathao?.storeId || '',
            clientId: s.courier.pathao?.clientId ? MASK : '',
            clientSecret: s.courier.pathao?.clientSecret ? MASK : '',
            username: s.courier.pathao?.username || '',
            password: s.courier.pathao?.password ? MASK : '',
          },
        },
        checkout: { guestEnabled: !(s.checkout && s.checkout.guestEnabled === false) },
        orders: { prefix: s.orders.prefix },
        sizeGuide: s.sizeGuide,
        categoryGuides: s.categoryGuides || [],
        content: await Setting.publicContent(),
        fcm: fcmStatus(),
      },
    });
  } catch (e) { next(e); }
};
