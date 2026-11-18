/* ArixGear page — /category/:slug (Phase 6a).
   One page per catalog branch: breadcrumb, bilingual title, live branch count,
   child-category narrowing chips and the shared server-driven CatalogBrowser.
   Unknown slugs get an honest "not in the catalog" panel, not a dead 404. */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import { useContent } from '../store/content.jsx';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

export default function Page() {
  const { slug } = useParams();
  const { catTree, catTreeReady, catTreeError, refreshCategoryTree } = useContent();
  const { t, isBn } = useLang();

  /* Resolve any depth in the live tree and retain every breadcrumb ancestor. */
  const cat = useMemo(() => {
    if (!catTreeReady) return undefined;
    const find = (nodes, ancestors = []) => {
      for (const node of nodes || []) {
        if (node.slug === slug) return { ...node, ancestors };
        const found = find(node.children, [...ancestors, node]);
        if (found) return found;
      }
      return null;
    };
    const found = find(catTree || []);
    if (found) return found;
    return null; // known tree, unknown slug → honest miss
  }, [catTree, catTreeReady, slug]);

  const label = cat && cat.name ? (isBn && cat.nameBn ? cat.nameBn : cat.name) : '';

  useSEO('shop', cat ? {
    title: label ? label + ' — Buy ' + cat.name + ' Online in Bangladesh' : '',
    description: cat.productCount
      ? 'Shop ' + cat.name + ' at arixgear.tech — ' + cat.productCount + ' products with warranty, best BDT prices and delivery across all 8 divisions.'
      : undefined,
  } : null);

  /* tree still landing → skeleton */
  if (cat === undefined) {
    return (
      <section className="page py-16 lg:py-24">
        <div className="container mx-auto w-[92%]">
          <div className="h-3 w-40 animate-pulse bg-line/60" />
          <div className="mt-6 h-12 w-80 max-w-full animate-pulse bg-line/40" />
        </div>
      </section>
    );
  }

  if (!cat && catTreeError) {
    return (
      <section className="page py-16 lg:py-24">
        <div className="container mx-auto w-[92%]">
          <div className="border border-dashed border-line2 px-8 py-16 text-center" role="alert" data-testid="categoryLoadError">
            <h2 className="font-disp text-[2rem] uppercase text-txt">Categories unavailable</h2>
            <p className="mt-3 text-muted">The category tree could not be loaded. Check your connection and try again.</p>
            <button type="button" onClick={refreshCategoryTree} className="mt-6 border border-line2 px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-acc">Try again</button>
          </div>
        </div>
      </section>
    );
  }

  /* unknown slug → honest panel */
  if (!cat) {
    return (
      <section className="page py-16 lg:py-24">
        <div className="container mx-auto w-[92%]">
          <div className="border border-dashed border-line2 px-8 py-16 text-center">
            <p className="eyebrow font-cond text-[.82rem] font-semibold uppercase tracking-[.4em] text-acc">404 · Category</p>
            <h2 className="mt-4 font-disp text-[2.2rem] uppercase text-txt">Not in the catalog</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">
              {t('No category called')} &ldquo;{slug}&rdquo;. {t('Browse the full catalog instead — every branch is one click away.')}
            </p>
            <Link to="/shop" className="mt-6 inline-block bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2">
              {t('Shop All')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="page-category" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        {/* breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 font-cond text-[.8rem] uppercase tracking-[.18em] text-dim" aria-label="Breadcrumb">
          <Link to="/" className="transition-colors hover:text-acc">{t('Home')}</Link>
          <span>/</span>
          {(cat.ancestors || []).map((ancestor) => (
            <span key={ancestor.slug} className="contents">
              <Link to={'/category/' + encodeURIComponent(ancestor.slug)} className="transition-colors hover:text-acc">{isBn && ancestor.nameBn ? ancestor.nameBn : t(ancestor.name)}</Link>
              <span>/</span>
            </span>
          ))}
          <span className="text-silver">{label}</span>
        </nav>

        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('CATEGORY')}
          </p>
          <div className="mt-[1.1rem] flex flex-wrap items-end gap-x-6 gap-y-3">
            <h2 className="sec-title font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
              {label}
            </h2>
            {cat.productCount != null && cat.productCount > 0 ? (
              <span className="mb-2 border border-line2 px-3 py-1 font-cond text-[.8rem] uppercase tracking-[.2em] text-muted">
                {cat.productCount} {t('products')}
              </span>
            ) : null}
          </div>
          {cat.desc ? <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">{cat.desc}</p> : null}
        </div>

        <div className="mt-10">
          <CatalogBrowser
            id="category"
            fixedCats={[slug]}
            subChips={(cat.children || []).map((c) => ({ slug: c.slug, name: c.name, nameBn: c.nameBn }))}
            emptyTitle="Nothing In This Category Yet"
            emptyBody="New stock lands weekly — check the flash sale or browse another branch."
          />
        </div>
      </div>
    </section>
  );
}
