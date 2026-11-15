/* ArixGear page — account: JWT login/register, order history, public order tracking.
   React port of legacy js/pages/account.js (behavior + copy preserved). */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { login, register, verifyEmail, resendVerification, forgotPassword, loyalty as loyaltyApi } from '../services/auth.js';
import { myOrders, trackOrder, cancelOrder, requestReturn, downloadInvoice } from '../services/orders.js';
import { listMine, markMineRead, sendMessage } from '../services/messages.js';
import { adaptOrder, money, STATUS_LABELS, DIV_LABELS } from '../lib/format.js';
import { getOrders } from '../lib/storage.js';
import { useStore } from '../store/store.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang, tr } from '../lib/i18n.jsx';
import { fbTrack } from '../lib/pixel.js';

/* ---------- shared primitives ---------- */
const Eyebrow = ({ children }) => (
  <p className="font-cond font-semibold uppercase tracking-[.45em] text-acc text-[.82rem] flex items-center gap-3">
    <i className="not-italic inline-block h-0.5 w-9 bg-acc" />{children}
  </p>
);

const labelCls = 'mb-1.5 block font-cond font-semibold text-[.78rem] uppercase tracking-[.26em] text-silver2';
const inputCls = 'w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc';
const btnPrimary = 'inline-flex items-center justify-center gap-2.5 bg-acc px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-black transition-all duration-300 clip-notch hover:bg-acc2 hover:-translate-y-0.5';
const btnGhost = 'inline-flex items-center justify-center gap-2.5 border border-line2 bg-white/[.03] px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-txt transition-all duration-300 clip-notch hover:border-silver hover:bg-white/[.07] hover:-translate-y-0.5';
const cardCls = 'border border-line bg-panel p-6 sm:p-7';

/* Task 28 — order action buttons inside the tracking result */
const trkMiniBtn = 'bg-transparent border border-line2 text-txt font-cond font-semibold uppercase tracking-[.16em] text-[.72rem] px-4 py-2.5 transition-colors hover:border-acc hover:text-acc';
const trkMiniBtnRed = 'bg-transparent border border-red/40 text-red font-cond font-semibold uppercase tracking-[.16em] text-[.72rem] px-4 py-2.5 transition-colors hover:bg-red/10';

/* RMA reasons (mirror backend ReturnRequest.RETURN_REASONS) */
const RETURN_REASONS = [
  ['damaged', 'Damaged / defective'],
  ['wrong-item', 'Wrong item delivered'],
  ['size-issue', 'Size does not fit'],
  ['not-as-described', 'Not as described'],
  ['late', 'Delivered too late'],
  ['other', 'Other'],
];

/* delivered → green · verifying → amber · rejected/cancelled → red (legacy tones) */
const stTone = (s) => {
  if (s === 'verifying') return 'text-amber border-amber/40';
  if (s === 'payment-rejected' || s === 'cancelled') return 'text-red border-red/40';
  return 'text-ok border-ok/40';
};

