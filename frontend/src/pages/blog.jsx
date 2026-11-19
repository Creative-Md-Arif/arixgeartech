import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPosts } from '../services/blog.js';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

const dateFmt = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function BlogPage() {
  const { isBn } = useLang();
  useSEO('blog', { title: 'The Journal — Training, Gear & Nutrition | ArixGear' });
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [state, setState] = useState('loading');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    (async () => {
      try {
        const d = await listPosts({ limit: 12, page, signal: ctrl ? ctrl.signal : undefined });
        setData({ ...d, items: Array.isArray(d.items) ? d.items : [], page: d.page || page, pages: d.pages || 1 });
        setState(d.items && d.items.length ? 'ok' : 'empty');
      } catch (e) {
        if (String(e).includes('abort')) return;
        setState('error');
      }
    })();
    return () => { if (ctrl) ctrl.abort(); };
  }, [page, reload]);

  return (
    <section id="page-blog" className="page py-16 lg:py-24" data-testid="blogPage">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            The Journal
          </p>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            Knowledge is a<br /><span className="text-acc">Prerequisite</span>
          </h2>
          <p className="mt-5 max-w-[560px] text-[.95rem] leading-[1.7] text-muted">
            Training programs, gear science and nutrition honesty — written for lifters in Bangladesh, not for clicks.
          </p>
        </div>

        {state === 'loading' && (
          <div className="mt-10 grid grid-cols-1 gap-[1.4rem] md:grid-cols-2 lg:grid-cols-3" data-testid="blogSkeleton">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="bg-panel border border-line" aria-hidden="true">
                <div className="aspect-[16/10] w-full animate-pulse bg-line/60" />
                <div className="p-5">
                  <div className="h-2.5 w-1/4 animate-pulse bg-line/60" />
                  <div className="mt-3 h-4 w-4/5 animate-pulse bg-line/70" />
                  <div className="mt-2 h-3 w-full animate-pulse bg-line/50" />
                  <div className="mt-1.5 h-3 w-2/3 animate-pulse bg-line/50" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state === 'empty' && (
          <div className="mt-10 border border-dashed border-line2 px-8 py-16 text-center text-muted" data-testid="blogEmpty">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">No Posts Yet</h3>
            <p>The first write-up is being written. Check back soon.</p>
          </div>
        )}

        {state === 'error' && (
          <div className="mt-10 border border-dashed border-line2 px-8 py-12 text-center text-muted" role="alert" data-testid="blogLoadError">
            <h3 className="mb-2 font-disp text-[1.5rem] uppercase text-txt">Journal unavailable</h3>
            <p>Posts could not be loaded. Check your connection and try again.</p>
            <button type="button" onClick={() => setReload((n) => n + 1)} className="mt-5 border border-line2 px-5 py-2 font-cond text-[.78rem] font-semibold uppercase tracking-[.18em] text-acc">Try again</button>
          </div>
        )}

        {state === 'ok' && (
          <div className="mt-10 grid grid-cols-1 gap-[1.4rem] md:grid-cols-2 lg:grid-cols-3" data-testid="blogGrid">
            {data.items.map((p) => (
              <Link
                key={p._id} to={`/blog/${p.slug}`} data-post={p.slug}
                className="group flex flex-col bg-panel border border-line transition-colors duration-300 hover:border-line2"
              >
                <div className="aspect-[16/10] w-full overflow-hidden bg-bg2">
                  {p.cover
                    ? <img className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" src={p.cover} alt={isBn && p.titleBn ? p.titleBn : p.title} loading="lazy" />
                    : <div className="flex h-full w-full items-center justify-center bg-carbon">
                        <span className="font-disp text-[2.6rem] uppercase text-outline">ArixGear</span>
                      </div>}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {(p.tags || []).slice(0, 2).map((t) => (
                      <span key={t} className="border border-line px-2 py-0.5 font-cond text-[.68rem] font-semibold uppercase tracking-[.18em] text-muted">{t}</span>
                    ))}
                    <span className="ml-auto font-cond text-[.72rem] uppercase tracking-[.14em] text-dim">{p.publishedAt ? dateFmt(p.publishedAt) : ''}</span>
                  </div>
                  <h3 className="mt-3 font-head text-[1.06rem] font-bold leading-snug text-txt transition-colors group-hover:text-acc">{isBn && p.titleBn ? p.titleBn : p.title}</h3>
                  <p className="mt-2 flex-1 text-[.88rem] leading-[1.65] text-muted">{isBn && p.excerptBn ? p.excerptBn : p.excerpt}</p>
                  <span className="mt-4 font-cond text-[.75rem] font-semibold uppercase tracking-[.22em] text-acc">Read the piece →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {state === 'ok' && data.pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-4" aria-label="Journal pages">
            <button type="button" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))} className="border border-line2 px-4 py-2 font-cond text-[.75rem] uppercase tracking-[.16em] text-muted disabled:opacity-40">Previous</button>
            <span className="font-cond text-[.75rem] uppercase tracking-[.16em] text-dim">Page {data.page} of {data.pages}</span>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage((n) => Math.min(data.pages, n + 1))} className="border border-line2 px-4 py-2 font-cond text-[.75rem] uppercase tracking-[.16em] text-muted disabled:opacity-40">Next</button>
          </nav>
        )}
      </div>
    </section>
  );
}
