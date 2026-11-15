/* ArixGear page — /service-center (Phase 6d).
   Walk-in network: active centers from GET /service/centers grouped by city,
   plus the two self-service paths (warranty registration, ticket desk). */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCenters } from '../services/service.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn, btnPrimary } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('service-center', {
    title: 'Service Centers — arixgear.tech',
    description: 'Walk-in service centers for arixgear.tech customers — diagnostics, repairs and warranty claims, addresses and hours by city.',
  });
  const { t } = useLang();
  const [centers, setCenters] = useState(null); /* null loading · [] none */

  useEffect(() => {
    let dead = false;
    listCenters()
      .then((d) => { if (!dead) setCenters(d.items || []); })
      .catch(() => { if (!dead) setCenters([]); });
    return () => { dead = true; };
  }, []);

  /* group by city — walk-in pages read city-first in Bangladesh */
  const byCity = useMemo(() => {
    const map = new Map();
    (centers || []).forEach((c) => {
      const k = c.city || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    });
    return [...map.entries()];
  }, [centers]);

  return (
    <section id="page-service-center" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%] max-w-6xl">
        <div className="page-head">
          <Eyebrow>{t('AFTER-SALES NETWORK')}</Eyebrow>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('Service Centers')}
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('Walk-in points for diagnostics and repairs — warranty claims run faster with an ARG-W registration in hand.')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/product-registration" className={btnPrimary}>{t('Register a warranty')}</Link>
            <Link to="/contact" className={miniBtn}>{t('Open a ticket instead')}</Link>
          </div>
        </div>

        {centers === null ? (
          <div className="mt-10 grid gap-[.7rem] md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse border border-line bg-panel" />)}
          </div>
        ) : centers.length === 0 ? (
          <div className="mt-10 border border-dashed border-line2 px-6 py-16 text-center text-muted">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('No centers listed yet')}</h3>
            <p>{t('The network is growing — meanwhile the ticket desk handles everything remotely.')}</p>
            <Link to="/contact" className={`${btnPrimary} mt-6`}>{t('Contact the Desk')}</Link>
          </div>
        ) : (
          <div className="mt-10">
            {byCity.map(([city, rows]) => (
              <div key={city} className="mb-9">
                <h3 className="mb-4 flex items-center gap-3 font-disp text-[1.25rem] uppercase text-txt">
                  <i className="not-italic inline-block h-0.5 w-7 bg-acc" />{city}
                </h3>
                <div className="grid gap-[.7rem] md:grid-cols-2">
                  {rows.map((c) => (
                    <div key={c.id} className="border border-line bg-panel px-5 py-5" id={'center-' + (c.id || '')}>
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                        <p className="font-disp text-[1.05rem] text-txt">{c.name}</p>
                        {c.mapUrl ? (
                          <a href={c.mapUrl} target="_blank" rel="noreferrer" className="ml-auto font-cond text-[.72rem] uppercase tracking-[.2em] text-acc hover:text-acc2">
                            {t('Map')} ↗
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[.88rem] leading-relaxed text-muted">{c.address}</p>
                      <p className="mt-2 text-[.82rem] text-muted">
                        <span className="text-dim">{t('Hours')}:</span> {c.hours}
                      </p>
                      <p className="mt-1 text-[.82rem] text-muted">
                        <span className="text-dim">{t('Phone')}:</span> <a href={'tel:' + String(c.phone).replace(/\s/g, '')} className="text-txt transition-colors hover:text-acc">{c.phone}</a>
                        {c.email ? <> · <a href={'mailto:' + c.email} className="text-txt transition-colors hover:text-acc">{c.email}</a></> : null}
                      </p>
                      {c.services && c.services.length ? (
                        <p className="mt-3 flex flex-wrap gap-2">
                          {c.services.map((s) => (
                            <span key={s} className="border border-line2 px-2 py-0.5 font-cond text-[.7rem] uppercase tracking-[.18em] text-muted">{s}</span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-8 text-[.85rem] text-muted">
          <span>{t('Paperwork:')}</span>
          <Link to="/policies/warranty" className={miniBtn}>{t('Warranty Policy')}</Link>
          <Link to="/product-registration" className={miniBtn}>{t('Product Registration')}</Link>
          <Link to="/faq" className={miniBtn}>{t('FAQ')}</Link>
        </div>
      </div>
    </section>
  );
}
