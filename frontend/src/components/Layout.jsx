/* App-wide providers and shared layout for storefront routes. */
import { useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { CatalogProvider } from '../store/catalog.jsx';
import { StoreProvider } from '../store/store.jsx';
import { ContentProvider, useContent } from '../store/content.jsx';
import { UIProvider, useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx'; /* bilingual maintenance message */
import { useStore } from '../store/store.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { initPixel } from '../lib/pixel.js';
import { initAnalytics } from '../lib/analytics.js';
import { connectRealtime, disconnectRealtime } from '../lib/realtime.js'; /* storefront socket client */
import Header from './Header.jsx';
import MobilePanel from './MobilePanel.jsx';
import { CartDrawer, WishDrawer } from './Drawers.jsx';
import Toasts from './Toasts.jsx';
import ChatWidget from './ChatWidget.jsx';
import InstallPrompt from './InstallPrompt.jsx';
import Footer, { Newsletter } from './Footer.jsx';

/* routes without the newsletter block (legacy page parity) */
const NO_NEWSLETTER = ['/checkout', '/success'];

function Chrome({ children }) {
  const { mobileOpen, closeDrawers, setMobileOpen } = useUI();
  const { pathname } = useLocation();
  const { homeDataReady } = useContent();
  const { READY: catalogReady, CAT_READY: categoriesReady } = useCatalog();
  const homePending = pathname === '/' && (!homeDataReady || !catalogReady || !categoriesReady);

  useEffect(() => { initPixel(); initAnalytics(); }, []); /* Meta Pixel + GA4 — admin-driven, once per boot */

  /* Socket.IO gateway client: connect with the session JWT (reconnect
     on login/account switch, disconnect on logout). Guests stay offline — the
     SSE bell covers notifications; the socket adds live order rooms. */
  const { session } = useStore();
  useEffect(() => {
    if (session && session.token) connectRealtime(session.token);
    else disconnectRealtime();
  }, [session && session.token]); // eslint-disable-line react-hooks/exhaustive-deps

  /* SPA navigation = a fresh page in the multi-page era: close overlays */
  useEffect(() => {
    closeDrawers();
    setMobileOpen(false);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Header />
      <MobilePanel />
      <main>{children}</main>
      {!homePending && !NO_NEWSLETTER.includes(pathname) ? <Newsletter /> : null}
      {!homePending ? <Footer /> : null}
      <CartDrawer />
      <WishDrawer />
      <ChatWidget />
      <InstallPrompt />
      <Toasts />
    </>
  );
}

/* Full layout — wraps every storefront route (Outlet renders the active page) */
/* maintenance gate: sits below ContentProvider so it can read the
   live flag; when ON it replaces the whole chrome (header/footer/page) with
   the branded holding screen. Admin SPA is a separate build and unaffected. */
function MaintainGate({ children }) {
  const { content } = useContent();
  const { isBn, t } = useLang();
  if (content && content.maintenance && content.maintenance.enabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center" id="maintenanceScreen" data-testid="maintenance">
        <p className="font-disp text-4xl text-txt">ArixGear<b className="text-acc">.</b></p>
        <div className="mt-6 border border-acc/50 bg-acc/10 px-6 py-4">
          <p className="font-cond text-[.85rem] font-bold uppercase tracking-[.3em] text-acc">⚒ {(isBn && content.maintenance.messageBn) ? content.maintenance.messageBn : (content.maintenance.message || 'Under Maintenance')}</p>
        </div>
        <p className="mt-6 max-w-md text-[.95rem] leading-relaxed text-muted">
          {t('We are upgrading the ArixGear. The shop reopens shortly — your cart and wishlist are safe, and order tracking stays live.')}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2"
          id="maintRetry"
        >
          {t('Try again')}
        </button>
        <Link to="/track-order" className="mt-4 font-cond text-[.8rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-acc">{t('Track an existing order')} →</Link>
      </div>
    );
  }
  return children;
}

export default function Layout() {
  return (
    <CatalogProvider>
      <StoreProvider>
        <ContentProvider>
          <UIProvider>
            <MaintainGate>
              <Chrome>
                <Outlet />
              </Chrome>
            </MaintainGate>
          </UIProvider>
        </ContentProvider>
      </StoreProvider>
    </CatalogProvider>
  );
}
