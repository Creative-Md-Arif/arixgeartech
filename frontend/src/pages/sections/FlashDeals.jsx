/*flash deals + countdown. Reads /api/products/flash (server-swapped flash prices, soonest-ending first). Big countdown to the soonest endsAt; grid of up to 4 deal cards. No live deals → renders a quiet promo strip to /flash-sale when the admin row exists, else nothing (honest empty state).*/
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../store/content.jsx';
import { adaptOne } from '../../store/catalog.jsx';
import { flashList } from '../../services/products.js';
import { money } from '../../lib/format.js';
import { pick, tr, useLang } from '../../lib/i18n.jsx';
import { SectionHead, OutlineTitle } from './Head.jsx';
import ProductCard from '../../components/ProductCard.jsx';

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  const ms = target ? Math.max(0, +new Date(target) - now) : 0;
  const s = Math.floor(ms / 1000);
  return { ended: target ? ms <= 0 : false, h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const Cell = ({ v, label }) => (
  <span className="fd-cell flex min-w-[64px] flex-col items-center border border-line bg-bg px-3 py-2.5" data-count={label}>
    <b className="font-disp text-2xl leading-none text-acc">{String(v).padStart(2, '0')}</b>
    <span className="mt-1.5 font-cond text-[.62rem] font-semibold uppercase tracking-[.24em] text-dim">{label}</span>
  </span>
);

export default function FlashDeals() {
  useLang();
  const { sectionVisible, homeSections } = useContent();
  const [items, setItems] = useState(null);
  const [serverNow] = useState(null);
  const trackRef = useRef(null);
  void serverNow;

  const visible = sectionVisible('flash-deals');
  const sec = homeSections.find((s) => s && s.key === 'flash-deals');

  useEffect(() => {
    if (!visible || !sec) return undefined;
    let dead = false;
    flashList().then((d) => {
      if (dead) return;
      setItems((d.items || []).map(adaptOne).filter(Boolean));
    }).catch(() => { if (!dead) setItems([]); });
    return () => { dead = true; };
  }, [visible, sec]); // eslint-disable-line react-hooks/exhaustive-deps

  /*countdown target: soonest flash end*/
  const target = useMemo(() => {
    if (!items || !items.length) return null;
    const ends = items.map((p) => p.flash && p.flash.endsAt).filter(Boolean).map((x) => +new Date(x));
    return ends.length ? Math.min(...ends) : null;
  }, [items]);
  const cd = useCountdown(target);

  const flashStep = () => {
    const el = trackRef.current;
    const card = el && el.firstElementChild;
    return card ? card.getBoundingClientRect().width + 11 : 300;
  };
  const flashIndex = () => {
    const el = trackRef.current;
    return el ? Math.round(el.scrollLeft / flashStep()) : 0;
  };
  const flashJump = (index) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: Math.max(0, index) * flashStep(), behavior: 'smooth' });
  };
  const flashNext = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft >= max - 10) el.scrollTo({ left: 0, behavior: 'smooth' });
    else flashJump(flashIndex() + 1);
  };

  if (!visible || !sec) return null;
  const lim = sec.config && +sec.config.limit > 0 ? Math.min(8, +sec.config.limit) : 4;
  if (items && !items.length) {
    /*honest empty: quiet strip to /flash-sale*/
    return (
      <section id="flash" className="hsec pb-4 pt-10">
        <div className="container mx-auto w-[92%]">
          <Link to="/flash-sale" className="flex items-center justify-between gap-4 border border-line bg-panel px-6 py-4 transition-colors hover:border-acc">
            <span className="font-cond text-[.85rem] font-semibold uppercase tracking-[.22em] text-muted">⚡ {tr('No flash deals live right now — catch the next drop')}</span>
            <span className="font-cond text-[.8rem] font-bold uppercase tracking-[.18em] text-acc">{tr('Flash sale page')} →</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section id="flash" className="hsec py-16 lg:py-20">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {target ? (
                <div className="flex items-center gap-1.5 sm:gap-2" id="flashCountdown" data-testid="flashCountdown">
                  <Cell v={cd.h} label={tr('HRS')} />
                  <b className="font-disp text-lg text-dim sm:text-xl">:</b>
                  <Cell v={cd.m} label={tr('MIN')} />
                  <b className="font-disp text-lg text-dim sm:text-xl">:</b>
                  <Cell v={cd.s} label={tr('SEC')} />
                </div>
              ) : null}
              <div className="flex gap-1.5" aria-label="Flash deals carousel controls">
                <button type="button" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={() => flashJump(flashIndex() - 1)} aria-label="Previous flash deals"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button>
                <button type="button" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={flashNext} aria-label="Next flash deals"><svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
              </div>
            </div>
          }
        />
        <div ref={trackRef} className="mt-6 flex gap-[.7rem] overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] [scrollbar-width:none] sm:mt-10 lg:gap-[1.15rem] [&::-webkit-scrollbar]:hidden" id="flashGrid">
          {(items || []).slice(0, lim).map((p) => (
            <div key={p.id} className="flash-deal-card flex-none [scroll-snap-align:start]"><ProductCard p={p} /></div>
          ))}
          {!items ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flash-deal-card flex-none aspect-[3/4] animate-pulse bg-line/40" aria-hidden="true" />
          )) : null}
        </div>
        {(items || []).length ? (
          <div className="mt-8 text-center">
            <Link to="/flash-sale" className="inline-flex items-center gap-2 border border-acc px-6 py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.18em] text-acc transition hover:bg-acc hover:text-black">
              ⚡ {tr('All flash deals')}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
