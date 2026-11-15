/* ArixGear page — index (home): the 13-section conversion-spec stack (Phase 3),
   100% admin-driven via /api/home-sections:
     #1 utility bar + #2 primary navbar + #3 secondary category navbar (header chrome)
     #4 hero + 2 side promos (HeroPromos column)
     #5 ticker · #6 quick services · #7 category grid · #8 flash deals + countdown
     #9 new arrivals · #10 best sellers · #11 combo bundles
     #12 community stories (athletes + member stories) · #13 footer + newsletter
   Known keys keep bespoke components placed by the admin's order number (legacy
   fixed order as fallback); any NEW admin-created section renders through
   sections/Generic.jsx at its order position. */
import { Fragment, useEffect, useState } from 'react';
import Hero from './sections/Hero.jsx';
import HeroPromos from './sections/HeroPromos.jsx';
import Ticker from './sections/Ticker.jsx';
import QuickServices from './sections/QuickServices.jsx';
import CategoryTiles from './sections/CategoryTiles.jsx';
import FlashDeals from './sections/FlashDeals.jsx';
import NewArrivals from './sections/NewArrivals.jsx';
import BestSellers from './sections/BestSellers.jsx';
import ComboBundles from './sections/ComboBundles.jsx';
import Arsenal from './sections/Arsenal.jsx';
import CreatorsCommunity from './sections/CreatorsCommunity.jsx';
import Stories from './sections/Stories.jsx';
import HomepageSkeleton from './sections/HomepageSkeleton.jsx';
import Generic from './sections/Generic.jsx';
import { useContent } from '../store/content.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { useSEO } from '../lib/seo.jsx';
import { getActiveTheme } from '../lib/theme.js';

/* bespoke components — key → component + the order it keeps when the admin row
   is absent (the Phase 3 visual order). goal-panels + membership teaser were
   removed with the fitness vertical (Phase 2). */
const KNOWN = [
  { key: 'hero-slider', C: Hero, at: 1 },
  { key: 'ticker', C: Ticker, at: 2 },
  { key: 'quick-services', C: QuickServices, at: 3 },
  { key: 'categories', C: CategoryTiles, at: 4 },
  { key: 'flash-deals', C: FlashDeals, at: 5 },
  { key: 'new-arrivals', C: NewArrivals, at: 6 },
  { key: 'best-sellers', C: BestSellers, at: 7 },
  { key: 'combo-bundles', C: ComboBundles, at: 8 },
  { key: 'arsenal', C: Arsenal, at: 9 },
  { key: 'athletes', C: CreatorsCommunity, at: 10 },
  { key: 'stories', C: Stories, at: 11 },
];

export default function Page() {
  useSEO('home');
  const [visualTheme, setVisualTheme] = useState(getActiveTheme);
  useEffect(() => { const update = (event) => setVisualTheme(event.detail || {}); window.addEventListener('arixgear:theme', update); return () => window.removeEventListener('arixgear:theme', update); }, []);
  const { homeSections, sideBanners, hiddenSections, homeDataReady } = useContent();
  const { READY, CAT_READY, CAT_OBJS, PRODUCTS } = useCatalog();

  const rows = Array.isArray(homeSections) ? homeSections : [];
  const knownKeys = KNOWN.map((section) => section.key);
  const nodes = KNOWN.map((def) => {
    const row = rows.find((section) => section && section.key === def.key);
    return {
      k: def.key,
      C: def.C,
      row,
      o: row && Number(row.order) > 0 ? Number(row.order) : def.at,
      at: def.at,
    };
  });
  rows.forEach((row, ix) => {
    if (!row || !row.key || knownKeys.includes(row.key)) return;
    nodes.push({
      k: row.key,
      row,
      o: Number(row.order) > 0 ? Number(row.order) : 90,
      at: 100 + ix,
    });
  });
  nodes.sort((a, b) => (a.o - b.o) || (a.at - b.at));

  if (!homeDataReady || !READY || !CAT_READY) {
    const categoryRow = rows.find((row) => row && row.key === 'categories');
    const rootCategories = CAT_OBJS.filter((category) => !category.parent);
    const configuredCategories = Array.isArray(categoryRow?.config?.categories) ? categoryRow.config.categories : [];
    const categoryCount = configuredCategories.length
      ? configuredCategories.filter((slug) => rootCategories.some((category) => category.slug === String(slug).toLowerCase())).length
      : rootCategories.length;
    const arsenalRow = rows.find((row) => row && row.key === 'arsenal');
    const configuredProducts = Array.isArray(arsenalRow?.config?.products) ? arsenalRow.config.products : [];
    const arsenalCount = configuredProducts.length
      ? (configuredProducts.filter((slug) => PRODUCTS.some((product) => product.id === slug)).length || PRODUCTS.length)
      : PRODUCTS.length;
    return (
      <HomepageSkeleton
        sections={nodes.filter((node) => visualTheme.homepage?.sections?.[node.k] !== false).map((node) => ({
          ...(node.row || {}),
          key: node.k,
          order: node.o,
          __configured: Boolean(node.row),
        }))}
        hidden={hiddenSections}
        promoCount={2}
        categoryCount={categoryCount}
        productCount={arsenalCount}
      />
    );
  }
  const hasSidePromos = Array.isArray(sideBanners) && sideBanners.some((banner) => banner && (banner.image || banner.title));

  /* #4 of 13 — the hero zone: slider + side promos (column on xl, grid under on small) */
  return (
    <>{nodes.filter((node) => visualTheme.homepage?.sections?.[node.k] !== false).map((x) => (
      x.k === 'hero-slider'
        ? <div key="hero-zone" data-theme-section className={'container mx-auto w-[92%] home-hero-zone' + (hasSidePromos ? ' has-side-promos' : '')}><Hero /><HeroPromos /></div>
        : <div key={x.k} data-theme-section className="theme-home-section">{x.C ? <x.C /> : <Generic sec={x.row} />}</div>
    ))}</>
  );
}
