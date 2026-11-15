/* ArixGear section — generic product carousel shelf (Phase 3).
   One engine for every product-strip section: new-arrivals (#9) and
   best-sellers (#10) both render through this — config.source decides the
   ordering from the live home feed:
     newest → createdAt desc · best-selling → sold desc · trending → views desc
     featured → feed order (admin-curated) · rating → rating desc
   Head copy + anchor come from the admin home-section row (key = section key).
   id/QA contract: the new-arrivals shelf keeps the legacy ids (#new, carTrack,
   carDots) so the Task 59 browser journeys keep working. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "../../store/catalog.jsx";
import { useContent } from "../../store/content.jsx";
import ProductCard from "../../components/ProductCard.jsx";
import { pick, useLang } from "../../lib/i18n.jsx";
import { SectionHead, OutlineTitle } from "./Head.jsx";

const CAR_MS = 4600; /* legacy auto-advance cadence */

function sortFor(source) {
  switch (source) {
    case "newest":
      return (a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    case "best-selling":
    case "popular":
      return (a, b) => (+b.sold || 0) - (+a.sold || 0);
    case "trending":
      return (a, b) => (+b.views || 0) - (+a.views || 0);
    case "rating":
      return (a, b) => (+b.rating || 0) - (+a.rating || 0);
    default:
      return null; /* featured — feed order */
  }
}

export default function ProductShelf({ keyName }) {
  useLang();
  const { sectionVisible, homeSections } = useContent();
  const { PRODUCTS, READY } = useCatalog();
  const trackRef = useRef(null);
  const [dot, setDot] = useState(0);
  const [hold, setHold] = useState(false);
  const holdRef = useRef(false);
  holdRef.current = hold;

  const visible = sectionVisible(keyName);
  const sec = homeSections.find((s) => s && s.key === keyName);
  const cfg = (sec && sec.config) || {};
  const lim = +cfg.limit > 0 ? Math.min(12, +cfg.limit) : 6;

  const list = useMemo(() => {
    const sort = sortFor(
      cfg.source || (keyName === "best-sellers" ? "best-selling" : "featured"),
    );
    const l = sort ? [...PRODUCTS].sort(sort) : PRODUCTS.slice();
    return l.slice(0, lim);
  }, [PRODUCTS, keyName, lim]); // eslint-disable-line react-hooks/exhaustive-deps

  const idOf = (base) =>
    keyName === "new-arrivals" ? base : `${base}-${keyName}`;
  const step = () => {
    const el = trackRef.current;
    const card = el && el.firstElementChild;
    return card ? card.getBoundingClientRect().width + 18 : 300;
  };
  const carIndex = () => {
    const el = trackRef.current;
    return el ? Math.round(el.scrollLeft / step()) : 0;
  };
  const jump = (k) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: k * step(), behavior: "smooth" });
  };
  const next = () => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft >= maxScroll - 10)
      el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollTo({ left: (carIndex() + 1) * step(), behavior: "smooth" });
  };

  useEffect(() => {
    if (!visible || hold || !list.length) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const t = setInterval(() => {
      if (!holdRef.current && !document.hidden) next();
    }, CAR_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hold, list.length]);

  if (!visible || !sec || !list.length) return null;

  const active = Math.min(dot, Math.max(0, list.length - 1));

  return (
    <section
      id={keyName === "new-arrivals" ? "new" : keyName}
      className="hsec pb-16 pt-16 lg:pb-24"
    >
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, "subtitle")}
          title={sec.title ? <OutlineTitle text={pick(sec, "title")} /> : null}
          right={
            <div className="sec-right flex gap-2.5">
              <button
                id={idOf("carPrev")}
                aria-label="Previous"
                className="car-btn group grid h-[46px] w-[46px] place-items-center rounded-none border border-line2 bg-panel transition hover:border-acc"
                onClick={() => jump(Math.max(0, carIndex() - 1))}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"
                >
                  <path d="M19 12H5M11 6l-6 6 6 6" />
                </svg>
              </button>
              <button
                id={idOf("carNext")}
                aria-label="Next"
                className="car-btn group grid h-[46px] w-[46px] place-items-center rounded-none border border-line2 bg-panel transition hover:border-acc"
                onClick={next}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          }
        />
        <div className="car-wrap relative">
          <div
            id={idOf("carTrack")}
            ref={trackRef}
            className="car-track flex cursor-grab gap-[1.1rem] overflow-x-auto pb-[.6rem] [scroll-snap-type:x_mandatory] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
            onScroll={() => setDot(carIndex())}
            onMouseEnter={() => setHold(true)}
            onMouseLeave={() => setHold(false)}
          >
            {!READY && list.length === 0
              ? Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="product-shelf-card flex-none"
                    aria-hidden="true"
                  >
                    <div className="bg-panel border border-line">
                      <div className="aspect-square w-full animate-pulse bg-line/60" />
                      <div className="p-3">
                        <div className="h-2.5 w-1/3 animate-pulse bg-line/60" />
                        <div className="mt-2.5 h-3.5 w-4/5 animate-pulse bg-line/70" />
                      </div>
                    </div>
                  </div>
                ))
              : list.map((p) => (
                  <div
                    key={p.id}
                    className="product-shelf-card flex-none [scroll-snap-align:start] [&>.card]:rounded-none [&_.card_button]:rounded-none"
                  >
                    <ProductCard p={p} />
                  </div>
                ))}
          </div>
          <div
            id={idOf("carDots")}
            className="car-dots mt-[1.6rem] flex justify-center gap-[.5rem]"
          >
            {list.map((p, k) => (
              <button
                key={p.id}
                aria-label={"Go to slide " + (k + 1)}
                className={
                  "car-dot h-[3px] w-[26px] cursor-pointer rounded-none transition-colors duration-300 " +
                  (k === active ? "bg-acc" : "bg-line2")
                }
                onClick={() => jump(k)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
