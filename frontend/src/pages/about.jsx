/* ArixGear page — about / brand story (/about).
   100% admin-driven: every text block renders from useContent().content.about
   (Admin → Content → About page; defaults served by the backend). A block whose
   data is absent simply does not render — nothing is hardcoded here. */
import { Link } from 'react-router-dom';
import { useContent } from '../store/content.jsx';

/* ---------- shared primitives ---------- */
const Eyebrow = ({ children }) => (
  <p className="font-cond font-semibold uppercase tracking-[.45em] text-acc text-[.82rem] flex items-center gap-3">
    <i className="not-italic inline-block h-0.5 w-9 bg-acc" />{children}
  </p>
);

const btnPrimary = 'inline-flex items-center justify-center gap-2.5 bg-acc px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-black transition-all duration-300 clip-notch hover:bg-acc2 hover:-translate-y-0.5';
const btnGhost = 'inline-flex items-center justify-center gap-2.5 border border-line2 bg-white/[.03] px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-txt transition-all duration-300 clip-notch hover:border-silver hover:bg-white/[.07] hover:-translate-y-0.5';

/* admin content may carry <b> HTML (legacy data-cs-type="html") — strip tags, render safe */
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '');

/* outline the last word of each line (port of site-content.outlineTitle) */
const OutlineLines = ({ text }) => (
  <>
    {String(text).split(/\n/).filter((l) => l.trim()).map((ln, i) => {
      const w = ln.trim().split(' '); const last = w.pop();
      return (
        <span key={i} className="block">
          {w.join(' ')}{w.length ? ' ' : ''}<span className="text-outline">{last}</span>
        </span>
      );
    })}
  </>
);

/* outlined last word of a single line */
const OutlineTitle = ({ text }) => {
  const w = String(text || '').trim().split(' ').filter(Boolean);
  if (!w.length) return null;
  const last = w.pop();
  return <>{w.join(' ')}{w.length ? ' ' : ''}<span className="text-outline">{last}</span></>;
};

/* quality-checkpoint icons — presentation only (theme SVGs, positions by index) */
const QC_ICONS = [
  <svg key="0" viewBox="0 0 24 24" className="mb-4 h-[26px] w-[26px] stroke-acc fill-none" strokeWidth="1.6"><path d="M12 2l3 6 6 .9-4.5 4.2 1.1 6-5.6-3-5.6 3 1.1-6L3 8.9l6-.9z" /></svg>,
  <svg key="1" viewBox="0 0 24 24" className="mb-4 h-[26px] w-[26px] stroke-acc fill-none" strokeWidth="1.6"><path d="M14 3l7 7-9 9H5v-7z" /><path d="M14 3l4 4" /></svg>,
  <svg key="2" viewBox="0 0 24 24" className="mb-4 h-[26px] w-[26px] stroke-acc fill-none" strokeWidth="1.6"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" /></svg>,
];

const statCellCls = (i) =>
  'px-6 py-7 text-center ' + (
    i % 4 === 0 ? 'border-r border-b border-line lg:border-b-0'
      : i % 4 === 1 ? 'border-b border-line lg:border-b-0 lg:border-r'
        : i % 4 === 2 ? 'border-r border-line'
          : '');

