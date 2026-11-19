/*hero reel slideshow (admin banners → content.hero fallback copy). Images: banner urls else the DEFAULT_SLIDES theme assets. Copy: the active banner when present, else content.hero (backend contentDefaults — admin-editable).*/
import { useEffect, useRef, useState } from "react";
import { useContent } from "../../store/content.jsx";
import { useUI } from "../../store/ui.jsx";
import { go } from "../../lib/go.js";
import { bannerClick } from "../../services/banners.js";
import { tr, pick, useLang } from "../../lib/i18n.jsx";
import { safeHref } from "../../lib/sanitize.js"; /*audit — banner/hero links are admin-authored; refuse javascript:/data: schemes*/
import { OutlineTitle } from "./Head.jsx";

const SLIDE_MS = 5600;

const DEFAULT_SLIDES = [
  {
    img: "/assets/hero-1.png",
    alt: "Athlete slamming battle ropes in a dark gym",
  },
  { img: "/assets/hero-2.png", alt: "Female athlete setting up a deadlift" },
  {
    img: "/assets/hero-3.png",
    alt: "Chalked hands gripping a knurled barbell",
  },
];

/*banner image url fix — same idea as the catalog adapter (absolute-ify relative paths)*/
const fixUrl = (u) =>
  !u ? "" : /^https?:/.test(u) ? u : u.startsWith("/") ? u : "/" + u;

