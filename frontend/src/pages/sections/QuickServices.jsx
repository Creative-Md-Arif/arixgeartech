/*quick services. Four service cards per the conversion spec: · Laptop Finder — 3-step wizard (budget → use → live catalog picks) · AC Ton Calculator — room-size → ton estimate + matching ACs · Raise a Complaint — deep-links to /contact?topic=Complaint · Servicing Center — deep-links to /contact?topic=Service & repair All card content, card actions, and finder/calculator rules are driven by the quick-services section config, with defaults for legacy section records.*/
import { useMemo, useState } from "react";
import { useContent } from "../../store/content.jsx";
import { useCatalog, priceFor } from "../../store/catalog.jsx";
import { money } from "../../lib/format.js";
import { pick, useLang } from "../../lib/i18n.jsx";
import { SectionHead, OutlineTitle } from "./Head.jsx";
import { Link } from "react-router-dom";

/*---------- Laptop Finder wizard ----------*/
const BUDGETS = [
  {
    key: "u80",
    label: "Under ৳80,000",
    labelBn: "৮০ হাজারের নিচে",
    max: 80000,
  },
  {
    key: "80-120",
    label: "৳80,000 – 120,000",
    labelBn: "৮০–১২০ হাজার",
    min: 80000,
    max: 120000,
  },
  {
    key: "120p",
    label: "৳120,000+",
    labelBn: "১.২ লাখ+",
    min: 120000,
    max: 999999,
  },
  { key: "any", label: "Any budget", labelBn: "যেকোনো বাজেট", max: 999999 },
];
const USES = [
  {
    key: "study",
    label: "Study / Office",
    labelBn: "পড়া / অফিস",
    keywords: "ideapad, slim, a3, everyday, evo",
    categories: ["ultrabooks"],
  },
  {
    key: "gaming",
    label: "Gaming",
    labelBn: "গেমিং",
    keywords: "rtx, gaming, tuf, nitro, strix",
    categories: ["gaming-laptops"],
  },
  {
    key: "design",
    label: "Design / Editing",
    labelBn: "ডিজাইন / এডিটিং",
    keywords: "creator, pavilion, pro, xps",
    categories: ["creator-laptops"],
  },
];

