/* ArixGear page — Track Order (Task 39): public order tracking.
   Order number + checkout phone (any ≥6-digit suffix) → status timeline,
   items, totals, courier info. Backed by GET /api/orders/track/:orderNumber
   (phone-proof rate limited server-side). Also self-cancel for live orders. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trackOrder, cancelOrder } from '../services/orders.js';
import { joinOrder, leaveOrder, onRealtime } from '../lib/realtime.js'; /* Phase 7 — live order room */
import { adaptOrder, money, STATUS_LABELS } from '../lib/format.js';
import { useUI } from '../store/ui.jsx';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

const Eyebrow = ({ children }) => (
  <p className="font-cond font-semibold uppercase tracking-[.45em] text-acc text-[.82rem] flex items-center gap-3">
    <i className="not-italic inline-block h-0.5 w-9 bg-acc" />{children}
  </p>
);
const labelCls = 'mb-1.5 block font-cond font-semibold text-[.78rem] uppercase tracking-[.26em] text-silver2';
const inputCls = 'w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc';
const btnPrimary = 'inline-flex items-center justify-center gap-2.5 bg-acc px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-black transition-all duration-300 clip-notch hover:bg-acc2 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0';

/* main flow for the timeline (cancel/reject render as terminal states) */
const FLOW = ['verifying', 'processing', 'packed', 'shipped', 'delivered'];
const FLOW_ICON = { verifying: '◔', processing: '⚙', packed: '▣', shipped: '➤', delivered: '✓' };

function Timeline({ status }) {
  const cancelled = status === 'cancelled' || status === 'payment-rejected';
  const idx = FLOW.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1.5" id="trackTimeline">
      {FLOW.map((s, i) => {
        const done = !cancelled && idx >= i;
        const active = !cancelled && idx === i;
        return (
          <li key={s} className="text-center">
            <div className={'mx-auto grid h-10 w-10 place-items-center rounded-full border text-[15px] transition-all ' +
              (active ? 'border-acc bg-acc text-black shadow-[0_0_18px_rgba(255,90,0,.45)]' : done ? 'border-acc/60 bg-acc/15 text-acc' : 'border-line2 bg-bg2 text-dim')}>
              {FLOW_ICON[s]}
            </div>
            <div className={'mt-1.5 font-cond text-[.68rem] font-semibold uppercase tracking-[.14em] ' + (done || active ? 'text-txt' : 'text-dim')}>{STATUS_LABELS[s]}</div>
            <div className={'mx-auto mt-1.5 h-0.5 w-full max-w-[54px] ' + (i < FLOW.length - 1 ? (idx > i && !cancelled ? 'bg-acc/70' : 'bg-line2') : 'bg-transparent')} />
          </li>
        );
      })}
    </ol>
  );
}

