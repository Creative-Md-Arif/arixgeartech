/* ArixGear page — /brand/:slug (Phase 6a).
   Brand store: logo, name, live product count and the shared server-driven
   CatalogBrowser pinned to the brand. Unknown slugs get an honest miss panel. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { getBrand } from '../services/brands.js';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

export default function Page() {
  const { slug } = useParams();
  const { t } = useLang();
  /* undefined = loading · null = unknown brand · object = live brand */
  const [brand, setBrand] = useState(undefined);

  useEffect(() => {
    let dead = false;
    setBrand(undefined);
    getBrand(slug)
      .then((d) => { if (!dead) setBrand(d && d.brand ? d.brand : null); })
      .catch(() => { if (!dead) setBrand(null); });
    return () => { dead = true; };
  }, [slug]);

  useSEO('shop', brand ? {
    title: brand.name + ' — Official Store in Bangladesh',
    description: brand.products
      ? 'Shop genuine ' + brand.name + ' laptops, monitors and gear at arixgear.tech — ' + brand.products + ' products, warranty and nationwide delivery.'
      : undefined,
  } : null);

  if (brand === undefined) {
    return (
      <section className="page py-16 lg:py-24">
        <div className="container mx-auto w-[92%]">
          <div className="h-3 w-40 animate-pulse bg-line/60" />
          <div className="mt-6 h-12 w-72 max-w-full animate-pulse bg-line/40" />
        </div>
      </section>
    );
  }

  if (!brand) {
    return (
      <section className="page py-16 lg:py-24">
        <div className="container mx-auto w-[92%]">
          <div className="border border-dashed border-line2 px-8 py-16 text-center">
            <p className="eyebrow font-cond text-[.82rem] font-semibold uppercase tracking-[.4em] text-acc">404 · Brand</p>
            <h2 className="mt-4 font-disp text-[2.2rem] uppercase text-txt">Brand not found</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">
              {t('No brand called')} &ldquo;{slug}&rdquo; {t('in our lineup yet — the directory lists every official store.')}
            </p>
            <Link to="/brands" className="mt-6 inline-block bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2">
              {t('Brand Directory')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="page-brand" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <nav className="mb-6 flex items-center gap-2 font-cond text-[.8rem] uppercase tracking-[.18em] text-dim" aria-label="Breadcrumb">
          <Link to="/" className="transition-colors hover:text-acc">{t('Home')}</Link>
          <span>/</span>
          <Link to="/brands" className="transition-colors hover:text-acc">{t('Brands')}</Link>
          <span>/</span>
          <span className="text-silver">{brand.name}</span>
        </nav>

        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('OFFICIAL BRAND STORE')}
          </p>
          <div className="mt-[1.1rem] flex flex-wrap items-center gap-x-6 gap-y-4">
            {brand.logo ? (
              <img
                src={brand.logo}
                alt={brand.name + ' logo'}
                className="h-14 w-[180px] object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : null}
            <h2 className="sec-title font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
              {brand.name}
            </h2>
            {brand.products != null && brand.products > 0 ? (
              <span className="mb-2 border border-line2 px-3 py-1 font-cond text-[.8rem] uppercase tracking-[.2em] text-muted">
                {brand.products} {t('products')}
              </span>
            ) : null}
          </div>
          {brand.desc ? <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">{brand.desc}</p> : null}
        </div>

        <div className="mt-10">
          <CatalogBrowser
            id="brand"
            fixedBrands={[slug]}
            emptyTitle="Nothing From This Brand Yet"
            emptyBody="Fresh drops land weekly — or browse another brand from the directory."
          />
        </div>
      </div>
    </section>
  );
}
