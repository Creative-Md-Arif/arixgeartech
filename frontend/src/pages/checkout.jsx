/* ArixGear page — checkout: totals, coupon, division shipping, manual payments (bKash/Nagad/Rocket/COD), place order.
   React 18 port of _legacy/frontend-vanilla/checkout.html + js/pages/checkout.js (behavior spec). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createOrder, validateCoupon, previewOrder, initPayment } from '../services/orders.js';
import { activeCoupons } from '../services/coupons.js';
import { getPayment } from '../services/settings.js';
import { money, adaptOrder, DIV_LABELS } from '../lib/format.js';
import { go } from '../lib/go.js';
import { fbTrack } from '../lib/pixel.js';
import { useStore } from '../store/store.jsx';
import { loyalty as loyaltyApi } from '../services/auth.js';
import { useCatalog } from '../store/catalog.jsx';
import { useContent } from '../store/content.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';

/* payment method rows (brand chips approximated with palette tokens — no hex in JSX) */
const METHODS = [
  { key: 'bkash', name: 'bKash', sub: 'Send Money · TrxID + screenshot', chip: 'bg-pink-600 text-white' },
  { key: 'nagad', name: 'Nagad', sub: 'Send Money · TrxID + screenshot', chip: 'bg-red text-white' },
  { key: 'rocket', name: 'Rocket', sub: 'Send Money · TrxID + screenshot', chip: 'bg-purple-700 text-white' },
  { key: 'cod', name: 'Cash on Delivery', sub: 'Pay cash when the gear lands', chip: 'bg-panel2 border border-line2 text-silver' },
];
/* Task 40 — SSLCOMMERZ row, injected only while the admin gateway is enabled */
const GW_METHOD = { key: 'sslcommerz', name: 'Online Pay', sub: 'Card / Net Banking / Wallet · SSLCOMMERZ', chip: 'bg-panel2 border border-acc text-acc' };
const MOBILE_METHODS = ['bkash', 'nagad', 'rocket'];

const FIELD_BASE = 'w-full bg-bg2 border px-3.5 py-3 text-txt outline-none text-[.92rem] transition-colors placeholder:text-dim/60 focus:border-acc';
const errCls = (bad) => (bad ? 'border-red animate-shake' : 'border-line2');

