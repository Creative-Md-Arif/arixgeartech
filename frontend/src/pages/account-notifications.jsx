/* ArixGear page — /account/notifications (Phase 6b).
   In-app bell history as a full page (latest 30, live unread count): order /
   return / warranty events pushed by the backend notifier. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as notif from '../services/notifications.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AcctShell, Gate, miniBtn, dFmt } from '../components/accountKit.jsx';

const TONE = {
  order: 'text-acc border-acc/40',
  cancel: 'text-red border-red/40',
  return: 'text-amber border-amber/40',
  warranty: 'text-ok border-ok/40',
  ticket: 'text-acc border-acc/40',
};

export default function Page() {
  useSEO('account-notifications', { title: 'Notifications — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const [items, setItems] = useState(null); /* null loading */
  const [unread, setUnread] = useState(0);

  const load = () => {
    notif.list()
      .then((d) => { setItems(d.items || []); setUnread(d.unread || 0); })
      .catch(() => { setItems([]); setUnread(0); });
  };
  useEffect(load, []);

  const readAll = () => {
    notif.markAllRead()
      .then(() => load())
      .catch(() => {});
  };
  const readOne = (id) => {
    notif.markRead(id)
      .then(() => load())
      .catch(() => {});
  };

  /* notification.link rides the admin path (e.g. /admin/orders) — strip it for
     customers: the row links to the matching storefront surface instead */
  const href = (n) => {
    if (n.type === 'order' || n.type === 'cancel') return '/account/orders';
    if (n.type === 'return') return '/account/returns';
    if (n.type === 'warranty') return '/product-registration';
    if (n.type === 'ticket') return '/contact';
    return '';
  };

  return (
    <Gate title="Notifications">
      <AcctShell active="/account/notifications" title={t('Notifications')} lede={t('Order, return and warranty events — the same feed the header bell watches, in full.')}>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="font-cond text-[.8rem] uppercase tracking-[.22em] text-dim">
            {unread > 0 ? <b className="text-acc">{unread} {t('unread')}</b> : t('All read')}
          </span>
          {unread > 0 ? <button className={miniBtn} onClick={readAll}>{t('Mark all read')}</button> : null}
        </div>

        {items === null ? (
          <div className="h-40 animate-pulse border border-line bg-panel" />
        ) : items.length === 0 ? (
          <div className="border border-dashed border-line2 px-6 py-16 text-center text-muted">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('Nothing here yet')}</h3>
            <p>{t('Place an order or register a warranty — events land here the moment they happen.')}</p>
            <Link to="/shop" className={`${miniBtn} mt-6 inline-flex`}>{t('Shop the Catalog')}</Link>
          </div>
        ) : (
          <div id="notifList">
            {items.map((n) => {
              const to = href(n);
              const inner = (
                <>
                  <span className={`border px-2 py-0.5 font-cond text-[.68rem] uppercase tracking-[.2em] ${TONE[n.type] || 'text-muted border-line2'}`}>
                    {t(n.type ? n.type.charAt(0).toUpperCase() + n.type.slice(1) : 'Event')}
                  </span>
                  <span className={'min-w-0 flex-1 truncate ' + (n.read ? 'text-muted' : 'font-semibold text-txt')}>
                    {n.title}
                  </span>
                  <span className="flex-none text-[.75rem] text-dim">{dFmt(n.createdAt)}</span>
                  {!n.read ? <i className="not-italic h-2 w-2 flex-none rounded-full bg-acc" aria-label="unread" /> : null}
                </>
              );
              return (
                <div key={n.id || n._id} className={'mb-2.5 border px-4 py-3.5 transition-colors ' + (n.read ? 'border-line bg-panel' : 'border-line2 bg-panel')}>
                  <div className="flex items-center gap-3">
                    {to ? (
                      <Link to={to} className="flex min-w-0 flex-1 flex-wrap items-center gap-3" onClick={() => { if (!n.read) readOne(n.id || n._id); }}>
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3" onClick={() => { if (!n.read) readOne(n.id || n._id); }} role="button" tabIndex={0}>
                        {inner}
                      </div>
                    )}
                  </div>
                  {n.body ? <p className="mt-1.5 pl-1 text-[.82rem] text-muted">{n.body}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </AcctShell>
    </Gate>
  );
}
