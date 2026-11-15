/* ArixGear section — marquee ticker. Items come from sectionCfg('ticker') only
   (Admin → Homepage); no items / section hidden → render null.
   Task 58 — BN mode prefers cfg.itemsBn when present (falls back to items). */
import { useContent } from "../../store/content.jsx";
import { pickArr, useLang } from "../../lib/i18n.jsx";

export default function Ticker() {
  useLang(); // Task 58 — subscribe so BN toggles re-render pickArr() items
  const { sectionCfg, sectionVisible } = useContent();
  if (!sectionVisible("ticker")) return null;

  const cfg = sectionCfg("ticker") || {};
  const items = pickArr(cfg, "items").map((x) => String(x));
  if (!items.length) return null;

  /* the copy is rendered TWICE inside #tickerTrack — animate-marquee translates -50%,
     so the loop is seamless when both halves are identical */
  const half = (key) => (
    <span
      key={key}
      className="flex items-center gap-[3.2rem] whitespace-nowrap pr-[3.2rem] font-cond text-[.9rem] font-semibold uppercase tracking-[.34em] text-muted"
    >
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-[3.2rem]">
          {it}
          <i className="not-italic text-acc">//</i>
        </span>
      ))}
    </span>
  );

  return (
    <div
      className="ticker hsec overflow-hidden border-y border-line bg-bg2 py-[.85rem]"
      aria-hidden="true"
    >
      <div
        id="tickerTrack"
        className="ticker-track flex w-max animate-marquee hover:[animation-play-state:paused]"
      >
        {half("a")}
        {half("b")}
      </div>
    </div>
  );
}
