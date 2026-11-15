/* ArixGear store — UI context: drawers (cart/wish), toasts, mobile panel.
   Phase 2: the PDP is a real route (/product/:slug) — openPDP() navigates;
   the overlay state (pdpId/closePDP) is gone. */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const Ctx = createContext(null);

export function UIProvider({ children }) {
  const [drawer, setDrawer] = useState(null);        /* 'cart' | 'wish' | null */
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();

  const toast = useCallback((title, sub) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const openDrawer = useCallback((which) => setDrawer(which), []);
  const closeDrawers = useCallback(() => setDrawer(null), []);
  /* Phase 2 — routed PDP: every product open is a real URL now */
  const openPDP = useCallback((id) => {
    setDrawer(null);
    setMobileOpen(false);
    navigate('/product/' + encodeURIComponent(id));
  }, [navigate]);

  useEffect(() => {
    const onOpen = (e) => setDrawer(e.detail);
    const onToast = (e) => toast(e.detail.title, e.detail.sub);
    window.addEventListener('forged:open-drawer', onOpen);
    window.addEventListener('forged:toast', onToast);
    return () => { window.removeEventListener('forged:open-drawer', onOpen); window.removeEventListener('forged:toast', onToast); };
  }, [toast]);

  /* body lock while any drawer/panel is open */
  useEffect(() => {
    document.body.classList.toggle('lock', Boolean(drawer || mobileOpen));
  }, [drawer, mobileOpen]);

  const value = {
    drawer, openDrawer, closeDrawers,
    openPDP,
    mobileOpen, setMobileOpen,
    toasts, toast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUI = () => useContext(Ctx);
