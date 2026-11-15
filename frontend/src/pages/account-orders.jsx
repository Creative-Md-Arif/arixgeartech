/* ArixGear page — /account/orders (Phase 6b).
   Routed order history: JWT /orders/my, adapted rows, status chips, thumbnails
   from the catalog mirror, invoice + detail deep links. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { myOrders, downloadInvoice } from '../services/orders.js';
import { adaptOrder, money, STATUS_LABELS, DIV_LABELS } from '../lib/format.js';
import { useStore } from '../store/store.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AcctShell, Gate, btnPrimary, miniBtn, stTone, dFmt } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('account-orders', { title: 'My Orders — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { toast } = useUI();
  const { BY_ID } = useCatalog();
  const { session } = useStore();
  const [orders, setOrders] = useState(null); /* null = loading · [] = none */
  const [invBusy, setInvBusy] = useState('');

  useEffect(() => {
    if (!session?.token) return;
    let dead = false;
    myOrders()
      .then((d) => { if (!dead) setOrders((d.items || []).map(adaptOrder)); })
      .catch(() => { if (!dead) setOrders([]); });
    return () => { dead = true; };
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const invoice = (no) => {
    setInvBusy(no);
    downloadInvoice(no)
      .then(() => toast(t('Invoice downloading'), 'ARG-' + no + '.pdf saved to your device.'))
      .catch((e) => toast(t('Invoice failed'), e.message || t('Try again in a moment.')))
      .finally(() => setInvBusy(''));
  };

  return (
    <Gate title="My Orders">
      <AcctShell active="/account/orders" title={t('My Orders')} lede={t('Every order placed with this account — live status, invoices and one-tap re-tracking.')}>
        {orders === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse border border-line bg-panel" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="border border-dashed border-line2 px-6 py-16 text-center text-muted">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('No orders yet')}</h3>
            <p>{t('Your first rig, monitor or peripheral lands here the moment checkout completes.')}</p>
            <Link to="/shop" className={`${btnPrimary} mt-6`}>{t('Shop the Catalog')}</Link>
          </div>
        ) : (
          <div id="ordList">
            {orders.map((o) => (
              <div key={o.no} className="mb-3.5 border border-line bg-panel">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
                  <Link to={'/account/orders/' + encodeURIComponent(o.no)} className="font-disp text-[1.05rem] tracking-[.03em] text-acc transition-colors hover:text-acc2">
                    {o.no}
                  </Link>
                  <span className="font-cond text-[.78rem] uppercase tracking-[.18em] text-dim">{dFmt(o.date)}</span>
                  <span className={`ml-auto border px-2.5 py-1 font-cond font-bold text-[.72rem] uppercase tracking-[.22em] ${stTone(o.status)}`}>
                    {o.statusLabel || STATUS_LABELS[o.status] || o.status}
                  </span>
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
                  <span>{DIV_LABELS[o.division] || o.division || t('Delivery')} · {o.payLabel}</span>
                  <b className="ml-auto font-disp text-[1.05rem] text-txt">{money(o.total)}</b>
                  <span className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <Link to={'/account/orders/' + encodeURIComponent(o.no)} className={`${miniBtn} flex-1 text-center sm:flex-none`}>{t('Details')}</Link>
                    <button type="button" className={`${miniBtn} flex-1 text-center sm:flex-none`} disabled={invBusy === o.no} onClick={() => invoice(o.no)}>
                      {invBusy === o.no ? t('…') : t('Invoice')}
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AcctShell>
    </Gate>
  );
}
