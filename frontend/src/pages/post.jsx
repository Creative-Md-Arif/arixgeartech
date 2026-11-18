/* ArixGear page — /blog/:slug — single Journal post (Task 47).
   Cover, tag chips, meta, paragraphs split on blank lines (plain text —
   zero HTML injection), view-bump on the API side, related posts footer. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPost } from '../services/blog.js';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

const dateFmt = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const readMin = (body) => Math.max(1, Math.round(String(body || '').split(/\s+/).length / 200));

export default function PostPage() {
  const { isBn } = useLang();
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [related, setRelated] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | missing
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setState('loading'); setPost(null);
    (async () => {
      try {
        const d = await getPost(slug, ctrl ? ctrl.signal : undefined);
        setPost(d.post); setRelated(d.related || []); setState('ok');
      } catch (e) {
        if (String(e).includes('abort')) return;
        setState(e.status === 404 ? 'missing' : 'error');
      }
    })();
    return () => { if (ctrl) ctrl.abort(); };
  }, [slug, reload]);

  useSEO(state === 'ok' && post ? 'blog-post' : 'blog', {
    title: post ? (post.seoTitle || (isBn && post.titleBn ? post.titleBn : post.title)) : undefined,
    description: post ? (post.seoDescription || (isBn && post.excerptBn ? post.excerptBn : post.excerpt)) : undefined,
    image: post && post.cover ? post.cover : undefined,
  });

  /* Task 58 — BN mode reads the Bengali body when present */
  const bodyTxt = post ? (isBn && post.bodyBn ? post.bodyBn : post.body) : '';
  const paras = bodyTxt ? String(bodyTxt).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) : [];

  return (
    <section id="page-post" className="page py-16 lg:py-24" data-testid="postPage">
      <div className="container mx-auto w-[92%] max-w-[860px]">

        {state === 'loading' && (
          <div aria-hidden="true">
            <div className="h-3 w-32 animate-pulse bg-line/60" />
            <div className="mt-4 h-8 w-3/4 animate-pulse bg-line/70" />
            <div className="mt-8 aspect-[16/8] w-full animate-pulse bg-line/60" />
          </div>
        )}

        {state === 'missing' && (
          <div className="border border-dashed border-line2 px-8 py-16 text-center" data-testid="postMissing">
            <h1 className="font-disp text-[2rem] uppercase text-txt">Post Not Found</h1>
            <p className="mt-2 text-muted">The piece moved or was never forged.</p>
            <Link to="/blog" className="mt-6 inline-block bg-acc px-6 py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2">Back to the Journal</Link>
          </div>
        )}

        {state === 'error' && (
          <div className="border border-dashed border-line2 px-8 py-16 text-center" role="alert" data-testid="postLoadError">
            <h1 className="font-disp text-[2rem] uppercase text-txt">Journal unavailable</h1>
            <p className="mt-2 text-muted">This post could not be loaded. Check your connection and try again.</p>
            <button type="button" onClick={() => setReload((n) => n + 1)} className="mt-6 border border-line2 px-6 py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.2em] text-acc">Try again</button>
          </div>
        )}

        {state === 'ok' && post && (
          <article data-post-slug={post.slug}>
            <Link to="/blog" className="font-cond text-[.78rem] font-semibold uppercase tracking-[.24em] text-muted transition hover:text-acc">← The Journal</Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(post.tags || []).map((t) => (
                <span key={t} className="border border-line px-2 py-0.5 font-cond text-[.68rem] font-semibold uppercase tracking-[.18em] text-muted">{t}</span>
              ))}
            </div>
            <h1 className="mt-3 font-disp uppercase leading-[1.02] tracking-[.01em] text-[clamp(1.9rem,4.6vw,3.2rem)] text-txt">{isBn && post.titleBn ? post.titleBn : post.title}</h1>
            <p className="mt-3 font-cond text-[.8rem] uppercase tracking-[.16em] text-dim">
              {post.author || 'ArixGear Editorial'} · {post.publishedAt ? dateFmt(post.publishedAt) : ''} · {readMin(bodyTxt)} min read · {post.views || 0} views
            </p>
            {post.cover && (
              <div className="mt-7 aspect-[16/8] w-full overflow-hidden border border-line bg-bg2">
                <img className="h-full w-full object-cover" src={post.cover} alt={isBn && post.titleBn ? post.titleBn : post.title} />
              </div>
            )}
            {(isBn ? (post.excerptBn || post.excerpt) : post.excerpt) && <p className="mt-7 border-l-2 border-acc pl-4 text-[1.02rem] leading-[1.75] text-silver">{isBn && post.excerptBn ? post.excerptBn : post.excerpt}</p>}
            <div className="mt-6 space-y-5" data-testid="postBody">
              {paras.map((p, i) => (
                <p key={i} className="text-[.98rem] leading-[1.85] text-muted whitespace-pre-line">{p}</p>
              ))}
            </div>

            {related.length > 0 && (
              <div className="mt-14 border-t border-line pt-9" data-testid="postRelated">
                <h2 className="font-disp text-[1.5rem] uppercase text-txt">Keep <span className="text-acc">Reading</span></h2>
                <div className="mt-5 grid gap-[1.1rem] md:grid-cols-3">
                  {related.map((r) => (
                    <Link key={r._id} to={`/blog/${r.slug}`} className="group bg-panel border border-line p-4 transition-colors hover:border-line2">
                      <p className="font-cond text-[.68rem] uppercase tracking-[.16em] text-dim">{r.publishedAt ? dateFmt(r.publishedAt) : ''}</p>
                      <h3 className="mt-1.5 font-head text-[.95rem] font-bold leading-snug text-txt transition-colors group-hover:text-acc">{r.title}</h3>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12 border border-line bg-panel p-7 text-center">
              <p className="font-disp text-[1.4rem] uppercase text-txt">Gear worthy of the <span className="text-acc">Knowledge</span></p>
              <Link to="/shop" className="mt-4 inline-block bg-acc px-7 py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2">Shop the Drop</Link>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
