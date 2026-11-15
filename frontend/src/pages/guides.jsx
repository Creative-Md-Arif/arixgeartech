/* ArixGear page — guides / blog: tag filters, cards, article reader with kit chips.
   Posts come from content.posts (Admin → Content); ?post= opens the reader directly
   (react-router search params). No post id / an invalid id → the list view shows. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { money } from '../lib/format.js';
import { useContent } from '../store/content.jsx';
import { useCatalog } from '../store/catalog.jsx';
import { useUI } from '../store/ui.jsx';

/* ---------- shared primitives ---------- */
const Eyebrow = ({ children }) => (
  <p className="font-cond font-semibold uppercase tracking-[.45em] text-acc text-[.82rem] flex items-center gap-3">
    <i className="not-italic inline-block h-0.5 w-9 bg-acc" />{children}
  </p>
);

/* imgk → asset mapping. Step 2 sync fix — the admin picker offers tech-era
   keys (laptop/phone/audio/gaming) now; the legacy gym-era keys stay as
   aliases so old content rows keep rendering. */
const POST_IMG = {
  laptop: 'assets/laptop-voyage-14.png',
  phone: 'assets/phone-nova-x5.png',
  audio: 'assets/buds-air-3.png',
  gaming: 'assets/monitor-ultra-27-4k.png',
  /* legacy aliases (pre-conversion content) */
  chalk: 'assets/hero-3.png',
  deadlift: 'assets/hero-2.png',
  story1: 'assets/story-1.png',
  story2: 'assets/story-2.png',
  story3: 'assets/story-3.png',
  athlete1: 'assets/athlete-1.png',
  athlete2: 'assets/athlete-2.png',
  athlete3: 'assets/athlete-3.png',
};
function postImg(BY_ID, k) {
  if (k === 'wheyimg') return (BY_ID.whey && BY_ID.whey.img) || 'assets/laptop-voyage-14.png';
  return POST_IMG[k] || 'assets/hero-1.png';
}

/* article body typography (legacy .article rules → arbitrary variants) */
const BODY_CLS = [
  '[&_p]:mb-4 [&_p]:text-[.98rem] [&_p]:text-muted',
  '[&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:font-head [&_h3]:font-extrabold [&_h3]:text-[1.15rem] [&_h3]:uppercase [&_h3]:tracking-[.06em] [&_h3]:text-txt',
  '[&_b]:text-txt [&_strong]:text-txt',
  '[&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-[square]',
  '[&_li]:mb-2 [&_li]:text-[.95rem] [&_li]:text-muted',
  '[&_.pull]:my-7 [&_.pull]:border-l-[3px] [&_.pull]:border-acc [&_.pull]:py-1 [&_.pull]:pl-6 [&_.pull]:font-disp [&_.pull]:text-[1.4rem] [&_.pull]:leading-[1.25] [&_.pull]:uppercase [&_.pull]:text-txt',
].join(' ');

const scatCls = (on) =>
  'select-none border px-4 py-2.5 font-cond font-semibold uppercase tracking-[.2em] text-[.85rem] transition-colors ' +
  (on ? 'border-acc bg-acc text-black' : 'border-line bg-transparent text-muted hover:border-line2 hover:text-txt');

function PostMeta({ p }) {
  return <p className="font-cond font-bold text-[.74rem] uppercase tracking-[.3em] text-acc">{p.tag} · {p.time}</p>;
}

import { useSEO } from '../lib/seo.jsx';
import { sanitizeHtml } from '../lib/sanitize.js'; /* Step 3 audit — shared hardened sanitizer (entity-decode + svg/math/base coverage) */

/* Task 57 (security audit) — guide bodies are admin-authored HTML rendered via
   dangerouslySetInnerHTML. Sanitize defensively: a compromised admin account
   must not be able to run script on every customer's device.
   Step 3 audit — the sanitizer lives in lib/sanitize.js, shared with the
   homepage "html" section block; it entity-decodes first (javascript&colon;
   used to slip past the raw-string regex) and strips svg/math/base/form too. */

