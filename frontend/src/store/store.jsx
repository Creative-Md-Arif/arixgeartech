/* ArixGear store — cart / wishlist / session context (React port of core/store.js).
   Same localStorage keys (forged_v1, forged_session, forged_orders) and the
   same DOM contract ids, so every QA journey keeps working. */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useCatalog, firstStock, priceFor, stockFor } from './catalog.jsx';
import { fbTrack } from '../lib/pixel.js';
import { tr } from '../lib/i18n.jsx';
import { getSession, setSession, getOrders, pushOrder } from '../lib/storage.js';

const Ctx = createContext(null);

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem('forged_v1') || '{}');
    return { cart: saved.cart || {}, wish: new Set(saved.wish || []), compare: new Set(saved.compare || []) };
  } catch (e) { return { cart: {}, wish: new Set(), compare: new Set() }; }
}

const COMPARE_MAX = 4;

/* Step 4 (4.4) — total units already in the cart for one product+size, across
   every color line: the backend decrements TOP-LEVEL stock per unit, so the
   clamp budget is shared by all lines of the same product+size. */
function cartQtyFor(cart, id, size) {
  let n = 0;
  for (const k in cart) {
    const it = cart[k];
    if (it.id !== id) continue;
    if (size && String(it.size || '').toLowerCase() !== String(size).toLowerCase()) continue;
    n += +it.qty || 0;
  }
  return n;
}

/* Stock clamp for one cart line. Returns the allowed qty (integer ≥ 0).
   null availability (unknown size on a sized product) → unclamped, exactly
   like today; the server's atomic `stock >= qty` guard stays the final
   authority either way. */
function allowedQty(p, size, wanted) {
  const avail = stockFor(p, size);
  if (avail === null || avail === undefined) return wanted;
  return Math.max(0, Math.min(wanted, avail));
}

