/* ArixGear page — /search?q= (Phase 6a).
   Full-page search: the query lives in the URL (shareable deep links),
   the shared CatalogBrowser drives the server query with two-way ?q= sync. */
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

export default function Page() {
  const { t } = useLang();
  useSEO('shop', {
    title: 'Search — arixgear.tech',
    description: 'Search the full arixgear.tech catalog — laptops, monitors, components and accessories with BDT prices.',
  });

  return (
    <section id="page-search" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('FIND YOUR GEAR')}
          </p>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('SEARCH')} <span className="text-outline">{t('THE CATALOG')}</span>
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('Model numbers, specs, brands — the whole catalog is one query away.')}
          </p>
        </div>
        <div className="mt-10">
          <CatalogBrowser id="search" syncQ autoFocusSearch />
        </div>
      </div>
    </section>
  );
}
