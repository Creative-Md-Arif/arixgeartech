/* ArixGear ADMIN — app shell v2 (Phase 5, 5.1): grouped + collapsible sidebar
   for the 34-module console, topbar + pills, theme + lang toggles.
   Groups persist their collapsed state in localStorage; sub-admins only see
   groups/modules granted to them; Team + Audit stay owner-only. */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { auth, logout, requireAuth } from "../lib/admin.js";
import { getStats } from "../services/stats.js";
import { list as listMessages } from "../services/messages.js";
import { list as listPendingReviews } from "../services/reviews.js";
import { list as listOpenQuestions } from "../services/questions.js";
import { list as listOpenTickets } from "../services/tickets.js";
import NotificationBell from "./NotificationBell.jsx";
import PushBell from "./PushBell.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { tr, useLang, LangToggle } from "../lib/i18n.jsx";

const ic = (d) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[17px] w-[17px] shrink-0 fill-none stroke-current"
    strokeWidth="1.8"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

const I = {
  badges: ic('<path d="M20.5 13.2L13.2 20.5a2.1 2.1 0 01-3 0L3.5 13.8a2.1 2.1 0 010-3L10.2 4h6.3l4 4v5.2z"/><circle cx="14.5" cy="8.5" r="1.2"/>'),
  "quick-services": ic('<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2.5"/><path d="M18 16.5V18l1 1"/>'),
  "spec-schema": ic('<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><circle cx="17.5" cy="17" r="2.5"/>'),
  dashboard: ic(
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  ),
  orders: ic(
    '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/>',
  ),
  returns: ic(
    '<path d="M3 9h13a5 5 0 015 5v0a5 5 0 01-5 5H8"/><path d="M7 5L3 9l4 4"/>',
  ),
  reports: ic(
    '<path d="M3 21h18"/><path d="M6 21v-8M11 21V5M16 21v-11M21 21v-5"/>',
  ),
  payments: ic(
    '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
  ),
  products: ic(
    '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  ),
  brands: ic(
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c2.8 2.5 4.3 5.2 4.3 8.5s-1.5 6-4.3 8.5C9.2 18 7.7 15.3 7.7 12S9.2 6 12 3.5zM3.7 12h16.6"/>',
  ),
  categories: ic(
    '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><path d="M17.2 14v6.5M14 17.2h6.5"/>',
  ),
  bundles: ic(
    '<rect x="3" y="3.5" width="8" height="8" rx="1.5"/><rect x="13" y="3.5" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13.5v7M13.5 17h7"/>',
  ),
  flash: ic('<path d="M13 2L4.5 13.5H11L9.8 22l8.7-11.5H12z"/>'),
  inventory: ic(
    '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/><path d="M8 5.2l8.5 4.5"/>',
  ),
  reviews: ic(
    '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/>',
  ),
  questions: ic(
    '<circle cx="12" cy="12" r="9.2"/><path d="M9.4 9.2a2.7 2.7 0 015.3.9c0 1.8-2.7 2.2-2.7 3.6"/><circle cx="12" cy="17" r=".4" fill="currentColor"/>',
  ),
  banners: ic(
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 15l5-5 4 4 3-3 8 6"/>',
  ),
  homepage: ic(
    '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="8" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
  ),
  coupons: ic(
    '<path d="M3 9a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M13 7v2m0 4v2"/>',
  ),
  deals: ic(
    '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/><path d="M13 8l3 3"/>',
  ),
  ai: ic(
    '<rect x="4" y="7" width="16" height="11" rx="2.5"/><circle cx="9" cy="12.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12.5" r="1.3" fill="currentColor" stroke="none"/><path d="M12 7V4M9 4h6"/>',
  ),
  subscribers: ic('<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>'),
  templates: ic('<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
  customers: ic(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5c3 .3 5.5 2.3 5.5 5.5"/>',
  ),
  loyalty: ic(
    '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z"/><circle cx="12" cy="10.5" r="1.1" fill="currentColor" stroke="none"/>',
  ),
  messages: ic(
    '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  ),
  tickets: ic(
    '<path d="M12 3a9 9 0 019 9.5c0 5.2-4 8.5-9 8.5-1.2 0-2.4-.2-3.4-.6L3.5 21.5l1.2-3.9A9.3 9.3 0 013 12.5 9 9 0 0112 3z"/><path d="M8.5 10.5h7M8.5 14h4.5"/>',
  ),
  warranty: ic(
    '<path d="M12 3l7 3v5.5c0 4.6-3 8.3-7 9.5-4-1.2-7-4.9-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
  ),
  centers: ic(
    '<path d="M3.5 21V8.5L12 3l8.5 5.5V21"/><path d="M3.5 21h17"/><path d="M9.5 21v-6h5v6M8 12h.01M16 12h.01"/>',
  ),
  content: ic(
    '<path d="M4 20h16"/><path d="M6 16L17 5l2 2L8 18H6z"/><path d="M14 6l2 2"/>',
  ),
  blog: ic(
    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.5.5H6.5A2.5 2.5 0 0 1 4 17.5v-12z"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
  ),
  seo: ic(
    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6M11 8v6"/>',
  ),
  settings: ic(
    '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.5-2-1.5c.06-.4.1-.8.1-1.2z"/>',
  ),
  team: ic(
    '<circle cx="8.5" cy="8" r="3.2"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M2.5 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M15.5 14.6c2.9.2 5 2.1 5 4.9"/>',
  ),
  audit: ic(
    '<path d="M20 6H9M20 12H9M20 18H9"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  ),
};

/* Phase 5 — 7 nav groups · 30 links (34 modules counting order-detail,
   categories+badges, and the settings/seo routed sections). */
const GROUPS = [
  {
    k: "overview",
    t: "Overview",
    items: [
      { k: "dashboard", to: "/dashboard", t: "Dashboard", mod: "dashboard" },
      { k: "reports", to: "/reports", t: "Sales Report", mod: "reports" },
      { k: "payments", to: "/payments", t: "Payments", mod: "orders" },
    ],
  },
  {
    k: "orders",
    t: "Orders & Customers",
    items: [
      {
        k: "orders",
        to: "/orders",
        t: "Orders",
        pill: "orders",
        mod: "orders",
      },
      /* Step 2 audit fix — backend gates returns with P('orders','returns') and
       the ledger with P('products','orders'); single-key `mod` hid both from
       legitimately-granted subadmins. `mods` = any-of. */
      {
        k: "returns",
        to: "/returns",
        t: "Returns / RMA",
        mods: ["orders", "returns"],
      },
      { k: "customers", to: "/customers", t: "Customers", mod: "customers" },
      { k: "loyalty", to: "/loyalty", t: "Loyalty", mod: "customers" },
      {
        k: "subscribers",
        to: "/subscribers",
        t: "Subscribers",
        mod: "customers",
      },
    ],
  },
  {
    k: "catalog",
    t: "Catalog",
    items: [
      { k: "products", to: "/products", t: "Products", mod: "products" },
      { k: "brands", to: "/brands", t: "Brands", mod: "brands" },
      { k: "categories", to: "/categories", t: "Categories", mod: "catalog" },
      { k: "badges", to: "/badges", t: "Badges", mod: "catalog" },
      { k: "spec-schema", to: "/spec-schema", t: "Spec Schema", mod: "catalog" },
      { k: "bundles", to: "/bundles", t: "Combo Bundles", mod: "catalog" },
      {
        k: "flash",
        to: "/flash-campaigns",
        t: "Flash Campaigns",
        mod: "catalog",
      },
      {
        k: "inventory",
        to: "/stock",
        t: "Inventory Log",
        mods: ["products", "orders"],
      },
    ],
  },
  {
    k: "intelligence",
    t: "Intelligence",
    items: [{ k: "ai", to: "/ai", t: "AI Console", mod: "ai" }],
  },
  {
    k: "marketing",
    t: "Marketing",
    items: [
      { k: "deals", to: "/deals", t: "Deals & Promotions", mod: "deals" },
      { k: "coupons", to: "/coupons", t: "Coupons", mod: "coupons" },
      { k: "banners", to: "/banners", t: "Banners", mod: "banners" },
      { k: "homepage", to: "/homepage", t: "Homepage", mod: "homepage" },
      {
        k: "quick-services",
        to: "/quick-services",
        t: "Quick Services",
        mod: "homepage",
      },
      {
        k: "templates",
        to: "/notification-templates",
        t: "Notification Copy",
        mod: "settings",
      },
    ],
  },
  {
    k: "community",
    t: "Community",
    items: [
      {
        k: "reviews",
        to: "/reviews",
        t: "Reviews",
        pill: "reviews",
        mod: "reviews",
      },
      {
        k: "questions",
        to: "/questions",
        t: "Questions",
        pill: "questions",
        mod: "questions",
      },
      {
        k: "messages",
        to: "/messages",
        t: "Messages",
        pill: "messages",
        mod: "messages",
      },
    ],
  },
  {
    k: "service",
    t: "Service Desk",
    items: [
      {
        k: "tickets",
        to: "/tickets",
        t: "Complaints",
        pill: "tickets",
        mod: "messages",
      },
      { k: "warranty", to: "/warranty", t: "Warranty", mod: "orders" },
      {
        k: "centers",
        to: "/service-centers",
        t: "Service Centers",
        mod: "content",
      },
    ],
  },
  {
    k: "system",
    t: "System",
    items: [
      { k: "content", to: "/content", t: "Content", mod: "content" },
      { k: "blog", to: "/blog", t: "Journal", mod: "content" },
      { k: "seo", to: "/seo", t: "SEO", mod: "seo" },
      { k: "settings", to: "/settings", t: "Settings", mod: "settings" },
      { k: "team", to: "/team", t: "Team", owner: true },
      { k: "audit", to: "/audit", t: "Audit Log", owner: true },
    ],
  },
];

const LS_KEY = "adminNavCollapsed";

const PersistentShellContext = createContext(null);

export function PersistentAdminShell({ children }) {
  const [meta, setMeta] = useState({ active: "", title: "Admin Console" });
  const shellContext = useMemo(() => ({ setMeta }), [setMeta]);
  return (
    <PersistentShellContext.Provider value={shellContext}>
      <AdminShell active={meta.active} title={meta.title} persistentShell>
        {children || <Outlet />}
      </AdminShell>
    </PersistentShellContext.Provider>
  );
}

export default function AdminShell({ active, title, children, persistentShell = false }) {
  const sidebarNavRef = useRef(null);
  const location = useLocation();

  /* Keep the menu position stable while route pages remount the shell. */
  useEffect(() => {
    const nav = sidebarNavRef.current;
    if (!nav) return undefined;
    const storageKey = "arixgear-admin-sidebar-scroll";
    const saved = Number(sessionStorage.getItem(storageKey) || 0);
    requestAnimationFrame(() => {
      nav.scrollTop = saved;
    });
    const remember = () =>
      sessionStorage.setItem(storageKey, String(nav.scrollTop));
    nav.addEventListener("scroll", remember, { passive: true });
    return () => {
      remember();
      nav.removeEventListener("scroll", remember);
    };
  }, []);
  useEffect(() => {
    if (!persistentShell) return undefined;
    const storageKey = `arixgear-admin-page-scroll:${location.pathname}`;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const save = () => sessionStorage.setItem(storageKey, String(window.scrollY));
    const navigation = performance.getEntriesByType?.("navigation")?.[0];
    const isReload = navigation?.type === "reload" || (performance.navigation && performance.navigation.type === 1);
    const saved = Number(sessionStorage.getItem(storageKey) || 0);
    const timers = [];
    if (isReload && saved > 0) {
      [0, 50, 150, 350, 700].forEach((delay) => {
        timers.push(window.setTimeout(() => window.scrollTo(0, saved), delay));
      });
    }
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [persistentShell, location.pathname]);
  const persistent = useContext(PersistentShellContext);
  useEffect(() => {
    if (persistent && !persistentShell) persistent.setMeta({ active, title });
  }, [persistent, persistentShell, active, title]);
  if (persistent && !persistentShell) return children;
  requireAuth();
  const { t } = useLang();
  const [pills, setPills] = useState({
    orders: 0,
    messages: 0,
    reviews: 0,
    questions: 0,
    tickets: 0,
  });
  const [sbOpen, setSbOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("adminTheme") === "light" ? "light" : "dark",
  );
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch (_) {
      return {};
    }
  });
  const [menuQuery, setMenuQuery] = useState('');
  const u = auth.user || { name: "Admin", email: "" };

  const isOwner = u.role !== "subadmin";
  const myPerms = u.permissions || [];

  /* permission-filtered groups (empty groups disappear) — `mods` = any-of list */
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((n) =>
          n.owner
            ? isOwner
            : isOwner ||
              (n.mods
                ? n.mods.some((m) => myPerms.includes(m))
                : myPerms.includes(n.mod)),
        ),
      }))
        .map((g) => ({
          ...g,
          items: menuQuery.trim()
            ? g.items.filter((n) => {
                const q = menuQuery.trim().toLowerCase();
                return n.t.toLowerCase().includes(q) || n.to.toLowerCase().includes(q);
              })
            : g.items,
        }))
        .filter((g) => g.items.length),
    [isOwner, myPerms.join(","), menuQuery],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("adminTheme", next);
    } catch (_) {}
  };

  const toggleGroup = (k) => {
    setCollapsed((c) => {
      const next = { ...c, [k]: !c[k] };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      try {
        const s = await getStats();
        setPills((p) => ({ ...p, orders: s.verifying || 0 }));
        const m = await listMessages().catch(() => null);
        setPills((p) => ({ ...p, messages: (m && m.unread) || 0 }));
        const [rv, qs, tk] = await Promise.all([
          listPendingReviews("pending").catch(() => null),
          /* Step 2 audit fix — the pill called list() with a string (silently
             dropped → unfiltered list) and read a field the backend never
             sends; the real shape is counts.unanswered */
          listOpenQuestions({ filter: "unanswered" }).catch(() => null),
          listOpenTickets("status=open").catch(() => null),
        ]);
        setPills((p) => ({
          ...p,
          reviews: (rv && rv.pending) || 0,
          questions: (qs && (qs.counts?.unanswered ?? qs.unanswered)) || 0,
          tickets: (tk && tk.openCount) || 0,
        }));
      } catch (_) {}
    })();
  }, []);

  return (
    <div className="flex min-h-screen" id="app">
      {/* Step 2 audit fix — the mobile drawer had no scrim: the page behind
          stayed clickable with no backdrop */}
      {sbOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/55 lg:hidden"
          id="sbScrim"
          onClick={() => setSbOpen(false)}
        />
      ) : null}
      <aside
        className={
          "fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col border-r border-line bg-panel transition-transform lg:translate-x-0 " +
          (sbOpen ? "translate-x-0" : "-translate-x-full")
        }
        id="sidebar"
      >
        <div className="sb-logo border-b border-line px-5 pb-4 pt-[22px] font-disp text-[26px]">
          arixgear<b className="text-acc">.tech</b>
          <span className="sb-role mt-0.5 block font-body text-[9.5px] tracking-[.3em] text-dim2">
            {tr(isOwner ? "ADMIN CONSOLE" : "STAFF CONSOLE")}
          </span>
        </div>
        <div className="border-b border-line px-2.5 py-2">
          <label className="sr-only" htmlFor="menuSearch">Search menu</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim2" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
            <input id="menuSearch" value={menuQuery} onChange={(e) => setMenuQuery(e.target.value)}
              placeholder={tr("Search menu...")} className="w-full rounded-lg border border-line2 bg-transparent py-2 pl-8 pr-3 text-[12px] outline-none placeholder:text-dim2 focus:border-acc" />
          </div>
        </div>
        <nav
          ref={sidebarNavRef}
          className="flex-1 overflow-y-auto p-2.5"
          id="sbNav"
        >
          {!groups.length && menuQuery ? <p className="px-2.5 py-4 text-center text-[12px] text-dim2">{tr("No menu items found")}</p> : null}
          {groups.map((g) => {
            const open = !collapsed[g.k];
            return (
              <div key={g.k} className="mb-1" data-navgroup={g.k}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.k)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[9.5px] font-extrabold uppercase tracking-[.22em] text-dim2 hover:text-dim"
                  aria-expanded={open}
                >
                  <span
                    className={
                      "inline-block transition-transform " +
                      (open ? "rotate-90" : "")
                    }
                  >
                    ›
                  </span>
                  <span className="flex-1">{tr(g.t)}</span>
                  {!open && g.items.some((n) => n.pill && pills[n.pill] > 0) ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-red" />
                  ) : null}
                </button>
                {open &&
                  g.items.map((n) => (
                    <Link
                      key={n.k}
                      to={n.to}
                      onClick={() => setSbOpen(false)}
                      className={
                        "nav-item mb-0.5 flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-[13px] font-semibold tracking-[.04em] " +
                        (n.k === active
                          ? "bg-acc-dim text-acc"
                          : "text-dim hover:bg-panel2 hover:text-txt")
                      }
                    >
                      {I[n.k]}
                      {tr(n.t)}
                      {n.pill && pills[n.pill] > 0 ? (
                        <span
                          className="pill ml-auto rounded-full bg-red px-1.5 py-px text-[10px] font-extrabold text-white"
                          id={
                            n.pill === "orders"
                              ? "verifyingPill"
                              : n.pill === "messages"
                                ? "unreadMsgPill"
                                : n.pill + "Pill"
                          }
                        >
                          {pills[n.pill]}
                        </span>
                      ) : null}
                    </Link>
                  ))}
              </div>
            );
          })}
        </nav>
        <div className="sb-foot border-t border-line p-3.5">
          <div className="sb-user mb-2.5 text-[12px] font-semibold text-dim">
            <b className="block text-[13px] text-txt">
              {u.name}
              {!isOwner ? (
                <span className="ml-1.5 inline-block rounded-full border border-acc/40 bg-acc/10 px-1.5 py-px align-middle text-[8.5px] font-extrabold uppercase tracking-wider text-acc">
                  {tr("STAFF")}
                </span>
              ) : null}
            </b>
            {u.email}
          </div>
          <a
            className="btn-ghost flex w-full items-center justify-center rounded-lg border border-line2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc"
            href="/"
            target="_blank"
          >
            {tr("↗ View Store")}
          </a>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-[232px]" id="main">
        <header
          className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/85 px-3 py-3.5 backdrop-blur md:gap-4 md:px-7"
          id="topbar"
        >
          <button
            className="btn-ghost rounded-lg border border-line2 px-3 py-1.5 text-[12px] lg:hidden"
            id="burger"
            aria-label="Toggle navigation"
            onClick={() => setSbOpen((o) => !o)}
          >
            ☰
          </button>
          <h1
            id="pageTitle"
            className="min-w-0 truncate text-[17px] md:text-[22px]"
          >
            {title}
          </h1>
          <div className="spacer flex-1" />
          <CommandPalette />
          <PushBell />
          <NotificationBell />
          <LangToggle />
          <button
            className="btn-ghost grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-line2 text-[15px] hover:border-acc hover:text-acc"
            id="themeToggle"
            title={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            className="btn-ghost hidden rounded-lg border border-line2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc sm:block"
            id="logoutBtn"
            onClick={() => {
              logout();
            }}
          >
            {tr("Logout")}
          </button>
        </header>
        <div
          className="w-full max-w-[1500px] px-4 pb-16 pt-6 md:px-7"
          id="view"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
