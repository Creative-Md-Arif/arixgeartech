/* ArixGear component — site header: announce bar, logo, nav, search popup, actions */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../store/catalog.jsx";
import { useStore } from "../store/store.jsx";
import { useUI } from "../store/ui.jsx";
import { useContent } from "../store/content.jsx";
import { go } from "../lib/go.js";
import { money } from "../lib/format.js";
import { fbTrack } from "../lib/pixel.js";
import { suggestProducts } from "../services/products.js";
import { useLang, LangToggle } from "../lib/i18n.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import NotificationBell from "./NotificationBell.jsx";

function SearchPopup({ className = "" }) {
  const { PRODUCTS } = useCatalog();
  const { openPDP } = useUI();
  const { t, isBn } = useLang();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [srv, setSrv] = useState([]); /* Task 27 — server-side suggest hits */
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const runSearch = (v) => {
    setQ(v);
    const s = v.trim().toLowerCase();
    if (!s) {
      setOpen(false);
      return;
    }
    const list = PRODUCTS.filter((p) =>
      (p.name + " " + (p.nameBn || "") + " " + p.cat).toLowerCase().includes(s),
    ).slice(0, 6); // Task 58 — Bn names searchable too
    setResults(list);
    setActive(0);
    setOpen(true);
  };

  /* Task 27 — whole-catalog typeahead: the local mirror holds ≤48 products, so
     anything deeper (or shortDesc-only matches) arrives via /search/suggest.
     Debounced 250ms; silent failure keeps the local results intact. */
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setSrv([]);
      return;
    }
    const t = setTimeout(() => {
      suggestProducts(s)
        .then((d) => setSrv(d.items || []))
        .catch(() => setSrv([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  /* merged dropdown rows — local mirror first, then server-only extras */
  const list = (() => {
    const seen = new Set(results.map((r) => r.id));
    const extras = srv
      .filter((it) => it && it.slug && !seen.has(it.slug))
      .map((it) => ({
        id: it.slug,
        name: it.name,
        nameBn: it.nameBn || "",
        cat: it.category || "Gear", // Task 58
        rating: +it.rating || 0,
        price: +it.price || 0,
        img: (it.images && it.images[0] && it.images[0].url) || "",
        deep: true /* rendered without the local highlight marks */,
      }));
    return [...results, ...extras].slice(0, 10);
  })();

  const pick = (p) => {
    if (q.trim())
      fbTrack("Search", {
        search_string: q.trim(),
        content_ids: [p.id],
        content_type: "product",
      });
    setOpen(false);
    setQ("");
    setSrv([]);
    openPDP(p.id);
  };

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (
        e.key === "/" &&
        !/INPUT|TEXTAREA/.test(document.activeElement.tagName)
      ) {
        e.preventDefault();
        boxRef.current?.querySelector("input")?.focus();
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className={`search relative hidden items-center gap-2 border-b border-transparent bg-white/[.03] px-3 py-2 transition-all focus-within:border-line2 md:flex ${className}`}
      ref={boxRef}
      id="searchBox"
      data-open={open}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-dim"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        id="searchInput"
        type="text"
        placeholder={t("SEARCH GEAR")}
        autoComplete="off"
        spellCheck="false"
        aria-label="Search products"
        className="w-24 bg-transparent font-cond text-[.9rem] tracking-[.12em] text-txt placeholder:text-dim focus:w-44 focus:outline-none transition-all"
        value={q}
        onChange={(e) => runSearch(e.target.value)}
        onFocus={() => {
          if (q.trim()) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % Math.max(list.length, 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + list.length) % Math.max(list.length, 1));
          } else if (e.key === "Enter" && list[active]) {
            e.preventDefault();
            pick(list[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            e.target.blur();
          }
        }}
      />
      <kbd className="hidden border border-line2 px-1.5 font-cond text-[.7rem] text-dim lg:block">
        /
      </kbd>
      {open && (
        <div
          className="search-pop absolute left-0 right-0 top-[calc(100%+10px)] z-50 max-h-[70vh] overflow-y-auto border border-line2 bg-panel shadow-2xl shadow-black"
          id="searchPop"
          role="listbox"
        >
          {list.length ? (
            list.map((p, i) => {
              const re = new RegExp(
                "(" + q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
                "ig",
              );
              const nm = isBn && p.nameBn ? p.nameBn : p.name; // Task 58 — bilingual suggestion label
              return (
                <div
                  key={p.id}
                  className={
                    "sp-item flex cursor-pointer items-center gap-3 border-b border-line/60 p-2.5 last:border-0 hover:bg-white/[.04] " +
                    (i === active ? "bg-white/[.05]" : "")
                  }
                  data-sp={p.id}
                  onClick={() => pick(p)}
                >
                  <img
                    src={p.img}
                    alt=""
                    className="h-11 w-11 shrink-0 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-head text-[.85rem] font-semibold">
                      {p.deep ? (
                        <span>{nm}</span>
                      ) : (
                        nm.split(re).map((part, j) =>
                          re.test(part) && part.match(re) ? (
                            <mark key={j} className="bg-acc/30 text-acc">
                              {part}
                            </mark>
                          ) : (
                            <span key={j}>{part}</span>
                          ),
                        )
                      )}
                    </div>
                    <div className="font-cond text-[.72rem] uppercase tracking-[.15em] text-dim">
                      {t(p.cat)} · ★ {p.rating}
                      {p.deep ? "" : ""}
                    </div>
                  </div>
                  <span className="font-head text-[.8rem] font-bold text-acc">
                    {money(p.price)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="sp-empty p-4 text-center font-cond text-[.85rem] tracking-[.1em] text-dim">
              {t("No gear matches")} &ldquo;{q}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Task 57 — slim header: secondary menus (Goals/Athletes/Stories/About/Guides/Contact)
   moved to the footer, where they already live. Header keeps only core commerce nav.
   Flash Sale gets the hottest spot — accent, first. */
const NAV = [
  { label: "Flash Sale", to: "/flash-sale", hot: true },

];

/* Phase 3 (#3 of 13) — SECONDARY CATEGORY NAVBAR: tree-driven strip under the
   primary nav. Hover/focus a root → dropdown with its subcategories + live
   counts; every link deep-links to /shop?cat=<slug> (branch-filtered). */
function CatNavbar() {
  const { catTree, catTreeReady } = useContent();
  const { t, isBn } = useLang();
  const [open, setOpen] = useState(null);
  const visibleCategories = catTree
    .filter((category) => category.showInNavbar !== false)
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 12);
  const renderChildren = (nodes, depth = 0) => (nodes || [])
    .filter((child) => child.showInNavbar !== false)
    .map((child) => (
      <div key={child.slug}>
        <Link
          to={"/shop?cat=" + encodeURIComponent(child.slug)}
          className={'flex items-center justify-between gap-3 rounded px-2.5 py-2 transition-colors hover:bg-white/[.05] hover:text-acc ' + (depth ? 'text-[.8rem] text-muted' : 'text-[.88rem] font-semibold text-txt')}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          onClick={() => setOpen(null)}
        >
          <span>{isBn && child.nameBn ? child.nameBn : child.name}</span>
          <span className="font-cond text-[.72rem] tracking-[.1em] text-dim">
            {child.productCount != null ? child.productCount : ''}
          </span>
        </Link>
        {renderChildren(child.children, depth + 1)}
      </div>
    ));
  return (
    <nav
      className="catnav hidden min-h-[86px] border-t border-line bg-panel/60 lg:block 2xl:min-h-[62px]"
      id="catNav"
      onMouseLeave={() => setOpen(null)}
      aria-busy={!catTreeReady}
    >
      <div className="container mx-auto flex min-h-[86px] w-full items-stretch justify-between gap-0 px-0 2xl:min-h-[62px]">
        {!catTreeReady ? (
          <div className="flex w-full items-center justify-between gap-1" aria-hidden="true">
            {Array.from({ length: 12 }, (_, item) => (
              <span key={item} className="h-3 min-w-0 flex-1 animate-pulse rounded bg-line/70" />
            ))}
          </div>
        ) : null}
        {catTreeReady ? visibleCategories.map((root, index) => {
          const visibleChildren = (root.children || []).filter((child) => child.showInNavbar !== false);
          return (
          <div
            key={root.slug}
            className="catnav-item relative flex shrink-0 items-center self-stretch"
            onMouseEnter={() => setOpen(root.slug)}
          >
            <Link
              to={"/shop?cat=" + encodeURIComponent(root.slug)}
              className={
                "relative flex h-full min-w-0 items-center justify-center px-1 py-2.5 text-center font-cond text-[.72rem] font-bold uppercase leading-tight tracking-[.04em] transition-colors 2xl:px-1.5 2xl:text-[.8rem] 2xl:tracking-[.06em] " +
                (open === root.slug ? "text-acc" : "text-muted hover:text-acc")
              }
              onFocus={() => setOpen(root.slug)}
            >
              <span className="max-w-full whitespace-normal break-words text-center">{isBn && root.nameBn ? root.nameBn : root.name}</span>
            </Link>
            {open === root.slug && visibleChildren.length ? (
              <div className={'catnav-drop absolute top-full z-50 max-h-[70vh] w-[min(460px,calc(100vw-2rem))] overflow-y-auto border border-line bg-panel p-4 shadow-2xl shadow-black/60 ' + (index < 4 ? 'left-0' : index > 7 ? 'right-0' : 'left-1/2 -translate-x-1/2')}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {renderChildren(visibleChildren)}
                </div>
                <Link
                  to={"/shop?cat=" + encodeURIComponent(root.slug)}
                  className="mt-3 inline-flex items-center gap-2 border-t border-line pt-3 font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-acc hover:text-acc2"
                  onClick={() => setOpen(null)}
                >
                  {t("Shop all {c}", {
                    c: isBn && root.nameBn ? root.nameBn : root.name,
                  })}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            ) : null}
          </div>
          );
        }) : null}
      </div>
    </nav>
  );
}

export default function Header() {
  const { cartTotals, wish, session } = useStore();
  const { openDrawer, setMobileOpen } = useUI();
  const { t } = useLang();
  const { n } = cartTotals();
  const [bump, setBump] = useState(false);
  const { sectionVisible, sectionCfg, homeDataReady } = useContent();
  /* announce bar = first admin-managed ticker item (hidden when the ticker is off) */
  const announce = sectionVisible("ticker")
    ? ((sectionCfg("ticker") || {}).items || [])[0] || ""
    : "";

  useEffect(() => {
    if (n > 0) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 500);
      return () => clearTimeout(t);
    }
  }, [n]);

  return (
    <header
      id="siteHeader"
      className="sticky top-0 z-[900] border-b border-line bg-bg/95 backdrop-blur"
    >
      <div className={'announce min-h-6 text-center font-cond text-[.78rem] font-semibold uppercase tracking-[.25em]' + (announce ? ' bg-acc text-black' : '')} aria-busy={!homeDataReady}>
        {announce ? (
          <span className="hidden sm:inline">{announce}</span>
        ) : null}
        {announce ? (
          <span className="sm:hidden">{String(announce).split("·")[0].trim()}</span>
        ) : null}
      </div>
      <div className="hdr-main container mx-auto flex w-[92%] items-center justify-between gap-2 py-4 sm:gap-4">
        <button
          className="burger flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
          id="burgerBtn"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <span className="block h-0.5 w-6 bg-txt" />
          <span className="block h-0.5 w-6 bg-txt" />
          <span className="block h-0.5 w-4 bg-acc" />
        </button>
        <a
          className="logo font-disp text-[1.7rem] leading-none tracking-wide text-txt"
          href="#hero"
          onClick={(e) => {
            e.preventDefault();
            go("#hero");
          }}
        >
          arixgear<b className="text-acc">.tech</b>
          <span className="reg ml-2 hidden font-cond text-[.6rem] tracking-[.3em] text-dim sm:inline">
            TECH & GADGETS
          </span>
        </a>
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <SearchPopup className="w-full max-w-[360px]" />
        </div>
        <nav className="main-nav hidden shrink-0 items-center gap-5 lg:flex xl:gap-6">
          {NAV.map((l) =>
            l.hash ? (
              <a
                key={l.label}
                href={l.hash}
                onClick={(e) => {
                  e.preventDefault();
                  go(l.hash);
                }}
                className="font-cond text-[.82rem] font-semibold uppercase tracking-[.22em] text-muted transition-colors hover:text-acc"
              >
                {t(l.label)}
              </a>
            ) : (
              <Link
                key={l.label}
                to={l.to}
                className={
                  (l.hot
                    ? "text-acc hover:text-acc2 animate-[flashSaleGlow_1.8s_ease-in-out_infinite]"
                    : "text-muted hover:text-acc") +
                  " font-cond text-[.82rem] font-semibold uppercase tracking-[.22em] transition-colors"
                }
              >
                {l.hot ? "⚡ " : ""}
                {t(l.label)}
              </Link>
            ),
          )}
        </nav>
        <div className="hdr-actions flex items-center gap-1.5">
          <NotificationBell session={session} />
          <div className="hidden sm:block"><LangToggle /></div>
          <Link
            to="/account"
            className="icon-btn hidden h-10 w-10 place-items-center text-muted transition-colors hover:text-acc sm:grid"
            id="acctBtn"
            aria-label="My Account"
            title="My Account"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
            </svg>
          </Link>
          <div className="hidden sm:block"><ThemeToggle /></div>
          <button
            className="icon-btn relative grid h-10 w-10 place-items-center text-muted transition-colors hover:text-acc"
            id="wishBtn"
            aria-label="Wishlist"
            onClick={() => openDrawer("wish")}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 21s-7.5-4.9-9.8-9.2C.7 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.1 2.3h4c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.2 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" />
            </svg>
            <span
              className={
                "count absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center bg-acc px-1 font-head text-[.6rem] font-extrabold text-black " +
                (wish.size === 0 ? "opacity-0" : "")
              }
              id="wishCount"
            >
              {wish.size}
            </span>
          </button>
          <button
            className="icon-btn relative grid h-10 w-10 place-items-center text-muted transition-colors hover:text-acc"
            id="cartBtn"
            aria-label="Cart"
            onClick={() => openDrawer("cart")}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M6 7h12l1.2 13.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1L6 7z" />
              <path d="M9 10V6a3 3 0 0 1 6 0v4" />
            </svg>
            <span
              className={
                "count absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center bg-acc px-1 font-head text-[.6rem] font-extrabold text-black " +
                (n === 0 ? "opacity-0" : "") +
                (bump ? " animate-bump" : "")
              }
              id="cartCount"
            >
              {n}
            </span>
          </button>
        </div>
      </div>
      <CatNavbar />
    </header>
  );
}
