/* ArixGear page — /brands (Phase 6d).
   Brand directory: every active brand with its live product count, filterable
   by name, linking into the routed brand stores. Featured strip first. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBrands } from '../services/brands.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('brands', {
    title: 'Brand Directory — arixgear.tech',
    description: 'Every official brand store on arixgear.tech — genuine imports, live product counts, warranty-backed, nationwide delivery.',
  });
  const { t, isBn } = useLang();
  const [rows, setRows] = useState(null); /* null loading · [] none */
  const [q, setQ] = useState('');

  useEffect(() => {
    let dead = false;
    listBrands()
      .then((d) => { if (!dead) setRows(d.brands || d.items || []); })
      .catch(() => { if (!dead) setRows([]); });
    return () => { dead = true; };
  }, []);

  const norm = (s) => String(s || '').toLowerCase();
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return rows || [];
    return (rows || []).filter((b) => norm(b.name).includes(needle) || norm(b.desc).includes(needle));
  }, [rows, q]);

  const featured = filtered.filter((b) => b.featured);
  const rest = filtered.filter((b) => !b.featured);

  const Card = ({ b }) => (
    <Link
      to={'/brand/' + encodeURIComponent(b.slug)}
      className="group flex flex-col border border-line bg-panel px-5 py-5 transition duration-200 hover:border-line2"
    >
      <div className="flex min-h-[56px] items-center gap-4">
        {b.logo ? (
          <img src={b.logo} alt={b.name + ' logo'} className="h-10 w-[120px] object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : null}
        <span className="font-disp text-[1.15rem] uppercase tracking-[.02em] text-txt group-hover:text-acc transition-colors">{b.name}</span>
      </div>
      {b.desc ? <p className="mt-3 line-clamp-2 text-[.82rem] leading-relaxed text-muted">{b.desc}</p> : null}
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="font-cond text-[.75rem] uppercase tracking-[.2em] text-dim">
          {b.products != null ? <><b className="text-acc">{b.products}</b> {t('products')}</> : t('Official store')}
        </span>
        <span className="font-cond text-[.78rem] uppercase tracking-[.2em] text-acc transition-transform duration-200 group-hover:translate-x-1">{t('Visit store')} →</span>
      </div>
    </Link>
  );

  return (
    <section id="page-brands" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <Eyebrow>{t('OFFICIAL LINEUP')}</Eyebrow>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('Brand Directory')}
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('Every brand we stock, one store each — genuine panels, official warranties, live counts straight from the catalog.')}
          </p>
        </div>

        {/* name filter */}
        <div className="mt-8 flex items-center gap-[.6rem] border border-line bg-panel px-[.9rem] py-[.7rem] ring-1 ring-inset ring-line2 focus-within:ring-acc sm:max-w-md">
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] flex-none fill-none stroke-[2] stroke-dim"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            id="brandFilter" type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('Filter brands — ASUS, Lenovo, HP…')}
            aria-label="Filter brands"
            className="w-full border-0 bg-transparent text-[.9rem] text-txt outline-none placeholder:text-dim"
          />
        </div>

        {rows === null ? (
          <div className="mt-10 grid gap-[.7rem] sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-40 animate-pulse border border-line bg-panel" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-10 border border-dashed border-line2 px-6 py-16 text-center text-muted">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('No brand matched')}</h3>
            <p>{t('Try fewer letters — or browse the full catalog instead.')}</p>
            <Link to="/shop" className={`${miniBtn} mt-6 inline-flex`}>{t('Shop All')}</Link>
          </div>
        ) : (
          <div className="mt-10">
            {featured.length ? (
              <>
                <h3 className="mb-4 flex items-center gap-3 font-disp text-[1.2rem] uppercase text-txt">
                  <i className="not-italic inline-block h-0.5 w-7 bg-acc" />{t('Featured Stores')}
                </h3>
                <div className="grid gap-[.7rem] sm:grid-cols-2 lg:grid-cols-3" id="brandFeatured">
                  {featured.map((b) => <Card key={'f-' + b.slug} b={b} />)}
                </div>
              </>
            ) : null}
            {rest.length ? (
              <>
                {featured.length ? <h3 className="mb-4 mt-10 flex items-center gap-3 font-disp text-[1.2rem] uppercase text-txt"><i className="not-italic inline-block h-0.5 w-7 bg-acc" />{t('All Brands')}</h3> : null}
                <div className="grid gap-[.7rem] sm:grid-cols-2 lg:grid-cols-3" id="brandGrid">
                  {rest.map((b) => <Card key={b.slug} b={b} />)}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
