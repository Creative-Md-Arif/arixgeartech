import { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { fbTrack } from './lib/pixel.js';
import { ROUTES, lazyFor } from './routes.jsx';
import HomePage from './pages/index.jsx';
import SoonPage from './pages/soon.jsx';
import NotFoundPage from './pages/not-found.jsx';

export function MaintenanceScreen({ message }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center" id="maintenanceScreen" data-testid="maintenance">
      <p className="font-disp text-4xl text-txt">arixgear<b className="text-acc">.tech</b></p>
      <div className="mt-6 border border-acc/50 bg-acc/10 px-6 py-4">
        <p className="font-cond text-[.85rem] font-bold uppercase tracking-[.3em] text-acc">⚒ {message || 'Under Maintenance'}</p>
      </div>
      <p className="mt-6 max-w-md text-[.95rem] leading-relaxed text-muted">
        We are upgrading the stack. The shop reopens shortly — your cart and wishlist are safe, and order tracking stays live.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-8 bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2"
        id="maintRetry"
      >
        Try again
      </button>
      <Link to="/track-order" className="mt-4 font-cond text-[.8rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-acc">Track an existing order →</Link>
    </div>
  );
}

/* chunk fallback — matches the skeleton language used across the app */
function PageFallback() {
  return (
    <div className="container mx-auto w-[92%] py-16" aria-hidden="true">
      <div className="h-3 w-32 animate-pulse bg-line/60" />
      <div className="mt-6 grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse bg-line/40" />
        ))}
      </div>
    </div>
  );
}

const PAGE_BY_PATH = {
  '/': 'home',
  '/shop': 'shop',
  '/about': 'about',
  '/guides': 'guides',
  '/contact': 'contact',
  '/account': 'account',
  '/checkout': 'checkout',
  '/success': 'success',
  '/track-order': 'track-order',
  '/flash-sale': 'flash-sale',
};

/* old multi-page URLs → clean SPA routes */
const LEGACY = {
  '/index.html': '/',
  '/home.html': '/',
  '/shop.html': '/shop',
  '/about.html': '/about',
  '/guides.html': '/guides',
  '/blog.html': '/guides',
  '/contact.html': '/contact',
  '/membership.html': '/',
  '/account.html': '/account',
  '/checkout.html': '/checkout',
  '/success.html': '/success',
  '/track.html': '/track-order',
  '/track-order.html': '/track-order',
};

let booted = false;

function RouteEffects() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.body.dataset.page = PAGE_BY_PATH[pathname] || 'page';
    if (!booted) { booted = true; return; }
    fbTrack('PageView');
    if (!hash) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  /* "#section" navigation (header/footer/section links) — element may render
     after the CMS fetch, so retry the lookup briefly before giving up. */
  useEffect(() => {
    if (!hash || hash.length < 2) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); clearInterval(t); }
      else if (++tries > 12) clearInterval(t);
    }, 90);
    return () => clearInterval(t);
  }, [hash]);

  return null;
}

export default function App() {
  return (
    <>
      <RouteEffects />
      <Routes>
        {Object.entries(LEGACY).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route element={<Layout />}>
          {ROUTES.map((r) => {
            if (r.path === '/') {
              return <Route key={r.path} path={r.path} element={<HomePage />} />;
            }
            const Lazy = lazyFor(r);
            return (
              <Route
                key={r.path}
                path={r.path}
                element={<Suspense fallback={<PageFallback />}>{Lazy ? <Lazy /> : <SoonPage route={r} />}</Suspense>}
              />
            );
          })}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
