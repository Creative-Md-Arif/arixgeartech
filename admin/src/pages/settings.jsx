/* ArixGear ADMIN page — Store Settings (Task 33: accordion menu layout)
   8 accordion sections: 🏪 Store · 💳 Payments (manual + gateway) · 🚚 Shipping ·
   📦 Courier · 💬 Chat & SMS · 📣 Pixel · 📏 Size Guide (global + category tables)
   · 🚦 System Status. Left sticky menu (jump + scroll-spy highlight + status dot),
   live status chips per header, dirty-tracking with a floating Save/Discard bar,
   expand/collapse all. Every input id from the pre-accordion era is preserved. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import GuideEditor from '../components/GuideEditor.jsx';
import { AccSection as Section, AccChip as Chip, useAccordion, AccBulkButtons } from '../components/Accordion.jsx';
import { useParams, Navigate, Link as RLink } from 'react-router-dom';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { DIVISIONS, auth } from '../lib/admin.js';
import { get as getSettings, update as updateSettings, sendTestEmail } from '../services/settings.js';
import { status as systemStatus } from '../services/system.js';
import { list as listCategories } from '../services/categories.js';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4';
const FULL = 'md:col-span-2 lg:col-span-4';
const METHODS = ['bkash', 'nagad', 'rocket'];
const PIXEL_EVENTS = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Search', 'CompleteRegistration'];
/* Task 56-d — editable email template strings. Placeholders {{name}} etc.
   are filled by the backend at send time; blank fields fall back to the
   built-in defaults so an empty editor never sends broken emails. */
const ET_DEFAULT = {
  orderConfirmation: { subject: '', intro: '' },
  statusUpdate: {
    subjectPrefix: '',
    notes: { verified: '', rejected: '', processing: '', packed: '', shipped: '', delivered: '', cancelled: '', 'payment-rejected': '' },
  },
  passwordReset: { subject: '', intro: '' },
  emailOtp: { subject: '', intro: '' },
};
const ET_PLACEHOLDERS = {
  orderConfirmation: '{{name}} {{orderNumber}} {{total}}',
  statusUpdate: '{{name}} {{orderNumber}} {{status}} {{courier}} {{consignment}} {{reason}}',
  passwordReset: '{{name}} {{resetUrl}} {{minutes}}',
  emailOtp: '{{name}} {{code}} {{minutes}}',
};
const STATUS_NOTE_KEYS = ['verified', 'rejected', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'payment-rejected'];

const SG_DEFAULT = {
  enabled: true,
  title: 'Size Guide',
  note: 'Measurements are body measurements in centimetres (cm). Between two sizes? Size up for a relaxed fit.',
  headers: ['Size', 'Chest (cm)', 'Waist (cm)'],
  rows: [['S', '88–94', '72–78'], ['M', '95–101', '79–85'], ['L', '102–108', '86–92'], ['XL', '109–115', '93–99'], ['XXL', '116–124', '100–108']],
};

const SECTIONS = [
  { id: 'store', icon: '🏪', label: 'Store Information' },
  { id: 'checkout', icon: '🛒', label: 'Checkout Rules' },
  { id: 'payments', icon: '💳', label: 'Payment Methods' },
  { id: 'shipping', icon: '🚚', label: 'Shipping Charges' },
  { id: 'courier', icon: '📦', label: 'Courier API' },
  { id: 'chat', icon: '💬', label: 'Chat & SMS' },
  { id: 'pixel', icon: '📣', label: 'Facebook Pixel' },
  { id: 'sizeguide', icon: '📏', label: 'Size Guide' },
  { id: 'emailtpl', icon: '✉️', label: 'Email Templates' },
  { id: 'system', icon: '🚦', label: 'System Status' },
];

/* Phase 5 (5.4) — settings split into ROUTED sections (/settings/:section).
   Each route renders its own group of panels, all pre-opened; the floating
   save bar keeps covering every panel (single PUT under the hood). */
const SECTION_ROUTES = [
  { key: 'store', label: 'Store & Checkout', ids: ['store', 'checkout', 'maint'] },
  { key: 'payments', label: 'Payments & Gateway', ids: ['payments', 'courier'] },
  { key: 'shipping', label: 'Shipping', ids: ['shipping'] },
  { key: 'comms', label: 'Chat & Tracking', ids: ['chat', 'pixel'] },
  { key: 'content', label: 'Guides & Email Copy', ids: ['sizeguide', 'emailtpl'] },
  { key: 'system', label: 'System Status', ids: ['system'] },
];

/* Task 30 — production readiness checklist (same data the server prints at boot) */
function ProdStatus() {
  const [st, setSt] = useState(null);
  useEffect(() => { systemStatus().then(setSt).catch(() => {}); }, []);
  if (!st) return null;
  const c = st.checks;
  const Row = ({ ok, label, sub, id }) => (
    <li className="flex items-start gap-2.5 text-[12.5px]" id={id}>
      <span className={'mt-[1px] font-bold ' + (ok ? 'text-green' : 'text-yellow')}>{ok ? '✓' : '⚠'}</span>
      <span><b className="text-txt">{label}</b>{sub ? <span className="text-dim2"> — {sub}</span> : null}</span>
    </li>
  );
  return (
    <div id="prodStatus">
      <div className="mb-3 flex items-center justify-between">
        <span className={CHIP + (st.env === 'production' ? ' border-green/40 text-green' : ' border-yellow/40 text-yellow')}>{st.env}</span>
      </div>
      <ul className="space-y-1.5">
        <Row ok={c.jwt.ok} label="JWT_SECRET" sub={c.jwt.ok ? 'strong secret set' : 'missing or default — REQUIRED'} />
        <Row ok={c.cors.ok} label="CORS" sub={c.cors.origins ? c.cors.origins + ' domain(s) allow-listed' : (c.cors.warning || 'all origins allowed (dev ok)')} />
        <Row ok={c.database.replicaSet} label="Database" sub={`${c.database.uri} · ${c.database.replicaSet ? 'replica set — transactions ON' : 'no replica set — transactions OFF (fallback mode)'}`} />
        <Row ok={c.images.mode === 'cloudinary'} label="Images" sub={c.images.mode === 'cloudinary' ? 'Cloudinary' : 'local uploads (lost on redeploy — set CLOUDINARY_*)'} />
        <Row ok={c.email.ok} label="Email" sub={c.email.mode === 'resend' ? 'live (Resend)' : 'dry-run — set RESEND_API_KEY'} />
        <Row ok={c.sms.mode === 'live'} label={'SMS (' + c.sms.mode + ')'} sub={c.sms.mode === 'live' ? 'SSLWireless live' : (c.sms.warning || 'off')} />
        <Row ok={c.notify.ok} label="Question alerts" sub={c.notify.ok ? '→ ' + c.notify.adminEmail : 'disabled — set ADMIN_NOTIFY_EMAIL'} />
        <Row ok={c.builds.frontend && c.builds.admin} label="SPA builds" sub={`frontend ${c.builds.frontend ? '✓' : '✗'} · admin ${c.builds.admin ? '✓' : '✗'}`} />
      </ul>
    </div>
  );
}

