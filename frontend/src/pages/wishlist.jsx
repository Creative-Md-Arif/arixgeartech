import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useStore } from '../store/store.jsx';
import { useCatalog, adaptOne } from '../store/catalog.jsx';
import { getProduct } from '../services/products.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  const { t } = useLang();
  useSEO('shop', { title: 'Wishlist — arixgear.tech', description: 'Your saved arixgear.tech gear — laptops, monitors and components, ready when you are.' });

  const { wish, addToCart, toggleWish } = useStore();
  const { BY_ID } = useCatalog();

  /*hearts beyond the home-feed mirror resolve live*/
  const [remote, setRemote] = useState({});
  const ids = useMemo(() => [...wish], [wish]);
  const missingKey = ids.filter((id) => !BY_ID[id] && !remote[id]).sort().join(',');
  const fetchingRef = useRef(false);
  useEffect(() => {
    const missing = missingKey ? missingKey.split(',') : [];
    if (!missing.length || fetchingRef.current) return;
    fetchingRef.current = true;
    let dead = false;
    Promise.allSettled(missing.map((id) => getProduct(id))).then((rs) => {
      const add = {};
      rs.forEach((r) => {
        if (r.status === 'fulfilled' && r.value && r.value.product) {
          const a = adaptOne(r.value.product);
          if (a) add[a.id] = a;
        }
      });
      if (!dead && Object.keys(add).length) setRemote((cur) => ({ ...cur, ...add }));
      fetchingRef.current = false;
    }).catch(() => { fetchingRef.current = false; });
    return () => { dead = true; };
  }, [missingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = ids.map((id) => BY_ID[id] || remote[id] || null).filter(Boolean);

  const addAll = () => {
    let added = 0;
    items.forEach((p) => { if (p) { addToCart(p.id, null, null, 1, false); added++; } });
    if (added) window.dispatchEvent(new CustomEvent('arixgear:open-drawer', { detail: 'cart' }));
  };

  return (
    <section id="page-wishlist" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
              <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
              {t('SAVED FOR LATER')}
            </p>
            <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
              {t('WISHLIST')}
              <span className="ml-4 align-middle font-cond text-[1rem] tracking-[.2em] text-dim">({wish.size})</span>
            </h2>
          </div>
          {items.length ? (
            <button
              id="wishAddAll"
              onClick={addAll}
              className="border border-acc px-5 py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.18em] text-acc transition hover:bg-acc hover:text-black"
            >
              {t('Add all to cart')}
            </button>
          ) : null}
        </div>

        {!wish.size ? (
          <div className="mt-12 border border-dashed border-line2 px-8 py-16 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-14 w-14 text-line2" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-7.5-4.9-9.8-9.2C.7 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.1 2.3h4c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.2 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" /></svg>
            <h3 className="mt-5 font-disp text-[1.8rem] uppercase text-txt">{t('NO HEARTS YET.')}</h3>
            <p className="mt-2 text-muted">{t('Tap the heart on any product and it will wait for you here.')}</p>
            <Link to="/shop" className="mt-6 inline-block bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2">
              {t('Shop All')}
            </Link>
          </div>
        ) : (
          <>
            <div className="gear-grid mt-10 grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4">
              {items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
            {/*any heart the API could not resolve (retired product) — honest note*/}
            {items.length < wish.size ? (
              <p className="mt-6 font-cond text-[.8rem] uppercase tracking-[.16em] text-dim">
                {t('{n} saved item(s) are no longer in the catalog — removing them keeps the list clean.', { n: wish.size - items.length })}
              </p>
            ) : null}
            <button
              className="mt-8 font-cond text-[.8rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-acc"
              onClick={() => items.forEach((p) => toggleWish(p.id))}
            >
              {t('Clear the whole list')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
