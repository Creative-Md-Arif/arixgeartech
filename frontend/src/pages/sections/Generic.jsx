/* ArixGear section — generic renderer for admin-created home sections (Task 59).
   Any "New Section" saved in Admin → Homepage with a custom key renders HERE,
   placed on the home page by its order number (see pages/index.jsx).
   Every section type has a generic block:
     product-carousel · product-grid · custom-banner · html ·
     ticker · categories · goal-panels · slider
   Head copy runs through pick() — the Task 58 Bengali twins (titleBn /
   subtitleBn) show in BN mode, English is the fallback. A section whose config
   yields nothing visible renders null (same honesty rule as bespoke sections). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalog, adaptOne } from '../../store/catalog.jsx';
import { useUI } from '../../store/ui.jsx';
import { listProducts } from '../../services/products.js';
import { listBanners, bannerClick } from '../../services/banners.js';
import { go } from '../../lib/go.js';
import { money } from '../../lib/format.js';
import { sanitizeHtml, safeHref } from '../../lib/sanitize.js'; /* Step 3 audit — admin-authored HTML/links are sanitized defensively */
import { pick, pickArr, useLang } from '../../lib/i18n.jsx';
import { SectionHead, OutlineTitle } from './Head.jsx';
import ProductCard from '../../components/ProductCard.jsx';

const GOAL_IMGS = ['/assets/athlete-1.png', '/assets/hero-1.png', '/assets/story-2.png'];
const fixUrl = (u) => (!u ? '' : (/^https?:/.test(u) ? u : (u.startsWith('/') ? u : '/' + u)));

