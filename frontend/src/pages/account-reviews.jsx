import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMine } from '../services/reviews.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import Stars from '../components/Stars.jsx';
import { AcctShell, Gate, btnPrimary, dFmt } from '../components/accountKit.jsx';

const imgFallback = (e) => { e.currentTarget.style.display = 'none'; };

export default function Page() {
  useSEO('account-reviews', { title: 'My Reviews — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const [items, setItems] = useState(null);

  useEffect(() => {
    let dead = false;
    listMine()
      .then((d) => { if (!dead) setItems(d.items || []); })
      .catch(() => { if (!dead) setItems([]); });
    return () => { dead = true; };
  }, []);

  return (
    <Gate title="My Reviews">
      <AcctShell active="/account/reviews" title={t('My Reviews')} lede={t('Reviews land unapproved and go live after moderation — verified-purchase badges are added automatically when the order is delivered.')}>
        {items === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse border border-line bg-panel" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-line2 px-6 py-16 text-center text-muted">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('No reviews written yet')}</h3>
            <p>{t('Rate the gear you own — your verdict steers the next buyer.')}</p>
            <Link to="/shop" className={`${btnPrimary} mt-6`}>{t('Shop the Catalog')}</Link>
          </div>
        ) : (
          <div id="revList">
            {items.map((r) => (
              <div key={r.id} className="mb-3.5 border border-line bg-panel px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {r.product && r.product.image ? (
                    <img src={r.product.image} alt={r.product && r.product.name} className="h-12 w-12 flex-none border border-line2 object-cover" onError={imgFallback} />
                  ) : null}
                  <div className="min-w-0">
                    {r.product ? (
                      <Link to={'/product/' + encodeURIComponent(r.product.slug)} className="block truncate text-[.92rem] font-semibold text-txt transition-colors hover:text-acc">
                        {r.product.name}
                      </Link>
                    ) : (
                      <span className="text-[.92rem] text-muted">{t('Product removed from catalog')}</span>
                    )}
                    <div className="mt-1 flex items-center gap-3">
                      <Stars rating={r.rating} />
                      <span className="text-[.75rem] text-dim">{dFmt(r.createdAt)}</span>
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    {r.verified ? (
                      <span className="border border-ok/40 px-2 py-0.5 font-cond text-[.68rem] uppercase tracking-[.2em] text-ok">{t('Verified purchase')}</span>
                    ) : null}
                    <span className={'border px-2 py-0.5 font-cond text-[.68rem] uppercase tracking-[.2em] ' + (r.approved ? 'border-ok/40 text-ok' : 'border-amber/40 text-amber')}>
                      {r.approved ? t('Published') : t('Awaiting moderation')}
                    </span>
                    <span className="border border-line2 px-2 py-0.5 font-cond text-[.68rem] uppercase tracking-[.2em] text-muted">
                      ♡ {r.helpfulCount}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[.9rem] leading-relaxed text-muted">{r.comment}</p>
                {r.reply ? (
                  <div className="mt-3 border-l-2 border-acc bg-acc/5 px-4 py-3">
                    <p className="font-cond text-[.7rem] uppercase tracking-[.22em] text-acc">{t('Store reply')} {r.reply.by ? `· ${r.reply.by}` : ''}</p>
                    <p className="mt-1 text-[.85rem] leading-relaxed text-muted">{r.reply.text}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </AcctShell>
    </Gate>
  );
}