export default function Page() {
  useSEO('track-order');
  const { toast } = useUI();
  const { t } = useLang();
  const [params] = useSearchParams();
  const [no, setNo] = useState(params.get('order') || '');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState(null); // adapted order
  const [raw, setRaw] = useState(null); // server payload (canCancel etc.)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /* deep link ?order=ARG-… auto-searches once the visitor types the phone */
  const autoNo = params.get('order');
  useEffect(() => { if (order === null && autoNo && phone.replace(/\D/g, '').length >= 6 && !busy) { /* handled by submit */ } }, [autoNo, phone, order, busy]);

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!no.trim()) { setError('Order number is required — check your confirmation page or SMS.'); return; }
    if (phone.replace(/\D/g, '').length < 6) { setError('Enter the phone number you used at checkout (at least 6 digits).'); return; }
    setBusy(true); setError(''); setOrder(null); setRaw(null);
    try {
      const d = await trackOrder(no.trim(), { phone: phone.trim() });
      setRaw(d.order);
      setOrder(adaptOrder(d.order));
    } catch (err) {
      setError(err.message || 'Order not found — double-check the number and phone.');
    } finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!raw) return;
    if (!window.confirm(`Cancel order ${raw.orderNumber}? Stock will be released and this cannot be undone.`)) return;
    setBusy(true);
    try {
      await cancelOrder(raw.orderNumber, phone.trim());
      toast(t('Order cancelled — stock released'), 'ok');
      const d = await trackOrder(no.trim(), { phone: phone.trim() });
      setRaw(d.order); setOrder(adaptOrder(d.order));
    } catch (err) {
      toast(err.message || t('Could not cancel'), 'err');
    } finally { setBusy(false); }
  };

  const cancelled = raw && (raw.status === 'cancelled' || raw.status === 'payment-rejected');
  const eta = useMemo(() => (raw ? new Date(raw.eta || Date.now()) : null), [raw]);

  /* Phase 7 — live order room (Socket.IO): join `order:<NUM>` after a successful
     track (phone-proof rule enforced by the gateway) and refresh the timeline
     the moment the admin fans an order:updated — zero polling. */
  const liveRef = useRef({ no: '', phone: '' });
  useEffect(() => { liveRef.current = { no: no.trim(), phone: phone.trim() }; }, [no, phone]);
  useEffect(() => {
    if (!raw || !raw.orderNumber) return undefined;
    joinOrder(raw.orderNumber, liveRef.current.phone);
    const off = onRealtime('order:updated', (p) => {
      if (!p || String(p.orderNumber || '').toUpperCase() !== String(raw.orderNumber).toUpperCase()) return;
      trackOrder(liveRef.current.no || raw.orderNumber, { phone: liveRef.current.phone })
        .then((d) => { setRaw(d.order); setOrder(adaptOrder(d.order)); toast(t('Order updated'), 'ok'); })
        .catch(() => {});
    });
    return () => { off(); leaveOrder(raw.orderNumber); };
  }, [raw && raw.orderNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 pb-24 pt-14 md:px-8" id="trackOrderPage">
      <div className="mb-10 max-w-2xl">
        <Eyebrow>{t('Order Tracking')}</Eyebrow>
        <h1 className="mt-3 font-head text-[2.6rem] font-black leading-[.95] md:text-[3.6rem]">{t("WHERE'S MY")} <span className="text-acc">{t('GEAR?')}</span></h1>
        <p className="mt-4 text-[.95rem] leading-relaxed text-muted">{t('Enter your order number and the phone you used at checkout. No account needed — guest orders work the same way.')}</p>
      </div>

      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-line bg-panel p-6 md:grid-cols-[1fr_1fr_auto] md:items-end md:gap-5" id="trackForm">
        <div>
          <label className={labelCls}>{t('Order number')}</label>
          <input className={inputCls + ' font-mono uppercase'} placeholder="ARG-8FK2QA" value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} id="trackNoInput" />
        </div>
        <div>
          <label className={labelCls}>{t('Checkout phone')}</label>
          <input className={inputCls} placeholder="01XXXXXXXXX (or last 6 digits)" value={phone} onChange={(e) => setPhone(e.target.value)} id="trackPhoneInput" />
        </div>
        <button className={btnPrimary + ' h-[52px] w-full md:w-auto'} disabled={busy} id="trackSubmitBtn">{busy ? t('Searching…') : t('TRACK ORDER')}</button>
      </form>

      {error ? (
        <div className="mt-5 rounded-xl border border-red/40 bg-red/10 px-5 py-4 text-[.9rem] text-red" id="trackError">{error}</div>
      ) : null}

      {!order && !error ? (
        <div className="mt-5 rounded-xl border border-line bg-panel/60 px-5 py-4 text-[.85rem] text-muted" id="trackHint">
          Where do I find my order number? It starts with <b className="text-txt">ARG-</b> — shown on the checkout success page, your account order history, and every confirmation message.
        </div>
      ) : null}

      {order && raw ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_1fr]" id="trackResult">
          {/* status card */}
          <section className="rounded-xl border border-line bg-panel p-6" id="trackStatusCard">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div>
                <div className="font-mono text-[1.05rem] font-bold text-txt">{order.no}</div>
                <div className="mt-0.5 text-[.78rem] text-muted">Placed {new Date(order.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
              <span className={'ml-auto rounded-full border px-3 py-1 font-cond text-[.72rem] font-bold uppercase tracking-[.16em] ' + (cancelled ? 'border-red/50 text-red' : order.status === 'delivered' ? 'border-ok/50 text-ok' : 'border-acc/50 text-acc')}>
                {order.statusLabel}
              </span>
            </div>

            {cancelled ? (
              <div className="rounded-lg border border-red/40 bg-red/10 px-4 py-3.5 text-[.9rem] text-red">
                {raw.status === 'cancelled' ? 'This order was cancelled' : 'Payment was rejected for this order'} — {raw.statusHistory && raw.statusHistory.length ? (raw.statusHistory[raw.statusHistory.length - 1].note || 'contact support for details') : 'contact support for details.'}
              </div>
            ) : (
              <Timeline status={order.status} />
            )}

            {!cancelled && eta ? (
              <p className="mt-5 text-center text-[.8rem] text-muted">Estimated delivery: <b className="text-txt">{eta.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</b> (3-day standard, Dhaka metro often sooner)</p>
            ) : null}

            {/* history */}
            {raw.statusHistory && raw.statusHistory.length ? (
              <div className="mt-6 border-t border-line pt-5">
                <div className="mb-2.5 font-cond text-[.72rem] font-bold uppercase tracking-[.2em] text-silver2">History</div>
                <ul className="space-y-1.5 text-[.82rem] text-muted">
                  {raw.statusHistory.map((h, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-acc" />
                      <span><b className="text-txt">{h.label || STATUS_LABELS[h.status] || h.status}</b> · {new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{h.note ? ` — ${h.note}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {raw.canCancel && !cancelled ? (
              <button onClick={doCancel} disabled={busy} className="mt-6 w-full rounded-lg border border-red/40 px-4 py-3 font-cond text-[.75rem] font-bold uppercase tracking-[.18em] text-red transition hover:bg-red/10" id="trackCancelBtn">
                CANCEL THIS ORDER
              </button>
            ) : null}
          </section>

          {/* items + totals + shipping */}
          <div className="space-y-5">
            <section className="rounded-xl border border-line bg-panel p-6" id="trackItems">
              <div className="mb-3.5 font-cond text-[.72rem] font-bold uppercase tracking-[.2em] text-silver2">Items ({order.items.length})</div>
              <ul className="space-y-3">
                {order.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-line bg-bg2">
                      {it.image ? <img src={it.image} alt={it.name} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[.85rem] font-semibold text-txt">{it.name}</div>
                      <div className="text-[.72rem] text-muted">{it.qty} × {money(it.price)}{it.size ? ` · ${it.size}` : ''}{it.color ? ` · ${it.color}` : ''}</div>
                    </div>
                    <div className="text-[.85rem] font-bold text-txt">{money(it.price * it.qty)}</div>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[.82rem]">
                <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="text-txt">{money(order.total - (order.shipTotal || 0))}</dd></div>
                <div className="flex justify-between text-muted"><dt>Shipping</dt><dd className="text-txt">{order.shipTotal ? money(order.shipTotal) : 'Free'}</dd></div>
                <div className="flex justify-between border-t border-line pt-2 font-bold"><dt className="text-txt">Total</dt><dd className="text-acc">{money(order.total)}</dd></div>
              </dl>
            </section>

            <section className="rounded-xl border border-line bg-panel p-6 text-[.85rem]" id="trackShipping">
              <div className="mb-2.5 font-cond text-[.72rem] font-bold uppercase tracking-[.2em] text-silver2">Delivery & Payment</div>
              <p className="text-muted"><b className="text-txt">{raw.customer && raw.customer.name}</b> · {raw.customer && raw.customer.phone}</p>
              <p className="mt-1 text-muted">{raw.shipping && [raw.shipping.address, raw.shipping.city, raw.shipping.postal].filter(Boolean).join(', ')}</p>
              <p className="mt-2.5 text-muted">Payment: <b className="text-txt">{order.payLabel}</b>{raw.payment && raw.payment.trxId ? ` · TrxID ${raw.payment.trxId}` : ''} {raw.payment && raw.payment.status ? <span className={'ml-1 rounded-full border px-2 py-px text-[.62rem] font-bold uppercase ' + (raw.payment.status === 'verified' || raw.payment.status === 'paid' ? 'border-ok/40 text-ok' : raw.payment.status === 'pending' ? 'border-amber/40 text-amber' : 'border-red/40 text-red')}>{raw.payment.status}</span> : null}</p>
              {raw.courier && raw.courier.name ? <p className="mt-1 text-muted">Courier: <b className="text-txt">{raw.courier.name}</b>{raw.courier.trackingCode ? ` · ${raw.courier.trackingCode}` : ''}</p> : null}
            </section>

            <p className="text-center text-[.78rem] text-muted">Need help? <Link to="/contact" className="text-acc hover:underline">Contact support</Link> with your order number.</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
