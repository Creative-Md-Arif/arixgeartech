/* Homepage community section. Content is generated from approved reviews and
   delivered-order aggregates; no testimonial cards are stored in HomeSection. */
import { useEffect, useState } from "react";
import { useContent } from "../../store/content.jsx";
import { pick, pickArr, useLang } from "../../lib/i18n.jsx";
import { getCommunity } from "../../services/community.js";
import { SectionHead, OutlineTitle } from "./Head.jsx";

export default function CreatorsCommunity() {
  useLang();
  const { homeSections, sectionVisible } = useContent();
  const [feed, setFeed] = useState(null);
  const section = homeSections.find((item) => item?.key === "athletes");

  useEffect(() => {
    const ctrl = new AbortController();
    getCommunity(ctrl.signal)
      .then(setFeed)
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!sectionVisible("athletes") || !section || !feed?.items?.length)
    return null;
  const comm = Array.isArray(feed.comm) ? feed.comm : [];

  return (
    <section
      id="creators-community"
      className="hsec border-y border-line bg-bg2 py-16 lg:py-24"
    >
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(section, "subtitle")}
          title={<OutlineTitle text={pick(section, "title")} />}
        />
        <div className="ath-grid mx-auto grid max-w-[560px] gap-[1.15rem] lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {feed.items.slice(0, 3).map((item) => (
            <article
              key={`${item.name}-${item.meta}`}
              className="ath-card group relative h-[440px] overflow-hidden border border-line transition-colors duration-300 hover:border-acc lg:h-[520px]"
            >
              {item.img ? (
                <img
                  src={item.img}
                  alt={item.alt}
                  loading="lazy"
                  className="h-full w-full object-cover contrast-[1.12] grayscale transition-all duration-700 ease-forge group-hover:scale-[1.05] group-hover:grayscale-[.55]"
                />
              ) : null}
              <div className="ath-shade pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
              <div className="ath-body absolute inset-x-0 bottom-0 z-[2] p-[1.5rem]">
                <p className="ath-role font-cond text-[.78rem] font-semibold uppercase tracking-[.3em] text-acc">
                  {pick(item, "role")}
                </p>
                <h3 className="ath-name mt-[.35rem] font-disp text-[1.7rem] uppercase leading-[1.05] text-white">
                  {pick(item, "name")}
                </h3>
                <p className="ath-quote mt-[.7rem] max-w-[38ch] text-[.9rem] text-white/80 opacity-90">
                  {pick(item, "quote")}
                </p>
                <div className="ath-wears mt-[1rem] flex flex-wrap gap-[.5rem]">
                  {pickArr(item, "wears").map((wear) => (
                    <span
                      key={wear}
                      className="border border-white/25 bg-black/50 px-[.6rem] py-[.3rem] font-cond text-[.72rem] font-semibold uppercase tracking-[.18em] text-white/80"
                    >
                      {wear}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        {comm.length ? (
          <div className="comm-strip mt-[1.15rem] grid grid-cols-2 border border-line lg:grid-cols-4">
            {comm.map(([value, label], index) => (
              <div
                key={label}
                className={
                  "comm-cell border-line p-[1.6rem] " +
                  (index % 2 === 0 ? "border-r " : "") +
                  (index < 2 ? "border-b " : "") +
                  "lg:border-b-0 lg:border-r lg:last:border-r-0"
                }
              >
                <p className="comm-num font-disp text-[2.1rem] leading-none text-acc">
                  {value}
                </p>
                <p className="comm-lbl mt-[.4rem] font-cond text-[.8rem] font-semibold uppercase tracking-[.26em] text-muted">
                  {label}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
