import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useContent } from '../store/content.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { getPayment } from '../services/settings.js';
import { money } from '../lib/format.js';
import { useLang } from '../lib/i18n.jsx';

function DrawerShell({ id, open, onClose, title, count, children }) {
  return (
    <aside className={'fixed right-0 top-0 z-[1000] flex h-full w-[min(430px,100vw)] flex-col border-l border-line bg-panel transition-transform duration-300 ' + (open ? 'translate-x-0' : 'translate-x-full')} id={id} aria-label={title}>
      <div className="drawer-head flex items-center justify-between border-b border-line p-5">
        <h3 className="font-disp text-xl uppercase tracking-wide">
          {title} <i className="not-italic text-acc" id={id + 'Count'}>({count})</i>
        </h3>
        <button className="x-btn grid h-9 w-9 place-items-center text-muted transition-colors hover:text-acc" aria-label={'Close ' + title} onClick={onClose}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      </div>
      {children}
    </aside>
  );
}

export function CartDrawer() {
  const { drawer, closeDrawers, openPDP } = useUI();
  const { cart, setQty, cartTotals, session } = useStore();
  const { FREE_SHIP } = useContent();
  const { t } = useLang();
  const open = drawer === 'cart';
  const keys = Object.keys(cart);
  const { n, sum } = cartTotals();
  const left = Math.max(0, FREE_SHIP - sum);

  /* guest checkout kill-switch surfaces in the drawer too:
     when the admin turns guests off and no one is logged in, warn BEFORE
     checkout instead of surprising at the gate. Fetched once per mount. */
  const [guestOff, setGuestOff] = useState(false);
  useEffect(() => {
    let live = true;
    getPayment().then((d) => { if (live) setGuestOff(d && d.checkout && d.checkout.guestEnabled === false); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const showGuestGate = guestOff && !session;

  return (
    <>
      <div className={'scrim fixed inset-0 z-[990] bg-black/70 backdrop-blur-sm transition-opacity duration-300 ' + (open ? 'opacity-100' : 'pointer-events-none opacity-0')} id="scrim" onClick={closeDrawers} />
      <DrawerShell id="cartDrawer" open={open} onClose={closeDrawers} title={t('Your Cart')} count={n}>
        {showGuestGate ? (
          <div id="cartGuestNotice" data-testid="cartGuestNotice" className="border-b border-amber/30 bg-amber/10 px-5 py-3">
            <p className="font-cond text-[.78rem] font-semibold uppercase tracking-[.14em] text-amber">{t('Guest checkout is off')}</p>
            <p className="mt-0.5 text-[.8rem] text-muted">
              {t('You will need an account to check out — ')}<Link to="/account" className="font-semibold text-acc underline decoration-acc/40 hover:decoration-acc" onClick={closeDrawers}>{t('log in or create one')}</Link>.
            </p>
          </div>
        ) : null}
        <div className="ship-progress border-b border-line px-5 py-4">
          <p className="font-cond text-[.85rem] tracking-[.08em] text-muted" id="shipMsg">
            {left > 0
              ? <>{t('You are')} <i className="not-italic font-bold text-acc">{money(left)}</i> {t('away from')} <i className="not-italic font-bold text-txt">{t('FREE SHIPPING')}</i></>
              : <i className="not-italic font-bold text-ok">{t('FREE SHIPPING UNLOCKED')}</i>}
          </p>
          <div className="sp-bar mt-2 h-1 bg-line2">
            <b className={'block h-full bg-acc transition-transform duration-500 ' + (left <= 0 ? 'w-full' : '')} id="shipFill" style={{ transform: 'scaleX(' + Math.min(1, sum / (FREE_SHIP || 1)) + ')', transformOrigin: 'left' }} />
          </div>
        </div>
        <div className="drawer-items flex-1 overflow-y-auto p-5" id="cartItems">
          {!keys.length ? (
            <div className="drawer-empty flex h-full flex-col items-center justify-center gap-3 text-center">
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-line2" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 7h12l1.2 13.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1L6 7z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></svg>
              <p className="font-cond tracking-[.15em] text-dim">{t('THE RACK IS EMPTY.')}<br />{t('LOAD IT UP.')}</p>
            </div>
          ) : keys.map((k) => {
            const it = cart[k];
            return <CartRow key={k} item={it} itemKey={k} setQty={setQty} openPDP={openPDP} />;
          })}
        </div>
        <div className="drawer-foot border-t border-line p-5" id="cartFoot" style={{ display: keys.length ? 'block' : 'none' }}>
          <div className="df-row mb-1 flex items-center justify-between font-head text-[.95rem]">
            <span className="text-muted">{t('Subtotal')}</span><b className="text-lg text-txt" id="cartSubtotal">{money(sum)}</b>
          </div>
          <p className="df-note mb-4 font-cond text-[.78rem] tracking-[.05em] text-dim">{t('Shipping, taxes and discount codes are calculated at checkout.')}</p>
          <Link to="/checkout" className="btn-primary mb-3 flex w-full items-center justify-center gap-2 bg-acc py-4 font-head text-[.8rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2" id="goCheckout" onClick={closeDrawers} style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)' }}>
            {t('Checkout')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
          <button className="df-continue w-full font-cond text-[.8rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-txt" onClick={closeDrawers}>{t('Continue shopping')}</button>

          <Link to="/cart" className="mt-2 block text-center font-cond text-[.72rem] uppercase tracking-[.22em] text-dim transition-colors hover:text-acc" onClick={closeDrawers}>
            {t('Open the full cart page')} →
          </Link>
        </div>
      </DrawerShell>
    </>
  );
}

function CartRow({ item, itemKey, setQty, openPDP }) {
  const { isBn } = useLang();
  const { BY_ID } = useCatalog();
  if (item.bundle) return <div className="d-item mb-5 flex justify-between border-b border-line/60 pb-5"><div><p className="font-head font-semibold">{isBn && item.bundleTitleBn ? item.bundleTitleBn : item.bundleTitle}</p><p className="text-xs text-dim">Combo bundle · server priced</p></div><div className="flex items-center gap-2"><button onClick={() => setQty(itemKey, -1)}>−</button>{item.qty}<button onClick={() => setQty(itemKey, 1)}>+</button><b>{money(item.price * item.qty)}</b></div></div>;
  const p = BY_ID[item.id];
  if (!p) return null;
  return (
    <div className="d-item mb-5 flex gap-4 border-b border-line/60 pb-5 last:border-0">
      <img src={p.img} alt="" className="h-20 w-20 cursor-pointer object-cover" onClick={() => openPDP(p.id)} />
      <div className="min-w-0 flex-1">
        <p className="di-name cursor-pointer truncate font-head text-[.9rem] font-semibold hover:text-acc" onClick={() => openPDP(p.id)}>{p.name}</p>
        <p className="di-meta font-cond text-[.78rem] uppercase tracking-[.1em] text-dim">{item.size} · {item.color}</p>
        <div className="di-row mt-2 flex items-center justify-between">
          <span className="di-qty flex items-center gap-3 border border-line2 px-2 py-1">
            <button aria-label="Decrease" className="px-1 text-muted hover:text-acc" onClick={() => setQty(itemKey, -1)}>−</button>
            <b className="text-[.85rem]">{item.qty}</b>
            <button aria-label="Increase" className="px-1 text-muted hover:text-acc" onClick={() => setQty(itemKey, 1)}>+</button>
          </span>
          <span className="flex items-center gap-3">
            <span className="di-price font-head text-[.9rem] font-bold text-acc">{money((+item.price > 0 ? +item.price : p.price) * item.qty)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function WishDrawer() {
  const { drawer, closeDrawers, openPDP } = useUI();
  const { wish, toggleWish, addToCart } = useStore();
  const { BY_ID } = useCatalog();
  const { t } = useLang();
  const open = drawer === 'wish';
  return (
    <DrawerShell id="wishDrawer" open={open} onClose={closeDrawers} title="Wishlist" count={wish.size}>
      <div className="drawer-items flex-1 overflow-y-auto p-5" id="wishItems">
        {!wish.size ? (
          <div className="drawer-empty flex h-full flex-col items-center justify-center gap-3 text-center">
            <svg viewBox="0 0 24 24" className="h-12 w-12 text-line2" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 21s-7.5-4.9-9.8-9.2C.7 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.1 2.3h4c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.2 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" /></svg>
            <p className="font-cond tracking-[.15em] text-dim">NO HEARTS YET.<br />THE IRON AWAITS.</p>
          </div>
        ) : [...wish].map((id) => {
          const p = BY_ID[id];
          if (!p) return null;
          return (
            <div className="wl-item mb-5 flex items-center gap-4 border-b border-line/60 pb-5 last:border-0" key={id}>
              <img src={p.img} alt="" className="h-16 w-16 cursor-pointer object-cover" onClick={() => openPDP(id)} />
              <div className="min-w-0 flex-1">
                <p className="di-name cursor-pointer truncate font-head text-[.9rem] font-semibold hover:text-acc" onClick={() => openPDP(id)}>{p.name}</p>
                <p className="di-meta font-cond text-[.78rem] uppercase tracking-[.1em] text-dim">{p.cat} · {money(p.price)}</p>
                <button className="wl-move mt-2 bg-acc px-3 py-1.5 font-head text-[.68rem] font-extrabold uppercase tracking-[.15em] text-black hover:bg-acc2" data-wl-add={id} onClick={() => addToCart(id, null, null, 1, true)}>Move to Cart</button>
              </div>
              <button className="di-x grid h-8 w-8 place-items-center text-dim hover:text-acc" data-wish={id} aria-label="Remove" onClick={() => toggleWish(id)}>✕</button>
            </div>
          );
        })}
      </div>

      {[...wish].length ? (
        <div className="drawer-foot border-t border-line p-5">
          <Link to="/wishlist" className="block text-center font-cond text-[.72rem] uppercase tracking-[.22em] text-dim transition-colors hover:text-acc" onClick={closeDrawers}>
            {t('Open the full wishlist page')} →
          </Link>
        </div>
      ) : null}
    </DrawerShell>
  );
}
