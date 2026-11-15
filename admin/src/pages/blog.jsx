/* ArixGear ADMIN page — Journal / Blog (Task 47 Content Hub).
   Draft + publish plain-text posts: title, auto-slug (editable), tags,
   excerpt, body paragraphs, cover URL, SEO fields. Publish stamps
   publishedAt once; every mutation lands in the Audit Log. */
import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { list, create, update, remove } from '../services/blog.js';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2';
const FULL = 'md:col-span-2';
const LBL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.1em] text-dim';
const INP = 'w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-[13px] text-txt outline-none transition focus:border-acc';

const dateFmt = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/* ---------- create / edit modal ---------- */
function PostForm({ p, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { closeModal } = useModal();
  const isNew = !p || !p._id;
  const [f, setF] = useState({
    title: p?.title || '',
    titleBn: p?.titleBn || '', // Task 58 — Bengali twins
    slug: p?.slug || '',
    tags: (p?.tags || []).join(', '),
    author: p?.author || 'ArixGear Editorial',
    excerpt: p?.excerpt || '',
    excerptBn: p?.excerptBn || '', // Task 58
    body: p?.body || '',
    bodyBn: p?.bodyBn || '', // Task 58
    cover: p?.cover || '',
    seoTitle: p?.seoTitle || '',
    seoDescription: p?.seoDescription || '',
    published: p?.published || false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!f.title.trim()) return toast('Title required', 'err');
    if (!f.body.trim()) return toast('Body required', 'err');
    setBusy(true);
    try {
      const body = {
        ...f,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      if (isNew) await create(body);
      else await update(p._id, body);
      toast(isNew ? 'Post created' : 'Post updated', 'ok');
      closeModal();
      onDone();
    } catch (e) {
      toast(e.message || 'Save failed', 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="max-h-[86vh] overflow-y-auto p-6">
      <h3 className="font-head text-[16px] font-extrabold uppercase tracking-[.06em] text-txt">{isNew ? 'New post' : 'Edit post'}</h3>
      <div className={FRM + ' mt-5'}>
        <div className={FULL}>
          <label className={LBL}>Title *</label>
          <input className={INP} id="postTitle" value={f.title} onChange={set('title')} placeholder="Best Budget Laptops of 2026" />
        </div>
        <div className={FULL}>
          <label className={LBL}>টাইটেল (বাংলা)</label>
          <input className={INP} id="postTitleBn" value={f.titleBn || ''} onChange={set('titleBn')} placeholder="২০২৬ সালের সেরা বাজেট ল্যাপটপ" />
        </div>
        <div>
          <label className={LBL}>Slug (auto from title, editable)</label>
          <input className={INP} id="postSlug" value={f.slug} onChange={set('slug')} placeholder="best-budget-laptops-2026" />
        </div>
        <div>
          <label className={LBL}>Tags (comma separated)</label>
          <input className={INP} id="postTags" value={f.tags} onChange={set('tags')} placeholder="guides, laptops" />
        </div>
        <div className={FULL}>
          <label className={LBL}>Excerpt (card + SEO fallback)</label>
          <textarea className={INP} id="postExcerpt" rows={2} value={f.excerpt} onChange={set('excerpt')} />
        </div>
        <div className={FULL}>
          <label className={LBL}>সারসংক্ষেপ (বাংলা)</label>
          <textarea className={INP} id="postExcerptBn" rows={2} value={f.excerptBn || ''} onChange={set('excerptBn')} />
        </div>
        <div className={FULL}>
          <label className={LBL}>Body * — paragraphs separated by blank lines (plain text)</label>
          <textarea className={INP} id="postBody" rows={12} value={f.body} onChange={set('body')} />
        </div>
        <div className={FULL}>
          <label className={LBL}>বডি (বাংলা) — ফাঁকা লাইনে প্যারা ভাগ</label>
          <textarea className={INP} id="postBodyBn" rows={12} value={f.bodyBn || ''} onChange={set('bodyBn')} />
        </div>
        <div>
          <label className={LBL}>Cover image URL</label>
          <input className={INP} id="postCover" value={f.cover} onChange={set('cover')} placeholder="https://… / /uploads/…" />
        </div>
        <div>
          <label className={LBL}>Author</label>
          <input className={INP} id="postAuthor" value={f.author} onChange={set('author')} />
        </div>
        <div>
          <label className={LBL}>SEO title</label>
          <input className={INP} id="postSeoTitle" value={f.seoTitle} onChange={set('seoTitle')} />
        </div>
        <div>
          <label className={LBL}>SEO description</label>
          <input className={INP} id="postSeoDesc" value={f.seoDescription} onChange={set('seoDescription')} />
        </div>
        <label className={FULL + ' flex items-center gap-3 text-[13px] text-txt'}>
          <input id="postPublished" type="checkbox" checked={f.published} onChange={set('published')} className="h-4 w-4 accent-acc" />
          Published — visible in the storefront Journal
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className={GHOST_BTN} onClick={closeModal}>Cancel</button>
        <button className={ACC_BTN} id="postSave" disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create post' : 'Save changes'}</button>
      </div>
    </div>
  );
}

function Page() {
  const confirm = useConfirm(); // Step 2 audit fix — confirm() was declared in a sibling component; every delete click crashed
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading');
  const [q, setQ] = useState('');

  const load = async () => {
    setState('loading');
    try {
      const d = await list();
      setItems(d.items || []);
      setState('ok');
    } catch (e) { toast(e.message || 'Load failed', 'err'); setState('err'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openNew = () => openModal(<PostForm p={null} onDone={load} />);
  const openEdit = (p) => openModal(<PostForm p={p} onDone={load} />);
  const del = async (p) => {
    if (!(await confirm({ title: 'Delete post', body: `Delete "${p.title}"? This cannot be undone.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(p._id); toast('Post deleted', 'ok'); load(); }
    catch (e) { toast(e.message || 'Delete failed', 'err'); }
  };
  const togglePub = async (p) => {
    try { await update(p._id, { published: !p.published }); toast(p.published ? 'Unpublished' : 'Published', 'ok'); load(); }
    catch (e) { toast(e.message || 'Failed', 'err'); }
  };

  const filtered = items.filter((p) => !q.trim() || (p.title + ' ' + p.slug + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q.toLowerCase()));

  return (
    <AdminShell active="blog" title="Journal — Blog">
      <div className="w-full max-w-none py-6">
        <div className={CARD}>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-head text-[15px] font-extrabold uppercase tracking-[.06em] text-txt">All posts</h2>
              <p className="mt-0.5 text-[12px] text-dim">Drafts stay invisible to customers · publish stamps the date</p>
            </div>
            <input className={INP + ' ml-auto max-w-[260px]'} placeholder="Search title / slug / tag…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className={ACC_BTN} id="blogNew" onClick={openNew}>+ New post</button>
          </div>

          {state === 'loading' && <p className="py-10 text-center text-[13px] text-dim">Loading posts…</p>}
          {state === 'ok' && filtered.length === 0 && (
            <div className="py-12 text-center" data-testid="blogAdminEmpty">
              <p className="text-[13px] text-dim">No posts{q ? ' match that search' : ' yet'} — write the first one.</p>
            </div>
          )}
          {state === 'ok' && filtered.length > 0 && (
            <div className="mt-5 w-full overflow-x-auto rounded-xl border border-line bg-panel" data-testid="blogTableWrap">
              <table className="w-full min-w-[1050px] border-collapse text-left text-[13px]" data-testid="blogTable">
                <thead className="bg-panel2">
                  <tr className="border-b border-line text-[10.5px] uppercase tracking-[.1em] text-dim2">
                    <th className="whitespace-nowrap px-4 py-3 font-bold">Title</th>
                    <th className="whitespace-nowrap px-4 py-3 font-bold">Slug</th>
                    <th className="whitespace-nowrap px-4 py-3 font-bold">Tags</th>
                    <th className="whitespace-nowrap px-4 py-3 font-bold">Status</th>
                    <th className="whitespace-nowrap px-4 py-3 font-bold">Views</th>
                    <th className="whitespace-nowrap px-4 py-3 font-bold">Date</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody data-testid="blogAdminRows">
                  {filtered.map((p) => (
                    <tr key={p._id} className="border-b border-line/60 align-middle transition-colors last:border-b-0 hover:bg-panel2/60">
                      <td className="max-w-[320px] px-4 py-4 font-semibold text-txt">{p.title}</td>
                      <td className="px-4 py-4 font-mono text-[11.5px] text-dim">/{p.slug}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(p.tags || []).map((t) => <span key={t} className={CHIP + ' border-line2 text-dim'}>{t}</span>)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <button onClick={() => togglePub(p)} title="Toggle publish">
                          <span className={CHIP + ' ' + (p.published ? 'border-green/40 bg-green/10 text-green' : 'border-line2 bg-panel2 text-dim')}>{p.published ? 'Published' : 'Draft'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-dim">{p.views || 0}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-dim">{p.published ? dateFmt(p.publishedAt) : dateFmt(p.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button className={GHOST_BTN} onClick={() => openEdit(p)}>Edit</button>
                          <button className={RED_BTN} onClick={() => del(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

export default function BlogAdminPage() {
  return <OverlayProvider><Page /></OverlayProvider>;
}