/* one order card — used by history + tracking result */
function OrdCard({ o }) {
  const { BY_ID } = useCatalog();
  const date = new Date(o.date || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const st = o.statusLabel || STATUS_LABELS[o.status] || '—';
  return (
    <div className="mb-3.5 border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
        <span className="font-disp text-[1.05rem] tracking-[.03em] text-acc">{o.no}</span>
        <span className="font-cond text-[.78rem] uppercase tracking-[.18em] text-dim">{date}</span>
        <span className={`ml-auto border px-2.5 py-1 font-cond font-bold text-[.72rem] uppercase tracking-[.22em] ${stTone(o.status)}`}>{st}</span>
      </div>
      <div className="flex items-center gap-4 overflow-x-auto px-4 py-4 sm:px-5">
        {o.items.map((it, i) => {
          const p = BY_ID[it.id];
          const img = (p && p.img) || it.image || '';
          return img ? <img key={i} src={img} alt={it.name} title={it.name} className="h-[52px] w-[52px] flex-none border border-line2 object-cover" /> : null;
        })}
        <span className="text-[.78rem] text-dim">{o.items.map((it) => `${it.name} ×${it.qty}`).join(' · ')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[.85rem] text-muted sm:px-5">
        <span>{DIV_LABELS[o.division] || o.division || 'Delivery'} · {o.payLabel || ''}</span>
        <b className="ml-auto font-disp text-[1.05rem] text-txt">{money(o.total)}</b>
      </div>
    </div>
  );
}

const EmptyBlock = ({ title, sub }) => (
  <div className="border border-dashed border-line2 px-6 py-16 text-center text-muted">
    <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{title}</h3>
    <p>{sub}</p>
    <Link to="/shop" className={`${btnPrimary} mt-6`}>{tr('Shop the Arsenal')}</Link>
  </div>
);

/* ---------- page ---------- */
import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  useSEO('account');
  const { session, setSession, logout, wish } = useStore();
  const { toast } = useUI();
  const { t } = useLang();

  /* tabs — login | reg | forgot */
  const [tab, setTab] = useState('login');

  /* login form */
  const [lgEmail, setLgEmail] = useState('');
  const [lgPass, setLgPass] = useState('');
  const [lgBusy, setLgBusy] = useState(false);

  /* forgot password */
  const [fpEmail, setFpEmail] = useState('');
  const [fpBusy, setFpBusy] = useState(false);
  const [fpSent, setFpSent] = useState(null); /* API response after submit */

  /* register form */
  const [rgName, setRgName] = useState('');
  const [rgEmail, setRgEmail] = useState('');
  const [rgPhone, setRgPhone] = useState('');
  const [rgPass, setRgPass] = useState('');
  const [rgBusy, setRgBusy] = useState(false);

  /* Task 51 — email OTP verification (6-digit code → activate account) */
  const [vtEmail, setVtEmail] = useState('');
  const [vtCode, setVtCode] = useState('');
  const [vtBusy, setVtBusy] = useState(false);
  const [vtErr, setVtErr] = useState('');
  const [vtDev, setVtDev] = useState(null); /* devOtp — only when API mail is dry-run */
  const [rsLeft, setRsLeft] = useState(0);  /* resend cooldown seconds */
  /* Task 60-b — segmented 6-box code input (auto-advance · backspace · paste) */
  const boxRefs = useRef([]);
  useEffect(() => {
    if (tab === 'verify') {
      const first = boxRefs.current.find((b) => b && !b.value) || boxRefs.current[0];
      if (first) first.focus();
    }
  }, [tab]);
  const setBox = (i, raw, boxes) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits && raw !== '') return;
    const next = (boxes || vtCode.split('')).slice();
    if (digits.length > 1) {
      /* paste (or autofill) — spread across boxes from this slot */
      for (let k = 0; k < 6; k++) next[k] = digits[k] || '';
      setVtCode(next.join(''));
      const last = Math.min(5, digits.length - 1);
      if (boxRefs.current[last]) boxRefs.current[last].focus();
      return;
    }
    next[i] = digits;
    setVtCode(next.join(''));
    if (digits && i < 5 && boxRefs.current[i + 1]) boxRefs.current[i + 1].focus();
  };
  const boxKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !vtCode.split('')[i] && i > 0 && boxRefs.current[i - 1]) {
      boxRefs.current[i - 1].focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) boxRefs.current[i - 1].focus();
    if (e.key === 'ArrowRight' && i < 5) boxRefs.current[i + 1].focus();
  };
  useEffect(() => {
    if (!rsLeft) return undefined;
    const id = setInterval(() => setRsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [rsLeft]);

  /* order history */
  const [orders, setOrders] = useState([]);
  const [ordState, setOrdState] = useState('loading'); /* loading | ok | err */
  const [ordMsg, setOrdMsg] = useState('');

  /* public tracking */
  const [trkNo, setTrkNo] = useState('');
  const [trkPhone, setTrkPhone] = useState('');
  const [trk, setTrk] = useState(null); /* {loading,no} | {error} | {order} */

  /* Task 28 — order actions: invoice download, customer cancel, RMA request */
  const [ret, setRet] = useState(null); /* { no, reason, note, qtys:{slug:qty} } */
  const [retBusy, setRetBusy] = useState(false);

  /* Task 37 — Messages From ArixGear (admin-composed) + reply box */
  const [msgs, setMsgs] = useState([]);
  const [msgUnread, setMsgUnread] = useState(0);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const loadMsgs = () => {
    if (!session?.token) return;
    listMine().then((d) => { setMsgs(d.items || []); setMsgUnread(d.unread || 0); }).catch(() => {});
  };
  useEffect(() => { loadMsgs(); }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  const openInbox = () => { setInboxOpen(true); if (msgUnread) { markMineRead().catch(() => {}); setMsgUnread(0); } };
  const [inboxOpen, setInboxOpen] = useState(false);
  const sendReply = async () => {
    if (reply.trim().length < 2) return;
    setReplyBusy(true);
    try {
      await sendMessage({ name: session?.user?.name || 'Customer', email: session?.user?.email || '', topic: 'chat', message: reply.trim() });
      toast(t('Sent ✓'), t('Support will reply shortly.'));
      setReply('');
      loadMsgs();
    } catch (e) { toast(t('Failed'), e.message || String(e)); } finally { setReplyBusy(false); }
  };

  const doInvoice = async (no) => {
    try {
      await downloadInvoice(no, { phone: trkPhone });
      toast(t('Invoice downloading'), 'ARG-' + no + '.pdf saved to your device.');
    } catch (err) {
      toast(t('Invoice failed'), err.message || t('Try again in a moment.'));
    }
  };

  const doCancel = async (no) => {
    if (!window.confirm(t('Cancel this order? Reserved stock is released and this cannot be undone.'))) return;
    try {
      const d = await cancelOrder(no, trkPhone);
      toast(t('Order cancelled'), d.message || t('Reserved stock released.'));
      setTrk({ order: adaptOrder(d.order) });
    } catch (err) {
      toast(t('Could not cancel'), err.message || t('Try again.'));
    }
  };

  const openReturn = (order) => setRet({
    no: order.no,
    reason: 'damaged',
    note: '',
    qtys: Object.fromEntries((order.items || []).map((i) => [i.id, i.qty])),
  });

  const submitReturn = async () => {
    setRetBusy(true);
    try {
      const items = Object.entries(ret.qtys).filter(([, q]) => +q > 0).map(([slug, q]) => ({ slug, qty: +q }));
      const d = await requestReturn(ret.no, { phone: trkPhone, reason: ret.reason, note: ret.note, items });
      toast(t('Return requested'), d.message || t('We will call you to arrange pickup.'));
      setRet(null);
    } catch (err) {
      toast(t('Return failed'), err.message || t('Try again.'));
    }
    setRetBusy(false);
  };

  const user = (session && session.user) || {};

  /* ---------- Task 56-a — loyalty pack (balance + rules + history) ---------- */
  const [loyal, setLoyal] = useState(null);
  const [refCopied, setRefCopied] = useState(false);
  useEffect(() => {
    if (!session?.token) { setLoyal(null); return undefined; }
    let dead = false;
    loyaltyApi().then((d) => { if (!dead) setLoyal(d); }).catch(() => { if (!dead) setLoyal(null); });
    return () => { dead = true; };
  }, [session?.token]);
  const copyRef = async () => {
    if (!loyal?.referralCode) return;
    try { await navigator.clipboard.writeText(loyal.referralCode); setRefCopied(true); setTimeout(() => setRefCopied(false), 1600); } catch (_e) { /* clipboard blocked */ }
  };

  const loadOrders = async () => {
    setOrdState('loading');
    try {
      const d = await myOrders();
      const apiOrders = (d.items || []).map(adaptOrder);
      /* merge device-local orders (guest checkouts) that the API list misses */
      const local = getOrders().filter((l) => l && l.no && !apiOrders.some((a) => a.no === l.no));
      setOrders([...apiOrders, ...local]);
      setOrdState('ok');
    } catch (e) {
      if (e.status === 401) { setSession(null); return; }
      setOrders(getOrders().filter(Boolean));
      setOrdState('err');
      setOrdMsg(e.message || 'Something went wrong.');
    }
  };

  useEffect(() => { if (session) loadOrders(); /* eslint-disable-next-line */ }, [session]);

  /* ---------- handlers ---------- */
  const doLogin = async (e) => {
    e.preventDefault();
    setLgBusy(true);
    try {
      const d = await login(lgEmail.trim(), lgPass);
      setSession({ token: d.token, user: d.user });
      toast(t('Welcome back, {name}', { name: (d.user && d.user.name) || 'lifter' }), t('The rack missed you.'));
    } catch (err) {
      /* Task 51 — unverified account: route to the OTP screen instead of a dead end */
      if (err.status === 403 && err.data && err.data.needsVerification) {
        setVtEmail(err.data.email || lgEmail.trim().toLowerCase());
        setVtCode(''); setVtErr('');
        /* Task 58 — the server auto-sends a fresh code here (devOtp when mail is
           dry-run); retryAfter keeps the 60s cooldown honest across both paths */
        setVtDev(err.data.devOtp || null);
        setRsLeft(err.data.retryAfter || 60);
        setTab('verify');
        toast(t('Verify your email first'), t('We sent you a 6-digit code — enter it below.'));
        return;
      }
      toast(err.offline ? 'API offline' : 'Access denied', err.message || 'Email or password did not survive the check.');
    } finally { setLgBusy(false); }
  };

  const doRegister = async (e) => {
    e.preventDefault();
    const nm = rgName.trim(), em = rgEmail.trim().toLowerCase(), ph = rgPhone.trim(), pw = rgPass;
    if (!nm || !/^\S+@\S+\.\S+$/.test(em) || pw.length < 6) {
      toast(t('Check the form'), t('Name, valid email and a 6+ character password.'));
      return;
    }
    setRgBusy(true);
    try {
      /* Task 51 — account is created UNVERIFIED; the emailed OTP activates it */
      const d = await register(nm, em, pw, ph || undefined);
      setVtEmail(em); setVtCode(''); setVtErr('');
      setVtDev(d.devOtp || null);
      setRsLeft(d.retryAfter || 60);
      setTab('verify');
      toast(t('Account created'), t('We emailed you a 6-digit code — enter it to activate your account.'));
    } catch (err) {
      toast(err.offline ? 'API offline' : 'Could not create account', err.message || 'Try again.');
    } finally { setRgBusy(false); }
  };

  const doVerify = async (e) => {
    e.preventDefault();
    const code = vtCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast(t('Enter the 6-digit code'), t('Check your inbox — the code is valid for 10 minutes.'));
      return;
    }
    setVtBusy(true); setVtErr('');
    try {
      const d = await verifyEmail(vtEmail, code);
      setSession({ token: d.token, user: d.user });
      setRsLeft(0); setVtDev(null); setVtCode('');
      toast(t('Email verified'), t('Welcome to the Forge, {name}.', { name: (d.user && d.user.name) || 'lifter' }));
      /* Task 58 — guest orders claimed during verification surface immediately */
      if (d.linkedOrders > 0) {
        setTimeout(() => toast(t('Guest orders recovered'), t('{n} order(s) you placed as a guest are now in your account.', { n: d.linkedOrders })), 600);
      }
      /* Meta Pixel: CompleteRegistration — account activated */
      fbTrack('CompleteRegistration', { content_name: 'account', status: true, currency: 'BDT' });
    } catch (err) {
      /* Task 60-b — surface the server's attemptsLeft so customers know where they stand */
      const al = err.data && err.data.attemptsLeft != null ? err.data.attemptsLeft : null;
      setVtErr(err.message ? err.message + (al != null ? ' — ' + tr('{n} attempt(s) left', { n: al }) : '') : 'Verification failed.');
    } finally { setVtBusy(false); }
  };

  const doResend = async () => {
    if (rsLeft > 0 || vtBusy) return;
    setVtBusy(true); setVtErr('');
    try {
      const d = await resendVerification(vtEmail);
      setRsLeft(d.retryAfter || 60);
      if (d.devOtp) setVtDev(d.devOtp);
      toast(t('Code sent'), d.message || t('Check your inbox — the new code replaces the old one.'));
    } catch (err) {
      setVtErr(err.message || 'Could not resend.');
    } finally { setVtBusy(false); }
  };

  const doLogout = () => {
    logout();
    /* Task 51 — a fresh logged-out view must open on Log In, never on the OTP screen */
    setTab('login'); setVtCode(''); setVtErr(''); setVtDev(null); setRsLeft(0);
    toast(t('Logged out'), t('The bar will be here when you are back.'));
  };

  const doForgot = async (e) => {
    e.preventDefault();
    const em = fpEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      toast(t('Check the email'), t('Enter the email address on your account.'));
      return;
    }
    setFpBusy(true);
    try {
      const d = await forgotPassword(em);
      setFpSent({ ...d, email: em });
    } catch (err) {
      toast(err.offline ? 'API offline' : 'Could not send reset link', err.message || 'Try again in a minute.');
    } finally { setFpBusy(false); }
  };

  const doTrack = async (e) => {
    e.preventDefault();
    const no = trkNo.trim().toUpperCase(), ph = trkPhone.trim();
    if (!no || ph.replace(/\D/g, '').length < 6) {
      toast(t('Both fields needed'), t('Order number + the phone used at checkout (last 6 digits are enough).'));
      return;
    }
    setTrk({ loading: true, no });
    try {
      const d = await trackOrder(no, { phone: ph });
      setTrk({ order: adaptOrder(d.order) });
    } catch (err) {
      setTrk({ error: err.message || 'Could not track this order.' });
    }
  };

  const tabCls = (on) =>
    'px-5 py-2.5 font-cond font-semibold uppercase tracking-[.2em] text-[.85rem] border transition-colors ' +
    (on ? 'border-acc bg-acc text-black' : 'border-line bg-transparent text-muted hover:text-txt hover:border-line2');

  return (
    <>

      <section id="page-account" className="py-16 md:py-24">
        <div className="container mx-auto w-[92%]">
          <div className="mx-auto max-w-[940px]">
            <div className="mb-10">
              <Eyebrow>{t('Your Forge')}</Eyebrow>
              <h2 className="mt-4 font-disp uppercase leading-[.96] text-4xl md:text-6xl">{t('MY')} <span className="text-outline">{t('ACCOUNT')}</span></h2>
            </div>

            {/* ---------- PUBLIC ORDER TRACKING ---------- */}
            <div className={`${cardCls} mb-8 max-w-[640px]`}>
              <h3 className="mb-6 font-disp text-[1.25rem] uppercase">{t('Track Your')} <span className="text-acc">{t('Order')}</span></h3>
              <form id="trkForm" noValidate onSubmit={doTrack}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="trkNo" className={labelCls}>{t('Order number')}</label>
                    <input id="trkNo" type="text" placeholder="ARG-XXXXXX" autoComplete="off" className={inputCls}
                      value={trkNo} onChange={(e) => setTrkNo(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="trkPhone" className={labelCls}>{t('Phone used at checkout')}</label>
                    <input id="trkPhone" type="tel" placeholder="01712-345678 — last 6 digits OK" className={inputCls}
                      value={trkPhone} onChange={(e) => setTrkPhone(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className={`${btnGhost} mt-5`}>{t('Track Order')}</button>
              </form>
              <div id="trkResult" className="mt-5">
                {trk && trk.loading && <p className="text-[.85rem] text-dim">{t('Tracking')} {trk.no}…</p>}
                {trk && trk.error && <p className="text-[.88rem] text-red">{trk.error}</p>}
                {trk && trk.order && (() => {
                  const o = trk.order;
                  const hist = (o.raw && o.raw.statusHistory) || [];
                  return (
                    <div className="border border-line bg-panel">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
                        <span className="font-disp text-[1.05rem] tracking-[.03em] text-acc">{o.no}</span>
                        <span className={`ml-auto border px-2.5 py-1 font-cond font-bold text-[.72rem] uppercase tracking-[.22em] ${stTone(o.status)}`}>{o.statusLabel}</span>
                      </div>
                      <div className="my-3.5 grid gap-2.5">
                        {hist.map((h, i) => (
                          <div key={i} className="border-l-2 border-acc py-1.5 pl-3.5">
                            <b className="block font-cond text-[.85rem] uppercase tracking-[.14em]">{STATUS_LABELS[h.status] || h.status}</b>
                            <span className="mt-0.5 block text-[.8rem] text-silver2">{h.note || ''}</span>
                            <i className="not-italic text-[.72rem] text-dim">
                              {new Date(h.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {h.by || 'system'}
                            </i>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[.85rem] text-muted sm:px-5">
                        <span>{o.items.reduce((a, b) => a + (+b.qty || 0), 0)} item(s) · {o.payLabel}{o.txnId ? ' · TrxID ' + o.txnId : ''}</span>
                        <b className="ml-auto font-disp text-[1.05rem] text-txt">{money(o.total)}</b>
                      </div>

                      {/* Task 28 — invoice / cancel / return actions */}
                      <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-4 py-3.5 sm:px-5">
                        <button type="button" onClick={() => doInvoice(o.no)} className={`${trkMiniBtn} w-full max-w-full whitespace-normal text-center sm:w-auto`}>⬇ Invoice PDF</button>
                        {o.status === 'delivered' ? (
                          <button type="button" onClick={() => openReturn(o)} className={trkMiniBtn}>↩ Request Return</button>
                        ) : null}
                        {o.raw && o.raw.canCancel && ['verifying', 'processing', 'packed'].includes(o.status) ? (
                          <button type="button" onClick={() => doCancel(o.no)} className={trkMiniBtnRed}>✕ Cancel Order</button>
                        ) : null}
                      </div>

                      {ret && ret.no === o.no ? (
                        <div className="border-t border-line bg-bg2 px-4 py-4 sm:px-5">
                          <p className="mb-3 font-cond font-semibold text-[.78rem] uppercase tracking-[.2em] text-acc">Return request — {ret.no}</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className={labelCls} htmlFor="retReason">{t('Reason')}</label>
                              <select id="retReason" value={ret.reason} onChange={(e) => setRet((r) => ({ ...r, reason: e.target.value }))} className={inputCls}>
                                {RETURN_REASONS.map(([k, lbl]) => <option key={k} value={k} className="bg-bg2">{lbl}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls} htmlFor="retNote">{t('Note for our team')}</label>
                              <input id="retNote" type="text" placeholder="What happened?" value={ret.note}
                                onChange={(e) => setRet((r) => ({ ...r, note: e.target.value }))} className={inputCls} />
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {o.items.map((it) => (
                              <div key={it.id + (it.size || '') + (it.color || '')} className="flex items-center gap-3 border border-line2 bg-panel px-3 py-2">
                                <span className="min-w-0 flex-1 truncate text-[.82rem] text-txt">{it.name}{it.size ? ' · ' + it.size : ''}{it.color ? ' · ' + it.color : ''}</span>
                                <span className="text-[.74rem] text-dim">{t('max')} {it.qty}</span>
                                <input type="number" min={0} max={it.qty} value={ret.qtys[it.id] ?? it.qty}
                                  onChange={(e) => setRet((r) => ({ ...r, qtys: { ...r.qtys, [it.id]: Math.max(0, Math.min(it.qty, +e.target.value || 0)) } }))}
                                  className="w-[64px] border border-line2 bg-bg2 px-2 py-1.5 text-center text-[.85rem] text-txt outline-none focus:border-acc" />
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2.5">
                            <button type="button" disabled={retBusy} onClick={submitReturn}
                              className={btnPrimary + ' !px-6 !py-3 ' + (retBusy ? 'pointer-events-none opacity-60' : '')}>
                              {retBusy ? t('Submitting…') : t('Submit Return Request')}
                            </button>
                            <button type="button" onClick={() => setRet(null)} className={trkMiniBtn}>{t('Cancel')}</button>
                          </div>
                          <p className="mt-3 text-[.74rem] leading-relaxed text-dim">
                            Return window: 7 days after delivery · one open request per order. Once approved, the refund lands on your {o.payLabel} number.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ---------- AUTH (logged out) ---------- */}
            {!session && (
              <div id="acctAuth">
                <div className="mb-6 flex flex-wrap gap-2">
                  <button id="tabLogin" className={tabCls(tab === 'login')} onClick={() => setTab('login')}>{t('Log In')}</button>
                  <button id="tabReg" className={tabCls(tab === 'reg')} onClick={() => setTab('reg')}>{t('Create Account')}</button>
                </div>

                <div id="lgCard" className={`${cardCls} max-w-[460px]`} hidden={tab !== 'login'}>
                  <h3 className="mb-6 font-disp text-[1.25rem] uppercase">{t('Back Under')} <span className="text-acc">{t('the Bar')}</span></h3>
                  <form id="lgForm" noValidate onSubmit={doLogin}>
                    <div className="mb-4">
                      <label htmlFor="lgEmail" className={labelCls}>{t('Email or phone')}</label>
                      <input id="lgEmail" type="text" placeholder="you@iron.house · 01712-345678" autoComplete="username" className={inputCls}
                        value={lgEmail} onChange={(e) => setLgEmail(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="lgPass" className={labelCls}>{t('Password')}</label>
                      <input id="lgPass" type="password" placeholder="••••••••" autoComplete="current-password" className={inputCls}
                        value={lgPass} onChange={(e) => setLgPass(e.target.value)} />
                    </div>
                    <button type="submit" disabled={lgBusy} className={`${btnPrimary} mt-6 w-full ${lgBusy ? 'pointer-events-none opacity-60' : ''}`}>{t('Log In')}</button>
                  </form>
                  <button id="forgotLink" onClick={() => { setTab('forgot'); setFpSent(null); }} className="mt-3 font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
                    {t('Forgot password?')}
                  </button>
                  <p className="mt-4 text-[.78rem] leading-relaxed text-dim">
                    Demo account — try <b className="text-silver">demo@arixgear.tech</b> / <b className="text-silver">forge2026</b> — or log in with your phone number.
                  </p>
                </div>

                {/* Task 51 — email OTP verification */}
                <div id="vtCard" className={`${cardCls} max-w-[460px]`} hidden={tab !== 'verify'}>
                  <h3 className="mb-2 font-disp text-[1.25rem] uppercase">{t('Verify Your')} <span className="text-acc">{t('Email')}</span></h3>
                  <p className="mb-6 text-[.85rem] leading-relaxed text-dim">
                    {t('We emailed a 6-digit code to')} <b className="text-silver">{vtEmail}</b>. {t('It is valid for 10 minutes and works exactly once.')}
                  </p>
                  {vtErr && <p id="vtErr" className="mb-4 border-l-2 border-red bg-red/10 px-3 py-2 text-[.82rem] text-red">{vtErr}</p>}
                  <form id="vtForm" noValidate onSubmit={doVerify}>
                    <div className="mb-1">
                      <label htmlFor="vtCode" className={labelCls}>{t('Verification code')}</label>
                      {/* Task 60-b — six segmented boxes: auto-advance, backspace, paste, one-time-code autofill */}
                      <div className="flex gap-2" id="vtBoxes" data-testid="vtBoxes">
                        {Array.from({ length: 6 }, (_, i) => (
                          <input
                            key={i}
                            ref={(el) => { boxRefs.current[i] = el; }}
                            id={i === 0 ? 'vtCode' : 'vtCode' + (i + 1)}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            aria-label={'Digit ' + (i + 1)}
                            autoComplete={i === 0 ? 'one-time-code' : 'off'}
                            className="h-14 w-full min-w-0 border border-line2 bg-bg2 text-center font-disp text-2xl text-txt outline-none transition-colors placeholder:text-dim focus:border-acc"
                            placeholder="•"
                            value={vtCode.split('')[i] || ''}
                            onChange={(e) => setBox(i, e.target.value)}
                            onKeyDown={(e) => boxKeyDown(i, e)}
                            onPaste={(e) => { e.preventDefault(); setBox(0, e.clipboardData.getData('text')); }}
                          />
                        ))}
                      </div>
                    </div>
                    <button type="submit" disabled={vtBusy} className={`${btnPrimary} mt-5 w-full ${vtBusy ? 'pointer-events-none opacity-60' : ''}`}>
                      {vtBusy ? t('Checking…') : t('Verify & Enter')}
                    </button>
                  </form>
                  <button id="vtResend" onClick={doResend} disabled={rsLeft > 0 || vtBusy}
                    className="mt-3 font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc disabled:cursor-not-allowed disabled:opacity-50">
                    {rsLeft > 0 ? t('Resend code in {s}s', { s: rsLeft }) : t('Resend code')}
                  </button>
                  {vtDev && (
                    <div id="vtDevBox" className="mt-5 border border-line2 bg-bg2 p-4">
                      <p className="mb-2 font-cond text-[.72rem] font-semibold uppercase tracking-[.2em] text-silver2">
                        Dev mode — email delivery not configured, use this code
                      </p>
                      <p className="font-disp text-2xl tracking-[.4em] text-acc">{vtDev}</p>
                    </div>
                  )}
                  <button onClick={() => setTab('login')} className="mt-5 font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
                    ← Back to log in
                  </button>
                </div>

                <div id="fpCard" className={`${cardCls} max-w-[460px]`} hidden={tab !== 'forgot'}>
                  <h3 className="mb-2 font-disp text-[1.25rem] uppercase">{t('Reset Your')} <span className="text-acc">{t('Password')}</span></h3>
                  {!fpSent ? (
                    <>
                      <p className="mb-6 text-[.85rem] leading-relaxed text-dim">
                        Enter the email on your account — we'll send a reset link valid for 15 minutes. It works exactly once.
                      </p>
                      <form id="fpForm" noValidate onSubmit={doForgot}>
                        <div className="mb-1">
                          <label htmlFor="fpEmail" className={labelCls}>{t('Account email')}</label>
                          <input id="fpEmail" type="email" placeholder="you@iron.house" autoComplete="email" className={inputCls}
                            value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} />
                        </div>
                        <button type="submit" disabled={fpBusy} className={`${btnPrimary} mt-6 w-full ${fpBusy ? 'pointer-events-none opacity-60' : ''}`}>
                          {fpBusy ? 'Sending…' : 'Send Reset Link'}
                        </button>
                      </form>
                    </>
                  ) : (
                    <div id="fpSent">
                      <div className="border-l-2 border-acc py-1.5 pl-3.5">
                        <b className="block font-cond text-[.85rem] uppercase tracking-[.14em] text-acc">{t('Check your inbox')}</b>
                        <span className="mt-0.5 block text-[.85rem] text-muted">{fpSent.message}</span>
                      </div>
                      {fpSent.resetUrl && (
                        <div className="mt-5 border border-line2 bg-bg2 p-4">
                          <p className="mb-2 font-cond text-[.72rem] font-semibold uppercase tracking-[.2em] text-silver2">
                            Dev mode — email delivery not configured, use this link
                          </p>
                          <a href={fpSent.resetUrl} className="block break-all text-[.82rem] leading-relaxed text-acc underline decoration-acc/40 hover:decoration-acc">
                            {fpSent.resetUrl}
                          </a>
                          <p className="mt-2 text-[.72rem] text-dim">Expires in {fpSent.expiresIn || 15} minutes · single use.</p>
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => setTab('login')} className="mt-5 font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
                    ← Back to log in
                  </button>
                </div>

                <div id="rgCard" className={`${cardCls} max-w-[460px]`} hidden={tab !== 'reg'}>
                  <h3 className="mb-6 font-disp text-[1.25rem] uppercase">{t('Join the')} <span className="text-acc">{t('Forge')}</span></h3>
                  <form id="rgForm" noValidate onSubmit={doRegister}>
                    <div className="mb-4">
                      <label htmlFor="rgName" className={labelCls}>{t('Name')}</label>
                      <input id="rgName" type="text" placeholder="Marcus Reed" autoComplete="name" className={inputCls}
                        value={rgName} onChange={(e) => setRgName(e.target.value)} />
                    </div>
                    <div className="mb-4">
                      <label htmlFor="rgEmail" className={labelCls}>{t('Email')}</label>
                      <input id="rgEmail" type="email" placeholder="you@iron.house" autoComplete="email" className={inputCls}
                        value={rgEmail} onChange={(e) => setRgEmail(e.target.value)} />
                    </div>
                    <div className="mb-4">
                      <label htmlFor="rgPhone" className={labelCls}>{t('Phone')} <span className="text-dim">({t('delivery updates + phone login')})</span></label>
                      <input id="rgPhone" type="tel" placeholder="01712-345678" autoComplete="tel" className={inputCls}
                        value={rgPhone} onChange={(e) => setRgPhone(e.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="rgPass" className={labelCls}>{t('Password')} <span className="text-dim">({t('6+ characters')})</span></label>
                      <input id="rgPass" type="password" placeholder="••••••••" autoComplete="new-password" className={inputCls}
                        value={rgPass} onChange={(e) => setRgPass(e.target.value)} />
                    </div>
                    <button type="submit" disabled={rgBusy} className={`${btnPrimary} mt-6 w-full ${rgBusy ? 'pointer-events-none opacity-60' : ''}`}>{t('Create Account')}</button>
                  </form>
                  <p className="mt-4 text-[.78rem] leading-relaxed text-dim">
                    {t('We will email you a 6-digit code to activate the account — guest checkout below never needs an account. Guest orders can be tracked above with the order number + phone.')}
                  </p>
                </div>
              </div>
            )}

            {/* ---------- PROFILE + ORDER HISTORY (logged in) ---------- */}
            {session && (
              <div id="acctPanel" className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
                <div>
                  <div className={cardCls}>
                    <div id="pfAva" className="mb-4 flex h-16 w-16 items-center justify-center bg-acc font-disp text-[1.6rem] text-black">
                      {((user.name || 'F')[0] || 'F').toUpperCase()}
                    </div>
                    <p id="pfName" className="font-disp text-[1.5rem] uppercase leading-[1.05]">{user.name || 'Lifter'}</p>
                    <p id="pfMail" className="mt-1 text-[.85rem] text-dim">{user.email || ''}</p>
                    {/* Task 58 — verification badge: green check once verified, one-click verify prompt otherwise */}
                    {user.emailVerified ? (
                      <span id="pfVerified" data-testid="verifiedBadge" className="mt-2 inline-block border border-okgreen bg-okgreen px-2.5 py-1 font-cond text-[.66rem] font-bold uppercase tracking-[.18em] text-okgreen">✓ {t('Email verified')}</span>
                    ) : (
                      <button id="pfVerifyNow" data-testid="verifyNowBadge"
                        onClick={() => { setVtEmail(user.email || ''); setVtCode(''); setVtErr(''); setRsLeft(0); setTab('verify'); }}
                        className="mt-2 inline-block border border-acc/60 bg-acc/10 px-2.5 py-1 font-cond text-[.66rem] font-bold uppercase tracking-[.18em] text-acc transition hover:bg-acc hover:text-black">
                        ⚠ {t('Email not verified — verify now')}
                      </button>
                    )}
                    <div className="mt-6 grid grid-cols-2 border border-line">
                      <div className="border-r border-line py-5 text-center">
                        <b id="pfOrders" className="block font-disp text-[2rem] leading-none text-acc">{ordState === 'ok' ? orders.length : ordState === 'loading' ? '…' : '—'}</b>
                        <span className="font-cond font-semibold text-[.72rem] uppercase tracking-[.24em] text-silver">{t('Orders')}</span>
                      </div>
                      <div className="py-5 text-center">
                        <b id="pfWish" className="block font-disp text-[2rem] leading-none text-acc">{wish.size}</b>
                        <span className="font-cond font-semibold text-[.72rem] uppercase tracking-[.24em] text-silver">{t('Wishlisted')}</span>
                      </div>
                    </div>

                    {/* Task 56-a — My Points */}
                    <div id="pfPoints" className="mt-4 border border-line bg-bg2 p-4" data-testid="myPoints">
                      <div className="flex items-baseline justify-between">
                        <span className="font-cond font-semibold text-[.72rem] uppercase tracking-[.24em] text-silver">{t('My Points')}</span>
                        {loyal ? <span className="text-[.7rem] text-dim">{t('1 pt =')} {money(loyal.rules.pointValue)}</span> : null}
                      </div>
                      <b id="pfPtsBalance" className="mt-1 block font-disp text-[2.2rem] leading-none text-acc">
                        {loyal ? loyal.points : '…'}
                      </b>
                      {loyal ? (
                        <>
                          <p className="mt-1 text-[.74rem] text-dim">
                            {loyal.rules.enabled
                              ? <>{t('Worth about')} <b className="text-txt">{money(loyal.points * loyal.rules.pointValue)}</b> {t('at checkout')}{loyal.points < loyal.rules.minRedeem ? <> · {t('min redeem')} {loyal.rules.minRedeem}</> : null}</>
                              : t('Point redemption is paused right now.')}
                          </p>
                          {loyal.referralCode ? (
                            <button id="pfRefCopy" onClick={copyRef}
                              className="mt-2.5 flex w-full items-center justify-between border border-line px-3 py-2 text-left transition-colors hover:border-acc">
                              <span className="font-cond text-[.78rem] font-bold tracking-[.14em] text-txt">{loyal.referralCode}</span>
                              <span className="font-cond text-[.66rem] font-bold uppercase tracking-[.18em] text-acc">{refCopied ? t('Copied!') : t('Share — copy code')}</span>
                            </button>
                          ) : null}
                          {loyal.history && loyal.history.length ? (
                            <div className="mt-3 border-t border-line pt-2">
                              <span className="font-cond font-semibold text-[.68rem] uppercase tracking-[.22em] text-silver">{t('Recent activity')}</span>
                              <ul className="mt-1.5 space-y-1">
                                {loyal.history.slice(0, 4).map((h) => (
                                  <li key={h.id} className="flex items-baseline justify-between gap-2 text-[.74rem]">
                                    <span className="min-w-0 truncate text-dim">{h.note || h.type}{h.orderNumber ? ` · ${h.orderNumber}` : ''}</span>
                                    <b className={'shrink-0 ' + (h.points >= 0 ? 'text-okgreen' : 'text-acc')}>{h.points >= 0 ? '+' : ''}{h.points}</b>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-1 text-[.74rem] text-dim">{t('Earn 1 point per ৳100 delivered — redeem at checkout.')}</p>
                      )}
                    </div>

                    <button id="logoutBtn" onClick={doLogout} className={`${btnGhost} mt-5 w-full`}>{t('Log Out')}</button>
                  </div>
                </div>
                <div>
                  <h3 className="mb-5 font-disp text-[1.3rem] uppercase">{t('Order')} <span className="text-acc">{t('History')}</span></h3>
                  <div id="ordList">
                    {ordState === 'loading' && <p className="text-[.85rem] text-dim">{t('Loading your orders…')}</p>}
                    {ordState === 'ok' && (orders.length
                      ? orders.map((o) => <OrdCard key={o.no + String(o.date)} o={o} />)
                      : <EmptyBlock title="No Orders Yet" sub="Your history lands here the moment you place an order." />)}
                    {ordState === 'err' && (
                      <>
                        <EmptyBlock title="Could Not Load" sub={ordMsg} />
                        {orders.length > 0 && (
                          <p className="mt-4 text-[.78rem] text-dim">Showing {orders.length} order(s) saved on this device.</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Task 37 — Messages From ArixGear */}
                <div className="mt-10" id="msgPanel">
                  <div className="mb-5 flex flex-wrap items-center gap-4">
                    <h3 className="font-disp text-[1.3rem] uppercase">{t('Messages From')} <span className="text-acc">ArixGear</span></h3>
                    {msgUnread > 0 ? <span id="msgNewPill" className="border border-acc px-2 py-0.5 font-cond text-[.7rem] font-bold uppercase tracking-[.2em] text-acc">{msgUnread} new</span> : null}
                    <button id="msgToggle" onClick={() => (inboxOpen ? setInboxOpen(false) : openInbox())} className="ml-auto border border-line2 px-3.5 py-2 font-cond text-[.72rem] font-bold uppercase tracking-[.22em] text-dim transition-colors hover:border-acc hover:text-acc">
                      {inboxOpen ? t('Hide') : t('Open inbox')}
                    </button>
                  </div>
                  {inboxOpen ? (
                    <div className="border border-line bg-panel">
                      {msgs.length ? msgs.map((m) => (
                        <div key={m._id} data-msgdir={m.direction} className={'border-b border-line px-4 py-4 last:border-b-0 sm:px-5 ' + (m.direction === 'out' ? 'bg-acc/[.04]' : '')}>
                          <div className="flex flex-wrap items-baseline gap-3">
                            {m.direction === 'out'
                              ? <span className="border border-acc px-2 py-0.5 font-cond text-[.68rem] font-bold uppercase tracking-[.18em] text-acc">↗ {t('ArixGear Team')}</span>
                              : <b className="text-[.9rem]">{m.name}</b>}
                            {m.subject ? <span className="text-[.85rem] font-bold">“{m.subject}”</span> : null}
                            <span className="ml-auto text-[.72rem] text-dim">{new Date(m.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="mb-0 mt-2 whitespace-pre-wrap text-[.85rem] leading-[1.6] text-txt/90">{m.message}</p>
                        </div>
                      )) : <p className="px-5 py-8 text-center text-[.85rem] text-dim">{t('No messages yet — we occasionally send offers and updates here.')}</p>}

                      {/* reply box — lands in the admin inbox + admin bell */}
                      <div className="border-t border-line px-4 py-4 sm:px-5">
                        <label className="mb-2 block font-cond text-[.72rem] font-bold uppercase tracking-[.22em] text-dim">{t('Reply to ArixGear')}</label>
                        <textarea id="msgReplyBox" rows={2} className="w-full" value={reply} onChange={(e) => setReply(e.target.value)}
                          placeholder={t('Write your question or feedback…')} />
                        <button id="msgReplySend" onClick={sendReply} disabled={replyBusy || reply.trim().length < 2}
                          className="mt-2.5 border border-acc bg-acc px-4 py-2 font-cond text-[.72rem] font-bold uppercase tracking-[.22em] text-black transition-colors hover:bg-acc/90 disabled:opacity-40">
                          {replyBusy ? t('Sending…') : t('Send')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

    </>
  );
}