export function StoreProvider({ children }) {
  const { BY_ID } = useCatalog();
  const saved = useMemo(loadSaved, []);
  const [cart, setCart] = useState(saved.cart);
  const [wish, setWish] = useState(saved.wish);
  const [compare, setCompare] = useState(saved.compare);
  const [promo, setPromo] = useState(null);
  const [division, setDivision] = useState('dhaka');
  const [lastOrder, setLastOrder] = useState(null);
  const [session, setSessionState] = useState(() => getSession());

  useEffect(() => {
    try { localStorage.setItem('forged_v1', JSON.stringify({ cart, wish: [...wish], compare: [...compare] })); } catch (e) {}
  }, [cart, wish, compare]);

  const cartTotals = useCallback(() => {
    let n = 0, sum = 0;
    for (const k in cart) {
      const it = cart[k];
      /* line price was resolved at add time (size-based pricing); legacy carts fall back to base price */
      const unit = it.bundle ? (+it.price || 0) : (+it.price > 0 ? +it.price : ((BY_ID[it.id] || {}).price || 0));
      n += it.qty; sum += it.qty * unit;
    }
    return { n, sum };
  }, [cart, BY_ID]);

  const addToCart = useCallback((id, size, color, qty, open, bundle) => {
    if (bundle) {
      const key = 'bundle|' + bundle.slug;
      setCart((c) => ({ ...c, [key]: { id: null, bundle: bundle.slug, bundleTitle: bundle.title, bundleItems: bundle.items, size: 'Bundle', color: '', qty: (c[key]?.qty || 0) + 1, price: +bundle.bundlePrice } }));
      if (open !== false) window.dispatchEvent(new CustomEvent('forged:open-drawer', { detail: 'cart' }));
      window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Bundle added to cart'), sub: bundle.title } }));
      return;
    }
    const p = BY_ID[id];
    if (!p) return;
    size = size || firstStock(p); color = color || (p.colors[0] || {}).n || 'Default'; qty = Math.max(1, Math.floor(+qty || 1));
    /* Step 4 (4.4) — stock clamp: never let the cart exceed what is actually
       available for this product+size (shared across color lines). The server
       refuses over-stock orders with 409 at checkout; these clamps give the
       honest UX BEFORE that instead of a dead-end error page. */
    const already = cartQtyFor(cart, id, size);
    const avail = stockFor(p, size);
    if (avail !== null && avail !== undefined) {
      if (avail <= 0) {
        window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Out of stock'), sub: p.name + ' — ' + tr('this one just sold out') } }));
        return;
      }
      const room = avail - already;
      if (room <= 0) {
        window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Stock limit reached'), sub: p.name + ' — ' + tr('{n} already in your cart', { n: already }) } }));
        if (open !== false) window.dispatchEvent(new CustomEvent('forged:open-drawer', { detail: 'cart' }));
        return;
      }
      if (qty > room) {
        qty = room;
        window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Adjusted to available stock'), sub: p.name + ' — ' + tr('only {n} left', { n: room }) } }));
      }
    }
    const unit = priceFor(p, size); /* size-based pricing resolved here */
    const key = id + '|' + size + '|' + color;
    setCart((c) => {
      const next = { ...c };
      if (next[key]) next[key] = { ...next[key], qty: next[key].qty + qty, price: unit };
      else next[key] = { id, size, color, qty, price: unit };
      return next;
    });
    if (open !== false) window.dispatchEvent(new CustomEvent('forged:open-drawer', { detail: 'cart' }));
    window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Added to cart'), sub: p.name + ' · ' + size + ' · ' + color } }));
    /* Meta Pixel: AddToCart — fires for every add path (PDP, quick add, wishlist move) */
    fbTrack('AddToCart', { content_name: p.name, content_ids: [p.id], content_type: 'product', content_category: p.cat, value: unit * qty, num_items: qty, currency: 'BDT' });
  }, [BY_ID, cart]);

  const setQty = useCallback((key, d) => {
    setCart((c) => {
      if (!c[key]) return c;
      const next = { ...c };
      const it = next[key];
      const want = it.qty + d;
      if (want <= 0) { delete next[key]; return next; }
      if (it.bundle) { next[key] = { ...it, qty: want }; return next; }
      /* Step 4 (4.4) — the + stepper cannot push past available stock; the
         budget is shared across every color line of the same product+size
         (the server decrements top-level stock per unit). */
      const p = BY_ID[it.id];
      if (d > 0 && p) {
        const avail = stockFor(p, it.size);
        if (avail !== null && avail !== undefined) {
          const others = cartQtyFor(c, it.id, it.size) - it.qty;
          const cap = Math.max(0, Math.min(want, avail - others));
          if (cap < want) {
            window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Stock limit reached'), sub: p.name + ' — ' + tr('only {n} left', { n: cap }) } }));
            if (cap <= 0) delete next[key];
            else next[key] = { ...it, qty: cap };
            return next;
          }
        }
      }
      next[key] = { ...it, qty: want };
      return next;
    });
  }, [BY_ID]);

  /* Step 4 (4.4) — stale-cart reconciliation: localStorage carts survive stock
     changes; when a (re)fresh catalog lands, clamp every line to the current
     availability and tell the customer once per change instead of failing at
     checkout with a 409 the user cannot fix from the error page. */
  useEffect(() => {
    if (!BY_ID || Object.keys(BY_ID).length === 0) return;
    setCart((c) => {
      let changed = false;
      const next = {};
      for (const k in c) {
        const it = c[k];
        if (it.bundle) { next[k] = it; continue; }
        const p = BY_ID[it.id];
        if (!p) { next[k] = it; continue; } /* not in this mirror — leave untouched */
        const cap = allowedQty(p, it.size, it.qty);
        if (cap <= 0) { changed = true; continue; } /* sold out since last visit */
        if (cap < it.qty) { changed = true; next[k] = { ...it, qty: cap }; }
        else next[k] = it;
      }
      if (changed) {
        window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Cart updated to current stock'), sub: tr('quantities were adjusted to what is available right now') } }));
      }
      return changed ? next : c;
    });
  }, [BY_ID]);

  const toggleWish = useCallback((id) => {
    const p = BY_ID[id];
    setWish((w) => {
      const next = new Set(w);
      if (next.has(id)) { next.delete(id); window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Removed from wishlist'), sub: p ? p.name : '' } })); }
      else { next.add(id); window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Saved to wishlist'), sub: (p ? p.name : '') + ' — ' + tr('heart it, lift it, buy it.') } })); }
      return next;
    });
  }, [BY_ID]);

  /* compare tray — max COMPARE_MAX items; /compare renders the side-by-side table */
  const toggleCompare = useCallback((id) => {
    const p = BY_ID[id];
    setCompare((c) => {
      const next = new Set(c);
      if (next.has(id)) {
        next.delete(id);
        window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Removed from compare'), sub: p ? p.name : '' } }));
      } else {
        if (next.size >= COMPARE_MAX) {
          window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Compare tray is full'), sub: tr('Remove one first — max {n} products side by side.', { n: COMPARE_MAX }) } }));
          return c;
        }
        next.add(id);
        window.dispatchEvent(new CustomEvent('forged:toast', { detail: { title: tr('Added to compare'), sub: (p ? p.name : '') + ' — ' + tr('{n} in the tray', { n: next.size }) } }));
      }
      return next;
    });
  }, [BY_ID]);

  const updateSession = useCallback((s) => { setSession(s); setSessionState(s); }, []);
  const logout = useCallback(() => updateSession(null), [updateSession]);

  /* Step 3 audit — http.js clears a dead-token session centrally and fires this
     event; the React mirror must follow or pages keep a zombie session object. */
  useEffect(() => {
    const onExpired = () => setSessionState(null);
    window.addEventListener('forged:session-expired', onExpired);
    return () => window.removeEventListener('forged:session-expired', onExpired);
  }, []);

  const value = {
    cart, setCart, wish, promo, setPromo, division, setDivision,
    lastOrder, setLastOrder, session, setSession: updateSession, logout,
    cartTotals, addToCart, setQty, toggleWish, compare, toggleCompare,
    orders: getOrders(), pushOrder,
  };
  /* QA compatibility: window.state mirror (vanilla parity) */
  if (typeof window !== 'undefined') window.state = { cart, wish, compare };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
