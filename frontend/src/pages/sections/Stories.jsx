/* ArixGear section — member stories (#stories).
   100% admin-driven: config comes from sectionCfg('stories') (Admin → Homepage).
   No items / section hidden → render null. Keeps the "Shop what he/she uses"
   stack behavior + [data-list] contract. */
import { useEffect, useRef, useState } from 'react';
import { useContent } from '../../store/content.jsx';
import { useUI } from '../../store/ui.jsx';
import { tr, pick, pickArr, useLang } from '../../lib/i18n.jsx';
import { getCommunity } from '../../services/community.js';
import { SectionHead, OutlineTitle } from './Head.jsx';

export default function Stories() {
  useLang(); // Task 58 — subscribe so BN toggles re-render pick() copy
  const { homeSections, sectionVisible } = useContent();
  const { openPDP, toast } = useUI();
  const [feed, setFeed] = useState(null);
  const trackRef = useRef(null);
  const section = homeSections.find((item) => item?.key === 'stories');

  useEffect(() => {
    const ctrl = new AbortController();
    getCommunity(ctrl.signal).then(setFeed).catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!sectionVisible('stories') || !section || !feed?.items?.length) return null;

  /* legacy global-events parity: open the first product + toast the full stack */
  const shopStack = (list) => {
    if (!list) return;
    const ids = String(list).split(',');
    openPDP(ids[0]);
    toast(tr('The full stack'), ids.join(' · '));
  };

  const storyStep = () => {
    const el = trackRef.current;
    const card = el && el.firstElementChild;
    return card ? card.getBoundingClientRect().width + 18 : 300;
  };
  const storyIndex = () => trackRef.current ? Math.round(trackRef.current.scrollLeft / storyStep()) : 0;
  const storyJump = (index) => {
    if (trackRef.current) trackRef.current.scrollTo({ left: Math.max(0, index) * storyStep(), behavior: 'smooth' });
  };
  const storyNext = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft >= max - 10) el.scrollTo({ left: 0, behavior: 'smooth' });
    else storyJump(storyIndex() + 1);
  };

  return (
    <section id="stories" className="hsec py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(section, 'subtitle')}
          title={<OutlineTitle text={pick(section, 'title')} />}
          right={<div className="flex gap-1.5" aria-label="Stories carousel controls">
            <button type="button" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={() => storyJump(storyIndex() - 1)} aria-label="Previous stories"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button>
            <button type="button" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={storyNext} aria-label="Next stories"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
          </div>}
        />
        <div ref={trackRef} className="story-grid mx-auto flex max-w-[560px] gap-[1.15rem] overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] [scrollbar-width:none] lg:mx-0 lg:max-w-none [&::-webkit-scrollbar]:hidden">
          {feed.items.slice(0, 3).map((s) => (
            <div key={s.name} className="story-slide flex-none [scroll-snap-align:start]">
              <article className="story-card group flex flex-col border border-line bg-panel transition duration-300 ease-forge hover:-translate-y-1.5 hover:border-line2">
              <div className="story-media relative aspect-[4/3.2] overflow-hidden">
                {s.img ? <img src={s.img} alt={s.alt} loading="lazy" className="h-full w-full object-cover contrast-[1.1] grayscale-[.9] transition-all duration-700 ease-forge group-hover:scale-[1.05] group-hover:grayscale-[.4]" /> : null}
                <div className="story-stats absolute inset-x-0 bottom-0 flex bg-gradient-to-t from-black/90 to-transparent">
                  {pickArr(s, 'stats').map(([num, lbl]) => (
                    <div key={lbl} className="story-stat flex-1 border-r border-white/10 px-[.6rem] pb-[.8rem] pt-[.9rem] text-center last:border-r-0">
                      <b className="block font-disp text-[1.5rem] leading-none text-acc">{num}</b>
                      <span className="font-cond text-[.68rem] font-semibold uppercase tracking-[.22em] text-white/75">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="story-body flex flex-1 flex-col gap-[.7rem] p-[1.4rem]">
                <p className="story-name font-head text-[.95rem] font-extrabold uppercase tracking-[.06em] text-txt">
                  {s.name}
                  <small className="mt-[.15rem] block font-cond text-[.75rem] font-semibold tracking-[.25em] text-dim">{s.meta}</small>
                </p>
                <p className="story-quote flex-1 text-[.9rem] text-muted">
                  <span className="mr-0.5 font-disp text-[1.2rem] leading-none text-acc">“</span>
                  {pick(s, 'quote')}
                </p>
                <button
                  className="story-link inline-flex w-max cursor-pointer items-center gap-[.6rem] font-cond text-[.85rem] font-bold uppercase tracking-[.24em] text-acc transition-all duration-200 hover:gap-[1rem]"
                  data-list={s.list}
                  onClick={() => shopStack(s.list)}
                >
                  Shop this product
                  <svg viewBox="0 0 24 24" className="h-[14px] w-[14px] fill-none stroke-[2]"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
              </article>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