/* ---------- product-carousel (config: source newest|featured|best-sellers, limit) ---------- */
function CarBlock({ sec, cfg }) {
  const lim = Math.min(12, Math.max(1, +cfg.limit || 8));
  const [items, setItems] = useState(null); /* null = loading */
  const trackRef = useRef(null);
  const [dot, setDot] = useState(0);

  useEffect(() => {
    let live = true;
    const src = cfg.source || 'newest';
    const q = { limit: String(lim) };
    if (src === 'featured') q.featured = 'true';
    else if (src === 'best-sellers') q.sort = 'popular';
    else q.sort = 'newest';
    listProducts(q)
      .then((d) => { if (live) setItems((d.items || []).map(adaptOne).filter(Boolean)); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (el) el.scrollTo({ left: Math.max(0, k) * step(), behavior: 'smooth' });
  };
  const next = () => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft >= maxScroll - 10) jump(0);
    else jump(carIndex() + 1);
  };

  if (items === null) {
    return (
      <section id={sec.key} className="hsec pb-16 pt-16 lg:pb-24">
        <div className="container mx-auto w-[92%]"><CarSkeleton /></div>
      </section>
    );
  }
  if (!items.length) return null;
  const active = Math.min(dot, Math.max(0, items.length - 1));

  return (
    <section id={sec.key} className="hsec pb-16 pt-16 lg:pb-24">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null}
          right={
            <div className="sec-right flex gap-2.5">
              <button aria-label="Previous" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={() => jump(Math.max(0, carIndex() - 1))}>
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              </button>
              <button aria-label="Next" className="car-btn group grid h-[46px] w-[46px] place-items-center border border-line2 bg-panel transition hover:border-acc" onClick={next}>
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-silver stroke-2 transition group-hover:stroke-acc"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          }
        />
        <div className="car-wrap relative">
          <div
            ref={trackRef}
            className="car-track flex cursor-grab gap-[1.1rem] overflow-x-auto pb-[.6rem] [scroll-snap-type:x_mandatory] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
            onScroll={() => setDot(carIndex())}
          >
            {items.map((p) => (
              <div key={p.id} className="w-[clamp(248px,23.5vw,306px)] flex-none [scroll-snap-align:start]">
                <ProductCard p={p} />
              </div>
            ))}
          </div>
          <div className="car-dots mt-[1.6rem] flex justify-center gap-[.5rem]">
            {items.map((p, k) => (
              <button key={p.id} aria-label={'Go to slide ' + (k + 1)}
                className={'car-dot h-[3px] w-[26px] cursor-pointer transition-colors duration-300 ' + (k === active ? 'bg-acc' : 'bg-line2')}
                onClick={() => jump(k)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CarSkeleton() {
  return (
    <div className="car-track flex gap-[1.1rem] overflow-hidden pb-[.6rem]">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-[clamp(248px,23.5vw,306px)] flex-none" aria-hidden="true">
          <div className="bg-panel border border-line">
            <div className="aspect-square w-full animate-pulse bg-line/60" />
            <div className="p-3">
              <div className="h-2.5 w-1/3 animate-pulse bg-line/60" />
              <div className="mt-2.5 h-3.5 w-4/5 animate-pulse bg-line/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- product-grid (config: products = [slugs], limit fallback) ---------- */
function GridBlock({ sec, cfg }) {
  const { BY_ID } = useCatalog();
  const slugs = Array.isArray(cfg.products) ? cfg.products : [];
  const [fetched, setFetched] = useState(null);

  /* no curated slugs → newest N as an honest fallback */
  useEffect(() => {
    if (slugs.length) return undefined;
    let live = true;
    listProducts({ sort: 'newest', limit: String(Math.min(12, Math.max(1, +cfg.limit || 8))) })
      .then((d) => { if (live) setFetched((d.items || []).map(adaptOne).filter(Boolean)); })
      .catch(() => { if (live) setFetched([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = slugs.length ? slugs.map((s) => BY_ID[s]).filter(Boolean) : (fetched || []);
  if (!slugs.length && fetched !== null && !fetched.length) return null;

  return (
    <section id={sec.key} className="hsec pb-16 pt-8 lg:pb-24">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null}
        />
        {list.length ? (
          <div className="gear-grid grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4">
            {list.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : (
          <CarSkeleton />
        )}
      </div>
    </section>
  );
}

/* ---------- custom-banner (config: bannerId · or image/title/subtitle/cta/link) ---------- */
function BannerBlock({ sec, cfg }) {
  const [banner, setBanner] = useState(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!cfg.bannerId) { setSettled(true); return undefined; }
    let live = true;
    listBanners()
      .then((d) => {
        if (!live) return;
        const hit = (d.items || []).find((b) => b && (b.id === cfg.bannerId || b._id === cfg.bannerId));
        setBanner(hit || null);
        setSettled(true);
      })
      .catch(() => { if (live) setSettled(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settled) {
    return (
      <section id={sec.key} className="hsec py-8 lg:py-12" aria-hidden="true">
        <div className="container mx-auto w-[92%]">
          <div className="h-[300px] animate-pulse bg-line/40 lg:h-[380px]" />
        </div>
      </section>
    );
  }
  const src = banner
    ? {
        img: fixUrl((banner.poster && banner.poster.url) || (banner.image && banner.image.url) || cfg.image || ''),
        title: pick(banner, 'title') || pick(sec, 'title'),
        sub: pick(banner, 'subtitle') || pick(sec, 'subtitle'),
        cta: pick(banner, 'ctaText') || cfg.cta || 'Shop Now',
        link: safeHref(banner.link || cfg.link, '/shop'),
        id: banner.id,
      }
    : {
        img: fixUrl(cfg.image || ''),
        title: pick(sec, 'title'),
        sub: pick(sec, 'subtitle'),
        cta: cfg.cta || 'Shop Now',
        link: safeHref(cfg.link, '/shop'),
        id: null,
      };
  if (!src.img && !src.title) return null;

  const ctaGo = (e) => {
    e.preventDefault();
    if (src.id) bannerClick(src.id);
    go(src.link);
  };

  return (
    <section id={sec.key} className="hsec py-8 lg:py-12">
      <div className="container mx-auto w-[92%]">
        <a
          href={src.link}
          onClick={ctaGo}
          className="promo-banner group relative block h-[300px] overflow-hidden border border-line bg-panel lg:h-[380px]"
        >
          {src.img ? (
            <img src={src.img} alt={src.title || 'Promo'} loading="lazy"
              className="h-full w-full object-cover contrast-[1.1] transition-transform duration-700 ease-forge group-hover:scale-[1.04]" />
          ) : <div className="h-full w-full carbon" />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <div className="absolute inset-y-0 left-0 z-[2] flex max-w-[560px] flex-col justify-center p-[2rem] lg:p-[3rem]">
            {src.title ? <h3 className="font-disp text-[2rem] uppercase leading-[.96] text-white lg:text-[2.8rem]">{src.title}</h3> : null}
            {src.sub ? <p className="mt-[.8rem] max-w-[44ch] text-[.95rem] text-white/80">{src.sub}</p> : null}
            <span className="clip-notch mt-[1.4rem] inline-flex w-fit items-center gap-2 bg-acc px-6 py-3 font-head text-[.74rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2">
              {src.cta}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </a>
      </div>
    </section>
  );
}

/* ---------- html (config: html raw string · or eyebrow/heading/desc + items) ---------- */
function HtmlBlock({ sec, cfg }) {
  const items = Array.isArray(cfg.items) ? cfg.items : [];
  if (cfg.html) {
    return (
      <section id={sec.key} className="hsec py-10">
        <div className="container mx-auto w-[92%] custom-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(cfg.html) }} />
      </section>
    );
  }
  if (!cfg.heading && !cfg.desc && !items.length) return null;
  return (
    <section id={sec.key} className="hsec border-y border-line bg-bg2 py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(cfg, 'eyebrow') || pick(sec, 'subtitle')}
          title={(pick(cfg, 'heading') || pick(sec, 'title')) ? <OutlineTitle text={pick(cfg, 'heading') || pick(sec, 'title')} /> : null}
          desc={pick(cfg, 'desc')}
        />
        {items.length ? (
          <div className="grid gap-[1.15rem] md:grid-cols-3">
            {items.map((a, i) => (
              <article key={i} className="group relative h-[360px] overflow-hidden border border-line transition-colors duration-300 hover:border-acc">
                {a.img ? (
                  <img src={fixUrl(a.img)} alt={a.alt || pick(a, 'title') || ''} loading="lazy"
                    className="h-full w-full object-cover contrast-[1.1] grayscale transition-all duration-700 ease-forge group-hover:scale-[1.05] group-hover:grayscale-[.55]" />
                ) : <div className="h-full w-full carbon" />}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 z-[2] p-[1.4rem]">
                  {pick(a, 'title') ? <h3 className="font-disp text-[1.5rem] uppercase leading-[1.05] text-white">{pick(a, 'title')}</h3> : null}
                  {pick(a, 'text') ? <p className="mt-[.5rem] max-w-[38ch] text-[.88rem] text-white/80">{pick(a, 'text')}</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- ticker (config: items / itemsBn) ---------- */
function TickerBlock({ sec, cfg }) {
  const items = pickArr(cfg, 'items').map((x) => String(x));
  if (!items.length) return null;
  const half = (key) => (
    <span key={key} className="flex items-center gap-[3.2rem] whitespace-nowrap pr-[3.2rem] font-cond text-[.9rem] font-semibold uppercase tracking-[.34em] text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-[3.2rem]">
          {it}
          <i className="not-italic text-acc">//</i>
        </span>
      ))}
    </span>
  );
  return (
    <div id={sec.key} className="hsec overflow-hidden border-y border-line bg-bg2 py-[.85rem]" aria-hidden="true">
      <div className="ticker-track flex w-max animate-marquee hover:[animation-play-state:paused]">
        {half('a')}
        {half('b')}
      </div>
    </div>
  );
}

/* ---------- categories (config: categories = [slugs]) ---------- */
function CatBlock({ sec, cfg }) {
  const { PRODUCTS, CATS, CAT_OBJS } = useCatalog();
  const [broken, setBroken] = useState({});
  const cfgSlugs = Array.isArray(cfg.categories) ? cfg.categories : [];

  const tiles = useMemo(() => {
    const resolve = (sl) => {
      const obj = (CAT_OBJS || []).find((c) => String(c.slug).toLowerCase() === String(sl).toLowerCase());
      const name = obj ? obj.name : (CATS.find((n) => String(n).toLowerCase() === String(sl).toLowerCase()) || null);
      return name ? { slug: obj ? obj.slug : String(name).toLowerCase(), name, nameBn: obj ? obj.nameBn || '' : '' } : null;
    };
    const resolved = (cfgSlugs.length ? cfgSlugs.map(resolve).filter(Boolean) : (CATS.slice().map((n) => resolve(n))));
    return resolved.map((c) => ({
      ...c,
      count: PRODUCTS.filter((p) => (p.cat || '').toLowerCase() === String(c.name).toLowerCase()).length,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgSlugs.join(','), CATS.join(','), CAT_OBJS, PRODUCTS]);
  if (!tiles.length) return null;

  return (
    <section id={sec.key} className="hsec py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null}
        />
        <div className="cat-grid grid grid-cols-1 gap-[1.1rem] sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((c) => {
            const label = pick(c, 'name');
            return (
              <a key={c.slug} className="cat-tile group relative block h-[340px] overflow-hidden bg-panel lg:h-[430px]" href={'/shop?cat=' + encodeURIComponent(c.name)} onClick={(e) => { e.preventDefault(); go('/shop?cat=' + encodeURIComponent(c.name)); }} data-cat={c.name}>
                <i className="not-italic absolute inset-x-0 top-0 z-[3] h-[3px] origin-left scale-x-0 bg-acc transition-transform duration-[450ms] ease-forge group-hover:scale-x-100" />
                {broken[c.slug]
                  ? <div className="h-full w-full bg-panel2" />
                  : (
                    <img src={'/assets/cat-' + c.slug + '.png'} alt={label + ' gear'} loading="lazy"
                      onError={() => setBroken((b) => ({ ...b, [c.slug]: true }))}
                      className="h-full w-full object-cover contrast-[1.08] transition-transform duration-700 ease-forge group-hover:scale-[1.07]" />
                  )}
                <div className="pointer-events-none absolute inset-0 [background:linear-gradient(0deg,rgba(0,0,0,.88)_0%,transparent_55%)]" />
                <div className="absolute inset-x-0 bottom-0 z-[2] p-[1.6rem]">
                  <p className="font-cond text-[.78rem] font-semibold uppercase tracking-[.3em] text-white/75">{c.count} PRODUCTS</p>
                  <p className="mt-[.4rem] flex items-center justify-between font-disp text-[1.9rem] uppercase leading-none text-white">
                    {label}
                    <span className="-translate-x-3 font-head text-acc opacity-0 transition duration-300 ease-forge group-hover:translate-x-0 group-hover:opacity-100">→</span>
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- goal-panels (config: goals = [{title, desc, products}]) ---------- */
function GoalBlock({ sec, cfg }) {
  const { BY_ID } = useCatalog();
  const { openPDP } = useUI();
  const goals = Array.isArray(cfg.goals) ? cfg.goals : [];
  if (!goals.length) return null;

  const splitName = (t) => {
    const s = String(t || 'Goal');
    const k = s.indexOf(' ');
    return k < 0 ? [s] : [s.slice(0, k), s.slice(k + 1)];
  };

  return (
    <section id={sec.key} className="hsec pb-16 pt-8 lg:pb-24">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null}
        />
        <div className="grid gap-[1.1rem] lg:grid-cols-3">
          {goals.map((g, gi) => {
            const gTitle = pick(g, 'title');
            const parts = splitName(gTitle);
            const chips = (g.products || []).map((sl) => BY_ID[sl]).filter(Boolean);
            return (
              <article key={gi} className="group relative h-[460px] overflow-hidden border border-line transition-colors duration-300 hover:border-line2 lg:h-[560px]">
                <img src={GOAL_IMGS[gi % GOAL_IMGS.length]} alt={gTitle || 'Training goal'} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover contrast-[1.1] saturate-[.85] transition-transform duration-700 ease-forge group-hover:scale-[1.06]" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/30" />
                <span className="absolute left-[1.2rem] top-[1.2rem] bg-acc px-[.7rem] py-[.32rem] font-cond text-[.76rem] font-bold uppercase tracking-[.3em] text-black">
                  Phase 0{gi + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 z-[2] p-[1.7rem]">
                  <h3 className="font-disp text-[2.5rem] uppercase leading-[.95] text-white">
                    {parts.length > 1 ? (<>{parts[0]}<br />{parts[1]}</>) : parts[0]}
                  </h3>
                  <p className="mt-[.5rem] font-cond text-[.85rem] font-semibold uppercase tracking-[.24em] text-white/75">{pick(g, 'desc') || ''}</p>
                  <div className="mt-[1.1rem] flex flex-wrap gap-[.5rem]">
                    {chips.map((p) => (
                      <button key={p.id}
                        className="inline-flex items-baseline gap-[.5rem] border border-white/25 bg-black/50 px-[.75rem] py-[.5rem] font-head text-[.72rem] font-bold uppercase tracking-[.12em] text-white backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-acc hover:text-acc"
                        onClick={() => openPDP(p.id)}>
                        {pick(p, 'name')} <i className="not-italic font-disp text-[.8rem] text-acc">{money(p.price)}</i>
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- slider (config: slides = [{img, title, subtitle, link}]) ---------- */
function SliderBlock({ sec, cfg }) {
  const slides = (Array.isArray(cfg.slides) ? cfg.slides : []).filter((s) => s && (s.img || s.title));
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  const cur = Math.min(i, n - 1);

  useEffect(() => {
    if (paused || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % n), 5600);
    return () => clearInterval(t);
  }, [n, paused]);

  if (!n) return null;
  const s = slides[cur] || slides[0];

  return (
    <section id={sec.key} className="hsec relative overflow-hidden bg-black"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative h-[70svh] min-h-[420px] w-full">
        {slides.map((sl, k) => (
          <div key={k} className={'absolute inset-0 transition-opacity duration-[1200ms] ease-in-out ' + (k === cur ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            {sl.img
              ? <img src={fixUrl(sl.img)} alt={pick(sl, 'title') || 'Slide'} loading="lazy" className="h-full w-full object-cover contrast-[1.12] saturate-[.92]" />
              : <div className="h-full w-full carbon" />}
          </div>
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg to-transparent" />
        <div className="container relative z-[2] mx-auto flex h-full w-[92%] flex-col justify-end pb-[3rem]">
          {pick(s, 'title') ? <h2 className="max-w-[16ch] font-disp uppercase leading-[.94] text-white text-[clamp(2.2rem,6vw,4.6rem)]">{pick(s, 'title')}</h2> : null}
          {pick(s, 'subtitle') ? <p className="mt-[1rem] max-w-[46ch] text-[1rem] text-silver">{pick(s, 'subtitle')}</p> : null}
          {s.link ? (
            <a href={safeHref(s.link, '/shop')} onClick={(e) => { e.preventDefault(); go(safeHref(s.link, '/shop')); }}
              className="clip-notch mt-[1.6rem] inline-flex w-fit items-center gap-2 bg-acc px-7 py-3.5 font-head text-[.76rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2">
              {s.cta || 'Shop Now'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          ) : null}
        </div>
      </div>
      {n > 1 ? (
        <div className="absolute bottom-[1.2rem] right-[4%] z-[3] flex gap-[.5rem]">
          {slides.map((_, k) => (
            <button key={k} aria-label={'Slide ' + (k + 1)}
              className={'h-[3px] w-[34px] cursor-pointer transition-colors ' + (k === cur ? 'bg-acc' : 'bg-white/25')}
              onClick={() => setI(k)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ---------- dispatcher ---------- */
export default function Generic({ sec }) {
  useLang(); // Task 58 — subscribe so BN toggles re-render pick() copy
  const cfg = (sec && sec.config) || {};
  switch (sec.type) {
    case 'product-carousel': return <CarBlock sec={sec} cfg={cfg} />;
    case 'product-grid': return <GridBlock sec={sec} cfg={cfg} />;
    case 'custom-banner': return <BannerBlock sec={sec} cfg={cfg} />;
    case 'html': return <HtmlBlock sec={sec} cfg={cfg} />;
    case 'ticker': return <TickerBlock sec={sec} cfg={cfg} />;
    case 'categories': return <CatBlock sec={sec} cfg={cfg} />;
    case 'goal-panels': return <GoalBlock sec={sec} cfg={cfg} />;
    case 'slider': return <SliderBlock sec={sec} cfg={cfg} />;
    default: return null;
  }
}
