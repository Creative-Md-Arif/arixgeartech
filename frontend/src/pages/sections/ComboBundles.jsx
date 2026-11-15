/* ArixGear section — combo bundles (Phase 3, #11 of 13).
   Bundle content comes from the ComboBundle collection. Homepage config only
   selects which existing bundle slugs should be displayed.
   Prices: the bundle price is explicit; the compare total is the live sum of
   item prices (recalculated from the catalog so admin price edits always show
   honest savings). "Add bundle" drops every item into the cart (no drawer
   spam — one toast, cart opens once). The ComboBundle backend model + order
   validation lands in Phase 4; this section is already admin-manageable. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../store/content.jsx';
import { useCatalog, priceFor } from '../../store/catalog.jsx';
import { useStore } from '../../store/store.jsx';
import { money } from '../../lib/format.js';
import { pick, tr, useLang } from '../../lib/i18n.jsx';
import { SectionHead, OutlineTitle } from './Head.jsx';
import { Link } from 'react-router-dom';
import { api } from '../../services/http.js';

function BundleCard({ bundle }) {
  const { BY_ID, PRODUCTS } = useCatalog();
  const { addToCart } = useStore();
  const { t, isBn } = useLang();
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => (bundle.items || []).map((i) => BY_ID[i.slug]).filter(Boolean), [bundle.items, BY_ID, PRODUCTS]);

  if (items.length < 2) return null;

  const total = items.reduce((a, p) => a + priceFor(p), 0);
  const bundlePrice = +bundle.bundlePrice > 0 ? +bundle.bundlePrice : total;
  const savePct = total > 0 && bundlePrice < total ? Math.round((1 - bundlePrice / total) * 100) : 0;

  const addBundle = () => {
    setBusy(true);
    addToCart(null, null, null, 1, false, bundle);
    setBusy(false);
    window.dispatchEvent(new CustomEvent('forged:open-drawer', { detail: 'cart' }));
    window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Bundle added to cart'), sub: pick(bundle, 'title') + ' — ' + items.length + ' items' } }));
  };

  return (
    <article className="combo flex flex-col border border-line bg-panel" data-bundle={bundle.title} data-testid="comboBundle">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-head text-[1.02rem] font-bold uppercase tracking-[.05em] text-txt">{pick(bundle, 'title')}</h3>
            {bundle.tagline ? <p className="mt-1 text-[.8rem] text-muted">{pick(bundle, 'tagline')}</p> : null}
          </div>
          {bundle.tag || savePct > 0 ? (
            <span className="whitespace-nowrap bg-acc px-2.5 py-1 font-cond text-[.72rem] font-bold uppercase tracking-[.14em] text-black">{bundle.tag || ('SAVE ' + savePct + '%')}</span>
          ) : null}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-px bg-line">
        {items.map((p) => (
          <Link key={p.id} to={'/product/' + p.id} className="group flex flex-col items-center bg-panel p-3 text-center transition-colors hover:bg-bg2">
            <img src={p.img} alt={p.name} className="h-16 w-16 object-contain" />
            <span className="mt-2 line-clamp-2 text-[.72rem] leading-tight text-muted transition-colors group-hover:text-txt">{isBn && p.nameBn ? p.nameBn : p.name}</span>
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="font-head text-xl font-extrabold text-acc">{money(bundlePrice)}</p>
          {savePct > 0 ? <s className="text-[.8rem] text-dim">{money(total)}</s> : null}
        </div>
        <button
          className="bg-acc px-5 py-3 font-head text-[.72rem] font-extrabold uppercase tracking-[.16em] text-black transition hover:bg-acc2 disabled:opacity-60"
          onClick={addBundle}
          disabled={busy}
          data-add-bundle={bundle.title}
        >
          {t('Add bundle')}
        </button>
      </div>
    </article>
  );
}

export default function ComboBundles() {
  useLang();
  const { sectionVisible, homeSections } = useContent();
  const [bundles, setBundles] = useState([]);
  const trackRef = useRef(null);
  const load = useCallback(() => {
    return api('/bundles', { auth: false })
      .then((d) => setBundles(d.items || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') load();
    };
    load();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [load]);

  const visible = sectionVisible('combo-bundles');
  const sec = homeSections.find((s) => s && s.key === 'combo-bundles');
  if (!visible || !sec || !bundles.length) return null;
  const visibleBundles = bundles.filter((b) => b.orderable);
  if (!visibleBundles.length) return null;

  const bundleStep = () => {
    const el = trackRef.current;
    const card = el && el.firstElementChild;
    return card ? card.getBoundingClientRect().width + 20 : 300;
  };
  const bundleIndex = () => {
    const el = trackRef.current;
    return el ? Math.round(el.scrollLeft / bundleStep()) : 0;
  };
  const bundleJump = (index) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: Math.max(0, index) * bundleStep(), behavior: 'smooth' });
  };
  const bundleNext = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft >= max - 10) el.scrollTo({ left: 0, behavior: 'smooth' });
    else bundleJump(bundleIndex() + 1);
  };

  return (
    <section id="combos" className="hsec py-16 lg:py-20">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null}
          right={<Link to="/shop" className="font-cond text-[.8rem] font-semibold uppercase tracking-[.2em] text-dim transition-colors hover:text-acc">{tr('Browse everything')} →</Link>}
        />
        <div className="mb-3 flex justify-end gap-1.5 sm:-mt-8" aria-label="Combo bundles carousel controls">
          <button type="button" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={() => bundleJump(bundleIndex() - 1)} aria-label="Previous combo bundles"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button>
          <button type="button" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={bundleNext} aria-label="Next combo bundles"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
        </div>
        <div ref={trackRef} className="mt-6 flex gap-5 overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] [scrollbar-width:none] sm:mt-10 [&::-webkit-scrollbar]:hidden" id="comboGrid">
          {visibleBundles.map((b) => (
            <div key={b.id} className="combo-bundle-card flex-none [scroll-snap-align:start]"><BundleCard bundle={b} /></div>
          ))}
        </div>
      </div>
    </section>
  );
}