function SettingsPage() {
  const toast = useToast();
  const { section: routeSection } = useParams();
  const section = SECTION_ROUTES.some((s) => s.key === routeSection) ? routeSection : 'store';
  const SEC_IDS = (SECTION_ROUTES.find((s) => s.key === section) || SECTION_ROUTES[0]).ids;
  const show = (id) => SEC_IDS.includes(id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pay, setPay] = useState({ bkash: { number: '', ussd: '' }, nagad: { number: '', ussd: '' }, rocket: { number: '', ussd: '' } });
  const [store, setStore] = useState({ name: '', phone: '', email: '', address: '' });
  /* Task 52 — checkout rules (guest kill-switch) */
  const [checkout, setCheckout] = useState({ guestEnabled: true });
  /* Phase 4 (4.4) — order number prefix (default ARG) */
  const [ordersPrefix, setOrdersPrefix] = useState('ARG');
  /* Task 57 — maintenance mode kill-switch */
  const [maint, setMaint] = useState({ enabled: false, message: '', messageBn: '' }); // Task 58
  const [bkBusy, setBkBusy] = useState(false);
  const [ship, setShip] = useState({ divisions: {}, freeThreshold: 0 });
  const [sms, setSms] = useState(null);
  const [currency, setCurrency] = useState({ currency: '৳', currencyCode: 'BDT' });
  const [pixelId, setPixelId] = useState('');
  const [pxOn, setPxOn] = useState('off');
  const [pxStatus, setPxStatus] = useState('OFF — no Meta requests');
  const [chat, setChat] = useState({ enabled: true, whatsapp: '', telegram: '', greeting: '' });
  const [courier, setCourier] = useState({
    provider: 'none',
    autoPushOnShipped: false,
    steadfast: { apiKey: '', secretKey: '' },
    pathao: { baseUrl: 'https://api-hermes.pathao.com', storeId: '', clientId: '', clientSecret: '', username: '', password: '' },
  });
  const [guide, setGuide] = useState(SG_DEFAULT);
  /* Task 32 — per-category size guide tables + inline editor state */
  const [catGuides, setCatGuides] = useState([]);
  const [catRemoved, setCatRemoved] = useState([]); /* slugs removed this session → remove:true on save */
  const [catEdit, setCatEdit] = useState(null);     /* slug whose inline editor is open */
  const [catDraft, setCatDraft] = useState(null);   /* working copy while editing */
  const [catCats, setCatCats] = useState([]);       /* category slugs from the catalog */
  const [busy, setBusy] = useState(false);
  /* Task 40 — SSLCOMMERZ gateway. storePasswd holds the •••••••• mask from the
     server; sending the mask back keeps the stored secret (backend ignores it). */
  const [gw, setGw] = useState({ enabled: false, storeId: '', storePasswd: '', sandbox: true });
  const [etpl, setEtpl] = useState(ET_DEFAULT);
  const [testKey, setTestKey] = useState('orderConfirmation');
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  /* Task 33 — accordion open set + scroll-spy active section + dirty tracking */
  const acc = useAccordion(['store']);
  const { open, setOpen, toggle, openSec } = acc;
  /* routed sections — every panel of the current route starts expanded */
  useEffect(() => { setOpen(new Set(SEC_IDS)); window.scrollTo({ top: 0 }); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState('store');
  const [snap, setSnap] = useState('');

  const toggleSec = (id) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  /* jump AFTER the 300ms expand animation — scrolling during the animation
     uses a stale target (layout still shifting) and lands wrong */
  const jumpTo = (id) => {
    openSec(id);
    setTimeout(() => {
      const el = document.getElementById('sec-' + id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 320);
  };
  const expandAll = () => setOpen(new Set(SECTIONS.map((s) => s.id)));
  const collapseAll = () => setOpen(new Set());

  useEffect(() => {
    const fn = () => {
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById('sec-' + s.id);
        if (el && el.getBoundingClientRect().top <= 130) cur = s.id;
      }
      setActive(cur);
    };
    window.addEventListener('scroll', fn, { passive: true });
    fn();
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await getSettings();
      const s = d.setting || {};
      const pay0 = {
        bkash: { number: s.payments?.bkash?.number || '', ussd: s.payments?.bkash?.ussd || '' },
        nagad: { number: s.payments?.nagad?.number || '', ussd: s.payments?.nagad?.ussd || '' },
        rocket: { number: s.payments?.rocket?.number || '', ussd: s.payments?.rocket?.ussd || '' },
      };
      const store0 = { name: s.store?.name || '', phone: s.store?.phone || '', email: s.store?.email || '', address: s.store?.address || '' };
      const co0 = { guestEnabled: !(s.checkout && s.checkout.guestEnabled === false) };
      const mt0 = { enabled: Boolean(s.maintenance && s.maintenance.enabled), message: (s.maintenance && s.maintenance.message) || '', messageBn: (s.maintenance && s.maintenance.messageBn) || '' }; // Task 58
      const ship0 = { divisions: { ...(s.shipping?.divisions || {}) }, freeThreshold: s.shipping?.freeThreshold ?? 0 };
      const pixelId0 = (s.pixel && s.pixel.pixelId) || '';
      const pxOn0 = s.pixel && s.pixel.enabled ? 'on' : 'off';
      const chat0 = {
        enabled: s.chat ? s.chat.enabled !== false : true,
        whatsapp: (s.chat && s.chat.whatsapp) || '',
        telegram: (s.chat && s.chat.telegram) || '',
        greeting: (s.chat && s.chat.greeting) || '',
        greetingBn: (s.chat && s.chat.greetingBn) || '', // Task 58
      };
      const c0 = s.courier || {};
      const courier0 = {
        provider: c0.provider || 'none',
        autoPushOnShipped: Boolean(c0.autoPushOnShipped),
        steadfast: { apiKey: (c0.steadfast && c0.steadfast.apiKey) || '', secretKey: (c0.steadfast && c0.steadfast.secretKey) || '' },
        pathao: {
          baseUrl: (c0.pathao && c0.pathao.baseUrl) || 'https://api-hermes.pathao.com',
          storeId: (c0.pathao && c0.pathao.storeId) || '',
          clientId: (c0.pathao && c0.pathao.clientId) || '',
          clientSecret: (c0.pathao && c0.pathao.clientSecret) || '',
          username: (c0.pathao && c0.pathao.username) || '',
          password: (c0.pathao && c0.pathao.password) || '',
        },
      };
      const g0 = s.sizeGuide || {};
      const guide0 = {
        enabled: g0.enabled !== false,
        title: g0.title != null ? g0.title : SG_DEFAULT.title,
        titleBn: g0.titleBn || '', // Task 58
        note: g0.note != null ? g0.note : SG_DEFAULT.note,
        noteBn: g0.noteBn || '', // Task 58
        headers: Array.isArray(g0.headers) && g0.headers.length ? g0.headers.map(String) : SG_DEFAULT.headers,
        rows: Array.isArray(g0.rows) && g0.rows.length ? g0.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])) : SG_DEFAULT.rows,
      };
      const w0 = s.gateway || {};
      const gw0 = {
        enabled: Boolean(w0.enabled),
        storeId: w0.storeId || '',
        storePasswd: w0.storePasswd || '', /* '••••••••' when a secret is stored */
        sandbox: w0.sandbox !== false,
      };
      const catGuides0 = Array.isArray(s.categoryGuides) ? s.categoryGuides.map((g) => ({ ...g, headers: [...(g.headers || [])], rows: (g.rows || []).map((r) => [...r]) })) : [];
      /* Task 56-d — stored email template overrides → editor defaults are blank */
      const et0 = s.content && s.content.emailTemplates ? JSON.parse(JSON.stringify(s.content.emailTemplates)) : {};
      const etpl0 = {
        orderConfirmation: { subject: et0.orderConfirmation?.subject || '', intro: et0.orderConfirmation?.intro || '' },
        statusUpdate: {
          subjectPrefix: et0.statusUpdate?.subjectPrefix || '',
          notes: { ...ET_DEFAULT.statusUpdate.notes, ...(et0.statusUpdate?.notes || {}) },
        },
        passwordReset: { subject: et0.passwordReset?.subject || '', intro: et0.passwordReset?.intro || '' },
        emailOtp: { subject: et0.emailOtp?.subject || '', intro: et0.emailOtp?.intro || '' },
      };
      setOrdersPrefix((s.orders && s.orders.prefix) || 'ARG');
      setPay(pay0); setStore(store0); setShip(ship0); setSms(s.sms || null);
      setCheckout(co0);
      setCurrency({ currency: s.currency || '৳', currencyCode: s.currencyCode || 'BDT' });
      setPixelId(pixelId0); setPxOn(pxOn0);
      setPxStatus(s.pixel && s.pixel.enabled && s.pixel.pixelId ? 'ACTIVE · ID ' + s.pixel.pixelId : 'OFF — no Meta requests');
      setChat(chat0); setCourier(courier0); setGuide(guide0); setGw(gw0);
      setMaint(mt0);
      setCatGuides(catGuides0); setCatRemoved([]); setCatEdit(null); setCatDraft(null);
      setEtpl(etpl0);
      /* dirty-tracking snapshot — built from the SAME shapes as the setters */
      const op0 = (s.orders && s.orders.prefix) || 'ARG';
      setSnap(JSON.stringify([pay0, store0, co0, ship0, pixelId0, pxOn0, chat0, courier0, guide0, catGuides0, gw0, etpl0, mt0, op0]));
      listCategories().then((dd) => {
        const slugs = (dd.items || []).filter((c) => c.slug).map((c) => c.slug);
        if (slugs.length) setCatCats(slugs);
      }).catch(() => {});
      setError('');
      setLoading(false);
    } catch (e) { setError(e.message); setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const body = {
      payments: {},
      shipping: { divisions: {}, freeThreshold: Math.max(0, +ship.freeThreshold || 0) }, // Step 2 audit fix — negative made every order free-shipping
      store: { name: store.name, email: store.email, phone: store.phone, address: store.address },
      checkout: { guestEnabled: checkout.guestEnabled },
      orders: { prefix: (ordersPrefix || 'ARG').toUpperCase().trim() },
      maintenance: { enabled: maint.enabled, message: maint.message.trim().slice(0, 500), messageBn: (maint.messageBn || '').trim().slice(0, 500) }, // Task 58
      pixel: { enabled: pxOn === 'on', pixelId: pixelId.trim() },
      gateway: { enabled: gw.enabled, storeId: gw.storeId.trim(), storePasswd: gw.storePasswd, sandbox: gw.sandbox },
      chat: { enabled: chat.enabled, whatsapp: chat.whatsapp.trim(), telegram: chat.telegram.trim(), greeting: chat.greeting.trim(), greetingBn: (chat.greetingBn || '').trim() }, // Task 58
      courier: courier,
      sizeGuide: {
        enabled: guide.enabled,
        title: guide.title.trim(),
        titleBn: (guide.titleBn || '').trim(), // Task 58
        note: guide.note.trim(),
        noteBn: (guide.noteBn || '').trim(),
        /* blank header → positional auto-name so columns can never misalign with row cells */
        headers: guide.headers.map((h, i) => (h.trim() || 'Column ' + (i + 1)).slice(0, 40)),
        rows: guide.rows.map((r) => r.map((c) => String(c ?? '').slice(0, 40))),
      },
      /* Task 32 — category tables: full entries + this-session removals */
      categoryGuides: [
        ...catGuides
          .filter((g) => Array.isArray(g.headers) && g.headers.length && Array.isArray(g.rows) && g.rows.length)
          .map((g) => ({
            category: g.category,
            enabled: g.enabled !== false,
            title: String(g.title || '').trim() || 'Size Guide',
            titleBn: String(g.titleBn || '').trim(), // Task 58
            note: String(g.note || '').trim(),
            noteBn: String(g.noteBn || '').trim(),
            headers: g.headers.map((h, i) => (String(h).trim() || 'Column ' + (i + 1)).slice(0, 40)),
            rows: g.rows.map((r) => r.map((c) => String(c ?? '').trim().slice(0, 40))),
          })),
        ...catRemoved.map((c) => ({ category: c, remove: true })),
      ],
    };
    /* Task 56-d — email templates: only non-empty strings are sent so blanks
       keep using the built-in defaults inside emailService */
    const cleanNotes = {};
    STATUS_NOTE_KEYS.forEach((k) => { if (String(etpl.statusUpdate.notes[k] || '').trim()) cleanNotes[k] = etpl.statusUpdate.notes[k].trim(); });
    body.content = {
      emailTemplates: {
        orderConfirmation: {
          ...(etpl.orderConfirmation.subject.trim() ? { subject: etpl.orderConfirmation.subject.trim() } : {}),
          ...(etpl.orderConfirmation.intro.trim() ? { intro: etpl.orderConfirmation.intro.trim() } : {}),
        },
        statusUpdate: {
          ...(etpl.statusUpdate.subjectPrefix.trim() ? { subjectPrefix: etpl.statusUpdate.subjectPrefix.trim() } : {}),
          ...(Object.keys(cleanNotes).length ? { notes: cleanNotes } : {}),
        },
        passwordReset: {
          ...(etpl.passwordReset.subject.trim() ? { subject: etpl.passwordReset.subject.trim() } : {}),
          ...(etpl.passwordReset.intro.trim() ? { intro: etpl.passwordReset.intro.trim() } : {}),
        },
        emailOtp: {
          ...(etpl.emailOtp.subject.trim() ? { subject: etpl.emailOtp.subject.trim() } : {}),
          ...(etpl.emailOtp.intro.trim() ? { intro: etpl.emailOtp.intro.trim() } : {}),
        },
      },
    };
    METHODS.forEach((m) => { body.payments[m] = { number: pay[m].number, ussd: pay[m].ussd }; });
    DIVISIONS.forEach((dv) => { body.shipping.divisions[dv] = +ship.divisions[dv] || 0; });
    setBusy(true);
    try {
      const d = await updateSettings(body);
      const px = (d.setting && d.setting.pixel) || {};
      const st = px.enabled && px.pixelId ? 'ACTIVE · ID ' + px.pixelId : 'OFF — no Meta requests';
      setPxStatus(st);
      if (px.pixelId !== undefined) setPixelId(px.pixelId || '');
      toast('Settings saved ✓ — ' + (px.enabled && px.pixelId ? 'Facebook Pixel live on the storefront.' : 'pixel off.'), 'ok');
      await load(); /* re-snapshot → dirty clears */
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  /* Task 33 — dirty check: current form states vs the load-time snapshot.
     catEdit/catDraft are stage-only (not persisted) so they stay out. */
  const dirty = useMemo(() => {
    if (!snap) return false;
    /* maint + ordersPrefix ride at the END of both arrays (load snapshot order matches) */
    const cur = JSON.stringify([pay, store, checkout, ship, pixelId, pxOn, chat, courier, guide, catGuides, gw, etpl, maint, ordersPrefix]);
    return cur !== snap;
  }, [pay, store, checkout, ship, pixelId, pxOn, chat, courier, guide, catGuides, gw, etpl, maint, ordersPrefix, snap]);

  /* Task 33 — live status chips per section header */
  const chipsFor = {
    store: [store.name ? { text: '✓ ' + (store.name || '').slice(0, 18), tone: 'green' } : { text: '— name empty', tone: 'red' }],
    checkout: [{ text: checkout.guestEnabled ? 'GUEST ON' : 'GUEST OFF', tone: checkout.guestEnabled ? 'green' : 'red' }],
    maint: [{ text: maint.enabled ? 'MAINTENANCE ON' : 'MAINTENANCE OFF', tone: maint.enabled ? 'red' : 'green' }],
    payments: [
      { text: METHODS.filter((m) => pay[m].number.trim()).length + '/3 numbers', tone: METHODS.every((m) => pay[m].number.trim()) ? 'green' : 'red' },
      { text: gw.enabled ? 'GW ON' : 'GW OFF', tone: gw.enabled ? 'green' : 'dim' },
    ],
    shipping: [{ text: '8 divisions · free ≥ ৳' + (+ship.freeThreshold || 0).toLocaleString('en-IN'), tone: 'acc' }],
    courier: [{ text: courier.provider === 'none' ? 'MANUAL' : courier.provider.toUpperCase() + (courier.autoPushOnShipped ? ' · AUTO-PUSH' : ''), tone: courier.provider === 'none' ? 'dim' : 'green' }],
    chat: [
      { text: chat.enabled ? 'CHAT ON' : 'CHAT OFF', tone: chat.enabled ? 'green' : 'dim' },
      { text: [chat.whatsapp.trim() && 'WA', chat.telegram.trim() && 'TG'].filter(Boolean).join('+') || 'no links', tone: chat.whatsapp.trim() || chat.telegram.trim() ? 'green' : 'red' },
    ],
    pixel: [{ text: pxOn === 'on' ? 'PIXEL ON' : 'PIXEL OFF', tone: pxOn === 'on' ? 'green' : 'dim' }],
    sizeguide: [
      { text: guide.enabled ? 'GLOBAL ON' : 'GLOBAL OFF', tone: guide.enabled ? 'green' : 'dim' },
      { text: catGuides.filter((g) => g.enabled !== false).length + ' CAT TABLES', tone: 'acc' },
    ],
    system: [],
    emailtpl: [{ text: etpl.orderConfirmation.subject.trim() || etpl.emailOtp.subject.trim() || etpl.passwordReset.subject.trim() ? 'OVERRIDES SET' : 'DEFAULTS', tone: etpl.orderConfirmation.subject.trim() || etpl.emailOtp.subject.trim() || etpl.passwordReset.subject.trim() ? 'green' : 'dim' }],
  };

  /* ---- Task 32 — category guide helpers ---- */
  const startCatEdit = (cat) => {
    const entry = catGuides.find((g) => g.category === cat);
    setCatDraft(entry ? { category: cat, enabled: entry.enabled !== false, title: entry.title || 'Size Guide', note: entry.note || '', headers: [...(entry.headers || [])], rows: (entry.rows || []).map((r) => [...r]) }
      : { category: cat, enabled: true, title: 'Size Guide', note: '', headers: ['Size', 'Chest (cm)', 'Waist (cm)'], rows: [['S', '', ''], ['M', '', '']] });
    setCatEdit(cat);
  };
  const applyCatDraft = () => {
    if (!catDraft) return;
    setCatGuides((list) => {
      const others = list.filter((g) => g.category !== catDraft.category);
      return [...others, { ...catDraft, headers: [...catDraft.headers], rows: catDraft.rows.map((r) => [...r]) }];
    });
    setCatRemoved((rm) => rm.filter((c) => c !== catDraft.category));
    setCatEdit(null); setCatDraft(null);
  };
  const removeCat = (cat) => {
    setCatGuides((list) => list.filter((g) => g.category !== cat));
    setCatRemoved((rm) => (rm.includes(cat) ? rm : [...rm, cat]));
    if (catEdit === cat) { setCatEdit(null); setCatDraft(null); }
  };
  const toggleCat = (cat) => setCatGuides((list) => list.map((g) => (g.category === cat ? { ...g, enabled: !(g.enabled !== false) } : g)));
  const catRows = [...new Set([...catCats, ...catGuides.map((g) => g.category)])];

  if (error) {
    return (
      <div className={CARD}>
        <div className="text-[13px] text-red">Failed to load settings — {error}</div>
        <button className={GHOST_BTN + ' mt-3'} onClick={load}>Retry</button>
      </div>
    );
  }
  if (loading) return <div className={CARD}>Loading…</div>;

  const pxActive = pxStatus.indexOf('ACTIVE') === 0;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Task 33 — sticky settings menu */}
        <aside className="hidden lg:col-span-2 lg:block">
          <div className="sticky top-[86px] rounded-xl border border-line bg-panel p-4" id="settingsMenu">
            <div className="mb-2 flex items-center justify-between">
              <b className="text-[12px] uppercase tracking-[.14em] text-dim2">Settings Menu</b>
              <span className="flex gap-1.5">
                <button id="menuExpandAll" className="rounded border border-line2 px-2 py-0.5 text-[10.5px] font-bold uppercase text-dim2 hover:border-acc hover:text-acc" onClick={expandAll}>Expand all</button>
                <button id="menuCollapseAll" className="rounded border border-line2 px-2 py-0.5 text-[10.5px] font-bold uppercase text-dim2 hover:border-acc hover:text-acc" onClick={collapseAll}>Collapse</button>
              </span>
            </div>
            <nav className="flex flex-wrap gap-1.5" data-testid="settingsSections">
              {SECTION_ROUTES.map((r) => (
                <RLink key={r.key} to={'/settings/' + r.key}
                  className={'rounded-lg border px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.06em] transition ' + (section === r.key ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim hover:border-acc hover:text-acc')}>
                  {r.label}
                </RLink>
              ))}
            </nav>
            <div className="mt-3 border-t border-line pt-2.5 text-[11px] text-dim2">
              {dirty ? '⚠ Unsaved changes below' : 'All changes saved'}
            </div>
          </div>
        </aside>

        <div className="space-y-3 lg:col-span-3">
          {/* 🏪 STORE */}
          {show('store') && (
            <Section id="store" icon="🏪" title="Store Information" chips={chipsFor.store.map((c, i) => <Chip key={i} {...c} />)} open={open.has('store')} onToggle={() => toggleSec('store')}>
            <div className={FRM}>
              <div><label>Name</label><input id="stName" value={store.name} onChange={(e) => setStore((s0) => ({ ...s0, name: e.target.value }))} /></div>
              <div><label>Phone</label><input id="stPhone" value={store.phone} onChange={(e) => setStore((s0) => ({ ...s0, phone: e.target.value }))} /></div>
              <div className={FULL}><label>Email</label><input id="stEmail" value={store.email} onChange={(e) => setStore((s0) => ({ ...s0, email: e.target.value }))} /></div>
              <div className={FULL}><label>Address</label><input id="stAddr" value={store.address} onChange={(e) => setStore((s0) => ({ ...s0, address: e.target.value }))} /></div>
              <div className={FULL + ' flex flex-wrap items-center gap-3.5'}>
                <span className={CHIP + ' text-acc'}>Currency: {currency.currency} ({currency.currencyCode})</span>
                <span className="text-[11.5px] text-dim2">All prices, shipping charges and orders are in Bangladeshi Taka.</span>
              </div>
            </div>
          
            {/* Phase 4 (4.4) — order number prefix */}
            <div className="mt-4 rounded-lg border border-line p-4" id="ordersPrefixCard">
              <h4 className="mb-3 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">Order Number Prefix</h4>
              <p className="mb-3 text-[11.5px] text-dim2">Orders are numbered <code className="text-acc">PREFIX-XXXXXX</code>. 2–8 chars, A-Z / 0-9 / inner hyphens (default <b>ARG</b>). Applies to new orders only.</p>
              <div className="flex items-center gap-3">
                <input id="ordersPrefix" className="w-[140px] font-mono uppercase" value={ordersPrefix} onChange={(e) => setOrdersPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
                <span className="font-mono text-[12px] text-dim2">e.g. {ordersPrefix || 'ARG'}-8FK2QA</span>
              </div>
            </div>
</Section>
          )}

          {/* 🛒 CHECKOUT RULES (Task 52) — guest checkout kill-switch */}
          {show('checkout') && (
            <Section id="checkout" icon="🛒" title="Checkout Rules" chips={chipsFor.checkout.map((c, i) => <Chip key={i} {...c} />)} open={open.has('checkout')} onToggle={() => toggleSec('checkout')}>
            <div className={FRM}>
              <div>
                <label>Guest checkout</label>
                <select id="guestEnabled" value={checkout.guestEnabled ? 'on' : 'off'} onChange={(e) => setCheckout((c0) => ({ ...c0, guestEnabled: e.target.value === 'on' }))}>
                  <option value="on">ENABLED — anyone can order (name + phone only)</option>
                  <option value="off">DISABLED — login / account required to order</option>
                </select>
              </div>
              <div className={FULL + ' flex flex-wrap items-center gap-3'}>
                <span className={CHIP + (checkout.guestEnabled ? ' border-green/40 text-green' : ' border-red/40 text-red')}>
                  {checkout.guestEnabled ? 'GUEST CHECKOUT ON' : 'GUEST CHECKOUT OFF'}
                </span>
                <span className="text-[11.5px] text-dim2">Takes effect on the very next checkout — no code deploy.</span>
              </div>
              <div className={FULL + ' text-[12px] text-dim2 leading-relaxed'}>
                <b className="text-dim">ENABLED (default):</b> the COD-first funnel stays friction-free — customers order with just name, phone and address; orders land as <b>Guest</b> with order-number + phone tracking, no account needed.<br />
                <b className="text-dim">DISABLED:</b> the storefront checkout swaps the form for a login card, the cart drawer shows a warning strip before checkout, and the backend refuses guest <b>POST /api/orders</b> with <b>403 GUEST_CHECKOUT_DISABLED</b>. Logged-in customers keep ordering as usual, admin manual orders (WhatsApp/phone) are never blocked, and order tracking / returns stay open to guests.
              </div>
            </div>
          </Section>
          )}

          {/* 🚧 MAINTENANCE MODE (Task 57) — whole-store kill switch */}
          {show('maint') && (
            <Section id="maint" icon="🚧" title="Maintenance Mode" chips={chipsFor.maint.map((c, i) => <Chip key={i} {...c} />)} open={open.has('maint')} onToggle={() => toggleSec('maint')}>
            <div className={FRM}>
              <div>
                <label>Store status</label>
                <select id="maintEnabled" value={maint.enabled ? 'on' : 'off'} onChange={(e) => setMaint((m0) => ({ ...m0, enabled: e.target.value === 'on' }))}>
                  <option value="off">OPEN — storefront fully live</option>
                  <option value="on">MAINTENANCE — visitors see a holding screen</option>
                </select>
              </div>
              <div className={FULL}>
                <label>Message shown on the maintenance screen</label>
                <textarea id="maintMessage" rows={2} maxLength={500} value={maint.message} onChange={(e) => setMaint((m0) => ({ ...m0, message: e.target.value }))}
                  placeholder="We are upgrading our systems — back within the hour. For urgent orders call 017XXXXXXXX."
                  className="w-full" />
              </div>
              <div className={FULL}>
                <label>মেইনটেন্যান্স মেসেজ (বাংলা)</label>
                <textarea id="maintMessageBn" rows={2} maxLength={500} value={maint.messageBn || ''} onChange={(e) => setMaint((m0) => ({ ...m0, messageBn: e.target.value }))}
                  placeholder="আমরা সিস্টেম আপগ্রেড করছি — এক ঘণ্টার মধ্যেই ফিরে আসছি। জরুরি অর্ডারে কল করুন ০১৭XXXXXXXX।"
                  className="w-full" />
              </div>
              <div className={FULL + ' flex flex-wrap items-center gap-3'}>
                <span className={CHIP + (maint.enabled ? ' border-red/40 text-red' : ' border-green/40 text-green')} id="maintChip">
                  {maint.enabled ? '🚧 STORE CLOSED' : '✓ STORE OPEN'}
                </span>
                <span className="text-[11.5px] text-dim2">Takes effect on the next page load — no deploy needed.</span>
              </div>
              <div className={FULL + ' text-[12px] text-dim2 leading-relaxed'}>
                <b className="text-dim">MAINTENANCE ON:</b> every storefront page shows a branded holding screen, and the backend refuses new orders with <b>503 MAINTENANCE_MODE</b>. The admin panel, order tracking and admin manual orders keep working — flip it OFF here and the store is back instantly.
              </div>
            </div>
          </Section>
          )}

          {/* 💳 PAYMENTS — manual numbers + online gateway */}
          {show('payments') && (
            <Section id="payments" icon="💳" title="Payment Methods" chips={chipsFor.payments.map((c, i) => <Chip key={i} {...c} />)} open={open.has('payments')} onToggle={() => toggleSec('payments')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {METHODS.map((m) => (
                <div key={m}>
                  <label>{m} number</label>
                  <input id={'pay-' + m} value={pay[m].number} onChange={(e) => setPay((p0) => ({ ...p0, [m]: { ...p0[m], number: e.target.value } }))} />
                </div>
              ))}
              {METHODS.map((m) => (
                <div key={m + '-ussd'}>
                  <label>{m} USSD</label>
                  <input id={'ussd-' + m} value={pay[m].ussd} onChange={(e) => setPay((p0) => ({ ...p0, [m]: { ...p0[m], ussd: e.target.value } }))} />
                </div>
              ))}
            </div>
            <div className="mt-3 text-[12px] text-dim2">Checkout page reads these live — change here, save, done. No code deploy.</div>

            <div className="mt-4 rounded-lg border border-line p-4" id="gatewayCard">
              <h4 className="mb-3 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">Online Gateway — SSLCOMMERZ (Card / Net Banking / Wallet)</h4>
              <div className={FRM}>
                <div>
                  <label>Store ID (SSLCOMMERZ Panel)</label>
                  <input id="gwStoreId" placeholder="e.g. ArixGear5E5D" value={gw.storeId} onChange={(e) => setGw((g) => ({ ...g, storeId: e.target.value }))} />
                </div>
                <div>
                  <label>Store Password {gw.storePasswd === '••••••••' ? '(stored — leave the dots •••••••• untouched to keep)' : ''}</label>
                  <input id="gwStorePasswd" type="password" placeholder="from SSLCOMMERZ panel" value={gw.storePasswd}
                    onChange={(e) => setGw((g) => ({ ...g, storePasswd: e.target.value }))} />
                </div>
                <div>
                  <label>Gateway</label>
                  <select id="gwEnabled" value={gw.enabled ? 'on' : 'off'} onChange={(e) => setGw((g) => ({ ...g, enabled: e.target.value === 'on' }))}>
                    <option value="off">DISABLED — checkout shows manual methods only</option>
                    <option value="on">ENABLED — Online Pay shows at checkout</option>
                  </select>
                </div>
                <div>
                  <label>Environment</label>
                  <select id="gwSandbox" value={gw.sandbox ? 'sandbox' : 'live'} onChange={(e) => setGw((g) => ({ ...g, sandbox: e.target.value === 'sandbox' }))}>
                    <option value="sandbox">SANDBOX — sandbox.sslcommerz.com (test money)</option>
                    <option value="live">LIVE — securepay.sslcommerz.com (real money)</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 text-[12px] text-dim2">
                Save credentials from the SSLCOMMERZ merchant panel, flip the gateway to ENABLED — the storefront checkout gains an
                <b> Online Pay </b> method that redirects the customer to the secure SSLCOMMERZ page and auto-confirms the payment
                (order jumps to processing, no TrxID or screenshot needed). The password is stored masked — re-saving without
                touching it keeps the existing secret. Without credentials the backend runs a simulated session for testing.
              </div>
            </div>
          </Section>
          )}

          {/* 🚚 SHIPPING */}
          {show('shipping') && (
            <Section id="shipping" icon="🚚" title="Shipping Charges (৳ BDT)" chips={chipsFor.shipping.map((c, i) => <Chip key={i} {...c} />)} open={open.has('shipping')} onToggle={() => toggleSec('shipping')}>
            <div className={FRM}>
              {DIVISIONS.map((dv) => (
                <div key={dv}>
                  <label>{dv} (৳)</label>
                  <input id={'ship-' + dv} type="number" min="0" step="1" value={ship.divisions[dv] ?? 0}
                    onChange={(e) => setShip((s0) => ({ ...s0, divisions: { ...s0.divisions, [dv]: e.target.value } }))} />
                </div>
              ))}
              <div className={FULL}>
                <label>Free shipping threshold (৳ subtotal)</label>
                <input id="shipFree" type="number" min="0" step="1" value={ship.freeThreshold}
                  onChange={(e) => setShip((s0) => ({ ...s0, freeThreshold: e.target.value }))} />
              </div>
            </div>
          </Section>
          )}

          {/* 📦 COURIER */}
          {show('courier') && (
            <Section id="courier" icon="📦" title="Courier API — Steadfast / Pathao Auto-Dispatch" chips={chipsFor.courier.map((c, i) => <Chip key={i} {...c} />)} open={open.has('courier')} onToggle={() => toggleSec('courier')}>
            <div className={FRM}>
              <div>
                <label>Provider</label>
                <select id="courierProvider" value={courier.provider} onChange={(e) => setCourier((c) => ({ ...c, provider: e.target.value }))}>
                  <option value="none">NONE — manual dispatch (dry-run)</option>
                  <option value="steadfast">STEADFAST — portal.packzy.com API</option>
                  <option value="pathao">PATHAO — Hermes / Aladdin API</option>
                </select>
              </div>
              <div>
                <label>Auto-push when status → shipped</label>
                <select id="courierAutoPush" value={courier.autoPushOnShipped ? 'on' : 'off'} onChange={(e) => setCourier((c) => ({ ...c, autoPushOnShipped: e.target.value === 'on' }))}>
                  <option value="off">OFF — push only from the order page button</option>
                  <option value="on">ON — consignment auto-created on shipped</option>
                </select>
              </div>
              {courier.provider === 'steadfast' ? (
                <>
                  <div>
                    <label>Steadfast Api-Key</label>
                    <input id="sfKey" placeholder="from portal.packzy.com → API" value={courier.steadfast.apiKey} onChange={(e) => setCourier((c) => ({ ...c, steadfast: { ...c.steadfast, apiKey: e.target.value } }))} />
                  </div>
                  <div>
                    <label>Steadfast Secret-Key</label>
                    <input id="sfSecret" placeholder="from portal.packzy.com → API" value={courier.steadfast.secretKey} onChange={(e) => setCourier((c) => ({ ...c, steadfast: { ...c.steadfast, secretKey: e.target.value } }))} />
                  </div>
                </>
              ) : null}
              {courier.provider === 'pathao' ? (
                <>
                  <div>
                    <label>Store ID</label>
                    <input id="ptStore" placeholder="Pathao merchant store id" value={courier.pathao.storeId} onChange={(e) => setCourier((c) => ({ ...c, pathao: { ...c.pathao, storeId: e.target.value } }))} />
                  </div>
                  <div>
                    <label>Client ID</label>
                    <input id="ptClient" placeholder="Pathao API client id" value={courier.pathao.clientId} onChange={(e) => setCourier((c) => ({ ...c, pathao: { ...c.pathao, clientId: e.target.value } }))} />
                  </div>
                  <div>
                    <label>Client Secret</label>
                    <input id="ptSecret" placeholder="Pathao API client secret" value={courier.pathao.clientSecret} onChange={(e) => setCourier((c) => ({ ...c, pathao: { ...c.pathao, clientSecret: e.target.value } }))} />
                  </div>
                  <div>
                    <label>Username</label>
                    <input id="ptUser" placeholder="merchant portal username" value={courier.pathao.username} onChange={(e) => setCourier((c) => ({ ...c, pathao: { ...c.pathao, username: e.target.value } }))} />
                  </div>
                  <div>
                    <label>Password</label>
                    <input id="ptPass" placeholder="merchant portal password" value={courier.pathao.password} onChange={(e) => setCourier((c) => ({ ...c, pathao: { ...c.pathao, password: e.target.value } }))} />
                  </div>
                  <div>
                    <label>API base URL</label>
                    <input id="ptBase" placeholder="https://api-hermes.pathao.com" value={courier.pathao.baseUrl} onChange={(e) => setCourier((c) => ({ ...c, pathao: { ...c.pathao, baseUrl: e.target.value } }))} />
                  </div>
                </>
              ) : null}
            </div>
            <div className="mt-3 text-[12px] text-dim2">
              Set the provider, paste credentials once, save — then every order page gets a <b>Push to Courier</b> button that creates
              the real consignment (Steadfast returns a tracking code + public tracking URL, saved straight onto the order).
              With auto-push ON, flipping an order to <b>shipped</b> dispatches it automatically. Provider NONE keeps everything
              manual and the button reports a dry-run instead of failing.
            </div>
          </Section>
          )}

          {/* 💬 CHAT & SMS */}
          {show('chat') && (
            <Section id="chat" icon="💬" title="Chat, WhatsApp, Telegram & SMS" chips={chipsFor.chat.map((c, i) => <Chip key={i} {...c} />)} open={open.has('chat')} onToggle={() => toggleSec('chat')}>
            <div className={FRM}>
              <div>
                <label>Chat widget</label>
                <select id="chatEnabled" value={chat.enabled ? 'on' : 'off'} onChange={(e) => setChat((c0) => ({ ...c0, enabled: e.target.value === 'on' }))}>
                  <option value="on">ENABLED — bubble on every page</option>
                  <option value="off">DISABLED — hidden everywhere</option>
                </select>
              </div>
              <div>
                <label>WhatsApp number</label>
                <input id="chatWhatsapp" placeholder="01712-345678 or +8801712345678" value={chat.whatsapp} onChange={(e) => setChat((c0) => ({ ...c0, whatsapp: e.target.value }))} />
              </div>
              <div>
                <label>Telegram username</label>
                <input id="chatTelegram" placeholder="arixgear (or full t.me link)" value={chat.telegram} onChange={(e) => setChat((c0) => ({ ...c0, telegram: e.target.value }))} />
              </div>
              <div className={FULL}>
                <label>Chat greeting (first thing customers see)</label>
                <input id="chatGreeting" value={chat.greeting} onChange={(e) => setChat((c0) => ({ ...c0, greeting: e.target.value }))} />
              </div>
              <div className={FULL}>
                <label>চ্যাট গ্রিটিং (বাংলা)</label>
                <input id="chatGreetingBn" value={chat.greetingBn || ''} onChange={(e) => setChat((c0) => ({ ...c0, greetingBn: e.target.value }))} placeholder="আসসালামু আলাইকুম! আপনার প্রশ্ন লিখুন — সাধারণত এক ঘণ্টার মধ্যে উত্তর দিই।" />
              </div>
            </div>
            <div className="mt-3 text-[12px] text-dim2">
              The storefront shows a Live Chat bubble plus WhatsApp (green) and Telegram (blue) floating buttons — all three are
              managed here. Chat messages land in <b>Admin → Messages</b> with topic <b>chat</b>. Empty WhatsApp/Telegram fields hide those buttons.
            </div>

            <div className="mt-4 rounded-lg border border-line p-4">
              <h4 className="mb-3 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">📱 SMS Notifications — SSLWireless</h4>
              <div className={FRM}>
                <div><label>Provider</label><input value={(sms && sms.provider) || 'off'} readOnly /></div>
                <div><label>Mode</label><input value={(sms && sms.mode) || 'off'} readOnly className={(sms && sms.mode) === 'live' ? 'font-bold text-green' : ''} /></div>
                <div><label>Credentials in .env</label><input value={sms && sms.configured ? 'yes' : 'not yet'} readOnly /></div>
                <div><label>Message log</label><input value={(sms && sms.logFile) || ''} readOnly /></div>
              </div>
              <div className="mt-3 text-[12px] text-dim2">
                Dry-run is the safe default — every order/status SMS is written to <b>backend/logs/sms.jsonl</b> without sending.
                When your SSLWireless account is ready: set <code>SMS_PROVIDER=sslwireless</code>, <code>SMS_DRY_RUN=false</code>,
                <code>SSLWIRELESS_API_TOKEN</code> + <code>SSLWIRELESS_SID</code> in backend/.env and restart the API.
                Hooks: order placed · payment verified/rejected · shipped · delivered.
              </div>
            </div>
          </Section>
          )}

          {/* 📣 PIXEL */}
          {show('pixel') && (
            <Section id="pixel" icon="📣" title="Facebook Pixel — Meta Ads Conversion Tracking" chips={chipsFor.pixel.map((c, i) => <Chip key={i} {...c} />)} open={open.has('pixel')} onToggle={() => toggleSec('pixel')}>
            <div className={FRM}>
              <div className="md:col-span-2">
                <label>Pixel ID (Events Manager → Data Sources)</label>
                <input id="pxId" placeholder="e.g. 1234567890123456" value={pixelId} onChange={(e) => setPixelId(e.target.value)} />
              </div>
              <div>
                <label>Tracking</label>
                <select id="pxOn" value={pxOn} onChange={(e) => setPxOn(e.target.value)}>
                  <option value="off">DISABLED — pixel stays dark</option>
                  <option value="on">ENABLED — live on storefront</option>
                </select>
              </div>
              <div>
                <label>Storefront status (live)</label>
                <input id="pxStatus" readOnly value={pxStatus} className={pxActive ? 'font-bold text-green' : ''} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {PIXEL_EVENTS.map((ev) => <span key={ev} className={CHIP + ' text-dim'}>{ev}</span>)}
              <span className="text-[11.5px] text-dim2">auto-fired with ৳ BDT values across the whole storefront</span>
            </div>
            <div className="mt-3 text-[12px] text-dim2">
              Paste the Pixel ID from Meta Events Manager, set tracking to ENABLED, save — the storefront injects the Pixel
              automatically on every page and starts firing the standard e-commerce events above (values in BDT). No code deploy.
              Disabling it removes every Meta request on the next page load. Purchase is sent once per order with
              <code> order_id </code> as the event ID, so Meta dedupes reloads and server events.
            </div>
          </Section>
          )}

          {/* 📏 SIZE GUIDE — global + category tables */}
          {show('sizeguide') && (
            <Section id="sizeguide" icon="📏" title="Size Guide — Global Table + Category Tables" chips={chipsFor.sizeguide.map((c, i) => <Chip key={i} {...c} />)} open={open.has('sizeguide')} onToggle={() => toggleSec('sizeguide')}>
            <div className={FRM}>
              <div>
                <label>Global visibility</label>
                <select id="sgEnabled" value={guide.enabled ? 'on' : 'off'} onChange={(e) => setGuide((g) => ({ ...g, enabled: e.target.value === 'on' }))}>
                  <option value="on">SHOWN — accordion + link on every PDP</option>
                  <option value="off">HIDDEN — no size guide anywhere</option>
                </select>
              </div>
              <div>
                <label>Accordion title</label>
                <input id="sgTitle" placeholder="Size Guide" value={guide.title} onChange={(e) => setGuide((g) => ({ ...g, title: e.target.value }))} />
                <div className="mt-2"><label>টাইটেল (বাংলা)</label>
                <input id="sgTitleBn" value={guide.titleBn || ''} onChange={(e) => setGuide((g) => ({ ...g, titleBn: e.target.value }))} placeholder="সাইজ গাইড" /></div>
              </div>
              <div className={FULL}>
                <label>Helper note (small text under the table)</label>
                <input id="sgNote" value={guide.note} onChange={(e) => setGuide((g) => ({ ...g, note: e.target.value }))} />
                <div className="mt-2"><label>নোট (বাংলা)</label>
                <input id="sgNoteBn" value={guide.noteBn || ''} onChange={(e) => setGuide((g) => ({ ...g, noteBn: e.target.value }))} /></div>
              </div>
            </div>

            <div className="mt-4">
              <GuideEditor value={guide} onChange={(h) => setGuide((g0) => ({ ...g0, headers: h.headers, rows: h.rows }))} prefix="sg" />
            </div>
            <div className="mt-3 text-[12px] text-dim2">
              This is the GLOBAL fallback table — first row = bold header row; 1–6 columns, up to 30 rows. A product's own
              custom table or its category table (below) overrides this one.
            </div>

            <div className="mt-5 rounded-lg border border-line p-4" id="catGuideCard">
              <h4 className="mb-2 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">🗂 Category-specific Tables</h4>
              <p className="mb-3 text-[12px] text-dim2">
                PDP resolution: <b>product custom → category table → global table → default</b>. One table per category —
                every product in it shows it (unless the product runs its own). <b>Show/Hide</b> switches the whole category's
                guide + PDP link off without deleting the table. Remember to press <b>Save</b> — Apply only stages the table in this form.
              </p>
              <div className="space-y-2.5">
                {catRows.map((cat) => {
                  const entry = catGuides.find((g) => g.category === cat);
                  const editing = catEdit === cat;
                  const draft = editing ? catDraft : null;
                  return (
                    <div key={cat} className="rounded-lg border border-line p-3" data-catguide={cat}>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-[12.5px] uppercase tracking-[.08em]">{cat}</b>
                        {entry ? (
                          <span className={CHIP + (entry.enabled !== false ? ' border-green/40 text-green' : ' border-red/40 text-red')}>
                            {entry.enabled !== false ? 'TABLE ON' : 'TABLE OFF'} · {(entry.headers || []).length || 0} cols
                          </span>
                        ) : (
                          <span className={CHIP + ' text-dim2'}>— no table (global fallback)</span>
                        )}
                        <div className="flex-1" />
                        {entry ? (
                          <>
                            <button id={'cgEdit-' + cat} className={GHOST_BTN} onClick={() => (editing ? (setCatEdit(null), setCatDraft(null)) : startCatEdit(cat))}>{editing ? 'Close' : 'Edit'}</button>
                            <button id={'cgToggle-' + cat} className={GHOST_BTN} onClick={() => toggleCat(cat)}>{entry.enabled !== false ? 'Hide' : 'Show'}</button>
                            <button id={'cgRemove-' + cat} className={GHOST_BTN + ' hover:!border-red hover:!text-red'} onClick={() => removeCat(cat)}>Remove</button>
                          </>
                        ) : (
                          <button id={'cgAdd-' + cat} className={GHOST_BTN} onClick={() => startCatEdit(cat)}>+ Add table</button>
                        )}
                      </div>
                      {editing && draft ? (
                        <div className="mt-3 border-t border-line pt-3">
                          <div className={FRM + ' mb-3'}>
                            <div><label>Table title</label><input id={'cgTitle-' + cat} value={draft.title} onChange={(e) => setCatDraft((d) => ({ ...d, title: e.target.value }))} /></div>
                            <div className="md:col-span-2"><label>Helper note</label><input id={'cgNote-' + cat} value={draft.note} onChange={(e) => setCatDraft((d) => ({ ...d, note: e.target.value }))} /></div>
                          </div>
                          <GuideEditor value={draft} onChange={setCatDraft} prefix={'cg' + cat.replace(/[^a-z0-9]/g, '')} />
                          <div className="mt-3 flex gap-2">
                            <button id={'cgApply-' + cat} className={ACC_BTN} onClick={applyCatDraft}>Apply table</button>
                            <button className={GHOST_BTN} onClick={() => { setCatEdit(null); setCatDraft(null); }}>Discard</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!catRows.length ? <div className="text-[12px] text-dim2">No categories yet — create one in Admin → Catalog.</div> : null}
              </div>
            </div>
          </Section>
          )}

          {/* ✉️ EMAIL TEMPLATES (Task 56-d) */}
          {show('emailtpl') && (
            <Section id="emailtpl" icon="✉️" title="Email Templates — Subjects & Intro Text" chips={chipsFor.emailtpl.map((c, i) => <Chip key={i} {...c} />)} open={open.has('emailtpl')} onToggle={() => toggleSec('emailtpl')}>
            <div className="space-y-5">
              <p className="text-[12px] leading-relaxed text-dim2">
                Edit the <b>subject lines</b> and <b>intro paragraphs</b> of the four transactional emails. Tables, buttons and the
                brand wrapper stay fixed so a typo can never break a delivery. Leave a field blank to keep using the built-in default.
                Placeholders: {' '}{Object.entries(ET_PLACEHOLDERS).map(([k, v]) => (
                  <span key={k} className="mr-2 whitespace-nowrap rounded border border-line2 px-1.5 py-0.5 text-[10.5px] text-txt">{k}: <code className="text-acc">{v}</code></span>
                ))}
              </p>

              {[
                { key: 'orderConfirmation', label: 'Order Confirmation', sk: 'subject', ik: 'intro' },
                { key: 'passwordReset', label: 'Password Reset', sk: 'subject', ik: 'intro' },
                { key: 'emailOtp', label: 'Email Verification OTP', sk: 'subject', ik: 'intro' },
              ].map((tpl) => (
                <div key={tpl.key} className="rounded-lg border border-line2 bg-bg p-4">
                  <h4 className="mb-2.5 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">📄 {tpl.label}</h4>
                  <div className="space-y-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.08em] text-dim2">Subject</label>
                      <input id={'et-subj-' + tpl.key} value={etpl[tpl.key][tpl.sk]} onChange={(e) => setEtpl({ ...etpl, [tpl.key]: { ...etpl[tpl.key], [tpl.sk]: e.target.value } })}
                        className="w-full rounded-lg border border-line2 bg-panel px-3 py-2 text-[12.5px] text-txt outline-none focus:border-acc" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.08em] text-dim2">Intro paragraph (HTML allowed)</label>
                      <textarea id={'et-intro-' + tpl.key} rows={3} value={etpl[tpl.key][tpl.ik]} onChange={(e) => setEtpl({ ...etpl, [tpl.key]: { ...etpl[tpl.key], [tpl.ik]: e.target.value } })}
                        className="w-full rounded-lg border border-line2 bg-panel px-3 py-2 text-[12.5px] leading-relaxed text-txt outline-none focus:border-acc" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-line2 bg-bg p-4">
                <h4 className="mb-2.5 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">📄 Status Update Emails</h4>
                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.08em] text-dim2">Subject pattern</label>
                    <input id="et-statusPrefix" value={etpl.statusUpdate.subjectPrefix} onChange={(e) => setEtpl({ ...etpl, statusUpdate: { ...etpl.statusUpdate, subjectPrefix: e.target.value } })}
                      className="w-full rounded-lg border border-line2 bg-panel px-3 py-2 text-[12.5px] text-txt outline-none focus:border-acc" />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {STATUS_NOTE_KEYS.map((k) => (
                      <div key={k}>
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.08em] text-dim2">Note — {k}</label>
                        <input id={'et-note-' + k} value={etpl.statusUpdate.notes[k]} onChange={(e) => setEtpl({ ...etpl, statusUpdate: { ...etpl.statusUpdate, notes: { ...etpl.statusUpdate.notes, [k]: e.target.value } } })}
                          className="w-full rounded-lg border border-line2 bg-panel px-3 py-2 text-[12.5px] text-txt outline-none focus:border-acc" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* test send */}
              <div className="rounded-lg border border-dashed border-line2 bg-bg p-4">
                <h4 className="mb-2.5 text-[13px] font-bold uppercase tracking-[.1em] text-dim2">🧪 Send a test email</h4>
                <div className="flex flex-wrap items-center gap-2">
                  <select id="etTestKey" value={testKey} onChange={(e) => setTestKey(e.target.value)}
                    className="rounded-lg border border-line2 bg-panel px-3 py-2 text-[12.5px] text-txt outline-none focus:border-acc">
                    <option value="orderConfirmation">Order Confirmation</option>
                    <option value="statusUpdate">Status Update</option>
                    <option value="passwordReset">Password Reset</option>
                    <option value="emailOtp">Email OTP</option>
                  </select>
                  <input id="etTestTo" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourdomain.com"
                    className="min-w-[220px] flex-1 rounded-lg border border-line2 bg-panel px-3 py-2 text-[12.5px] text-txt outline-none focus:border-acc" />
                  <button id="etTestSend" disabled={testBusy || !testTo.trim()}
                    onClick={async () => {
                      setTestBusy(true);
                      try { toast(await sendTestEmail(testKey, testTo.trim()).then((d) => d.message), 'ok'); }
                      catch (e) { toast(e.message, 'err'); }
                      setTestBusy(false);
                    }}
                    className={ACC_BTN + ' disabled:opacity-40'}>{testBusy ? 'Sending…' : 'Send Test'}</button>
                </div>
                <p className="mt-2 text-[11px] text-dim2">Uses the SAVED overrides — press the main Save button first. Without a Resend API key the email lands in backend/logs/emails.jsonl (dry-run).</p>
              </div>
            </div>
          </Section>
          )}

          {/* 🚦 SYSTEM STATUS */}
          {show('system') && (
            <Section id="system" icon="🚦" title="Production Readiness — System Status" chips={chipsFor.system} open={true} onToggle={() => toggleSec('system')}>
            <ProdStatus />
            {/* Task 57 — one-click database backup (owner-only endpoint).
                Step 2 audit fix — the card rendered for subadmins too and the
                click just 403'd; hide it unless the user is the owner. */}
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line2 bg-bg p-4" style={{ display: (auth.user?.role === 'admin') ? undefined : 'none' }}>
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-bold uppercase tracking-[.1em] text-dim2">💾 Database Backup</h4>
                <p className="mt-1 text-[11.5px] leading-relaxed text-dim2">Downloads every collection as one JSON file (audit/GSC/notify logs capped). Keep weekly copies — restore is a reseed + import away.</p>
              </div>
              <button id="backupDb" disabled={bkBusy} onClick={async () => {
                setBkBusy(true);
                try {
                  await download('/admin/system/backup', 'arixgear-backup-' + new Date().toISOString().slice(0, 10) + '.json');
                  toast('Backup downloaded ✓', 'ok');
                } catch (e) { toast(e.message, 'err'); }
                setBkBusy(false);
              }} className={ACC_BTN + ' disabled:opacity-40'}>{bkBusy ? 'Packing…' : '⬇ Download Backup'}</button>
            </div>
          </Section>
          )}
        </div>
      </div>

      {/* Task 33 — floating unsaved-changes bar */}
      {dirty ? (
        <div id="unsavedBar" className="fixed bottom-4 left-1/2 z-[1400] flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-acc/50 bg-panel px-5 py-3 shadow-2xl">
          <b className="text-[12.5px] text-acc">⚠ Unsaved changes</b>
          <span className="hidden text-[11.5px] text-dim2 sm:inline">applies to storefront + checkout after save</span>
          <button id="discardSettings" className={GHOST_BTN} disabled={busy} onClick={() => load()}>Discard</button>
          <button id="saveSettings" className={ACC_BTN} disabled={busy} onClick={save}>Save All Settings</button>
        </div>
      ) : null}
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="settings" title="Store Settings">
        <SettingsPage />
      </AdminShell>
    </OverlayProvider>
  );
}