import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  useSEO('checkout');
  const { cart, setCart, promo, setPromo, division, setDivision, session, setLastOrder, pushOrder, cartTotals } = useStore();
  const { BY_ID } = useCatalog();
  const { payInfo, divCharge, FREE_SHIP } = useContent();
  const { toast } = useUI();
  const { t } = useLang();

  const [payMethod, setPayMethod] = useState('bkash');
  const [payShot, setPayShot] = useState(null);
  const [shot, setShot] = useState(null); /* {name,size,url} preview info */
  const [promoText, setPromoText] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState({});
  const [drag, setDrag] = useState(false);
  const [gateway, setGateway] = useState(null); /* Task 40 — { enabled, sandbox, provider } */
  const [guest, setGuest] = useState(true); /* Task 52 — guest checkout policy (default ON) */
  const fileRef = useRef(null);

  /* Task 40 + 52 — is the online gateway live? is guest checkout allowed?
     A disabled/failed call simply hides the Online Pay row; the page never
     blocks on the call itself. */
  useEffect(() => {
    let on = true;
    getPayment().then((d) => {
      if (!on) return;
      setGateway(d.gateway || { enabled: false });
      setGuest(!(d.checkout && d.checkout.guestEnabled === false));
    }).catch(() => { if (on) { setGateway({ enabled: false }); setGuest(true); } });
    return () => { on = false; };
  }, []);

  /* Task 28 — idempotency key: one per checkout attempt. A double-click or a
     network retry re-sends the SAME key, the server returns the original order
     and no second charge happens. Cleared after success / cart changes. */
  const idemRef = useRef(null);
  const getIdemKey = () => {
    if (!idemRef.current) {
      idemRef.current = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
    return idemRef.current;
  };

  /* prefilled from session, exactly like legacy initPage() (checkout branch) */
  const [form, setForm] = useState(() => {
    const u = (session && session.user) || {};
    return {
      email: u.email || '',
      phone: u.phone || '',
      first: u.name ? u.name.split(' ')[0] : '',
      last: '',
      addr: '',
      city: '',
      zip: '',
      txn: '',
    };
  });
  const setF = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setBad((b) => (b[k] ? { ...b, [k]: false } : b));
  };

  /* ---------- totals: discount (fixed vs percent), division shipping, free-shipping threshold ---------- */
  const { sum, disc, shipCost, total, items } = useMemo(() => {
    const t = cartTotals();
    const d = promo ? (promo.type === 'fixed' ? Math.min(promo.value, t.sum) : Math.round(t.sum * promo.value) / 100) : 0;
    const ship = t.sum <= 0 ? 0 : (((t.sum - d) >= FREE_SHIP) ? 0 : divCharge(division));
    const grand = Math.max(0, Math.round((t.sum - d + ship) * 100) / 100);
    const list = Object.keys(cart).map((k) => {
      const it = cart[k];
      const p = BY_ID[it.id] || {};
      return { key: k, name: it.bundle ? it.bundleTitle : (p.name || it.id), img: p.img || '', price: +it.price || p.price || 0, size: it.size, color: it.color, qty: it.qty };
    });
    return { sum: t.sum, disc: d, shipCost: ship, total: grand, items: list };
  }, [cartTotals, promo, division, divCharge, FREE_SHIP, cart, BY_ID]);

  /* Task 56-a — loyalty redemption: balance + rules load once per session */
  const [loyal, setLoyal] = useState(null);
  const [ptsInput, setPtsInput] = useState('');
  useEffect(() => {
    if (!session?.token) { setLoyal(null); return undefined; }
    let dead = false;
    loyaltyApi().then((d) => { if (!dead) setLoyal(d); }).catch(() => { if (!dead) setLoyal(null); });
    return () => { dead = true; };
  }, [session?.token]);
  const pts = Math.max(0, Math.floor(Number(ptsInput) || 0));
  const authedPts = Boolean(session?.token);
  const ptsUsable = Boolean(authedPts && loyal && loyal.rules.enabled && loyal.points >= (loyal.rules.minRedeem || 1));

  /* Task 28 — server preview: debounced POST /api/orders/preview returns the
     REAL server totals (price rules, coupon validity, division shipping, free-
     shipping gap). The summary box prefers these; local calc stays as fallback
     and instant paint. Coupon errors surface through couponMessage. */
  const [srv, setSrv] = useState(null);
  useEffect(() => {
    const list = Object.keys(cart).map((k) => cart[k].bundle ? ({ bundle: cart[k].bundle, qty: cart[k].qty }) : ({ slug: cart[k].id, qty: cart[k].qty, size: cart[k].size || undefined }));
    if (!list.length) { setSrv(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const d = await previewOrder({ items: list, couponCode: promo ? promo.code : null, division: division || 'dhaka', redeemPoints: ptsUsable ? pts : 0 });
        setSrv(d);
      } catch (e) { setSrv(null); /* server preview is best-effort */ }
    }, 400);
    return () => clearTimeout(t);
  }, [cart, promo, division, pts, ptsUsable]);

  /* redemption block straight from the server preview — null when invalid */
  const rd = srv && srv.redemption ? srv.redemption : null;

  /* display values — server numbers win when they have landed */
  const V = srv ? { sum: srv.subtotal, disc: srv.discount, shipCost: srv.shipping, total: srv.grandTotal } : { sum, disc, shipCost, total };

  const mob = MOBILE_METHODS.includes(payMethod);
  const m = payInfo[payMethod] || payInfo.bkash;
  const pm = METHODS.find((x) => x.key === payMethod) || METHODS[0];
  const gwOn = Boolean(gateway && gateway.enabled);
  const PAY_ROWS = gwOn ? [...METHODS, GW_METHOD] : METHODS;

  /* Task 52 — account gate: admin turned guest checkout off AND no session */
  const authed = Boolean(session && session.user);
  const needLogin = !guest && !authed;

  /* ---------- Meta Pixel: InitiateCheckout — once per checkout page view with a loaded cart ---------- */
  const pxOnce = useRef(false);
  useEffect(() => {
    if (pxOnce.current) return;
    pxOnce.current = true;
    try {
      const { n, sum: s } = cartTotals();
      if (n > 0) {
        fbTrack('InitiateCheckout', {
          content_ids: Object.keys(cart).map((k) => cart[k].id),
          content_type: 'product',
          num_items: n,
          value: s,
          currency: 'BDT',
        });
      }
    } catch (e) { /* pixel never blocks checkout */ }
  }, []); /* eslint-disable-line react-hooks/exhaustive-deps */

  /* ---------- coupon ---------- */
  /* Task 29 — public coupon picker: safe-to-advertise codes rendered as chips */
  const [publicCoupons, setPublicCoupons] = useState([]);
  const [promoMeta, setPromoMeta] = useState(null); /* { usageLeft, minRemaining } from validate */
  useEffect(() => {
    let dead = false;
    activeCoupons().then((d) => { if (!dead) setPublicCoupons(d.items || []); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const applyPromo = async (override) => {
    const v = String(override !== undefined ? override : promoText).trim().toUpperCase();
    if (!v) { toast(t('Enter a code'), t('Type a promo code first.')); return; }
    const { sum: s } = cartTotals();
    /* scoped coupons need per-line totals — prices come from the local mirror */
    const lines = Object.keys(cart).map((k) => ({
      slug: cart[k].id,
      lineTotal: Math.round((cart[k].price || BY_ID[cart[k].id]?.price || 0) * cart[k].qty * 100) / 100,
    }));
    try {
      const d = await validateCoupon(v, s, lines);
      setPromo({ code: d.code, type: d.type, value: d.value });
      setPromoMeta({ usageLeft: d.usageLeft, minRemaining: d.minRemaining, scoped: d.scoped });
      toast(t('Code applied'), d.code + ' — ' + money(d.discount) + ' off.' + (d.usageLeft != null ? ' ' + d.usageLeft + ' uses left.' : ''));
    } catch (e) {
      /* Step 3 audit — the old branch here applied a client-side "FORGE10 −10%"
         fallback when the API was unreachable. The server is the source of
         truth for coupons: with the API down the order cannot be placed at all,
         and FORGE10 is not a real code (the newsletter welcome coupon is
         ARIX10) — so the branch only produced a discount the backend would
         refuse, i.e. a broken checkout. Removed; the offline toast below is
         the honest outcome. */
      setPromo(null);
      setPromoMeta(null);
      toast(t('Invalid code'), e.message || t('That code did not survive the cut.'));
    }
  };

  /* ---------- manual payment helpers ---------- */
  const copyNum = () => {
    const info = payInfo[payMethod] || payInfo.bkash;
    const num = (info.num || '').replace(/[^0-9]/g, '');
    const done = () => toast(t('Number copied'), t('Paste it into your {app} app and send the exact total.', { app: info.label }));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(num).then(done, done);
    else {
      const ta = document.createElement('textarea');
      ta.value = num; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      ta.remove(); done();
    }
  };

  const acceptShot = (f) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { toast('Wrong file type', 'Upload a JPG, PNG or WEBP screenshot of the payment confirmation.'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('File too large', 'Keep the screenshot under 5 MB.'); return; }
    setPayShot(f);
    const r = new FileReader();
    r.onload = () => setShot({ name: f.name, size: (f.size / 1048576).toFixed(2) + ' MB · ' + new Date().toLocaleDateString(), url: r.result });
    r.readAsDataURL(f);
  };
  const removeShot = () => { setPayShot(null); setShot(null); if (fileRef.current) fileRef.current.value = ''; };

  /* ---------- place order: validate → multipart POST /api/orders ---------- */
  const placeOrder = async () => {
    if (needLogin) {
      toast(t('Account required'), t('Guest checkout is off — log in to place your order.'));
      go('account');
      return;
    }
    const b = {};
    ['email', 'phone', 'first', 'last', 'addr', 'city'].forEach((k) => { if (!String(form[k]).trim()) b[k] = true; });
    if (!/\S+@\S+\.\S+$/.test(form.email)) b.email = true;
    /* Task 28 — BD mobile validation (01[3-9]XXXXXXXX, 880/+880 normalized) —
       mirrors the server rule so customers get told before submitting. */
    const phNorm = form.phone.replace(/\D/g, '').replace(/^880/, '0').slice(-11);
    if (!/^01[3-9]\d{8}$/.test(phNorm)) b.phone = true;
    if (mob) {
      if (form.txn.trim().length < 6) b.txn = true;
      if (!payShot) b.shot = true;
    }
    setBad(b);
    if (Object.keys(b).length) { toast(t('Check the form'), t('Some fields need attention before we can lock the order.')); return; }
    if (mob && !payShot) { toast(t('Screenshot missing'), t('Upload the payment screenshot so we can verify your transaction.')); return; }
    if (total <= 0) { toast(t('Cart is empty'), t('Add gear before placing an order.')); return; }
    setBusy(true);
    try {
      /* Server recalculates prices, coupon and division shipping — client totals are informational only. */
      const payload = {
        customer: { name: form.first.trim() + ' ' + form.last.trim(), phone: form.phone.trim(), email: form.email.trim() },
        shipping: { address: form.addr.trim(), city: form.city.trim(), division: division || 'dhaka', postal: form.zip.trim(), notes: '' },
        items: Object.keys(cart).map((k) => { const it = cart[k]; return it.bundle ? { bundle: it.bundle, qty: it.qty } : { slug: it.id, qty: it.qty, size: it.size || undefined, color: it.color || undefined }; }),
        couponCode: promo ? promo.code : null,
        redeemPoints: rd ? rd.points : 0,
        paymentMethod: payMethod,
        trxId: mob ? form.txn.trim() : '',
        senderNumber: '',
        idempotencyKey: getIdemKey(),
      };
      const d = await createOrder({ payload: JSON.stringify(payload), screenshot: mob && payShot ? payShot : null });
      idemRef.current = null; /* next order gets a fresh key */
      const order = adaptOrder(d.order);
      setLastOrder(order);
      pushOrder(order);

      /* Task 40 — online payment: hand over to SSLCOMMERZ instead of the
         local success screen. Cart clears only when the session starts; if
         the gateway refuses, the cart stays so the customer can retry. */
      if (payMethod === 'sslcommerz') {
        try {
          const gw = await initPayment({ orderNumber: order.no, phone: form.phone.trim() });
          setCart({});
          window.location.href = gw.redirect;
          return;
        } catch (e2) {
          toast('Payment could not start', (e2.message || 'Gateway unavailable') + ' — your order ' + order.no + ' is saved; we will contact you.');
          return;
        }
      }

      setCart({});
      go('success');
      toast(t('Order locked in'), mob ? t('We will verify your payment and confirm shortly.') : t('Pay cash when the gear lands. Dispatch within 24 hours.'));
    } catch (e) {
      toast(e.offline ? t('API offline') : t('Order failed'), e.message || t('Something went wrong — try again.'));
    } finally {
      setBusy(false);
    }
  };

  const blockH3 = 'font-disp font-normal text-xl uppercase tracking-[.03em] flex items-center gap-3.5 mb-5';
  const numChip = 'not-italic flex-none w-[30px] h-[30px] inline-flex items-center justify-center bg-acc text-black font-cond font-bold text-[.9rem]';
  const line = 'flex justify-between gap-3 py-2 border-t border-line text-[.9rem] text-muted';

  return (
    <section id="checkout" className="bg-bg2 border-t border-line py-16 md:py-24">
      <div className="container mx-auto w-[92%]">
        {/* ---------- page head ---------- */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-fadeIn">
          <div>
            <p className="font-cond uppercase tracking-[.45em] text-acc text-[.82rem] font-semibold flex items-center gap-3">
              <i className="not-italic w-9 h-0.5 bg-acc" />{t('One Page · No Runaround')}
            </p>
            <h2 className="font-disp uppercase leading-[.96] text-5xl md:text-7xl mt-3">{t('CHECKOUT')}<span className="text-outline">.</span></h2>
          </div>
          <p className="text-muted text-[.95rem] max-w-[420px] md:pb-2">Everything on one page. Fill it once, lift tomorrow. Pay with bKash, Nagad, Rocket — or cash on delivery.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-6 lg:gap-10 items-start mt-10 animate-slideUp">
          {/* ==================== LEFT: forms ==================== */}
          <div>
            {needLogin ? (
              /* Task 52 — guest checkout disabled: account gate replaces the form */
              <div className="border border-line bg-panel p-6 sm:p-8 md:p-10 text-center" id="guestGate">
                <svg viewBox="0 0 24 24" className="w-[42px] h-[42px] stroke-acc fill-none mx-auto" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1.4" />
                </svg>
                <h3 className="font-disp uppercase text-2xl md:text-3xl mt-4">{t('Account required')}</h3>
                <p className="text-muted text-[.92rem] max-w-[460px] mx-auto mt-2.5">{t('Guest checkout is currently off. Log in or create a free account to place your order.')}</p>
                <div className="flex flex-wrap gap-3 justify-center mt-6">
                  <button type="button" id="gateLogin" onClick={() => go('account')}
                    className="bg-acc text-black hover:bg-acc2 font-head font-extrabold uppercase tracking-[.2em] py-3 px-7 transition-colors">
                    {t('Log In / Create Account')}
                  </button>
                </div>
                {/* Task 58 — show what is actually saved so the gate feels reassuring, not lossy */}
                {items.length ? (
                  <div id="gateCart" data-testid="gateCart" className="mx-auto mt-4 flex max-w-[460px] flex-wrap items-center justify-center gap-x-3 gap-y-1 border border-line2 bg-bg2 px-4 py-2.5">
                    <span className="font-cond text-[.74rem] font-semibold uppercase tracking-[.14em] text-silver2">{t('Cart saved — {n} item(s)', { n: items.length })}</span>
                    <span className="text-line2">·</span>
                    <b className="font-head text-[.82rem] text-acc">{money(total)}</b>
                  </div>
                ) : null}
                <p className="text-dim text-[.78rem] mt-4">{t('Your cart stays saved on this device.')}</p>
              </div>
            ) : (<>
            {/* 01 — contact */}
            <div className="border border-line bg-panel p-4 sm:p-6 md:p-7 mb-5">
              <h3 className={blockH3}><i className={numChip}>01</i>{t('Contact')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Email')}</span>
                  <input id="coEmail" type="email" placeholder="you@iron.house" value={form.email} onChange={(e) => setF('email', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.email)} />
                </label>
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Phone')}</span>
                  <input id="coPhone" type="tel" placeholder="01712-345678" value={form.phone} onChange={(e) => setF('phone', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.phone)} />
                </label>
              </div>
            </div>

            {/* 02 — shipping */}
            <div className="border border-line bg-panel p-4 sm:p-6 md:p-7 mb-5">
              <h3 className={blockH3}><i className={numChip}>02</i>{t('Shipping')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('First name')}</span>
                  <input id="coFirst" type="text" placeholder="Marcus" value={form.first} onChange={(e) => setF('first', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.first)} />
                </label>
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Last name')}</span>
                  <input id="coLast" type="text" placeholder="Reed" value={form.last} onChange={(e) => setF('last', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.last)} />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3.5 mt-3.5">
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Address')}</span>
                  <input id="coAddr" type="text" placeholder="12 Barbell Row" value={form.addr} onChange={(e) => setF('addr', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.addr)} />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('City')}</span>
                  <input id="coCity" type="text" placeholder="Dhaka" value={form.city} onChange={(e) => setF('city', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.city)} />
                </label>
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Postcode')}</span>
                  <input id="coZip" type="text" placeholder="1213" value={form.zip} onChange={(e) => setF('zip', e.target.value)}
                    className={FIELD_BASE + ' ' + errCls(bad.zip)} />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 mt-6">
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">Division — shipping zone (Bangladesh)</span>
                  <span className="relative block">
                    <select id="coDivision" aria-label="Division" value={division || 'dhaka'} onChange={(e) => setDivision(e.target.value || 'dhaka')}
                      className={FIELD_BASE + ' appearance-none cursor-pointer pr-10'}>
                      {Object.entries(DIV_LABELS).map(([k, label]) => <option key={k} value={k} className="bg-bg2 text-txt">{label}</option>)}
                    </select>
                    <i className="not-italic pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-silver2 text-xs">▾</i>
                  </span>
                </label>
                <p id="divChargeNote" className="text-dim text-[.78rem] mt-1">
                  {DIV_LABELS[division] || 'Dhaka'} — {money(divCharge(division))} · {FREE_SHIP > 0 ? 'free over ' + money(FREE_SHIP) : 'no free shipping'} · 2–4 working days
                </p>
              </div>
            </div>

            {/* 03 — payment */}
            <div className="border border-line bg-panel p-4 sm:p-6 md:p-7">
              <h3 className={blockH3}><i className={numChip}>03</i>{t('Payment')}</h3>
              <p className="text-[.85rem] text-muted -mt-2 mb-4">Manual payments or online card — pick a method. Send-the-total proof for mobile wallets, secure redirect for cards.</p>

              {/* radio group: bKash / Nagad / Rocket / COD / Online Pay (when gateway on) */}
              <div id="payMethods" role="radiogroup" aria-label="Payment method" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PAY_ROWS.map((x) => {
                  const sel = payMethod === x.key;
                  return (
                    <div key={x.key} data-pay={x.key} role="radio" aria-checked={sel ? 'true' : 'false'} tabIndex={0}
                      onClick={() => setPayMethod(x.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPayMethod(x.key); } }}
                      className={'pm flex items-center gap-2.5 border px-3.5 py-3 cursor-pointer min-w-0 transition-colors ' +
                        (sel ? 'sel border-acc bg-acc/[.07]' : 'border-line2 bg-bg2 hover:border-silver2')}>
                      <span className={'relative flex-none w-[15px] h-[15px] rounded-full border-2 ' + (sel ? 'border-acc' : 'border-silver2')}>
                        {sel ? <span className="absolute inset-[3px] rounded-full bg-acc" /> : null}
                      </span>
                      <span className={'flex-none font-head font-extrabold text-[.7rem] leading-none tracking-[.02em] px-2 py-1 rounded-sm ' + x.chip}>{x.name}</span>
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <b className="font-head font-bold text-[.78rem] tracking-[.05em] uppercase text-txt truncate">{x.name}</b>
                        <i className="not-italic text-[.68rem] text-dim truncate">{x.sub}</i>
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Task 40 — SSLCOMMERZ panel: no TrxID, no screenshot — secure redirect */}
              {payMethod === 'sslcommerz' ? (
                <div id="payPanelGw" className="border border-acc/60 bg-acc/[.05] px-4 py-4 sm:px-5 sm:py-5 mt-4">
                  <p className="font-head font-bold text-[.85rem] tracking-[.06em] uppercase text-acc mb-1.5">Secure redirect · SSLCOMMERZ</p>
                  <ol className="list-decimal pl-5 grid gap-1.5 text-[.85rem] text-muted">
                    <li>Place the order — we hand you over to the <b className="text-txt">SSLCOMMERZ secure page</b></li>
                    <li>Pay by card, net banking or mobile wallet — amount: <b id="gwAmt" className="text-acc">{money(V.total)}</b></li>
                    <li>You land back here automatically — paid orders move straight to processing</li>
                  </ol>
                  <p className="text-[.75rem] text-dim mt-2">No TrxID or screenshot needed — the gateway confirms the payment for us.</p>
                </div>
              ) : null}

              {/* mobile-money panel (bKash / Nagad / Rocket) */}
              <div id="payPanelMobile" hidden={!mob} className="border border-line bg-bg2 px-4 py-4 sm:px-5 sm:py-5 mt-4">
                <ol className="list-decimal pl-5 grid gap-1.5 text-[.85rem] text-muted mb-4">
                  <li>Open your <b id="payAppName" className="text-txt">{m.label}</b> app or dial <b id="payUssd" className="text-acc font-mono">{m.ussd}</b></li>
                  <li>Choose <b id="payTypeTxt" className="text-txt">{m.type}</b> and send the exact total to the number below</li>
                  <li>Copy the <b className="text-txt">Transaction ID (TrxID)</b> from the confirmation SMS</li>
                  <li>Paste the TrxID and upload the payment screenshot — we verify within hours</li>
                </ol>
                <div className="flex items-center gap-3 flex-wrap border border-line2 bg-panel2 px-4 py-3 mb-4">
                  <span id="payLogo" className={'flex-none font-head font-extrabold text-[.85rem] leading-none px-3 py-1.5 rounded-md ' + pm.chip}>{m.label}</span>
                  <div className="flex-1 min-w-[180px]">
                    <p id="payNumLabel" className="text-[.7rem] text-dim tracking-[.16em] uppercase">{m.who}</p>
                    <p id="payNum" className="font-disp text-xl sm:text-2xl tracking-[.06em] text-txt">{m.num}</p>
                    <p className="text-[.78rem] text-muted mt-0.5">Send exactly <b id="payAmt" className="text-acc font-disp text-[.95rem]">{money(V.total)}</b> — mention your order number in the reference if asked.</p>
                  </div>
                  <button id="copyPayNum" type="button" onClick={copyNum}
                    className="flex-none bg-transparent border border-line2 text-silver font-cond font-semibold tracking-[.18em] uppercase text-[.7rem] px-4 py-2.5 transition-colors hover:border-acc hover:text-acc">{t('Copy')}</button>
                </div>
                <label className="block">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Transaction ID (TrxID)')}</span>
                  <input id="coTxnId" type="text" placeholder="e.g. 9G3AXKD6GK" maxLength={12} autoComplete="off" value={form.txn}
                    onChange={(e) => setF('txn', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                    className={FIELD_BASE + ' ' + errCls(bad.txn)} />
                </label>
                <div className="mt-3.5">
                  <span className="block font-cond font-semibold text-[.78rem] tracking-[.26em] uppercase text-silver2 mb-1.5">{t('Payment screenshot')}</span>
                  <input ref={fileRef} id="coPayShot" type="file" accept="image/png,image/jpeg,image/webp" hidden
                    onChange={(e) => { const f = e.target.files && e.target.files[0]; acceptShot(f); }} />
                  <div id="payUpload" tabIndex={0} role="button" aria-label="Upload payment screenshot"
                    onClick={() => fileRef.current && fileRef.current.click()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current && fileRef.current.click(); } }}
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
                    onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) acceptShot(f); }}
                    className={'flex flex-col items-center gap-1.5 text-center cursor-pointer px-4 py-5 mt-1 border border-dashed transition-colors ' +
                      (drag ? 'border-acc bg-acc/5' : 'border-line2 bg-bg2 hover:border-acc hover:bg-acc/5')}>
                    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] stroke-acc fill-none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    <p className="text-[.84rem] text-muted"><b className="text-acc">{t('Upload screenshot')}</b> — {t('tap or drop the payment confirmation here')}</p>
                    <span className="text-[.7rem] text-dim tracking-[.08em] uppercase">JPG / PNG / WEBP · max 5 MB</span>
                  </div>
                  <div id="payPreview" hidden={!shot} className="flex items-center gap-3 border border-line2 bg-panel2 px-3.5 py-2.5 mt-3">
                    <img id="shotThumb" src={shot ? shot.url : undefined} alt="Payment screenshot preview" className="flex-none w-[54px] h-[54px] object-cover border border-line2" />
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <p id="shotName" className="text-[.8rem] text-txt truncate">{shot ? shot.name : ''}</p>
                      <span id="shotSize" className="text-[.7rem] text-dim">{shot ? shot.size : ''}</span>
                      <span className="text-[.7rem] text-ok">Attached — reviewed together with your TrxID</span>
                    </div>
                    <button id="shotRemove" type="button" onClick={removeShot} aria-label="Remove screenshot"
                      className="ml-auto flex-none bg-transparent border border-line2 text-silver w-[30px] h-[30px] text-lg leading-none transition-colors hover:border-red hover:text-red">×</button>
                  </div>
                </div>
              </div>

              {/* COD panel */}
              <div id="payPanelCod" hidden={mob} className="border border-line bg-bg2 px-4 py-4 sm:px-5 sm:py-5 mt-4">
                <div className="flex gap-3 items-start">
                  <svg viewBox="0 0 24 24" className="flex-none w-[34px] h-[34px] stroke-acc fill-none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7z" /><circle cx="6" cy="19" r="1.6" /><circle cx="17" cy="19" r="1.6" />
                  </svg>
                  <div>
                    <p className="text-[.88rem] text-muted mb-2"><b className="text-txt">{t('Cash on Delivery.')} </b>{t('Pay the courier in cash when the gear reaches your door.')}</p>
                    <p className="text-[.88rem] text-muted mb-2">Please keep <b id="codAmt" className="text-txt">{money(V.total)}</b> ready — exact change helps the hand-off go fast. Standard delivery takes 2–4 working days.</p>
                    <p className="text-[.78rem] text-dim border-l-2 border-acc pl-2.5">A confirmation call is made before dispatch. No answer, no dispatch.</p>
                  </div>
                </div>
              </div>
            </div>
            </>)}
          </div>

          {/* ==================== RIGHT: order summary ==================== */}
          <aside className="border border-line2 bg-panel p-4 sm:p-6 lg:sticky lg:top-[100px]">
            <h3 className="font-disp font-normal text-xl uppercase mb-5">{t('Order Summary')}</h3>
            <div id="coItems" className="grid gap-3 max-h-[280px] overflow-y-auto mb-4 pr-1">
              {items.length ? items.map((it) => (
                <div key={it.key} className="flex gap-3 items-center">
                  <img src={it.img} alt="" className="w-[52px] h-[52px] object-cover border border-line" />
                  <div className="min-w-0">
                    <p className="font-head font-bold text-[.78rem] tracking-[.05em] uppercase text-txt truncate">{it.name}</p>
                    <p className="text-[.72rem] text-dim truncate">{it.size} · {it.color} · ×{it.qty}</p>
                  </div>
                  <span className="ml-auto font-disp text-acc">{money(it.price * it.qty)}</span>
                </div>
              )) : <p className="text-dim text-[.85rem]">{t('Cart is empty — scroll up and load the bar.')}</p>}
            </div>
            <div className={line}><span>{t('Subtotal')}</span><b id="coSubtotal" className="text-txt">{money(V.sum)}</b></div>
            <div className={line}><span>{t('Shipping')}</span><b id="coShipping" className="text-txt">{V.sum === 0 ? '—' : (V.shipCost === 0 ? t('FREE') : money(V.shipCost))}</b></div>
            <div className={line}><span>{t('Discount')}</span><b id="coDiscount" className="text-txt">{V.disc ? '−' + money(V.disc) : '—'}</b></div>
            {rd ? (
              <div className={line} id="coPointsLine"><span>{t('Points')} ({rd.points})</span><b className="text-okgreen">−{money(rd.discount)}</b></div>
            ) : null}
            {srv && srv.freeShippingRemaining > 0 && V.sum > 0 ? (
              <p className="mt-2 border-l-2 border-acc pl-2.5 text-[.74rem] text-dim">
                Add <b className="text-acc">{money(srv.freeShippingRemaining)}</b> {t('more to unlock')} <b className="text-txt">{t('FREE')}</b> {t('shipping.')}
              </p>
            ) : null}
            <div className="flex gap-2.5 mt-3.5">
              <input id="promoInput" type="text" placeholder="PROMO CODE" value={promoText} onChange={(e) => setPromoText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                className="flex-1 min-w-0 bg-bg2 border border-line2 px-3 py-2.5 outline-none font-cond tracking-[.2em] uppercase text-[.85rem] text-txt placeholder:text-dim/60 focus:border-acc transition-colors" />
              <button id="promoBtn" type="button" onClick={() => applyPromo()}
                className="font-head font-extrabold text-[.74rem] tracking-[.16em] uppercase px-5 border border-line2 text-txt transition-colors hover:border-acc hover:text-acc">Apply</button>
            </div>
            {publicCoupons.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5" id="promoChips">
                {publicCoupons.map((c) => (
                  <button key={c.code} type="button" data-chip={c.code}
                    onClick={() => { setPromoText(c.code); applyPromo(c.code); }}
                    className="border border-line2 px-2.5 py-1 font-cond text-[.68rem] uppercase tracking-[.12em] text-dim transition-colors hover:border-acc hover:text-acc">
                    {c.code} · {c.type === 'percent' ? c.value + '% off' : money(c.value) + ' off'}{c.minOrder ? ' · min ' + money(c.minOrder) : ''}
                  </button>
                ))}
              </div>
            ) : null}
            {/* Task 56-a — loyalty points redemption */}
            {authed && loyal ? (
              ptsUsable ? (
                <div id="redeemBox" className="mt-3 border border-line bg-bg2 p-3" data-testid="redeemBox">
                  <div className="flex items-center justify-between">
                    <span className="font-cond font-semibold text-[.7rem] uppercase tracking-[.22em] text-silver">{t('Redeem Points')}</span>
                    <span className="text-[.72rem] text-dim"><b className="text-acc">{loyal.points}</b> {t('available')} · 1 pt = {money(loyal.rules.pointValue)}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input id="redeemInput" type="number" min="0" max={loyal.points} step="1" value={ptsInput}
                      onChange={(e) => setPtsInput(e.target.value)}
                      placeholder={t('How many points?')}
                      className="min-w-0 flex-1 border border-line2 bg-panel px-3 py-2 font-cond text-[.82rem] tracking-[.1em] text-txt outline-none placeholder:text-dim/60 focus:border-acc" />
                    {pts > 0 ? (
                      <button id="redeemClear" type="button" onClick={() => setPtsInput('')}
                        className="border border-line2 px-4 font-cond text-[.7rem] font-bold uppercase tracking-[.16em] text-dim transition-colors hover:border-acc hover:text-acc">{t('Clear')}</button>
                    ) : (
                      <button id="redeemMax" type="button" onClick={() => setPtsInput(String(loyal.points))}
                        className="border border-line2 px-4 font-cond text-[.7rem] font-bold uppercase tracking-[.16em] text-dim transition-colors hover:border-acc hover:text-acc">{t('Use all')}</button>
                    )}
                  </div>
                  {rd ? (
                    <p className="mt-2 text-[.72rem] text-okgreen">
                      ✓ {rd.points} {t('points applied')} — {money(rd.discount)} {t('off')}. {t('Left after:')} <b>{rd.pointsAfter}</b> {t('points')}.
                    </p>
                  ) : pts > 0 ? (
                    <p className="mt-2 text-[.72rem] text-amber">
                      {loyal.points < loyal.rules.minRedeem
                        ? t('Minimum {n} points needed to redeem.', { n: loyal.rules.minRedeem })
                        : t('Up to {p}% of the subtotal can be paid with points.', { p: loyal.rules.maxRedeemPct })}
                    </p>
                  ) : (
                    <p className="mt-2 text-[.72rem] text-dim">{t('Points come back automatically if the order is cancelled.')}</p>
                  )}
                </div>
              ) : (
                <p id="redeemHint" className="mt-2.5 text-[.72rem] text-dim">
                  ★ <b className="text-acc">{loyal.points}</b> {t('points on this account')}
                  {loyal.points < loyal.rules.minRedeem ? <> — {t('collect {n} to start redeeming.', { n: loyal.rules.minRedeem })}</> : loyal.rules.enabled ? '' : <> — {t('redemption is paused right now.')}</>}
                </p>
              )
            ) : null}
            <div className="flex justify-between items-baseline gap-3 pt-3.5 mt-1.5 border-t border-line2">
              <span className="font-cond font-semibold tracking-[.26em] uppercase text-silver">{t('Total')}</span>
              <b id="coTotal" className="font-disp text-3xl text-acc">{money(V.total)}</b>
            </div>
            {srv && srv.couponMessage ? <p className="mt-1.5 text-[.74rem] text-amber">{srv.couponMessage}</p> : null}
            {promo && promoMeta && (promoMeta.usageLeft != null || promoMeta.minRemaining > 0 || promoMeta.scoped) ? (
              <p className="mt-1 text-[.72rem] text-dim" id="promoMeta">
                {promoMeta.minRemaining > 0 ? <span>Add <b className="text-acc">{money(promoMeta.minRemaining)}</b> more to unlock {promo.code}. </span> : null}
                {promoMeta.usageLeft != null ? <span>{promoMeta.usageLeft} uses left. </span> : null}
                {promoMeta.scoped ? <span>Discount applies to eligible items only.</span> : null}
              </p>
            ) : null}
            {needLogin ? (
              <button type="button" onClick={() => go('account')}
                className="mt-5 w-full border border-acc text-acc hover:bg-acc hover:text-black font-head font-extrabold uppercase tracking-[.2em] py-3.5 px-4 transition-colors">
                {t('Log In / Create Account')}
              </button>
            ) : (
              <button id="placeOrder" type="button" onClick={placeOrder} disabled={busy}
                className={'mt-5 w-full bg-acc text-black hover:bg-acc2 font-head font-extrabold uppercase tracking-[.2em] py-3.5 px-4 transition-colors disabled:opacity-60 disabled:cursor-wait ' + (busy ? '' : 'animate-pulse')}>
                {busy ? t('Locking Order…') : (payMethod === 'sslcommerz' ? t('Place Order — Pay Online') : mob ? t('Place Order — Send Proof') : t('Place Order — Pay Cash'))}
              </button>
            )}
            <div className="grid grid-cols-3 gap-2.5 mt-5">
              <div className="border border-line bg-bg2 py-3.5 px-2 text-center">
                <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] stroke-acc fill-none mx-auto mb-1.5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="block font-cond font-semibold text-[.72rem] tracking-[.18em] text-silver uppercase">{t('Manual payment · verified by team')}</span>
              </div>
              <div className="border border-line bg-bg2 py-3.5 px-2 text-center">
                <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] stroke-acc fill-none mx-auto mb-1.5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
                </svg>
                <span className="block font-cond font-semibold text-[.72rem] tracking-[.18em] text-silver uppercase">{t('30-day returns')}</span>
              </div>
              <div className="border border-line bg-bg2 py-3.5 px-2 text-center">
                <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] stroke-acc fill-none mx-auto mb-1.5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7z" /><circle cx="6" cy="19" r="1.6" /><circle cx="17" cy="19" r="1.6" />
                </svg>
                <span className="block font-cond font-semibold text-[.72rem] tracking-[.18em] text-silver uppercase">{t('24h dispatch')}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
