import { Link } from 'react-router-dom';
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('featured', {
    title: 'Featured Tech — arixgear.tech',
    description: 'Hand-picked laptops, monitors and gear the arixgear.tech desk actually recommends — the featured flag, enforced server-side.',
  });
  const { t } = useLang();
  return (
    <section id="page-featured" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <Eyebrow>{t('STAFF PICKS')}</Eyebrow>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('Featured Tech')}
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('The picks the desk stands behind — the featured flag rides the server query, so nothing here is a paid slot.')}
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-3 text-[.85rem] text-muted">
            <span>{t('More discovery:')}</span>
            <Link to="/new-arrivals" className={miniBtn}>{t('New Arrivals')}</Link>
            <Link to="/best-sellers" className={miniBtn}>{t('Best Sellers')}</Link>
          </p>
        </div>

        <div className="mt-10">
          <CatalogBrowser id="featuredTech" pinned={{ featured: true }} emptyTitle="Nothing Flagged Right Now" emptyBody="The featured shelf reshuffles as stock moves — check back soon." />
        </div>
      </div>
    </section>
  );
}
