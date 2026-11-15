/* ArixGear page — /cart (Phase 6a).
   Full-page twin of the cart drawer: line rows with qty steppers, free-shipping
   progress, guest-checkout gate notice and a straight path to checkout.
   Line images resolve from the home-feed mirror first; anything beyond the
   mirror is fetched live from /api/products/:slug. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useContent } from '../store/content.jsx';
import { useCatalog, adaptOne } from '../store/catalog.jsx';
import { getProduct } from '../services/products.js';
import { getPayment } from '../services/settings.js';
import { money } from '../lib/format.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';

/* row image — only renders a real src; a failed load swaps to a neutral tile
   (an onError hidden <img> would stay invisible even after the src recovers) */
function RowImg({ p, onOpen }) {
  const [failed, setFailed] = useState(false);
  if (!p || !p.img || failed) return <div className="h-24 w-24 flex-none bg-bg2" aria-hidden="true" />;
  return (
    <img
      src={p.img}
      alt=""
      className="h-24 w-24 flex-none cursor-pointer object-cover"
      onClick={onOpen}
      onError={() => setFailed(true)}
    />
  );
}

export default function Page() {
  const { t } = useLang();
  useSEO('shop', { title: 'Your Cart — arixgear.tech', description: 'Review your arixgear.tech cart and check out with bKash, Nagad, Rocket or Cash on Delivery.' });

  const { cart, setQty, cartTotals, session } = useStore();
  const { openPDP } = useUI();
  const { FREE_SHIP } = useContent();
  const { BY_ID, PRODUCTS } = useCatalog();
  const keys = Object.keys(cart);
  const { n, sum } = cartTotals();
  const left = Math.max(0, FREE_SHIP - sum);

  /* lines beyond the home-feed mirror resolve live */
  const [remote, setRemote] = useState({});
  const missingKey = keys.map((k) => cart[k].id).filter((id) => !BY_ID[id] && !remote[id]).sort().join(',');
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
  const at = (id) => BY_ID[id] || remote[id] || null;

  /* guest checkout kill-switch — same notice as the drawer */
  const [guestOff, setGuestOff] = useState(false);
  useEffect(() => {
    let live = true;
    getPayment().then((d) => { if (live) setGuestOff(d && d.checkout && d.checkout.guestEnabled === false); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const showGuestGate = guestOff && !session;

  const crossSell = useMemo(() => PRODUCTS.filter((p) => !keys.some((k) => cart[k].id === p.id)).slice(0, 4), [PRODUCTS, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="page-cart" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('READY TO ROLL?')}
          </p>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('YOUR')} <span className="text-outline">{t('CART')}</span>
            <span className="ml-4 align-middle font-cond text-[1rem] tracking-[.2em] text-dim">({n})</span>
          </h2>
        </div>

        {showGuestGate ? (
          <div className="mt-10 border border-amber/30 bg-amber/10 px-5 py-3">
            <p className="font-cond text-[.78rem] font-semibold uppercase tracking-[.14em] text-amber">{t('Guest checkout is off')}</p>
            <p className="mt-0.5 text-[.8rem] text-muted">
              {t('You will need an account to check out — ')}<Link to="/login" className="font-semibold text-acc underline decoration-acc/40 hover:decoration-acc">{t('log in or create one')}</Link>.
            </p>
          </div>
        ) : null}

        {!keys.length ? (
          <div className="mt-12 border border-dashed border-line2 px-8 py-16 text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-14 w-14 text-line2" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 7h12l1.2 13.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1L6 7z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></svg>
            <h3 className="mt-5 font-disp text-[1.8rem] uppercase text-txt">{t('THE RACK IS EMPTY.')}</h3>
            <p className="mt-2 text-muted">{t('LOAD IT UP.')}</p>
            <Link to="/shop" className="mt-6 inline-block bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2">
              {t('Shop All')}
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
            {/* line rows */}
            <div className="cart-lines border border-line bg-panel">
              {keys.map((k) => {
                const it = cart[k];
                if (it.bundle) return <div key={k} className="cart-row flex justify-between border-b border-line p-5"><div><b>{it.bundleTitle}</b><p className="text-xs text-dim">Combo bundle · server priced</p></div><div className="flex items-center gap-3"><button onClick={() => setQty(k, -1)}>−</button>{it.qty}<button onClick={() => setQty(k, 1)}>+</button><b>{money(it.price * it.qty)}</b></div></div>;
                const p = at(it.id);
                const unit = +it.price > 0 ? +it.price : (p ? p.price : 0);
                return (
                  <div key={k} className="cart-row flex gap-4 border-b border-line/60 p-5 last:border-0" data-cart-row={k}>
                    <RowImg p={p} onOpen={() => p && openPDP(p.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <p
                          className="cursor-pointer truncate font-head text-[.95rem] font-semibold text-txt hover:text-acc"
                          onClick={() => p && openPDP(p.id)}
                        >
                          {p ? p.name : it.id}
                        </p>
                        <button
                          className="flex-none text-dim transition-colors hover:text-acc"
                          aria-label={'Remove ' + (p ? p.name : 'item')}
                          onClick={() => setQty(k, -it.qty)}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l14 14M19 5L5 19" /></svg>
                        </button>
                      </div>
                      <p className="mt-1 font-cond text-[.78rem] uppercase tracking-[.12em] text-dim">
                        {it.size !== 'Default' ? it.size : null}{it.size !== 'Default' && it.color !== 'Default' ? ' · ' : null}{it.color !== 'Default' ? it.color : null}
                        {p && p.sku ? <span className="ml-2 text-line2">SKU {p.sku}</span> : null}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="flex items-center gap-3 border border-line2 px-2.5 py-1.5">
                          <button aria-label="Decrease quantity" className="px-1.5 text-muted transition-colors hover:text-acc" onClick={() => setQty(k, -1)}>−</button>
                          <b className="min-w-6 text-center text-[.9rem]">{it.qty}</b>
                          <button aria-label="Increase quantity" className="px-1.5 text-muted transition-colors hover:text-acc" onClick={() => setQty(k, 1)}>+</button>
                        </span>
                        <span className="text-right">
                          <span className="block font-cond text-[.72rem] uppercase tracking-[.14em] text-dim">{money(unit)} × {it.qty}</span>
                          <b className="font-head text-[1rem] font-bold text-acc">{money(unit * it.qty)}</b>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* summary */}
            <aside className="cart-summary h-fit border border-line bg-panel p-6 lg:sticky lg:top-32">
              <div className="ship-progress border-b border-line pb-4">
                <p className="font-cond text-[.85rem] tracking-[.08em] text-muted">
                  {left > 0
                    ? <>{t('You are')} <i className="not-italic font-bold text-acc">{money(left)}</i> {t('away from')} <i className="not-italic font-bold text-txt">{t('FREE SHIPPING')}</i></>
                    : <i className="not-italic font-bold text-ok">{t('FREE SHIPPING UNLOCKED')}</i>}
                </p>
                <div className="sp-bar mt-2 h-1 bg-line2">
                  <b className={'block h-full bg-acc transition-transform duration-500 ' + (left <= 0 ? 'w-full' : '')} style={{ transform: 'scaleX(' + Math.min(1, sum / (FREE_SHIP || 1)) + ')', transformOrigin: 'left' }} />
                </div>
              </div>
              <div className="df-row mb-1 mt-4 flex items-center justify-between font-head text-[.95rem]">
                <span className="text-muted">{t('Subtotal')}</span>
                <b className="text-xl text-txt" id="cartPageSubtotal">{money(sum)}</b>
              </div>
              <p className="df-note mt-3 font-cond text-[.78rem] tracking-[.05em] text-dim">
                {t('Shipping, taxes and discount codes are calculated at checkout.')}
              </p>
              <Link
                to="/checkout"
                id="cartPageCheckout"
                className="btn-primary mt-5 flex w-full items-center justify-center gap-2 bg-acc py-4 font-head text-[.8rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2"
                style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)' }}
              >
                {t('Proceed to checkout')}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link to="/shop" className="mt-4 block text-center font-cond text-[.8rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-txt">
                {t('Continue shopping')}
              </Link>
            </aside>
          </div>
        )}

        {/* cross-sell — mirror picks, hidden while the rack is empty */}
        {keys.length > 0 && crossSell.length ? (
          <div className="mt-16">
            <h3 className="mb-5 flex items-center gap-3 font-cond text-[.9rem] font-semibold uppercase tracking-[.3em] text-muted">
              <i className="not-italic h-0.5 w-7 flex-none bg-acc" />
              {t('Popular right now')}
            </h3>
            <div className="grid grid-cols-2 gap-[.7rem] md:grid-cols-4 lg:gap-[1.15rem]">
              {crossSell.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
