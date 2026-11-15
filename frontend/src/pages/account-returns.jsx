/* ArixGear page — /account/returns (Phase 6b).
   RMA ledger across the account's orders (GET /orders/my/returns): status rail
   requested → approved → refunded (rejected shows the reason), items snapshot,
   refund amounts, and the flow guide for opening a new request. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { myReturns } from '../services/orders.js';
import { money } from '../lib/format.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AcctShell, Gate, RETURN_REASONS, btnPrimary, miniBtn, rmaTone, dFmt } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('account-returns', { title: 'Returns & Refunds — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const [items, setItems] = useState(null); /* null loading · [] none */

  useEffect(() => {
    let dead = false;
    myReturns()
      .then((d) => { if (!dead) setItems(d.items || []); })
      .catch(() => { if (!dead) setItems([]); });
    return () => { dead = true; };
  }, []);

  const reasonLab = (v) => {
    const hit = RETURN_REASONS.find(([k]) => k === v);
    return hit ? t(hit[1]) : v;
  };

  return (
    <Gate title="Returns & Refunds">
      <AcctShell active="/account/returns" title={t('Returns & Refunds')} lede={t('Delivered orders can be returned within 7 days — open the request from the order page, follow it here.')}>
        {/* flow guide */}
        <div className="mb-6 grid gap-2 sm:grid-cols-4" id="rmaGuide">
          {[
            [t('Requested'), t('Pickup arranged within 48h'), 'text-amber border-amber/40'],
            [t('Approved'), t('Parcel collected by courier'), 'text-acc border-acc/40'],
            [t('Refunded'), t('bKash / Nagad / bank in 3–7 days'), 'text-ok border-ok/40'],
            [t('Rejected'), t('Reason noted on the request'), 'text-red border-red/40'],
          ].map(([lab, sub, cls]) => (
            <div key={lab} className="border border-line bg-panel px-4 py-3">
              <p className={`border px-2 py-0.5 text-center font-cond text-[.7rem] font-bold uppercase tracking-[.2em] ${cls}`}>{lab}</p>
              <p className="mt-2 text-center text-[.78rem] text-muted">{sub}</p>
            </div>
          ))}
        </div>

        {items === null ? (
          <div className="h-40 animate-pulse border border-line bg-panel" />
        ) : items.length === 0 ? (
          <div className="border border-dashed border-line2 px-6 py-16 text-center text-muted">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('No return requests')}</h3>
            <p>{t('Delivered something wrong? Open a return from its order page — the 7-day window applies.')}</p>
            <Link to="/account/orders" className={`${btnPrimary} mt-6`}>{t('My Orders')}</Link>
          </div>
        ) : (
          <div id="rmaList">
            {items.map((r) => (
              <div key={r.id} className="mb-3.5 border border-line bg-panel">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-4">
                  <Link to={'/account/orders/' + encodeURIComponent(r.orderNumber)} className="font-disp text-[1.02rem] tracking-[.03em] text-acc transition-colors hover:text-acc2">
                    {r.orderNumber}
                  </Link>
                  <span className="font-cond text-[.78rem] uppercase tracking-[.18em] text-dim">{dFmt(r.createdAt)}</span>
                  <span className="border border-line2 px-2.5 py-1 font-cond text-[.72rem] uppercase tracking-[.2em] text-muted">{reasonLab(r.reason)}</span>
                  <span className={`ml-auto border px-2.5 py-1 font-cond font-bold text-[.72rem] uppercase tracking-[.22em] ${rmaTone(r.status)}`}>
                    {t(r.status.charAt(0).toUpperCase() + r.status.slice(1))}
                  </span>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[.85rem] text-muted">
                    {r.items.map((i) => `${i.name} ×${i.qty}`).join(' · ')}
                  </p>
                  {r.note ? <p className="mt-2 text-[.82rem] text-dim">“{r.note}”</p> : null}
                  {r.status === 'rejected' && r.resolveNote ? (
                    <p className="mt-2 border-l-2 border-red/50 bg-red/5 px-3 py-2 text-[.82rem] text-red">{t('Reason')} — {r.resolveNote}</p>
                  ) : null}
                  {r.status === 'refunded' && r.refundAmount ? (
                    <p className="mt-2 text-[.85rem] text-ok">{t('Refunded')} · <b className="font-disp">{money(r.refundAmount)}</b></p>
                  ) : null}
                </div>
                <div className="border-t border-line px-5 py-3">
                  <Link to={'/account/orders/' + encodeURIComponent(r.orderNumber)} className="font-cond text-[.78rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-acc">
                    {t('Open the order')} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-4 text-[.85rem] text-muted">
          <span>{t('Policy questions?')}</span>
          <Link to="/policies/returns" className={miniBtn}>{t('Returns Policy')}</Link>
          <Link to="/contact" className={miniBtn}>{t('Contact')}</Link>
        </div>
      </AcctShell>
    </Gate>
  );
}
