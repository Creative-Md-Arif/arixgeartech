/* Shared server-driven catalog controls and facets for listing pages.
   Parent pages own the page shell; this component owns filters, grid, empty state and pagination. */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import { useCatalog, adaptOne } from '../store/catalog.jsx';
import { listProducts, getFilters } from '../services/products.js';
import { money } from '../lib/format.js';
import { fbTrack } from '../lib/pixel.js';
import { useLang } from '../lib/i18n.jsx';
import { useContent } from '../store/content.jsx';
import { CardSkeleton } from './Skeleton.jsx';

const DEFAULT_LIMIT = 12;
const PAGE_SIZES = [12, 20, 40];

export default function CatalogBrowser({
  fixedCats = [],
  fixedBrands = [],
  initial = {},
  lockSort = null,
  pinned = null,
  syncQ = false,
  subChips = null,
  showSearch = true,
  autoFocusSearch = false,
  showMax = true,
  showCats = true,
  showBrands = true,
  searchPlaceholder,
  id = 'catalogBrowser',
  emptyTitle = 'Nothing Matched That Filter',
  emptyBody = 'Loosen the search or price cap — the catalog goes deeper than this.',
}) {
  const { t, isBn } = useLang();
  const { CAT_OBJS } = useCatalog();
  const { catTree } = useContent();
  /* The tree endpoint includes child categories; CAT_OBJS is a flat fallback
     while the tree is loading. */
  const ROOT_CATS = useMemo(
    () => (catTree && catTree.length ? catTree : CAT_OBJS.filter((c) => !c.parent)),
    [catTree, CAT_OBJS],
  );
  const [params, setParams] = useSearchParams();
  const urlCat = params.get('cat') || '';
  const urlCats = urlCat.split(',').map((v) => v.trim()).filter(Boolean);

  /* filter state — seeded from props */
  const [q, setQ] = useState(initial.q || '');
  const [qDeb, setQDeb] = useState(initial.q || '');
  const [cats, setCats] = useState(() => [...(urlCats.length ? urlCats : fixedCats)]);
  const lastCatsKeyRef = useRef(cats.join(','));
  const [collapsedCats, setCollapsedCats] = useState({});
  const [brands, setBrands] = useState([...fixedBrands]);
  const [max, setMax] = useState(initial.max ?? null);
  const [sort, setSort] = useState(lockSort || initial.sort || 'featured');
  const [stockOnly, setStockOnly] = useState(!!initial.stockOnly);
  const [saleOnly, setSaleOnly] = useState(!!initial.saleOnly);
  const [minRating, setMinRating] = useState(initial.minRating || 0);
  const [badge, setBadge] = useState(initial.badge || '');
  const [size, setSize] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_LIMIT);
  /* DYNAMIC SPEC FILTERS (schema-driven facets): specSel holds
     multi-value selections {fieldKey: [values]}, specRange the number ranges
     {fieldKey: {min, max}}. Facets + UI are generated from the category's
     filterable fields — a new schema field shows up here with zero code. */
  const [specSel, setSpecSel] = useState({});
  const [specRange, setSpecRange] = useState({});

  /* server state */
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [facets, setFacets] = useState(null);    // { price, badges, sizes, brands }
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (!mobileFiltersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileFiltersOpen(false);
    };
    const closeOnDesktop = () => {
      if (window.innerWidth >= 1024) setMobileFiltersOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnDesktop);
    };
  }, [mobileFiltersOpen]);

  /* syncQ — external deep-link ?q= wins whenever the URL changes */
  const urlQ = syncQ ? (params.get('q') || '') : null;
  const urlQApplied = useRef(null);
  useEffect(() => {
    if (!syncQ || urlQ === null || urlQ === urlQApplied.current) return;
    urlQApplied.current = urlQ;
    setQ(urlQ);
    setQDeb(urlQ);
  }, [urlQ, syncQ]);

  /* CatNavbar deep-links use /shop?cat=<slug>. Keep the server query in sync
     when the user changes category from the navbar without remounting /shop. */
  useEffect(() => {
    if (fixedCats.length) return;
    setCats((current) => {
      const next = urlCats;
      return current.join(',') === next.join(',') ? current : next;
    });
    setPage(1);
  }, [urlCat, fixedCats.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /* search debounce (300ms) + Pixel Search (900ms settle) */
  const pxT = useRef(null);
  const dbT = useRef(null);
  useEffect(() => () => { clearTimeout(pxT.current); clearTimeout(dbT.current); }, []);
  const onSearch = (e) => {
    const v = e.target.value;
    setQ(v);
    clearTimeout(dbT.current);
    dbT.current = setTimeout(() => setQDeb(v.trim()), 300);
    clearTimeout(pxT.current);
    if (v.trim().length >= 2) pxT.current = setTimeout(() => fbTrack('Search', { search_string: v.trim() }), 900);
  };

  /* facets — category-scoped (spec facets ride the scoped payload);
     re-queried whenever the branch changes */
  useEffect(() => {
    let dead = false;
    getFilters(cats.length ? cats.join(',') : undefined).then((f) => { if (!dead) setFacets(f); }).catch(() => {});
    return () => { dead = true; };
  }, [cats]);
  /* selections made under one branch don't apply to another — clear them */
  useEffect(() => {
    const catsKey = cats.join(',');
    if (lastCatsKeyRef.current === catsKey) return;
    lastCatsKeyRef.current = catsKey;
    setSpecSel((current) => Object.keys(current).length ? {} : current);
    setSpecRange((current) => Object.keys(current).length ? {} : current);
    if (!fixedBrands.length) setBrands((current) => current.length ? [] : current);
  }, [cats, fixedBrands.length]);

  /* THE query — server-driven, aborted on every change */
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const fetchList = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(false);
    const priceMax = max === null || max >= 250000 ? undefined : max;
    /* spec_* query params from the dynamic facet selections */
    const specParams = {};
    for (const [k, vals] of Object.entries(specSel)) if (vals && vals.length) specParams['spec_' + k] = vals.join(',');
    for (const [k, r] of Object.entries(specRange)) {
      if (r && r.min !== '' && r.min !== undefined && r.min !== null) specParams['spec_' + k + '_min'] = r.min;
      if (r && r.max !== '' && r.max !== undefined && r.max !== null) specParams['spec_' + k + '_max'] = r.max;
    }
    listProducts({
      category: cats.length ? cats.join(',') : undefined,
      brand: brands.length ? brands.join(',') : undefined,
      search: qDeb || undefined,
      sort: sort || undefined,
      limit: perPage,
      page,
      badge: badge || undefined,
      size: size || undefined,
      inStock: stockOnly || undefined,
      discounted: saleOnly || undefined,
      rating: minRating || undefined,
      maxPrice: priceMax,
      featured: pinned && pinned.featured ? 'true' : undefined,
      specParams,
      signal: ctrl.signal,
    }).then((d) => {
      if (requestId !== requestIdRef.current) return;
      setItems((d.items || []).map(adaptOne).filter(Boolean));
      setTotal(d.total || 0);
      setPages(d.pages || 1);
      setLoadError(false);
      setLoading(false);
    }).catch((e) => {
      if (requestId !== requestIdRef.current || (e && e.name === 'AbortError')) return;
      setItems([]); setTotal(0); setPages(1); setLoadError(true); setLoading(false);
    });
  }, [cats, brands, qDeb, sort, page, perPage, badge, size, stockOnly, saleOnly, minRating, max, pinned, specSel, specRange]);

  useEffect(() => {
    fetchList();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchList]);

  /* any filter change resets to page 1 */
  const resetPage = () => setPage(1);
  const toggleCat = (slug) => { setCats((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug])); resetPage(); };
  const toggleBrand = (slug) => { setBrands((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug])); resetPage(); };
  /* subChips narrow within the fixed branch: swap cats to [sub] (or back to the parent) */
  const fixedParent = fixedCats.length === 1 ? fixedCats[0] : null;
  const toggleSub = (slug) => {
    if (fixedParent == null) return toggleCat(slug);
    setCats((cur) => (cur.includes(slug) ? [fixedParent] : [slug]));
    resetPage();
  };
  const clearAll = () => {
    setQ(''); setQDeb(''); setCats([...fixedCats]); setBrands([...fixedBrands]); setMax(null);
    setSort(lockSort || 'featured');
    setStockOnly(false); setSaleOnly(!!initial.saleOnly); setMinRating(0); setBadge(initial.badge || ''); setSize('');
    setSpecSel({}); setSpecRange({});
    resetPage();
    const hadUrlFilter = (syncQ && params.get('q')) || (!fixedCats.length && params.get('cat'));
    if (syncQ && params.get('q')) params.delete('q');
    if (!fixedCats.length && params.get('cat')) params.delete('cat');
    if (hadUrlFilter) setParams(params, { replace: true });
    clearTimeout(pxT.current);
  };

  /* facet options (zero hardcode) */
  const badgeOpts = (facets && facets.badges) || [];
  const sizeOpts = (facets && facets.sizes) || [];
  const brandOpts = (facets && facets.brands) || [];
  const priceTop = facets && facets.price && facets.price.max ? Math.ceil(facets.price.max / 1000) * 1000 : 250000;

  const chipCls = (on) => 'cursor-pointer select-none border px-[.85rem] py-[.4rem] font-cond text-[.78rem] font-semibold uppercase tracking-[.16em] transition duration-200 ' +
    (on ? 'border-acc bg-acc text-black' : 'border-line text-muted hover:border-line2 hover:text-txt');

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const activeMainCategory = useMemo(() => {
    const selected = new Set(cats);
    const containsSelection = (category) =>
      selected.has(category.slug) || (category.children || []).some(containsSelection);
    const root = ROOT_CATS.find((category) =>
      containsSelection(category),
    );
    if (root) return isBn && root.nameBn ? root.nameBn : t(root.name);
    const fallback = CAT_OBJS.find((category) => selected.has(category.slug));
    if (fallback) return isBn && fallback.nameBn ? fallback.nameBn : t(fallback.name);
    return t('All Products');
  }, [ROOT_CATS, CAT_OBJS, cats, isBn, t]);
  const activeFilterCount =
    Number(!!(qDeb && qDeb !== (initial.q || ''))) +
    cats.filter((c) => !fixedCats.includes(c)).length +
    fixedCats.filter((c) => !cats.includes(c)).length +
    brands.filter((b) => !fixedBrands.includes(b)).length +
    Number(max !== null) +
    Number(stockOnly) +
    Number(saleOnly !== !!initial.saleOnly) +
    Number(!!minRating) +
    Number(badge !== (initial.badge || '')) +
    Number(!!size) +
    Object.values(specSel).filter((v) => v && v.length).length +
    Object.values(specRange).filter((r) => r && ((r.min !== '' && r.min != null) || (r.max !== '' && r.max != null))).length;
  const filtersOn = activeFilterCount > 0;

  /* compact page list: 1 … p-1 p p+1 … N */
  const pageList = useMemo(() => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) out.push(i);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  }, [pages, page]);

  const goto = (p) => {
    if (p < 1 || p > pages || p === page) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const categoryIsCollapsed = (slug) => collapsedCats[slug] ?? true;
  const renderSubcategories = (nodes, depth = 1) => (nodes || []).map((category) => {
    const label = isBn && category.nameBn ? category.nameBn : t(category.name);
    const children = category.children || [];
    const collapsed = categoryIsCollapsed(category.slug);
    return (
      <div key={category.slug}>
        <div className="shop-category-heading">
          <button
            data-cat={category.slug}
            aria-pressed={cats.includes(category.slug)}
            onClick={() => toggleCat(category.slug)}
            className={'shop-category-option shop-subcategory-option ' + (cats.includes(category.slug) ? 'is-active' : '')}
            style={{ paddingLeft: `${depth * 12}px` }}
          >
            <span className="shop-check" aria-hidden="true">{cats.includes(category.slug) ? '✓' : ''}</span>
            {label}
          </button>
          {children.length ? (
            <button
              type="button"
              className="shop-category-toggle"
              aria-label={`${collapsed ? t('Expand') : t('Collapse')} ${label}`}
              aria-expanded={!collapsed}
              aria-controls={id + 'Subcats-' + category.slug}
              onClick={() => setCollapsedCats((current) => ({ ...current, [category.slug]: !collapsed }))}
            >
              <span className="font-disp text-xl leading-none" aria-hidden="true">{collapsed ? '+' : '-'}</span>
            </button>
          ) : null}
        </div>
        {children.length && !collapsed ? (
          <div id={id + 'Subcats-' + category.slug} className="shop-subcategory-list">
            {renderSubcategories(children, depth + 1)}
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <>
      <div className="shop-layout grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)] xl:gap-8">
      {mobileFiltersOpen ? (
        <button
          type="button"
          className="shop-mobile-drawer-backdrop fixed inset-0 z-[910] bg-black/70 lg:hidden"
          aria-label={t('Close')}
          onClick={() => setMobileFiltersOpen(false)}
        />
      ) : null}
      <aside
        id={id + 'Sidebar'}
        role={mobileFiltersOpen ? 'dialog' : undefined}
        aria-modal={mobileFiltersOpen ? 'true' : undefined}
        className={'shop-sidebar min-w-0 ' + (mobileFiltersOpen
          ? 'shop-mobile-drawer fixed inset-y-0 left-0 z-[920] block w-[88vw] max-w-[380px] overflow-y-auto border-r border-line2 bg-bg p-4 shadow-2xl lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none'
          : 'hidden lg:block')}
        aria-label={t('Catalog filters')}
      >
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-line bg-panel/95 px-5 py-4 backdrop-blur lg:hidden">
        <div>
          <h2 className="font-head text-sm font-bold text-txt">{t('Filters')}</h2>
          <p className="mt-0.5 font-cond text-xs text-muted">
            {filtersOn ? `${activeFilterCount} ${t('active')}` : `${total} ${t('products')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtersOn ? (
            <button type="button" className="px-2 py-2 font-cond text-xs font-bold uppercase tracking-[.08em] text-acc" onClick={clearAll}>
              {t('Reset filters')}
            </button>
          ) : null}
          <button type="button" className="grid h-10 w-10 place-items-center rounded-none border border-line2 text-xl text-txt transition hover:border-acc" aria-label={t('Close')} onClick={() => setMobileFiltersOpen(false)}>×</button>
        </div>
      </div>
      <div className="shop-tools shop-filter-stack">
        {showSearch ? (
          <section className="shop-row shop-filter-card flex min-w-0 flex-col items-stretch gap-3">
            <h3 className="shop-filter-title">{t('Search')}</h3>
            <div className="shop-search flex w-full min-w-0 items-center gap-[.6rem] bg-bg2 px-[.75rem] py-[.7rem] ring-1 ring-inset ring-line2 focus-within:ring-acc">
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] flex-none fill-none stroke-[2] stroke-dim"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input
                id={id + 'Search'}
                type="text"
                value={q}
                onChange={onSearch}
                placeholder={searchPlaceholder || t('SEARCH THE CATALOG — LAPTOP, RTX, SSD…')}
                autoFocus={autoFocusSearch || undefined}
                autoComplete="off"
                spellCheck="false"
                aria-label="Search all products"
                className="min-w-0 flex-1 border-0 bg-transparent text-[.9rem] text-txt outline-none placeholder:text-dim"
              />
            </div>
          </section>
        ) : null}
        {showMax ? (
          <section className="shop-filter-card">
            <h3 className="shop-filter-title">{t('Price range')}</h3>
            <div className="price-lab shop-price-title flex flex-wrap items-center justify-between gap-3 font-cond text-[.8rem] font-semibold uppercase tracking-[.16em] text-silver">
              <span>{t('Maximum price')}</span>
              <b id={id + 'RangeLab'} className="font-disp text-[1rem] font-normal text-acc">{max === null ? 'ANY' : money(max)}</b>
              <input
                id={id + 'Range'}
                type="range"
                min={1000}
                max={priceTop}
                step={1000}
                value={max === null ? priceTop : max}
                aria-label="Maximum price"
                onChange={(e) => { setMax(+e.target.value >= priceTop ? null : +e.target.value); resetPage(); }}
                className="rng h-[3px] w-full cursor-pointer appearance-none bg-line2 outline-none [&::-moz-range-thumb]:h-[15px] [&::-moz-range-thumb]:w-[15px] [&::-moz-range-thumb]:rotate-45 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-acc [&::-webkit-slider-thumb]:h-[15px] [&::-webkit-slider-thumb]:w-[15px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rotate-45 [&::-webkit-slider-thumb]:bg-acc"
              />
            </div>
          </section>
        ) : null}

        {showCats && !fixedCats.length ? (
          <div id={id + 'Cats'} className="shop-cats shop-filter-card shop-category-list">
            <h3 className="shop-filter-title">{t('Categories')}</h3>
            {ROOT_CATS.map((c) => (
              <div key={c.slug} className="shop-category-group">
                <div className="shop-category-heading">
                  <button
                    data-cat={c.slug}
                    aria-pressed={cats.includes(c.slug)}
                    onClick={() => toggleCat(c.slug)}
                    className={'shop-category-option ' + (cats.includes(c.slug) ? 'is-active' : '')}
                  >
                    <span className="shop-check" aria-hidden="true">{cats.includes(c.slug) ? '✓' : ''}</span>
                    {isBn && c.nameBn ? c.nameBn : t(c.name)}
                  </button>
                  {c.children && c.children.length ? (
                    <button
                      type="button"
                      className="shop-category-toggle"
                      aria-label={`${categoryIsCollapsed(c.slug) ? t('Expand') : t('Collapse')} ${isBn && c.nameBn ? c.nameBn : t(c.name)}`}
                      aria-expanded={!categoryIsCollapsed(c.slug)}
                      aria-controls={id + 'Subcats-' + c.slug}
                      onClick={() => setCollapsedCats((current) => ({ ...current, [c.slug]: !(current[c.slug] ?? true) }))}
                    >
                      <span className="font-disp text-xl leading-none" aria-hidden="true">{categoryIsCollapsed(c.slug) ? '+' : '-'}</span>
                    </button>
                  ) : null}
                </div>
                {c.children && c.children.length && !categoryIsCollapsed(c.slug) ? (
                  <div id={id + 'Subcats-' + c.slug} className="shop-subcategory-list">
                    {renderSubcategories(c.children)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {subChips && subChips.length ? (
          <div className="shop-filter-card shop-category-list">
            <h3 className="shop-filter-title">{t('NARROW')}</h3>
            {subChips.map((c) => (
              <button
                key={c.slug}
                aria-pressed={cats.includes(c.slug)}
                className={'shop-category-option shop-subcategory-option ' + (cats.includes(c.slug) ? 'is-active' : '')}
                onClick={() => toggleSub(c.slug)}
              >
                <span className="shop-check" aria-hidden="true">{cats.includes(c.slug) ? '✓' : ''}</span>
                {isBn && c.nameBn ? c.nameBn : t(c.name)}
              </button>
            ))}
          </div>
        ) : null}


        <div id={id + 'Filters'} className="shop-filter-card shop-filter-facets flex flex-col items-stretch gap-[.35rem]">
          <h3 className="shop-filter-title">{t('Availability')}</h3>
          <button data-f="stock" aria-pressed={stockOnly} className={'shop-sidebar-option ' + (stockOnly ? 'is-active' : '')} onClick={() => { setStockOnly((v) => !v); resetPage(); }}><span className="shop-check" aria-hidden="true">{stockOnly ? '✓' : ''}</span>{t('In stock')}</button>
          <button data-f="sale" aria-pressed={saleOnly} className={'shop-sidebar-option ' + (saleOnly ? 'is-active' : '')} onClick={() => { setSaleOnly((v) => !v); resetPage(); }}><span className="shop-check" aria-hidden="true">{saleOnly ? '✓' : ''}</span>{t('On sale')}</button>
          {badgeOpts.map((b) => (
            <button key={b.key} data-f={'badge-' + b.key} aria-pressed={badge === b.key} className={'shop-sidebar-option ' + (badge === b.key ? 'is-active' : '')} onClick={() => { setBadge((cur) => (cur === b.key ? '' : b.key)); resetPage(); }}><span className="shop-check" aria-hidden="true">{badge === b.key ? '✓' : ''}</span>{t(String(b.key).replace('-', ' ')).replace(/^\w/, (m) => m.toUpperCase())}</button>
          ))}
          {sizeOpts.length ? (
            <span className="shop-facet-group">
              <span className="font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">{t('Size')}</span>
              <span className="flex flex-wrap gap-[.4rem]">{sizeOpts.slice(0, 10).map((s) => (
                <button key={s.s} data-f={'size-' + s.s} aria-pressed={size === s.s} className={chipCls(size === s.s) + ' min-w-9 text-center'} onClick={() => { setSize((cur) => (cur === s.s ? '' : s.s)); resetPage(); }}>{s.s}</button>
              ))}</span>
            </span>
          ) : null}
        </div>

        <section className="shop-filter-card">
          <h3 className="shop-filter-title">{t('Rating')}</h3>
          <select
            data-f="rating"
            aria-label="Minimum rating"
            value={minRating}
            onChange={(e) => { setMinRating(+e.target.value); resetPage(); }}
            className="w-full cursor-pointer border border-line bg-bg2 px-[.7rem] py-[.55rem] font-cond text-[.78rem] font-semibold uppercase tracking-[.16em] text-muted outline-none hover:border-line2 hover:text-txt"
          >
            <option value="0" className="bg-bg2">{t('ANY RATING')}</option>
            <option value="4" className="bg-bg2">★ 4.0 +</option>
            <option value="4.5" className="bg-bg2">★ 4.5 +</option>
          </select>
        </section>

        {showBrands && !fixedBrands.length && brandOpts.length ? (
          <div className="shop-filter-card shop-brand-filter">
            <span className="shop-filter-title">{t('Brand')}</span>
            {brandOpts.slice(0, 8).map((b) => (
              <button key={b.slug} data-f={'brand-' + b.slug} aria-pressed={brands.includes(b.slug)} className={'shop-brand-option ' + (brands.includes(b.slug) ? 'is-active' : '')} onClick={() => toggleBrand(b.slug)}><span className="shop-check" aria-hidden="true">{brands.includes(b.slug) ? '✓' : ''}</span>{b.name}</button>
            ))}
          </div>
        ) : null}

          {/*DYNAMIC SPEC FACETS: generated from the category's
              filterable fields (schema-driven, zero hardcode). Grouped under
              the schema's group label; dropdown for single-select, toggle
              chips for multi-select, Yes/No for booleans, min/max for numbers.*/}
          {(facets && Array.isArray(facets.specs) && facets.specs.length) ? (
            <div className="shop-spec-stack" id={id + 'SpecFilters'} data-specfilters="1">
              {facets.specs.map((f) => {
                const label = isBn && f.labelBn ? f.labelBn : t(f.label);
                const sel = specSel[f.key] || [];
                const rng = specRange[f.key] || { min: '', max: '' };
                const toggleVal = (v) => {
                  setSpecSel((cur) => {
                    const curVals = cur[f.key] || [];
                    const next = curVals.includes(v) ? curVals.filter((x) => x !== v) : [...curVals, v];
                    const n = { ...cur };
                    if (next.length) n[f.key] = next; else delete n[f.key];
                    return n;
                  });
                  resetPage();
                };
                return (
                  <section key={f.key} className="shop-filter-card shop-spec-card" data-specfacet={f.key}>
                    <span className="shop-filter-title">{label}{f.unit ? ` (${f.unit})` : ''}</span>
                    <div className="shop-filter-facets">
                    {f.type === 'select' ? (
                      <select
                        data-specsel={f.key}
                        aria-label={label}
                        value={sel[0] || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSpecSel((cur) => { const n = { ...cur }; if (v) n[f.key] = [v]; else delete n[f.key]; return n; });
                          resetPage();
                        }}
                        className="cursor-pointer border border-line bg-transparent px-[.7rem] py-[.42rem] font-cond text-[.78rem] font-semibold uppercase tracking-[.16em] text-muted outline-none hover:border-line2 hover:text-txt"
                      >
                        <option value="" className="bg-bg2">{t('ALL')}</option>
                        {(f.options || []).map((o) => <option key={o.value} value={o.value} className="bg-bg2">{o.value} ({o.count})</option>)}
                      </select>
                    ) : f.type === 'multiselect' ? (
                      (f.options || []).map((o) => (
                        <button key={o.value} data-specchip={f.key + ':' + o.value} aria-pressed={sel.includes(o.value)} className={chipCls(sel.includes(o.value))} onClick={() => toggleVal(o.value)}>
                          {o.value} <span className="opacity-60">{o.count}</span>
                        </button>
                      ))
                    ) : f.type === 'boolean' ? (
                      (f.options || []).map((o) => (
                        <button key={o.value} data-specchip={f.key + ':' + o.value} aria-pressed={sel.includes(o.value)} className={chipCls(sel.includes(o.value))} onClick={() => toggleVal(o.value)}>
                          {t(o.value)}
                        </button>
                      ))
                    ) : f.type === 'number' && f.range ? (
                      <span className="inline-flex items-center gap-[.3rem]">
                        <input
                          data-specmin={f.key} type="number" inputMode="decimal" placeholder={String(f.range.min)}
                          aria-label={label + ' min'}
                          value={rng.min}
                          onChange={(e) => { setSpecRange((cur) => ({ ...cur, [f.key]: { ...rng, min: e.target.value } })); }}
                          className="w-[74px] border border-line bg-transparent px-[.5rem] py-[.34rem] text-center font-cond text-[.78rem] text-txt outline-none placeholder:text-dim focus:border-acc"
                        />
                        <span className="text-dim">–</span>
                        <input
                          data-specmax={f.key} type="number" inputMode="decimal" placeholder={String(f.range.max)}
                          aria-label={label + ' max'}
                          value={rng.max}
                          onChange={(e) => { setSpecRange((cur) => ({ ...cur, [f.key]: { ...rng, max: e.target.value } })); }}
                          className="w-[74px] border border-line bg-transparent px-[.5rem] py-[.34rem] text-center font-cond text-[.78rem] text-txt outline-none placeholder:text-dim focus:border-acc"
                        />
                      </span>
                    ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
      </div>
      <div className="sticky bottom-[-1rem] -mx-4 -mb-4 mt-5 border-t border-line bg-panel/95 p-4 backdrop-blur lg:hidden">
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-none bg-acc px-4 py-3 font-head text-sm font-bold text-black transition hover:bg-acc2 disabled:cursor-wait disabled:opacity-60"
          disabled={loading}
          onClick={() => setMobileFiltersOpen(false)}
        >
          {loading ? t('Loading…') : `${t('Show')} ${total} ${t('products')}`}
          {!loading ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          ) : null}
        </button>
      </div>
      </aside>

      <div className="shop-results min-w-0">
      <div className="shop-mobile-toolbar mb-5 flex items-center justify-between gap-2 border border-line bg-panel p-2 lg:mb-5 lg:border-line lg:bg-panel lg:px-5 lg:py-3">
        <button
          type="button"
          className="shop-mobile-filter-trigger flex min-h-10 flex-none items-center gap-2 rounded-none border border-line2 bg-bg2 px-3 font-cond text-sm font-semibold text-txt transition hover:border-acc/70 lg:hidden"
          aria-expanded={mobileFiltersOpen}
          aria-controls={id + 'Sidebar'}
          onClick={() => setMobileFiltersOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-acc" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
            <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
            <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="8" cy="18" r="2" fill="currentColor" stroke="none" />
          </svg>
          {t('Filter')}
          {filtersOn ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-none bg-acc px-1 font-cond text-[10px] font-bold text-black">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        <h3 className="hidden min-w-0 flex-1 truncate font-head text-sm font-bold text-txt lg:block">
          {activeMainCategory}
        </h3>
        <label className="hidden flex-none items-center gap-2 font-cond text-xs font-semibold text-muted lg:flex">
          <span>{t('Show')}:</span>
          <select
            id={id + 'PageSize'}
            aria-label="Products per page"
            value={perPage}
            onChange={(e) => { setPerPage(+e.target.value); resetPage(); }}
            className="shop-sel min-h-10 cursor-pointer bg-bg2 px-2 font-cond text-xs font-semibold text-silver outline-none ring-1 ring-inset ring-line2"
          >
            {PAGE_SIZES.map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        {!lockSort ? (
          <label className="flex min-w-0 flex-1 items-center justify-end gap-2 font-cond text-xs font-semibold text-muted lg:flex-none">
            <span className="flex-none whitespace-nowrap">{t('Sort By')}</span>
            <select
              id={id + 'Sort'}
              aria-label="Sort products"
              value={sort}
              onChange={(e) => { setSort(e.target.value); resetPage(); }}
              className="shop-sel min-h-10 min-w-0 flex-1 cursor-pointer bg-bg2 px-2 font-cond text-xs font-semibold uppercase tracking-[.04em] text-silver outline-none ring-1 ring-inset ring-line2 sm:flex-none sm:px-[.75rem] sm:text-[.8rem] sm:tracking-[.12em]"
            >
              <option value="featured">{t('Default')}</option>
              <option value="price-asc">{t('PRICE · LOW TO HIGH')}</option>
              <option value="price-desc">{t('PRICE · HIGH TO LOW')}</option>
              <option value="newest">{t('NEWEST FIRST')}</option>
              <option value="rating">{t('TOP RATED')}</option>
              <option value="popular">{t('BEST SELLING')}</option>
              <option value="trending">{t('TRENDING · MOST VIEWED')}</option>
            </select>
          </label>
        ) : null}
      </div>

      <div id={id + 'Grid'} className="gear-grid grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)
          : items.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>

      <div id={id + 'Empty'} hidden={loading || (!loadError && items.length > 0)} className="shop-empty border border-dashed border-line2 px-8 py-16 text-center text-muted">
        {loadError ? (
          <div role="alert">
            <h3 className="mb-[.6rem] font-disp text-[1.8rem] uppercase text-txt">{t('Could not load products')}</h3>
            <p>{t('Try again in a moment.')}</p>
            <button type="button" className="mt-5 border border-line2 px-5 py-2 font-cond text-sm font-bold uppercase tracking-[.16em] text-txt hover:border-acc" onClick={fetchList}>
              {t('Try again')}
            </button>
          </div>
        ) : (
          <>
            <h3 className="mb-[.6rem] font-disp text-[1.8rem] uppercase text-txt">{t(emptyTitle)}</h3>
            <p>{t(emptyBody)}</p>
          </>
        )}
      </div>

      <div className="shop-meta mt-8 flex flex-wrap items-center justify-between gap-3 font-cond text-[.82rem] uppercase tracking-[.16em] text-dim">
        <span id={id + 'Count'} aria-live="polite">
          {loading ? t('Loading…') : <><b className="text-acc">{from}–{to}</b> / {total} {t('products')}</>}
        </span>
        {filtersOn ? (
          <button
            id={id + 'Clear'}
            className="shop-clear cursor-pointer border-b border-line2 text-silver transition duration-200 hover:border-acc hover:text-acc"
            onClick={clearAll}
          >
            {t('Reset filters')}
          </button>
        ) : null}
      </div>


      {pages > 1 ? (
        <nav id={id + 'Pager'} className="mt-5 flex flex-wrap items-center justify-center gap-2" aria-label="Catalog pages">
          <button
            className="cursor-pointer border border-line px-4 py-2 font-cond text-[.8rem] font-semibold uppercase tracking-[.16em] text-muted transition hover:border-line2 hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => goto(page - 1)}
            disabled={page <= 1}
          >
            {t('PREV')}
          </button>
          {pageList.map((p, ix) =>
            p === '…' ? (
              <span key={'e' + ix} className="px-1 font-cond text-[.8rem] text-dim">…</span>
            ) : (
              <button
                key={p}
                data-page={p}
                className={'min-w-10 cursor-pointer border px-3.5 py-2 font-cond text-[.8rem] font-semibold tracking-[.08em] transition ' + (p === page ? 'border-acc bg-acc text-black' : 'border-line text-muted hover:border-line2 hover:text-txt')}
                onClick={() => goto(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            className="cursor-pointer border border-line px-4 py-2 font-cond text-[.8rem] font-semibold uppercase tracking-[.16em] text-muted transition hover:border-line2 hover:text-txt disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => goto(page + 1)}
            disabled={page >= pages}
          >
            {t('NEXT')}
          </button>
        </nav>
      ) : null}
      </div>
      </div>
    </>
  );
}
