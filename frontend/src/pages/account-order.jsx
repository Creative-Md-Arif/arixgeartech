import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { trackOrder, cancelOrder, requestReturn, downloadInvoice } from '../services/orders.js';
import { joinOrder, leaveOrder, onRealtime } from '../lib/realtime.js';
import { money, STATUS_LABELS, DIV_LABELS, PAY_LABELS } from '../lib/format.js';
import { useCatalog } from '../store/catalog.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { PageHead, AcctNav, Gate, ErrStrip, OkStrip, miniBtn, btnPrimary, stTone, dFmt, RETURN_REASONS } from '../components/accountKit.jsx';

const inputCls = 'w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc';

/*order status flow order — for the timeline rail*/
const FLOW = ['verifying', 'processing', 'packed', 'shipped', 'delivered'];

function Timeline({ history, status }) {
  const { t } = useLang();
  const entries = history || [];
  const at = (s) => (entries.filter((h) => h.status === s).slice(-1)[0] || {}).at || null;
  if (status === 'cancelled' || status === 'payment-rejected') {
    const last = entries[entries.length - 1];
    return (
      <div className="border border-line2 bg-bg2 p-4 text-[.85rem] text-muted">
        <span className="mr-2 border border-red/40 px-2 py-1 font-cond text-[.72rem] uppercase tracking-[.2em] text-red">
          {STATUS_LABELS[status] || status}
        </span>
        {last ? `${dFmt(last.at)} — ${last.note || ''}` : t('No further movement on this order.')}
      </div>
    );
  }
  const done = FLOW.indexOf(status);
  return (
    <ol id="ordTimeline" className="grid gap-2 sm:grid-cols-5">
      {FLOW.map((s, i) => {
        const on = done >= i;
        const ts = at(s);
        return (
          <li key={s} className={'border px-3 py-3 text-center ' + (on ? 'border-acc/60 bg-acc/5' : 'border-line bg-bg2')}>
            <p className={'font-cond text-[.72rem] font-semibold uppercase tracking-[.2em] ' + (on ? 'text-acc' : 'text-dim')}>
              {STATUS_LABELS[s] || s}
            </p>
            <p className="mt-1 text-[.72rem] text-dim">{ts ? dFmt(ts) : '—'}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function Page() {
  useSEO('account-order', { title: 'Order Details — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { id } = useParams();
  const { toast } = useUI();
  const { BY_ID } = useCatalog();

  const [order, setOrder] = useState(undefined); /*undefined loading · null miss · object live*/
  const [ret, setRet] = useState({ on: false, reason: 'damaged', note: '', qty: {} });
  const [msg, setMsg] = useState(null); /*{tone:'err'|'ok', text}*/
  const [busy, setBusy] = useState('');
  /*guest rows are not account-linked — the phone-suffix proof re-opens them*/
  const [proof, setProof] = useState({ on: false, phone: '', err: '' });
  const proofRef = useRef(''); /*checkout phone that last passed proof ('' = owner JWT)*/

  useEffect(() => {
    let dead = false;
    setOrder(undefined);
    setProof({ on: false, phone: '', err: '' });
    proofRef.current = '';

    trackOrder(id, {})
      .then((d) => { if (!dead) setOrder(d.order || null); })
      .catch(() => { if (!dead) { setOrder(null); setProof((p) => ({ ...p, on: true })); } });
    return () => { dead = true; };
  }, [id]);

  /*live order room: join after a successful proof (owner JWT or the checkout phone) and re-pull the order when the server fans order:updated.*/
  useEffect(() => {
    if (!order || !order.orderNumber) return undefined;
    joinOrder(order.orderNumber, proofRef.current);
    const off = onRealtime('order:updated', (p) => {
      if (!p || String(p.orderNumber || '').toUpperCase() !== String(order.orderNumber).toUpperCase()) return;
      trackOrder(id, proofRef.current ? { phone: proofRef.current } : {})
        .then((d) => { setOrder(d.order || null); toast(t('Order updated'), 'ok'); })
        .catch(() => {});
    });
    return () => { off(); leaveOrder(order.orderNumber); };
  }, [order && order.orderNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitProof = (e) => {
    e.preventDefault();
    setProof((p) => ({ ...p, err: '' }));
    const digits = proof.phone.replace(/\D/g, '');
    if (digits.length < 6) { setProof((p) => ({ ...p, err: t('Provide the phone number (or last 6 digits) used at checkout') })); return; }
    setBusy('proof');
    trackOrder(id, { phone: proof.phone.trim() })
      .then((d) => { proofRef.current = proof.phone.trim(); setOrder(d.order || null); setProof((p) => ({ ...p, on: false })); })
      .catch((e2) => setProof((p) => ({ ...p, err: e2.message || t('Phone number does not match this order') })))
      .finally(() => setBusy(''));
  };

  const totals = useMemo(() => (order && order.totals) || {}, [order]);
  const items = useMemo(() => (order && order.items) || [], [order]);

  const doCancel = () => {
    setMsg(null); setBusy('cancel');
    cancelOrder(id, '')
      .then((d) => { setOrder(d.order || null); setMsg({ tone: 'ok', text: d.message || t('Order cancelled — reserved stock released.') }); })
      .catch((e) => setMsg({ tone: 'err', text: e.message || t('Could not cancel.') }))
      .finally(() => setBusy(''));
  };

  const doInvoice = () => {
    setBusy('invoice');
    downloadInvoice(id)
      .then(() => toast(t('Invoice downloading'), id + '.pdf saved to your device.'))
      .catch((e) => toast(t('Invoice failed'), e.message || t('Try again in a moment.')))
      .finally(() => setBusy(''));
  };

  const openReturn = () => {
    const q = {};
    items.forEach((i) => { q[i.slug] = i.qty; });
    setRet((r) => ({ ...r, on: true, qty: q }));
  };

  const submitReturn = (e) => {
    e.preventDefault();
    setMsg(null); setBusy('return');
    const payload = {
      reason: ret.reason,
      note: ret.note.trim(),
      items: items.map((i) => ({ slug: i.slug, qty: ret.qty[i.slug] ?? i.qty })).filter((l) => l.qty > 0),
    };
    requestReturn(id, payload)
      .then((d) => {
        setRet((r) => ({ ...r, on: false }));
        setMsg({ tone: 'ok', text: d.message || t('Return request submitted — we will call you to arrange pickup.') });
      })
      .catch((e2) => setMsg({ tone: 'err', text: e2.message || t('Return failed.') }))
      .finally(() => setBusy(''));
  };

  return (
    <Gate title="Order Details">
      <section id="page-order-detail" className="page py-16 lg:py-24">
        <div className="container mx-auto w-[92%] max-w-6xl">
          <PageHead crumb="My Orders" crumbTo="/account/orders" title={id} lede={t('Server-verified status, totals and history — exactly what the warehouse sees.')} />
          <AcctNav active="/account/orders" />

          {order === undefined ? (
            <div className="mt-10 h-64 animate-pulse border border-line bg-panel" />
          ) : order === null ? (
            <div className="mt-10 border border-dashed border-line2 px-6 py-16 text-center text-muted">
              <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('Order not found')}</h3>
              <p>{t('This order is not linked to your account.')}</p>
              {proof.on ? (
                <form id="proofForm" noValidate onSubmit={submitProof} className="mx-auto mt-6 max-w-sm text-left">
                  <ErrStrip>{proof.err}</ErrStrip>
                  <p className="mb-1.5 block font-cond font-semibold text-[.72rem] uppercase tracking-[.24em] text-silver2">{t('CHECKOUT PHONE')}</p>
                  <div className="flex gap-2">
                    <input
                      id="proofPhone" type="tel" autoComplete="tel" placeholder="01712-345678 — last 6 digits OK"
                      className="w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none placeholder:text-dim focus:border-acc"
                      value={proof.phone} onChange={(e) => setProof((p) => ({ ...p, phone: e.target.value }))}
                    />
                    <button type="submit" disabled={busy === 'proof'} className={btnPrimary}>{busy === 'proof' ? t('Checking…') : t('Open')}</button>
                  </div>
                </form>
              ) : null}
              <Link to="/track-order" className={`${miniBtn} mt-6`}>{t('Track with order number')}</Link>
            </div>
          ) : (
            <div className="mt-10">
              <ErrStrip>{msg && msg.tone === 'err' ? msg.text : ''}</ErrStrip>
              <OkStrip>{msg && msg.tone === 'ok' ? msg.text : ''}</OkStrip>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-line bg-panel px-5 py-4">
                <span className="font-disp text-[1.15rem] tracking-[.03em] text-acc">{order.orderNumber}</span>
                <span className="font-cond text-[.78rem] uppercase tracking-[.18em] text-dim">{dFmt(order.createdAt)}</span>
                <span className={`ml-auto border px-2.5 py-1 font-cond font-bold text-[.72rem] uppercase tracking-[.22em] ${stTone(order.status)}`}>
                  {STATUS_LABELS[order.status] || order.status}
                </span>
              </div>

              <div className="mt-6">
                <Timeline history={order.statusHistory} status={order.status} />
              </div>

              <div className="mt-8 border border-line bg-panel">
                <div className="border-b border-line px-5 py-3 font-cond text-[.78rem] uppercase tracking-[.22em] text-dim">{t('Items')}</div>
                {items.map((it, i) => {
                  const p = BY_ID[it.slug];
                  const img = (p && p.img) || it.image || '';
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
                      {img ? <img src={img} alt={it.name} className="h-14 w-14 flex-none border border-line2 object-cover" /> : null}
                      <div className="min-w-0 flex-1">
                        <Link to={'/product/' + encodeURIComponent(it.slug)} className="block truncate text-[.92rem] text-txt transition-colors hover:text-acc">{it.name}</Link>
                        <p className="mt-0.5 text-[.75rem] text-dim">
                          {it.size ? `${t('Size')} ${it.size} · ` : ''}{it.color ? `${it.color} · ` : ''}৳{(+it.price).toLocaleString('en-US')} × {it.qty}
                        </p>
                      </div>
                      <b className="font-disp text-[1rem] text-txt">{money(it.price * it.qty)}</b>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <div className="border border-line bg-panel p-5">
                  <p className="mb-3 font-cond text-[.78rem] uppercase tracking-[.22em] text-dim">{t('Totals')}</p>
                  <dl className="space-y-2 text-[.88rem] text-muted">
                    <div className="flex justify-between"><dt>{t('Subtotal')}</dt><dd>{money(totals.subtotal)}</dd></div>
                    {totals.discount > 0 ? <div className="flex justify-between text-ok"><dt>{t('Coupon discount')}</dt><dd>−{money(totals.discount)}</dd></div> : null}
                    {totals.pointsRedeemed > 0 ? <div className="flex justify-between text-ok"><dt>{t('Points redeemed')}</dt><dd>−{money(totals.pointsDiscount || totals.pointsRedeemed)}</dd></div> : null}
                    <div className="flex justify-between"><dt>{t('Shipping')}</dt><dd>{totals.shipping ? money(totals.shipping) : t('Free')}</dd></div>
                    <div className="flex justify-between border-t border-line pt-2 font-disp text-[1.05rem] text-txt"><dt>{t('Grand total')}</dt><dd>{money(totals.grandTotal)}</dd></div>
                  </dl>
                </div>
                <div className="border border-line bg-panel p-5">
                  <p className="mb-3 font-cond text-[.78rem] uppercase tracking-[.22em] text-dim">{t('Payment')}</p>
                  <dl className="space-y-2 text-[.88rem] text-muted">
                    <div className="flex justify-between"><dt>{t('Method')}</dt><dd className="text-txt">{PAY_LABELS[order.payment && order.payment.method] || (order.payment && order.payment.method) || '—'}</dd></div>
                    <div className="flex justify-between"><dt>{t('Status')}</dt><dd className="text-txt">{(order.payment && order.payment.status) || '—'}</dd></div>
                    {order.payment && order.payment.trxId ? (
                      <div className="flex justify-between"><dt>{t('Transaction')}</dt><dd className="font-disp text-txt">{order.payment.trxId}</dd></div>
                    ) : null}
                  </dl>
                </div>
                <div className="border border-line bg-panel p-5">
                  <p className="mb-3 font-cond text-[.78rem] uppercase tracking-[.22em] text-dim">{t('Delivery')}</p>
                  <p className="text-[.88rem] leading-relaxed text-muted">
                    {(order.customer && order.customer.name) || '—'}<br />
                    {(order.shipping && order.shipping.address) || (order.shipping && order.shipping.city) || ''}<br />
                    {DIV_LABELS[order.shipping && order.shipping.division] || (order.shipping && order.shipping.division) || ''}
                    {order.shipping && order.shipping.phone ? <> · {order.shipping.phone}</> : <> · {(order.customer && order.customer.phone) || ''}</>}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button type="button" className={`${miniBtn} w-full max-w-full whitespace-normal text-center sm:w-auto`} disabled={busy === 'invoice'} onClick={doInvoice}>{t('Download invoice (PDF)')}</button>
                {order.canCancel ? (
                  <button
                    className="border border-red/40 px-4 py-2.5 font-cond font-semibold uppercase tracking-[.16em] text-[.72rem] text-red transition-colors hover:bg-red/10"
                    disabled={busy === 'cancel'} onClick={doCancel}
                  >
                    {busy === 'cancel' ? t('Cancelling…') : t('Cancel order')}
                  </button>
                ) : null}
                {order.status === 'delivered' && !ret.on ? (
                  <button className={miniBtn} onClick={openReturn}>{t('Request a return')}</button>
                ) : null}
                <Link to="/account/orders" className="ml-auto font-cond text-[.78rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-acc">← {t('All orders')}</Link>
              </div>

              {ret.on ? (
                <form id="retForm" onSubmit={submitReturn} className="mt-6 border border-line bg-panel p-5 sm:p-6">
                  <p className="mb-4 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Return request')}</p>
                  {items.length > 1 ? (
                    <div className="mb-5 space-y-2">
                      <p className={miniLabelCls()}>{t('Quantities to return')}</p>
                      {items.map((i) => (
                        <div key={i.slug} className="flex items-center gap-3 text-[.85rem] text-muted">
                          <span className="min-w-0 flex-1 truncate">{i.name}</span>
                          <span className="text-dim">×{i.qty}</span>
                          <input
                            type="number" min="0" max={i.qty} value={ret.qty[i.slug] ?? i.qty}
                            aria-label={'Return qty ' + i.name}
                            onChange={(e) => setRet((r) => ({ ...r, qty: { ...r.qty, [i.slug]: Math.max(0, Math.min(i.qty, +e.target.value || 0)) } }))}
                            className="w-16 border border-line2 bg-bg2 px-2 py-1.5 text-center text-txt outline-none focus:border-acc"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className={miniLabelCls()}>{t('Reason')}</p>
                      <select value={ret.reason} onChange={(e) => setRet((r) => ({ ...r, reason: e.target.value }))} className={inputCls} id="retReason">
                        {RETURN_REASONS.map(([v, lab]) => <option key={v} value={v} className="bg-bg2">{t(lab)}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className={miniLabelCls()}>{t('Note — optional')}</p>
                      <input type="text" value={ret.note} onChange={(e) => setRet((r) => ({ ...r, note: e.target.value }))} className={inputCls} id="retNote" placeholder={t('What happened?')} />
                    </div>
                  </div>
                  <p className="mt-3 text-[.75rem] text-dim">{t('One active request per order — the support desk calls to arrange pickup within 48 hours.')}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="submit" disabled={busy === 'return'} className={btnPrimary}>{busy === 'return' ? t('Submitting…') : t('Submit return request')}</button>
                    <button type="button" onClick={() => setRet((r) => ({ ...r, on: false }))} className={miniBtn}>{t('Close')}</button>
                  </div>
                </form>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </Gate>
  );
}

/*tiny helper — label style local to the RMA block*/
const miniLabelCls = () => 'mb-1.5 block font-cond font-semibold text-[.72rem] uppercase tracking-[.24em] text-silver2';