export default function Page() {
  useSEO('guides');
  const { content } = useContent();
  const { BY_ID } = useCatalog();
  const { openPDP } = useUI();

  /* posts: admin-driven array only (no bundled posts) */
  const posts = useMemo(() => {
    const src = Array.isArray(content.posts) ? content.posts : [];
    return src.filter((p) => p && p.id && p.title && p.body).map((p) => ({
      id: String(p.id), tag: p.tag || 'Guide', time: p.time || '5 min read', imgk: p.imgk || 'laptop',
      title: String(p.title), ex: p.ex || '', kit: p.kit || [], body: String(p.body),
    }));
  }, [content.posts]);

  /* reader selection — ?post= query owns the reader (reactive, router-backed) */
  const [params, setParams] = useSearchParams();
  const sel = params.get('post');
  const [tag, setTag] = useState('All');

  const openPost = (id) => { setParams({ post: id }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closePost = () => { setParams({}); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const post = sel ? posts.find((x) => x.id === sel) || null : null;
  const tags = ['All', ...new Set(posts.map((p) => p.tag))];
  const list = posts.filter((p) => tag === 'All' || p.tag === tag);
  const guides = content.guides || {};

  const kitProducts = post && post.kit ? post.kit.map((id) => BY_ID[id]).filter(Boolean) : [];

  return (
    <>

      <section id="page-blog" className="py-16 md:py-24">
        <div className="container mx-auto w-[92%]">

          {/* ---------- LIST VIEW ---------- */}
          <div id="blogList" className={post ? 'hidden' : ''}>
            <div>
              {guides.eyebrow ? <Eyebrow>{guides.eyebrow}</Eyebrow> : null}
              <h2 className="mt-4 font-disp uppercase leading-[.96] text-4xl md:text-6xl">
                {guides.heading
                  ? String(guides.heading).split(/\n/).filter((l) => l.trim()).map((ln, i) => {
                    const w = ln.trim().split(' '); const last = w.pop();
                    return <span key={i} className="block">{w.join(' ')}{w.length ? ' ' : ''}<span className="text-outline">{last}</span></span>;
                  })
                  : null}
              </h2>
            </div>

            <div id="blogTags" className="mb-8 mt-8 flex flex-wrap items-center gap-2">
              {tags.map((t) => (
                <button key={t} className={scatCls(t === tag)} onClick={() => setTag(t)}>{t}</button>
              ))}
            </div>

            {/* featured = first post of the filtered list */}
            {list[0] && (
              <article className="group mb-10 grid cursor-pointer border border-line bg-panel transition-colors duration-300 hover:border-acc lg:grid-cols-[1.25fr_1fr]"
                onClick={() => openPost(list[0].id)} data-post={list[0].id}>
                <div className="relative min-h-[220px] overflow-hidden md:min-h-[340px]">
                  <img src={postImg(BY_ID, list[0].imgk)} alt={list[0].title} loading="lazy"
                    className="h-full w-full object-cover [filter:contrast(1.1)_grayscale(.55)] transition-transform duration-700 ease-forge group-hover:scale-105" />
                </div>
                <div className="flex flex-col justify-center gap-3.5 p-6 md:p-10">
                  <PostMeta p={list[0]} />
                  <h3 className="font-disp uppercase leading-[1.02] text-3xl md:text-[2.3rem]">{list[0].title}</h3>
                  <p className="text-[.94rem] text-muted">{list[0].ex}</p>
                  <span className="inline-flex w-max items-center gap-2.5 font-cond font-bold text-[.85rem] uppercase tracking-[.24em] text-acc transition-all duration-300 group-hover:gap-4">
                    Read the guide
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </div>
              </article>
            )}

            <div id="blogGrid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.slice(1).map((p) => (
                <article key={p.id} data-post={p.id}
                  className="group flex cursor-pointer flex-col border border-line bg-panel transition-all duration-300 hover:-translate-y-1.5 hover:border-line2"
                  onClick={() => openPost(p.id)}>
                  <div className="aspect-[16/9.5] overflow-hidden">
                    <img src={postImg(BY_ID, p.imgk)} alt={p.title} loading="lazy"
                      className="h-full w-full object-cover [filter:contrast(1.08)_grayscale(.6)] transition-all duration-700 group-hover:scale-[1.06] group-hover:[filter:grayscale(.25)]" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <p className="font-cond font-semibold text-[.78rem] uppercase tracking-[.22em] text-dim">{p.tag} · {p.time}</p>
                    <h3 className="font-disp uppercase leading-[1.02] text-[1.15rem]">{p.title}</h3>
                    <p className="text-[.86rem] text-muted">{p.ex}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* ---------- READER VIEW ---------- */}
          {post && (
            <div id="postReader">
              <button id="blogBack" onClick={closePost}
                className="mb-6 flex w-max cursor-pointer items-center gap-2.5 font-cond font-semibold uppercase tracking-[.24em] text-[.85rem] text-muted transition-colors hover:text-acc">
                ← All Guides
              </button>
              <article className="mx-auto max-w-[760px]">
                <PostMeta p={post} />
                <h2 className="mt-2 font-disp uppercase leading-[.96] text-4xl md:text-5xl">{post.title}</h2>
                <div className="my-8 aspect-[16/8.5] overflow-hidden border border-line">
                  <img src={postImg(BY_ID, post.imgk)} alt={post.title}
                    className="h-full w-full object-cover [filter:contrast(1.1)_grayscale(.35)]" />
                </div>
                {/* admin-trusted post HTML (Admin → Content) */}
                <div className={BODY_CLS} dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }} />

                {kitProducts.length > 0 && (
                  <>
                    <h3 className="mt-10 font-head font-extrabold uppercase tracking-[.06em] text-[1.15rem]">Shop the Kit</h3>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {kitProducts.map((pr) => (
                        <button key={pr.id} className="inline-flex cursor-pointer items-baseline gap-2 border border-white/25 bg-black/50 px-3 py-2 font-head font-bold text-[.72rem] uppercase tracking-[.12em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-acc hover:text-acc"
                          onClick={() => openPDP(pr.id)}>
                          {pr.name} <i className="not-italic font-disp text-[.8rem] text-acc">{money(pr.price)}</i>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </article>
            </div>
          )}

        </div>
      </section>
    
    </>
  );
}
