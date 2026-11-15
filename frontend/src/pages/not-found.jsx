/* ArixGear page — branded 404 (performance pack 2f).
   Unknown URLs used to silently bounce home; now they get a proper branded
   404 with the site's best sellers as suggested products — keeps ad traffic
   (and confused humans) instead of losing them. */
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { useSEO, NF_SEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

export default function NotFoundPage() {
  useSEO('not-found', NF_SEO);
  const { PRODUCTS } = useCatalog();
  const { t } = useLang();
  /* suggested: best sellers first (fallback to whatever the rack has) */
  const picks = [...PRODUCTS].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 4);

  return (
    <section id="page-404" className="page py-16 lg:py-24" data-testid="notFound">
      <div className="container mx-auto w-[92%]">
        <div className="border border-line bg-panel px-6 py-14 text-center md:px-12 md:py-20">
          <p className="eyebrow flex items-center justify-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('Wrong Door')}
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
          </p>
          <h1 className="mt-5 font-disp uppercase leading-[.9] text-[clamp(4.5rem,16vw,11rem)]">
            4<span className="text-acc">0</span>4
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-[.95rem] leading-[1.7] text-muted">
            {t('This page is gone — the link changed or the address has a typo. No problem: start with the best-sellers below, or head straight back to the rack.')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/shop" className="border border-acc bg-acc px-8 py-3.5 font-cond text-[.9rem] font-bold uppercase tracking-[.24em] text-black transition duration-200 hover:bg-acc2">
              {t('Browse the Shop')}
            </Link>
            <Link to="/" className="border border-line2 px-8 py-3.5 font-cond text-[.9rem] font-bold uppercase tracking-[.24em] text-silver transition duration-200 hover:border-acc hover:text-acc">
              {t('Back Home')}
            </Link>
          </div>
        </div>

        {picks.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 flex items-center gap-3 font-disp text-[1.5rem] uppercase tracking-[.02em]">
              <span className="h-[3px] w-8 bg-acc" /> {t('Lifters Also Buy')}
            </h2>
            <div className="grid grid-cols-2 gap-[.7rem] md:grid-cols-4 lg:gap-[1.15rem]" id="nfGrid">
              {picks.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