export default function Hero() {
  useLang();  // subscribe so BN toggles re-render pick() copy
  const { heroSlides, content } = useContent();
  const { toast } = useUI();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef(null);
  const gainRef = useRef(null);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const banners =
    Array.isArray(heroSlides) && heroSlides.length ? heroSlides : null;
  const n = banners ? banners.length : DEFAULT_SLIDES.length;
  const cur = Math.min(i, n - 1);

  /*auto-advance ~5s — effect re-arms on every index change so manual jumps reset the timer, exactly like legacy heroPlay() + index-bar clicks*/
  const toggleSound = (force) => {
    const next = typeof force === "boolean" ? force : !soundOn;
    setSoundOn(next);
    try {
      if (next) {
        if (!audioRef.current) {
          const AC = window.AudioContext || window.webkitAudioContext;
          const ctx = new AC();
          const gain = ctx.createGain();
          gain.gain.value = 0;
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 110;
          [52, 55.7, 110.3].forEach((f) => {
            const o = ctx.createOscillator();
            o.type = "sine";
            o.frequency.value = f;
            o.connect(lp);
            o.start();
          });
          lp.connect(gain);
          gain.connect(ctx.destination);
          audioRef.current = ctx;
          gainRef.current = gain;
        }
        audioRef.current.resume();
        gainRef.current.gain.linearRampToValueAtTime(
          0.045,
          audioRef.current.currentTime + 1.2,
        );
        toast("Reel unmuted", "Low-frequency training room ambience.");
      } else if (audioRef.current) {
        gainRef.current.gain.linearRampToValueAtTime(
          0,
          audioRef.current.currentTime + 0.5,
        );
      }
    } catch (e) {}
  };

  /*React 18 never re-applies the `muted` ATTRIBUTE after mount, so flip the DOM property directly on every soundOn change (deterministic unmute for hero videos; audio ambience continues separately).*/
  useEffect(() => {
    document.querySelectorAll("#hero video").forEach((v) => {
      v.muted = !soundOn;
    });
  }, [soundOn, cur]);

  /*content.hero — the admin-editable fallback copy block (backend contentDefaults)*/
  const hero = (content && content.hero) || {};

  const slides = banners
    ? banners.map((bn) => ({
        img: fixUrl((bn.poster && bn.poster.url) || (bn.image && bn.image.url)),
        alt: bn.title || hero.title || "",
        /*video banners: muted autoplay, advance at the end, single-video loops*/
        video:
          bn.mediaType === "video" && bn.video && bn.video.url
            ? fixUrl(bn.video.url)
            : null,
      }))
    : DEFAULT_SLIDES;

  /*while the ACTIVE slide is a video, the clip drives advancement (onEnded) — suspend the interval timer so it never cuts the video short*/
  const curVideo = Boolean(slides[cur] && slides[cur].video);
  useEffect(() => {
    if (curVideo || paused || n < 2 || reduceMotion) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % n), SLIDE_MS);
    return () => clearInterval(t);
  }, [n, i, paused, curVideo, reduceMotion]);

  /*copy from the ACTIVE banner when present, else content.hero (admin-editable). banner title/subtitle/ctaText go through pick() so BN mode shows the Bengali twins when lang=bn (falls back to English when empty).*/
  const bn = banners ? banners[cur] || null : null;
  const copy = {
    eyebrow: (bn && bn.eyebrow) || hero.eyebrow || "",
    title:
      bn && bn.title ? (
        <OutlineTitle text={pick(bn, "title")} />
      ) : (
        <>
          {hero.title}
          <br />
          <span className="text-outline">{hero.titleAccent}</span>
        </>
      ),
    sub: (bn && pick(bn, "subtitle")) || hero.subtitle || "",
    ctaText: (bn && pick(bn, "ctaText")) || hero.ctaText || "",
    link: safeHref((bn && bn.link) || hero.link, "#new"),
  };

  const ctaGo = (e, link) => {
    e.preventDefault();
    if (bn && bn.id) bannerClick(bn.id);
    go(link);
  };

  return (
    <section
      id="hero"
      className="hsec home-hero-card relative flex flex-col justify-end overflow-hidden rounded-2xl bg-black"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
@keyframes arixgearKenburns{from{transform:scale(1) translateX(0)}to{transform:scale(1.1) translateX(-1.5%)}}
@keyframes arixgearIdxFill{to{transform:scaleX(1)}}
@keyframes arixgearBlink{50%{opacity:.25}}
.hero-slide.active img{animation:arixgearKenburns 7s ease-out forwards}
.idx-fill{transform:scaleX(0);transform-origin:left}
.idx-bar.active .idx-fill{animation:arixgearIdxFill ${SLIDE_MS}ms linear forwards}
.hero-paused .idx-fill{animation-play-state:paused}
`}</style>

      <div
        className="hero-media absolute inset-0 cursor-pointer"
        title="Click to unmute reel"
        onClick={() => {
          if (!soundOn) toggleSound(true);
        }}
      >
        {slides.map((s, k) => (
          <div
            key={k}
            className={
              "hero-slide absolute inset-0 transition-opacity duration-[1400ms] ease-in-out " +
              (k === cur
                ? "active opacity-100"
                : "pointer-events-none opacity-0")
            }
          >
            {s.video ? (
              <video
                src={s.video}
                poster={s.img || undefined}
                className="h-full w-full object-cover contrast-[1.12] saturate-[.92]"
                autoPlay={!reduceMotion}
                muted={!soundOn}
                playsInline
                loop={!banners || banners.length === 1}
                onEnded={() => {
                  if (!paused) setI((v) => (v + 1) % n);
                }}
                data-hero-video={k === cur ? "active" : "idle"}
              />
            ) : s.img ? (
              <img
                src={s.img}
                alt={s.alt}
                className="h-full w-full object-cover contrast-[1.12] saturate-[.92]"
              />
            ) : (
              <div className="h-full w-full carbon" />
            )}
          </div>
        ))}
        <div className="hero-shade pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="hero-shade hero-shade-bottom pointer-events-none absolute inset-0" />
      </div>

      <div className="hero-content container relative z-[2] mx-auto pb-[4.5rem]">
        <p className="eyebrow mb-[1.4rem] flex animate-heroIn items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
          <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
          {copy.eyebrow}
        </p>
        <h1 className="hero-title max-w-[12ch] animate-heroIn font-disp uppercase leading-[.92] tracking-[.005em] text-[clamp(2.8rem,6.6vw,6rem)] [animation-delay:.08s]">
          {copy.title}
        </h1>
        <p className="hero-sub mt-[1.4rem] max-w-[46ch] animate-heroIn text-[1.02rem] text-silver [animation-delay:.16s]">
          {copy.sub}
        </p>
        <div className="hero-cta mt-[2.2rem] flex flex-wrap gap-4 animate-heroIn [animation-delay:.24s]">
          <a
            className="btn-primary clip-notch inline-flex items-center gap-2 bg-acc px-8 py-4 font-head text-[.78rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2"
            href={copy.link}
            onClick={(e) => ctaGo(e, copy.link)}
          >
            {copy.ctaText}
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          <a
            className="btn-ghost clip-notch inline-flex items-center border border-line2 px-8 py-4 font-head text-[.78rem] font-bold uppercase tracking-[.2em] text-txt transition hover:border-acc hover:text-acc"
            href="#gear"
            onClick={(e) => {
              e.preventDefault();
              go("#gear");
            }}
          >
            Browse the Catalog
          </a>
        </div>
      </div>

      <div className="hero-foot container relative z-[2] mx-auto flex flex-wrap items-center justify-between gap-[1.5rem] pb-[1.8rem]">
        <div
          className={
            "hero-indices flex max-w-[340px] flex-1 gap-[.6rem]" +
            (paused ? " hero-paused" : "")
          }
        >
          {Array.from({ length: n }).map((_, k) => (
            <button
              key={k}
              className={
                "idx-bar relative h-[3px] flex-1 cursor-pointer overflow-hidden bg-white/15" +
                (k === cur ? " active" : "")
              }
              aria-label={"Slide " + (k + 1)}
              onClick={() => setI(k)}
            >
              <i className="idx-fill not-italic absolute inset-0 bg-acc" />
            </button>
          ))}
        </div>
        <div className="hero-tools flex flex-wrap items-center gap-[.8rem]">
          <span className="reel-chip hidden items-center gap-[.55rem] border border-line2 bg-black/40 px-[.9rem] py-[.5rem] font-cond text-[.78rem] font-semibold uppercase tracking-[.3em] text-white/85 sm:inline-flex">
            <span className="h-[7px] w-[7px] rounded-full bg-acc [animation:arixgearBlink_1.6s_ease_infinite]" />
            {tr("Reel 001 — Playing")}
          </span>
          <button
            className={
              "sound-btn inline-flex items-center gap-[.6rem] border bg-black/40 px-[.9rem] py-[.5rem] font-cond text-[.78rem] font-semibold uppercase tracking-[.26em] transition " +
              (soundOn
                ? "on border-acc text-acc"
                : "border-line2 text-white/85 hover:border-acc hover:text-acc")
            }
            aria-label="Toggle sound"
            onClick={(e) => {
              e.stopPropagation();
              toggleSound();
            }}
          >
            {soundOn ? (
              <svg
                viewBox="0 0 24 24"
                className="h-[14px] w-[14px] fill-none stroke-[1.8]"
              >
                <path d="M11 5 6 9H3v6h3l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-[14px] w-[14px] fill-none stroke-[1.8]"
              >
                <path d="M11 5 6 9H3v6h3l5 4V5z" />
                <path d="M22 9l-6 6M16 9l6 6" />
              </svg>
            )}
            <span>
              {soundOn ? tr("Sound On") : tr("Sound Off · Tap to Unmute")}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