function LaptopFinderModal({ onClose, settings }) {
  const { PRODUCTS } = useCatalog();
  const { t, isBn } = useLang();
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(null);
  const [use, setUse] = useState(null);
  const budgets = Array.isArray(settings?.budgets) ? settings.budgets : BUDGETS;
  const uses = Array.isArray(settings?.uses) ? settings.uses : USES;

  const picks = useMemo(() => {
    if (!budget || !use) return { inBudget: [], nearest: [] };
    const u = uses.find((x) => x.key === use);
    if (!u) return { inBudget: [], nearest: [] };
    const laptops = PRODUCTS.filter((p) =>
      (p.catSlug || "").includes("laptop"),
    );
    const keywords = String(u.keywords || "")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);
    const matchUse = laptops.filter(
      (p) =>
        (u.categories || []).includes(p.catSlug) ||
        keywords.some((word) =>
          (p.name + " " + (p.desc || ""))
            .toLowerCase()
            .includes(word.toLowerCase()),
        ),
    );
    const inBudget = matchUse
      .filter(
        (p) => p.price <= budget.max && (!budget.min || p.price >= budget.min),
      )
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);
    /*honest fallback: nothing in budget → the closest matches for that use*/
    const nearest = inBudget.length ? [] : matchUse.slice(0, 2);
    return { inBudget, nearest };
  }, [budget, use, PRODUCTS, uses]);

  return (
    <div
      className="fixed inset-0 z-[1150] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
      data-testid="laptopFinder"
    >
      <div
        className="w-full max-w-lg border border-line bg-panel p-6 shadow-2xl shadow-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-cond text-[.75rem] font-semibold uppercase tracking-[.3em] text-acc">
              Laptop Finder
            </p>
            <h3 className="mt-1 font-disp text-2xl uppercase text-txt">
              {t("Find your laptop")}
            </h3>
          </div>
          <button
            className="grid h-9 w-9 place-items-center border border-line text-muted hover:text-txt"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {step === 0 ? (
          <div className="mt-5">
            <p className="text-[.9rem] text-muted">
              {t("What is your budget?")}
            </p>
            <div className="mt-3 grid gap-2">
              {budgets.map((b) => (
                <button
                  key={b.key}
                  className="border border-line px-4 py-3 text-left font-head text-[.9rem] text-txt transition hover:border-acc hover:text-acc"
                  onClick={() => {
                    setBudget(b);
                    setStep(1);
                  }}
                >
                  {isBn && b.labelBn ? b.labelBn : b.label}
                </button>
              ))}
            </div>
          </div>
        ) : step === 1 ? (
          <div className="mt-5">
            <p className="text-[.9rem] text-muted">
              {t("What will you use it for?")}
            </p>
            <div className="mt-3 grid gap-2">
              {uses.map((u) => (
                <button
                  key={u.key}
                  className="border border-line px-4 py-3 text-left font-head text-[.9rem] text-txt transition hover:border-acc hover:text-acc"
                  onClick={() => {
                    setUse(u.key);
                    setStep(2);
                  }}
                >
                  {isBn && u.labelBn ? u.labelBn : u.label}
                </button>
              ))}
            </div>
            <button
              className="mt-4 font-cond text-[.8rem] uppercase tracking-[.2em] text-dim hover:text-acc"
              onClick={() => setStep(0)}
            >
              ← {t("Back")}
            </button>
          </div>
        ) : (
          <div className="mt-5" data-testid="finderResults">
            <p className="text-[.9rem] text-muted">
              {t("Picked for you")} —{" "}
              {isBn && budget.labelBn ? budget.labelBn : budget.label} ·{" "}
              {isBn && uses.find((u) => u.key === use)?.labelBn
                ? uses.find((u) => u.key === use).labelBn
                : uses.find((u) => u.key === use)?.label}
            </p>
            {picks.inBudget.length ? (
              <ul className="mt-3 divide-y divide-line border border-line">
                {picks.inBudget.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={"/product/" + p.id}
                      className="flex items-center gap-3 p-3 transition hover:bg-white/[.04]"
                      onClick={onClose}
                    >
                      <img
                        src={p.img}
                        alt=""
                        className="h-14 w-14 shrink-0 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-head text-[.88rem] font-semibold text-txt">
                          {isBn && p.nameBn ? p.nameBn : p.name}
                        </p>
                        <p className="font-cond text-[.72rem] uppercase tracking-[.12em] text-dim">
                          {p.cat} · ★ {p.rating}
                        </p>
                      </div>
                      <b className="font-head text-acc">{money(priceFor(p))}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {picks.nearest.length ? (
                  <>
                    <p className="mt-3 text-[.82rem] text-muted">
                      {t("Nothing in that range for this use — closest picks")}
                    </p>
                    <ul className="mt-2 divide-y divide-line border border-line">
                      {picks.nearest.map((p) => (
                        <li key={p.id}>
                          <Link
                            to={"/product/" + p.id}
                            className="flex items-center gap-3 p-3 transition hover:bg-white/[.04]"
                            onClick={onClose}
                          >
                            <img
                              src={p.img}
                              alt=""
                              className="h-14 w-14 shrink-0 object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-head text-[.88rem] font-semibold text-txt">
                                {isBn && p.nameBn ? p.nameBn : p.name}
                              </p>
                              <p className="font-cond text-[.72rem] uppercase tracking-[.12em] text-dim">
                                {p.cat} · ★ {p.rating}
                              </p>
                            </div>
                            <b className="font-head text-acc">
                              {money(priceFor(p))}
                            </b>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 border border-dashed border-line2 p-4 text-center text-[.9rem] text-muted">
                    {t(
                      "No laptop matched that combo — widen the budget or browse the full range.",
                    )}
                  </p>
                )}
              </>
            )}
            <div className="mt-4 flex items-center justify-between">
              <button
                className="font-cond text-[.8rem] uppercase tracking-[.2em] text-dim hover:text-acc"
                onClick={() => setStep(1)}
              >
                ← {t("Back")}
              </button>
              <Link
                to="/shop?cat=laptops"
                className="bg-acc px-5 py-2.5 font-head text-[.75rem] font-extrabold uppercase tracking-[.16em] text-black hover:bg-acc2"
                onClick={onClose}
              >
                {t("Browse all laptops")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ACCalcModal({ onClose, settings = {} }) {
  const { PRODUCTS } = useCatalog();
  const { t } = useLang();
  const minArea = Number(settings.minArea) || 80;
  const maxArea = Number(settings.maxArea) || 600;
  const step = Number(settings.step) || 10;
  const [area, setArea] = useState(Number(settings.defaultArea) || 180);
  const [topFloor, setTopFloor] = useState(false);
  const [sunny, setSunny] = useState(false);
  const [open, setOpen] = useState(false);

  const tons = (() => {
    const rounding = Number(settings.roundingIncrement) || 0.5;
    let value =
      Math.max(minArea, area || 0) / (Number(settings.areaPerTon) || 620);
    if (topFloor) value += Number(settings.topFloorBoost ?? 0.5);
    if (sunny) value += Number(settings.sunnyBoost ?? 0.25);
    return Math.max(
      Number(settings.minimumTons) || 1,
      Math.round(value / rounding) * rounding,
    );
  })();
  const matches = useMemo(() => {
    const want =
      tons <= (Number(settings.capacityThreshold) || 1.5)
        ? settings.lowCapacity || "1.5 Ton"
        : settings.highCapacity || "2 Ton";
    return PRODUCTS.filter(
      (p) =>
        p.catSlug === (settings.categorySlug || "air-conditioners") &&
        (p.sizes || []).some((s) => s.s === want),
    ).slice(0, 2);
  }, [tons, PRODUCTS, settings]);

  return (
    <div
      className="fixed inset-0 z-[1150] grid place-items-center bg-black/70 p-4"
      onClick={onClose}
      data-testid="acCalc"
    >
      <div
        className="w-full max-w-md border border-line bg-panel p-6 shadow-2xl shadow-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-cond text-[.75rem] font-semibold uppercase tracking-[.3em] text-acc">
              AC Ton Calculator
            </p>
            <h3 className="mt-1 font-disp text-2xl uppercase text-txt">
              {t("Right size, lower bill")}
            </h3>
          </div>
          <button
            className="grid h-9 w-9 place-items-center border border-line text-muted hover:text-txt"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <label className="mt-5 block font-cond text-[.78rem] uppercase tracking-[.2em] text-muted">
          {t("Room area (sq ft)")}
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={minArea}
            max={maxArea}
            step={step}
            value={area}
            onChange={(e) => {
              setArea(+e.target.value);
              setOpen(false);
            }}
            className="rng h-[3px] flex-1 cursor-pointer appearance-none bg-line2 outline-none [&::-webkit-slider-thumb]:h-[15px] [&::-webkit-slider-thumb]:w-[15px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rotate-45 [&::-webkit-slider-thumb]:bg-acc"
          />
          <b className="w-16 text-right font-disp text-lg text-txt">{area}</b>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className={
              "border px-3 py-2.5 text-left text-[.82rem] transition " +
              (topFloor
                ? "border-acc text-acc"
                : "border-line text-muted hover:text-txt")
            }
            onClick={() => {
              setTopFloor((v) => !v);
              setOpen(false);
            }}
          >
            {topFloor ? "✓ " : ""}
            {t("Top floor / under roof")}
          </button>
          <button
            className={
              "border px-3 py-2.5 text-left text-[.82rem] transition " +
              (sunny
                ? "border-acc text-acc"
                : "border-line text-muted hover:text-txt")
            }
            onClick={() => {
              setSunny((v) => !v);
              setOpen(false);
            }}
          >
            {sunny ? "✓ " : ""}
            {t("Heavy sun / west-facing")}
          </button>
        </div>

        <button
          className="mt-5 w-full bg-acc py-3 font-head text-[.78rem] font-extrabold uppercase tracking-[.18em] text-black hover:bg-acc2"
          onClick={() => setOpen(true)}
        >
          {t("Calculate")}
        </button>

        {open ? (
          <div
            className="mt-4 border border-line bg-bg p-4"
            data-testid="acResult"
          >
            <p className="text-[.85rem] text-muted">
              {t("Recommended capacity")}
            </p>
            <p className="font-disp text-4xl text-acc">
              {tons} <span className="text-xl text-txt">ton</span>
            </p>
            <p className="mt-1 text-[.75rem] leading-relaxed text-dim">
              {t(
                "Estimate for Dhaka-latitude heat — the calculator rounds to the nearest half ton. Oversizing cools fast but short-cycles and wastes electricity.",
              )}
            </p>
            {matches.length ? (
              <div className="mt-3 space-y-2">
                {matches.map((p) => (
                  <Link
                    key={p.id}
                    to={"/product/" + p.id}
                    className="flex items-center justify-between gap-3 border border-line p-2.5 transition hover:border-acc"
                    onClick={onClose}
                  >
                    <span className="truncate text-[.85rem] text-txt">
                      {p.name}
                    </span>
                    <b className="whitespace-nowrap font-head text-acc">
                      {money(p.price)}
                    </b>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function QuickServices() {
  const { sectionVisible, homeSections, sectionCfg } = useContent();
  const [modal, setModal] = useState(null);
  useLang();

  const visible = sectionVisible("quick-services");
  const sec = homeSections.find((s) => s && s.key === "quick-services");
  if (!visible || !sec) return null;

  const config = sectionCfg("quick-services");
  const cards = Array.isArray(config.cards) ? config.cards : [];
  if (!cards.length) return null;

  return (
    <section id="services" className="hsec py-16 lg:py-20">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, "subtitle")}
          title={sec.title ? <OutlineTitle text={pick(sec, "title")} /> : null}
        />
        <div
          className="qs-grid mt-6 grid grid-cols-2 gap-2.5 sm:mt-10 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
          id="quickServices"
        >
          {cards.map((c, index) => {
            if (!c || c.active === false) return null;
            const action = c.action || "none";
            const href =
              action !== "finder" &&
              action !== "calculator" &&
              action !== "none" &&
              typeof c.href === "string" &&
              (c.href.startsWith("/") || /^https?:\/\//i.test(c.href))
                ? c.href
                : null;
            const external = /^https?:\/\//i.test(String(href || ""));
            const inner = (
              <>
                <span className="qs-icon grid h-11 w-11 place-items-center border border-line2 bg-bg text-acc transition-colors group-hover:border-acc sm:h-14 sm:w-14">
                  {String(c.icon || "").startsWith("http") ||
                  String(c.icon || "").startsWith("/") ? (
                    <img
                      src={c.icon}
                      alt=""
                      className="h-6 w-6 object-contain sm:h-8 sm:w-8"
                    />
                  ) : (
                    <span aria-hidden="true">{c.icon || "✦"}</span>
                  )}
                </span>
                <h3 className="mt-3 font-head text-[.82rem] font-bold uppercase leading-tight tracking-[.04em] text-txt sm:mt-4 sm:text-[1.05rem] sm:tracking-[.06em]">
                  {pick({ title: c.title, titleBn: c.titleBn }, "title")}
                </h3>
                <p className="mt-1.5 text-[.72rem] leading-relaxed text-muted sm:mt-2 sm:text-[.88rem]">
                  {pick(
                    { desc: c.description, descBn: c.descriptionBn },
                    "desc",
                  )}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 font-cond text-[.62rem] font-bold uppercase tracking-[.12em] text-acc transition-colors group-hover:text-acc2 sm:mt-4 sm:gap-2 sm:text-[.78rem] sm:tracking-[.2em]">
                  {pick(
                    { ctaText: c.actionText, ctaTextBn: c.actionTextBn },
                    "ctaText",
                  )}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 fill-none stroke-current stroke-2 transition-transform group-hover:translate-x-1"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </>
            );
            return href && external ? (
              <a
                key={c.key || index}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="qs-card group rounded-none border border-line bg-panel p-4 transition-colors hover:border-line2 sm:p-6"
                data-service={c.key}
              >
                {inner}
              </a>
            ) : href ? (
              <Link
                key={c.key || index}
                to={href}
                className="qs-card group rounded-none border border-line bg-panel p-4 transition-colors hover:border-line2 sm:p-6"
                data-service={c.key}
              >
                {inner}
              </Link>
            ) : (
              <button
                key={c.key || index}
                className="qs-card group cursor-pointer rounded-none border border-line bg-panel p-4 text-left transition-colors hover:border-line2 sm:p-6"
                data-service={c.key}
                onClick={() =>
                  setModal(
                    action === "finder"
                      ? "finder"
                      : action === "calculator"
                        ? "accalc"
                        : null,
                  )
                }
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>
      {modal === "finder" ? (
        <LaptopFinderModal
          onClose={() => setModal(null)}
          settings={config.finder}
        />
      ) : null}
      {modal === "accalc" ? (
        <ACCalcModal
          onClose={() => setModal(null)}
          settings={config.calculator || {}}
        />
      ) : null}
    </section>
  );
}
