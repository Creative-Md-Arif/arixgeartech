/* ArixGear store — site content + live settings + home content (100% admin-driven).
   All fetches go through src/services/*; shells are EMPTY (same key shapes) — the
   backend serves contentDefaults merged into /settings/content, so no client copy. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getContent, getPayment, getShipping } from '../services/settings.js';
import { listBanners } from '../services/banners.js';
import { listHomeSections } from '../services/sections.js';
import { getCategoryTree } from '../services/categories.js';

export const EMPTY_PAY_INFO = {
  bkash: { label: 'bKash', num: '', ussd: '', type: 'Send Money', who: '' },
  nagad: { label: 'Nagad', num: '', ussd: '', type: 'Send Money', who: '' },
  rocket: { label: 'Rocket', num: '', ussd: '', type: 'Send Money', who: '' },
};
const EMPTY_SHIP = { freeThreshold: 0, divisions: {} };
const EMPTY_CONTENT = {
  site: {}, newsletter: {}, about: {}, contact: {}, hero: {},
  faqs: [], guides: {}, posts: null,
};

function readHomeCache(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

const Ctx = createContext(null);

export function ContentProvider({ children }) {
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [payInfo, setPayInfo] = useState(EMPTY_PAY_INFO);
  const [shipCfg, setShipCfg] = useState(EMPTY_SHIP);
  const [heroSlides, setHeroSlides] = useState([]);
  const [sideBanners, setSideBanners] = useState(() => {
    const cached = readHomeCache('arixgear_home_side_banners', null);
    return Array.isArray(cached) ? cached : [];
  });
  const [catTree, setCatTree] = useState(() => {
    const cached = readHomeCache('arixgear_category_tree', null);
    return cached && Array.isArray(cached.items) ? cached.items : [];
  });
  const [catTreeReady, setCatTreeReady] = useState(() => !!readHomeCache('arixgear_category_tree', null));
  const [catTreeError, setCatTreeError] = useState(false);
  const categoryTreeRequest = useRef(false);
  const [homeSections, setHomeSections] = useState(() => {
    const cached = readHomeCache('arixgear_home_sections', null);
    return cached && Array.isArray(cached.items) && Array.isArray(cached.hidden)
      ? cached
      : { items: [], hidden: [] };
  });
  const [homeDataReady, setHomeDataReady] = useState(false);

  const refreshCategoryTree = useCallback(async () => {
    if (categoryTreeRequest.current) return;
    categoryTreeRequest.current = true;
    setCatTreeError(false);
    try {
      const d = await getCategoryTree();
      const items = d && Array.isArray(d.items) ? d.items : [];
      setCatTree(items);
      try { localStorage.setItem('arixgear_category_tree', JSON.stringify({ items })); } catch {}
    } catch (_e) {
      setCatTreeError(true);
    } finally {
      categoryTreeRequest.current = false;
      setCatTreeReady(true);
    }
  }, []);

  useEffect(() => {
    const requests = [
      getContent().then((d) => { if (d && d.content) setContent({ ...EMPTY_CONTENT, ...d.content }); }),
      getPayment().then((d) => {
        if (d && d.payments) {
          const next = { ...EMPTY_PAY_INFO };
          ['bkash', 'nagad', 'rocket'].forEach((k) => {
            const p = d.payments[k];
            if (p) next[k] = { label: p.label || k, num: p.number || '', ussd: p.ussd || '', type: p.type || 'Send Money', who: (p.label || k) + ' Personal' };
          });
          setPayInfo(next);
        }
      }),
      getShipping().then((d) => {
        if (d && d.shipping) {
          setShipCfg({ freeThreshold: d.shipping.freeThreshold > 0 ? d.shipping.freeThreshold : 0, divisions: d.shipping.divisions || {} });
        }
      }),
      listBanners('hero').then((d) => { if (d && d.items) setHeroSlides(d.items); }),
      listBanners('side').then((d) => {
        if (d && d.items) {
          const items = d.items.slice(0, 2);
          setSideBanners(items);
          try { localStorage.setItem('arixgear_home_side_banners', JSON.stringify(items)); } catch {}
        }
      }),
      refreshCategoryTree(),
      listHomeSections().then((d) => {
        if (d && d.items) {
          const next = { items: d.items, hidden: d.hidden || [] };
          setHomeSections(next);
          try { localStorage.setItem('arixgear_home_sections', JSON.stringify(next)); } catch {}
        }
      }),
    ];
    Promise.allSettled(requests).then(() => setHomeDataReady(true));
  }, [refreshCategoryTree]);

  useEffect(() => {
    const refreshVisibleCategoryTree = () => {
      if (document.visibilityState === 'hidden') return;
      refreshCategoryTree();
    };
    window.addEventListener('focus', refreshVisibleCategoryTree);
    document.addEventListener('visibilitychange', refreshVisibleCategoryTree);
    const timer = window.setInterval(refreshVisibleCategoryTree, 15000);
    return () => {
      window.removeEventListener('focus', refreshVisibleCategoryTree);
      document.removeEventListener('visibilitychange', refreshVisibleCategoryTree);
      window.clearInterval(timer);
    };
  }, [refreshCategoryTree]);

  /* Homepage admins can update sections while the storefront tab is open.
     Revalidate the section list when the tab becomes active and periodically
     so active/hidden changes do not require a hard refresh. */
  useEffect(() => {
    const refreshHomeSections = () => {
      if (document.visibilityState === 'hidden') return;
      listHomeSections().then((d) => {
        if (!d || !d.items) return;
        const next = { items: d.items, hidden: d.hidden || [] };
        setHomeSections(next);
        try { localStorage.setItem('arixgear_home_sections', JSON.stringify(next)); } catch {}
      }).catch(() => {});
    };
    const onFocus = () => refreshHomeSections();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = window.setInterval(refreshHomeSections, 15000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(timer);
    };
  }, []);

  const divCharge = (k) => {
    const d = shipCfg.divisions || {};
    return d[k] != null ? d[k] : (d.dhaka != null ? d.dhaka : 0);
  };
  const sectionCfg = (key) => {
    const it = homeSections.items.find((x) => x.key === key);
    return it ? it.config || {} : {};
  };
  const sectionVisible = (key) => !homeSections.hidden.includes(key);

  const value = {
    content, payInfo, shipCfg, heroSlides, sideBanners, catTree, catTreeReady, catTreeError, refreshCategoryTree, homeSections: homeSections.items, homeDataReady,
    hiddenSections: homeSections.hidden, divCharge, sectionCfg, sectionVisible,
    FREE_SHIP: shipCfg.freeThreshold,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useContent = () => useContext(Ctx);