import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  useSEO('about');
  const { content } = useContent();
  const ab = content.about || {};
  const q = ab.quality || {};

  const prose = (ab.prose || []).map((p) => stripTags(p)).filter(Boolean);
  const stats = (ab.stats || []).filter((s) => s && (s.value || s.v) && (s.label || s.text));
  const timeline = (ab.timeline || []).filter((t) => t && t.year && t.title);
  const qc = (q.qc || []).filter((c) => c && (c.h || c.title));
  const qProse = (q.prose || []).map((p) => stripTags(p)).filter(Boolean);

  return (
    <section id="page-about" className="py-16 md:py-24">
      <div className="container mx-auto w-[92%]">

        {/* ---------- HERO ---------- */}
        <div className="relative mb-12 flex min-h-[52vh] items-end overflow-hidden border border-line">
          <img id="abImg" src="assets/hero-3.png" alt="Chalked hands gripping a barbell in a dark gym"
            className="absolute inset-0 h-full w-full object-cover [filter:contrast(1.12)_grayscale(.75)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-black/50 to-black/35" />
          <div className="relative z-[2] w-full p-6 sm:p-10 md:p-[2.8rem]">
            {ab.eyebrow ? <Eyebrow>{ab.eyebrow}</Eyebrow> : null}
            {ab.title ? (
              <h2 className="mt-4 max-w-[16ch] font-disp uppercase leading-[.96] text-4xl md:text-6xl lg:text-7xl">
                <OutlineLines text={ab.title} />
              </h2>
            ) : null}
          </div>
        </div>

        {/* ---------- STORY PROSE ---------- */}
        {prose.length > 0 && (
          <div className="max-w-[70ch] text-muted">
            {prose.map((p, i) => (
              <p key={i} className={i > 0 ? 'mt-4' : ''}>{p}</p>
            ))}
          </div>
        )}

        {/* ---------- STATS STRIP ---------- */}
        {stats.length > 0 && (
          <div className="my-12 grid grid-cols-2 border border-line bg-panel lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={i} className={statCellCls(i)}>
                <b className="block font-disp text-[2.3rem] leading-none text-acc">{s.value || s.v}</b>
                <span className="font-cond font-semibold text-[.72rem] uppercase tracking-[.24em] text-silver">{s.label || s.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* ---------- TIMELINE ---------- */}
        {timeline.length > 0 && (
          <>
            <div className="mb-0">
              {ab.timelineEyebrow ? <Eyebrow>{ab.timelineEyebrow}</Eyebrow> : null}
              {ab.timelineTitle ? (
                <h2 className="mt-4 font-disp uppercase leading-[.96] text-4xl md:text-6xl">
                  <OutlineTitle text={ab.timelineTitle} />
                </h2>
              ) : null}
            </div>
            <div className="ml-2 mt-10 grid gap-7 border-l-2 border-line2 pl-9">
              {timeline.map((t, i) => (
                <div key={i} className="relative">
                  <span className="absolute top-1.5 -left-[calc(2.25rem+6px)] h-3 w-3 rotate-45 bg-acc" />
                  <p className="font-disp text-[1.15rem] tracking-[.04em] text-acc">{t.year}</p>
                  <h4 className="mb-1.5 mt-1 font-head font-extrabold uppercase tracking-[.08em] text-[1rem]">{t.title}</h4>
                  <p className="max-w-[62ch] text-[.92rem] text-muted">{stripTags(t.text || '')}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- QUALITY SPLIT ---------- */}
        <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-2">
          <div className="relative min-h-[300px] overflow-hidden border border-line md:min-h-[380px]">
            <img id="abImg2" src="assets/story-1.png" alt="Athlete mid-training wearing ArixGear gear"
              className="absolute inset-0 h-full w-full object-cover [filter:contrast(1.1)_grayscale(.5)]" />
          </div>
          <div className="border border-line bg-panel p-6 md:p-9">
            {q.eyebrow ? <Eyebrow>{q.eyebrow}</Eyebrow> : null}
            {q.title ? (
              <h3 className="mb-5 mt-4 font-disp uppercase leading-[1.02] text-[1.8rem] md:text-[2.6rem]">
                {String(q.title).split(/\n/).filter((l) => l.trim()).map((l, i) => <span key={i} className="block">{stripTags(l)}</span>)}
              </h3>
            ) : null}
            {qProse.length > 0 && (
              <div className="text-[.95rem] text-muted">
                {qProse.map((p, i) => <p key={i} className={i > 0 ? 'mt-4' : ''}>{p}</p>)}
              </div>
            )}
            {qc.length > 0 && (
              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {qc.map((c, i) => (
                  <div key={i} className="border border-line bg-panel p-6">
                    {QC_ICONS[i % QC_ICONS.length]}
                    <h4 className="font-head font-extrabold uppercase tracking-[.1em] text-[.95rem]">{c.h || c.title}</h4>
                    <p className="mt-2 text-[.9rem] text-muted">{stripTags(c.p || c.text || '')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---------- CTAs ---------- */}
        <div className="mt-12 flex flex-wrap gap-4">
          <Link to="/shop" className={btnPrimary}>Train the Catalog</Link>
          <Link to="/guides" className={btnGhost}>Read the Training Guides</Link>
        </div>

      </div>
    </section>
  );
}
