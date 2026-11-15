/* ArixGear page — shop all (Phase 6a: the engine moved to CatalogBrowser).
   Server-driven catalog: every filter change queries /api/products with
   pagination — no client mirror. Deep links: ?cat=slug (multi: ?cat=a,b). */
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  useSEO('shop');
  const { t } = useLang();
  return (
    <section id="page-shop" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            The Full Catalog
          </p>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('SHOP')} <span className="text-outline">{t('ALL')}</span>
          </h2>
        </div>
        <div className="mt-10">
          <CatalogBrowser id="shop" />
        </div>
      </div>
    </section>
  );
}
