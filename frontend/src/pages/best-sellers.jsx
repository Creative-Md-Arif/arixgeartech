import { Link } from 'react-router-dom';
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('best-sellers', {
    title: 'Best Sellers — arixgear.tech',
    description: 'What Bangladesh keeps buying from arixgear.tech — the catalog ranked by units sold, updated live from real orders.',
  });
  const { t } = useLang();
  return (
    <section id="page-best-sellers" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <Eyebrow>{t('PROVEN GEAR')}</Eyebrow>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('Best Sellers')}
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('Ranked by units actually sold — the live order ledger does the ranking, refreshed every load.')}
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-3 text-[.85rem] text-muted">
            <span>{t('Need ideas?')}</span>
            <Link to="/guides" className={miniBtn}>{t('Buying Guides')}</Link>
            <Link to="/featured" className={miniBtn}>{t('Featured Tech')}</Link>
          </p>
        </div>

        <div className="mt-10">
          <CatalogBrowser id="bestSellers" lockSort="popular" showMax={false} />
        </div>
      </div>
    </section>
  );
}
