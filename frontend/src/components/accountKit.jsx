/* ArixGear — account kit (Phase 6b).
   Shared primitives for the 11 routed account pages so every screen keeps the
   same Voltage voice: eyebrow → display title → panels, notch buttons, honest
   empty states, and a login gate that deep-links back after /login?next=… */
import { Link, useLocation } from "react-router-dom";
import { useStore } from "../store/store.jsx";
import { useLang } from "../lib/i18n.jsx";

/* ---------- class constants (mirrors account.jsx hub) ---------- */
export const labelCls =
  "mb-1.5 block font-cond font-semibold text-[.78rem] uppercase tracking-[.26em] text-silver2";
export const inputCls =
  "w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2.5 bg-acc px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-black transition-all duration-300 clip-notch hover:bg-acc2 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
export const btnGhost =
  "inline-flex items-center justify-center gap-2.5 border border-line2 bg-white/[.03] px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-txt transition-all duration-300 clip-notch hover:border-silver hover:bg-white/[.07] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
export const cardCls = "border border-line bg-panel p-6 sm:p-7";
export const miniBtn =
  "bg-transparent border border-line2 text-txt font-cond font-semibold uppercase tracking-[.16em] text-[.72rem] px-4 py-2.5 transition-colors hover:border-acc hover:text-acc disabled:cursor-not-allowed disabled:opacity-40";

/* status tone — verifying amber · rejected/cancelled red · rest green */
export const stTone = (s) => {
  if (s === "verifying") return "text-amber border-amber/40";
  if (s === "payment-rejected" || s === "cancelled")
    return "text-red border-red/40";
  return "text-ok border-ok/40";
};

/* generic RMA status tone — requested amber · rejected red · approved/refunded green */
export const rmaTone = (s) => {
  if (s === "requested") return "text-amber border-amber/40";
  if (s === "rejected") return "text-red border-red/40";
  return "text-ok border-ok/40";
};

/* RMA reasons — mirror backend ReturnRequest.RETURN_REASONS */
export const RETURN_REASONS = [
  ["damaged", "Damaged / defective"],
  ["wrong-item", "Wrong item delivered"],
  ["size-issue", "Size does not fit"],
  ["not-as-described", "Not as described"],
  ["late", "Delivered too late"],
  ["other", "Other"],
];

export function Eyebrow({ children }) {
  return (
    <p className="font-cond font-semibold uppercase tracking-[.45em] text-acc text-[.82rem] flex items-center gap-3">
      <i className="not-italic inline-block h-0.5 w-9 bg-acc" />
      {children}
    </p>
  );
}

/* breadcrumb + display title + optional lede — every routed page opens with it */
export function PageHead({
  crumb,
  crumbTo = "/account",
  title,
  lede,
  children,
}) {
  const { t } = useLang();
  return (
    <div className="page-head">
      <nav
        className="mb-6 flex items-center gap-2 font-cond text-[.8rem] uppercase tracking-[.18em] text-dim"
        aria-label="Breadcrumb"
      >
        <Link to="/" className="transition-colors hover:text-acc">
          {t("Home")}
        </Link>
        <span>/</span>
        {crumbTo ? (
          <Link to={crumbTo} className="transition-colors hover:text-acc">
            {crumb}
          </Link>
        ) : (
          <span>{crumb}</span>
        )}
        <span>/</span>
        <span className="text-silver">{title}</span>
      </nav>
      <Eyebrow>{t("MY ACCOUNT")}</Eyebrow>
      <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.2rem,4.6vw,3.6rem)]">
        {title}
      </h2>
      {lede ? (
        <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
          {lede}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/* quick-nav chips — the account subpages cross-link through this strip */
export function AcctNav({ active }) {
  const { t } = useLang();
  const items = [
    ["/account/orders", "My Orders"],
    ["/account/profile", "Profile"],
    ["/account/addresses", "Addresses"],
    ["/account/reviews", "My Reviews"],
    ["/account/returns", "Returns & Refunds"],
    ["/account/notifications", "Notifications"],
  ];
  return (
    <nav
      className="acct-nav mt-8 flex flex-wrap items-center gap-[.5rem]"
      aria-label="Account sections"
    >
      {items.map(([to, lab]) => (
        <Link
          key={to}
          to={to}
          aria-current={to === active ? "page" : undefined}
          className={
            "border px-[1rem] py-[.55rem] font-cond text-[.8rem] font-semibold uppercase tracking-[.2em] transition duration-200 " +
            (to === active
              ? "border-acc bg-acc text-black"
              : "border-line text-muted hover:border-line2 hover:text-txt")
          }
        >
          {t(lab)}
        </Link>
      ))}
    </nav>
  );
}

/* section shell: breadcrumb head + nav strip + children */
export function AcctShell({ active, title, lede, children, wide = false }) {
  return (
    <section id="page-account-sub" className="page py-16 lg:py-24">
      <div className={"container mx-auto w-[92%]" + (wide ? " max-w-6xl" : "")}>
        <PageHead title={title} lede={lede} />
        <AcctNav active={active} />
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/* login gate — guests see an honest panel instead of a bare API 401 */
export function Gate({ title, lede, children }) {
  const { session } = useStore();
  const { t } = useLang();
  const loc = useLocation();
  const next = encodeURIComponent(loc.pathname + loc.search);
  if (session && session.token) return children;
  return (
    <section id="page-account-gate" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%] max-w-xl text-center">
        <p className="font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
          arixgear<b>.tech</b>
        </p>
        <h2 className="mt-4 font-disp text-[clamp(1.9rem,4.5vw,2.8rem)] uppercase leading-[1.02] text-txt">
          {t("Members Only")}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[.95rem] leading-relaxed text-muted">
          {t("Log in to see")} {lede || t("this page")} —{" "}
          {t("your session lives in this browser until you log out")}.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to={"/login?next=" + next} className={btnPrimary}>
            {t("Log In")}
          </Link>
          <Link to="/register" className={btnGhost}>
            {t("Create Account")}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* centered auth card — login / register / forgot / verify all use this shell */
export function AuthShell({ title, sub, children, foot }) {
  return (
    <section id="page-auth" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="mx-auto max-w-[460px]">
          <div className="text-center">
            <p className="font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
              arixgear<b>.tech</b>
            </p>
            <h2 className="mt-4 font-disp text-[clamp(2rem,5vw,2.9rem)] uppercase leading-[1.0] text-txt">
              {title}
            </h2>
            {sub ? (
              <p className="mx-auto mt-3 max-w-sm text-[.92rem] leading-relaxed text-muted">
                {sub}
              </p>
            ) : null}
          </div>
          <div className={`${cardCls} mt-8`}>{children}</div>
          {foot ? (
            <div className="mt-6 text-center text-[.85rem] text-muted">
              {foot}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* inline error strip */
export function ErrStrip({ children }) {
  if (!children) return null;
  return (
    <p className="mb-4 border-l-2 border-red bg-red/10 px-3 py-2 text-[.82rem] text-red">
      {children}
    </p>
  );
}

/* ok strip */
export function OkStrip({ children }) {
  if (!children) return null;
  return (
    <p className="mb-4 border-l-2 border-ok bg-ok/10 px-3 py-2 text-[.82rem] text-ok">
      {children}
    </p>
  );
}

/* date helper — "9 Nov 2026" */
export const dFmt = (ts) =>
  new Date(ts || Date.now()).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
