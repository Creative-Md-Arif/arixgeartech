/* ArixGear component — mobile nav panel + mobile search */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog } from '../store/catalog.jsx';
import { useContent } from '../store/content.jsx';
import { useUI } from '../store/ui.jsx';
import { go } from '../lib/go.js';
import { fbTrack } from '../lib/pixel.js';
import { useLang } from '../lib/i18n.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const LINKS = [
  { label: 'Flash Sale', to: '/flash-sale' },
  { label: 'Shop All', to: '/shop' },
  { label: 'My Account', to: '/account' },
];

export default function MobilePanel() {
  const { mobileOpen, setMobileOpen, openPDP, toast } = useUI();
  const { PRODUCTS } = useCatalog();
  const { catTree, catTreeReady } = useContent();
  const { t, lang, toggle } = useLang();
  const [q, setQ] = useState('');
  const [openCat, setOpenCat] = useState(null);
  const categories = catTree
    .filter((category) => category.showInNavbar !== false)
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 12);
  const renderCategoryLinks = (nodes, depth = 0) => (nodes || [])
    .filter((category) => category.showInNavbar !== false)
    .map((category) => (
      <div key={category.slug}>
        <Link
          to={'/shop?cat=' + encodeURIComponent(category.slug)}
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-between border-b border-line/40 py-2.5 text-sm text-muted last:border-0 hover:text-acc"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <span>{lang === 'bn' && category.nameBn ? category.nameBn : category.name}</span>
          {category.productCount != null ? <span className="font-cond text-xs text-dim2">{category.productCount}</span> : null}
        </Link>
        {renderCategoryLinks(category.children, depth + 1)}
      </div>
    ));

  const search = () => {
    const s = q.trim().toLowerCase();
    if (!s) return;
    fbTrack('Search', { search_string: s });
    const hit = PRODUCTS.find((p) => (p.name + ' ' + p.cat).toLowerCase().includes(s));
    if (hit) { setMobileOpen(false); openPDP(hit.id); }
    else toast(t('No match'), t('Try "tee", "belt", "whey"…'));
  };

  return (
    <div className={'mobile-panel fixed inset-0 z-[950] flex flex-col bg-bg2 transition-transform duration-300 lg:hidden ' + (mobileOpen ? 'translate-x-0' : '-translate-x-full')} id="mobilePanel" aria-hidden={!mobileOpen}>
      <div className="border-b border-line p-4 pb-3">
        <div className="flex items-center justify-between">
          <span className="font-disp text-xl">arixgear<b className="text-acc">.tech</b></span>
          <button className="grid h-10 w-10 place-items-center text-muted" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <ThemeToggle variant="pill" />
          <button
            id="mobileLangToggle"
            className="flex items-center gap-1.5 border border-line2 bg-panel px-3 py-2 font-cond text-xs font-semibold uppercase tracking-[.15em] text-txt transition-colors hover:border-acc hover:text-acc"
            aria-label={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}
            onClick={toggle}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
            </svg>
            {lang === 'en' ? 'বাংলা' : 'English'}
          </button>
        </div>
      </div>
      <nav className="flex flex-1 flex-col overflow-y-auto p-2">
        <div className="mb-2 border-b border-line pb-2" aria-label="Categories">
          <div className="px-4 py-2 font-cond text-xs font-bold uppercase tracking-[.2em] text-dim">{t('Categories')}</div>
          {!catTreeReady ? (
            <div className="space-y-2 px-4 py-2" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-4 w-2/3 animate-pulse rounded bg-line/70" />)}
            </div>
          ) : categories.map((root) => (
            <div key={root.slug}>
              <div className="flex items-center border-b border-line/60">
                <Link
                  to={'/shop?cat=' + encodeURIComponent(root.slug)}
                  onClick={() => setMobileOpen(false)}
                  className="min-w-0 flex-1 px-4 py-3 font-disp text-base uppercase tracking-wide text-txt transition-colors hover:text-acc"
                >
                  <span className="break-words">{lang === 'bn' && root.nameBn ? root.nameBn : root.name}</span>
                </Link>
                {root.children && root.children.length ? (
                  <button type="button" className="px-4 py-3 text-xl text-dim2" aria-label={'Toggle ' + root.name + ' subcategories'} aria-expanded={openCat === root.slug}
                    onClick={() => setOpenCat((v) => v === root.slug ? null : root.slug)}>
                    {openCat === root.slug ? '−' : '+'}
                  </button>
                ) : null}
              </div>
              {openCat === root.slug && root.children?.some((child) => child.showInNavbar !== false) ? (
                <div className="bg-panel px-3 py-1">
                  {renderCategoryLinks(root.children)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {LINKS.map((l) => l.hash ? (
          <a
            key={l.label}
            href={l.hash}
            onClick={(e) => { e.preventDefault(); setMobileOpen(false); go(l.hash); }}
            className="border-b border-line/60 px-4 py-3 font-disp text-xl uppercase tracking-wide text-txt transition-colors hover:text-acc"
          >
            {t(l.label)}
          </a>
        ) : (
          <Link
            key={l.label}
            to={l.to}
            onClick={() => setMobileOpen(false)}
            className="border-b border-line/60 px-4 py-3 font-disp text-xl uppercase tracking-wide text-txt transition-colors hover:text-acc"
          >
            {t(l.label)}
          </Link>
        ))}
      </nav>
      <div className="mp-search border-t border-line p-4">
        <input
          type="text" id="mobileSearchInput" placeholder={t('SEARCH GEAR…')} aria-label="Search products"
          className="w-full border border-line2 bg-panel px-4 py-3 font-cond tracking-[.15em] text-txt placeholder:text-dim focus:border-acc focus:outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
        />
      </div>
    </div>
  );
}
