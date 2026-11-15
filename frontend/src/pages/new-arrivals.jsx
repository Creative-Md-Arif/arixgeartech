/* ArixGear page — /new-arrivals (Phase 6d).
   Discovery shelf on the shared CatalogBrowser, sort locked to NEWEST FIRST —
   the server's createdAt ordering, no client curation. */
import { Link } from 'react-router-dom';
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('new-arrivals', {
    title: 'New Arrivals — arixgear.tech',
    description: 'The freshest laptops, monitors, components and gear at arixgear.tech — newest catalog additions first, server-driven.',
  });
  const { t } = useLang();
  return (
    <section id="page-new-arrivals" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <Eyebrow>{t('JUST LANDED')}</Eyebrow>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('New Arrivals')}
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('Every new catalog addition, straight from the server — no manual curation, sort locked to newest first.')}
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-3 text-[.85rem] text-muted">
            <span>{t('Hunting a bargain?')}</span>
            <Link to="/deals" className={miniBtn}>{t('Offers & Deals')}</Link>
            <Link to="/best-sellers" className={miniBtn}>{t('Best Sellers')}</Link>
          </p>
        </div>

        <div className="mt-10">
          <CatalogBrowser id="newArrivals" lockSort="newest" showMax={false} />
        </div>
      </div>
    </section>
  );
}
