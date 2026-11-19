import { useEffect, useMemo } from 'react';
import { money, etaDate, DIV_LABELS } from '../lib/format.js';
import { go } from '../lib/go.js';
import { fbTrackCtx } from '../lib/pixel.js';
import { gaTrack } from '../lib/analytics.js';
import { downloadInvoice } from '../services/orders.js';
import { useStore } from '../store/store.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { useUI } from '../store/ui.jsx';

import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  useSEO('success');
  const { lastOrder, orders } = useStore();
  const { BY_ID } = useCatalog();
  const { toast } = useUI();

  const o = useMemo(() => lastOrder || orders[0] || null, [lastOrder, orders]);
  /*gateway-paid orders are ALREADY confirmed; copy must not say "verifying". The stored order snapshot still says "pending" (it was taken at place time), so the server's success redirect (?paid=1 — only issued after validation) also counts.*/
  const gwPaidParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('paid') === '1';
  const paidOnline = Boolean(o && (o.payStatus === 'paid' || (gwPaidParam && o.pay && o.pay === 'sslcommerz')));
  const mobPay = Boolean(o && o.pay && o.pay !== 'cod');

  /*one-tap invoice for the fresh order (phone comes from the order itself)*/
  const dlInvoice = async () => {
    if (!o || !o.no) return;
    try {
      await downloadInvoice(o.no, { phone: o.phone });
      toast('Invoice downloading', o.no + '.pdf saved to your device.');
    } catch (err) {
      toast('Invoice failed', err.message || 'Grab it later from My Account → Track.');
    }
  };

  /*---------- Meta Pixel: Purchase — once per order (localStorage-guarded, deduped on Meta side via eventID) ----------*/
  useEffect(() => {
    if (!o || !o.no) return undefined;
    const fire = () => {
      try {
        const flag = 'arixgear_px_purchase_' + o.no;
        const pxOn = !!(window.arixPixel && window.arixPixel.enabled);
        const gaOn = !!(window.arixGA && window.arixGA.enabled);
        if ((pxOn || gaOn) && o.no && o.total > 0 && !localStorage.getItem(flag)) {
          localStorage.setItem(flag, '1');
          if (pxOn) {
            fbTrackCtx('Purchase', {
              value: o.total,
              currency: 'BDT',
              content_type: 'product',
              content_ids: o.items.map((i) => i.id),
              contents: o.items.map((i) => ({ id: i.id, quantity: i.qty, item_price: i.price })),
              num_items: o.items.reduce((a, b) => a + b.qty, 0),
              order_id: o.no,
            }, o.no);
          } else {/*GA only — pixel off, analytics on: fire the purchase straight to GA4*/ gaTrack('purchase', { value: o.total, currency: 'BDT', transaction_id: o.no, items: o.items.map((i) => ({ item_id: i.id, quantity: i.qty, price: i.price })), }); } } } catch (e) { }
    };
    fire();
    /*initPixel() races this page on cold load — one guarded retry if the flag never landed*/
    const t = setTimeout(() => {
      try { if (!localStorage.getItem('arixgear_px_purchase_' + o.no)) fire(); } catch (e) {}
    }, 1500);
    return () => clearTimeout(t);
  }, [o && o.no]); /*eslint-disable-line react-hooks/exhaustive-deps*/

  /*---------- summary lines (legacy renderSuccess markup, React-escaped) ----------*/
  const lines = useMemo(() => {
    if (!o) return [];
    const eta = 'by ' + etaDate(o.raw && o.raw.eta ? o.raw.eta : Date.now() + 4 * 864e5);
    const arr = [
      ['Items', o.items.reduce((a, b) => a + b.qty, 0) + ' piece(s)'],
      ['Delivery', 'Standard — ' + eta],
      ['Shipping to', (o.name || '—') + ' · ' + (o.city || '—') + (o.division ? ' · ' + (DIV_LABELS[o.division] || o.division) : '')],
      mobPay
        ? ['Payment', (o.payLabel || 'Mobile payment') + (paidOnline
            ? (() => { const v = (o.raw && o.raw.payment && o.raw.payment.gateway && o.raw.payment.gateway.valId) || (o.txnId || ''); return v ? ' · paid — val_id ' + v : ' · paid'; })()
            : ' · TrxID ' + (o.txnId || '—'))]
        : ['Payment', 'Cash on Delivery'],
    ];
    if (o.statusLabel) arr.push(['Status', paidOnline && o.status === 'verifying' ? 'Processing' : o.statusLabel]);
    arr.push(['Total ' + (paidOnline ? 'paid' : mobPay ? 'sent' : 'due on delivery'), money(o.total)]);
    return arr;
  }, [o, mobPay, paidOnline]);

  const note = !o
    ? 'No recent order found — the rack is waiting.'
    : (paidOnline
      ? 'Payment received via ' + (o.payLabel || 'SSLCOMMERZ') + ' — your order is already in processing. Confirmation is on its way to ' + o.email + '. Track it anytime from My Account with your order number + phone.'
      : (mobPay
        ? 'We are verifying your ' + (o.payLabel || 'mobile') + ' payment — confirmation lands at ' + o.email + ' the moment it clears, usually within a few hours. Track the order anytime from My Account with your order number + phone.'
        : 'Confirmation is on its way to ' + o.email + '. Keep the cash ready — the courier collects on delivery.'));

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="max-w-[720px] mx-auto text-center border border-line bg-panel px-4 py-10 sm:px-8 sm:py-14 md:px-11 md:py-14 animate-slideUp">
          {/*ok-ring: animated draw check*/}
          <div className="w-[84px] h-[84px] mx-auto mb-6 rounded-full border-2 border-ok flex items-center justify-center animate-popIn">
            <svg viewBox="0 0 24 24" className="w-[34px] h-[34px] text-ok" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12.5l5 5L20 6.5" className="animate-draw" style={{ strokeDasharray: 60, strokeDashoffset: 60 }} />
            </svg>
          </div>
          <h2 className="font-disp uppercase leading-[.96] text-4xl md:text-[3.2rem]">ORDER <span className="text-outline">LOCKED IN</span></h2>
          <p id="succNo" className="font-disp text-3xl md:text-[2.4rem] text-acc tracking-[.02em] mt-2 mb-6">{o ? o.no : 'ARG-00000'}</p>

          <div id="succItems" className="flex gap-3 justify-center flex-wrap mb-7">
            {o && o.items.map((it, i) => {
              const p = BY_ID[it.id];
              return (
                <img key={i} src={(p && p.img) || it.image || ''} alt={it.name || ''} title={(it.name || '') + ' ×' + it.qty}
                  className="w-[58px] h-[58px] object-cover border border-line2" />
              );
            })}
          </div>

          <div id="succLines" className="grid gap-2 text-left border-y border-line py-5 px-1 mb-6">
            {lines.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-[.9rem] text-muted">
                <span>{k}</span><b className="text-txt text-right">{v}</b>
              </div>
            ))}
          </div>

          <p id="succNote" className="text-muted text-[.92rem] max-w-[46ch] mx-auto mb-8">{note}</p>

          <div className="flex flex-col gap-3 justify-center sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => go('shop')}
              className="w-full max-w-full whitespace-normal bg-acc text-black hover:bg-acc2 font-head font-extrabold uppercase tracking-[.2em] px-6 py-3 transition-colors sm:w-auto">Keep Loading the Cart</button>
            <button type="button" onClick={() => go('account')}
              className="w-full max-w-full whitespace-normal bg-transparent border border-line2 text-txt hover:border-acc hover:text-acc font-head font-extrabold uppercase tracking-[.2em] px-6 py-3 transition-colors sm:w-auto">View in My Account</button>
            {o && o.no ? (
              <button type="button" onClick={dlInvoice}
                className="w-full max-w-full whitespace-normal bg-transparent border border-line2 text-txt hover:border-acc hover:text-acc font-head font-extrabold uppercase tracking-[.2em] px-6 py-3 transition-colors sm:w-auto">⬇ Invoice PDF</button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
