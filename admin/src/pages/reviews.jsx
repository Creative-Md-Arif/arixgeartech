/* ArixGear ADMIN page — Reviews moderation (Task 29).
   Stats strip (pending / approval rate / response time) · search + rating filter +
   pagination · checkbox bulk moderation · inline brand reply · content edit modal ·
   customer photo thumbnails · verified-buyer chips. Approving still recalculates
   the product's public rating live (server-side). */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { dt } from '../lib/admin.js';
import { list, stats, approve, unapprove, toggleHomepage, edit, reply, bulk, remove } from '../services/reviews.js';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';

const STARS = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

/* ---------- content edit modal (typos / profanity, approval state untouched) ---------- */
function EditReviewForm({ r, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const [name, setName] = useState(r.name);
  const [rating, setRating] = useState(r.rating);
  const [comment, setComment] = useState(r.comment);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await edit(r._id, { name, rating: Number(rating), comment });
      toast('Review content saved — rating recalculated', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <h2 className="mb-4 text-[17px]">Edit review — {r.name}</h2>
      <div className="space-y-3">
        <div><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label>Rating</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}
                className={'h-8 w-8 rounded border text-[13px] font-bold ' + (Number(rating) >= n ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim2')}>{n}</button>
            ))}
          </div>
        </div>
        <div><label>Comment</label><textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      </div>
      <div className="mt-5 flex justify-end gap-2.5">
        <button className={GHOST_BTN} onClick={closeModal}>Cancel</button>
        <button className={ACC_BTN} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}

function ReviewsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { openModal } = useModal();
  const [filter, setFilter] = useState('pending');
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [rating, setRating] = useState('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(null);
  const [pending, setPending] = useState(0);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, all: 0 });
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState({});
  const [health, setHealth] = useState(null);
  const [replyBox, setReplyBox] = useState(null); /* { id, text } */

  useEffect(() => { stats().then(setHealth).catch(() => {}); }, []);

  const load = useCallback(async (f, pageN, qv, rv) => {
    try {
      const d = await list({ filter: f, page: pageN, limit: 30, q: qv, rating: rv });
      setItems(d.items || []);
      setPending(d.pending || 0);
      setCounts(d.counts || { pending: 0, approved: 0, all: 0 });
      setPages(d.pages || 1);
      setSelected({});
    } catch (e) { toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { load(filter, page, q, rating); }, [filter, page, q, rating, load]);

  /* search box is Enter-committed to keep the list calm */
  useEffect(() => { const t = setTimeout(() => setQ(qLive), 450); return () => clearTimeout(t); }, [qLive]);
  useEffect(() => { setPage(1); }, [filter, q, rating]);

  const doApprove = async (r) => {
    try { await approve(r._id); toast('Approved ✓ — product rating recalculated', 'ok'); load(filter, page, q, rating); } catch (e) { toast(e.message, 'err'); }
  };
  const doHide = async (r) => {
    try { await unapprove(r._id); toast('Back to pending — rating recalculated', 'ok'); load(filter, page, q, rating); } catch (e) { toast(e.message, 'err'); }
  };
  const doHomepage = async (r) => {
    try {
      await toggleHomepage(r._id, !r.homepageFeatured);
      toast(r.homepageFeatured === false ? 'Review included on homepage' : 'Review hidden from homepage', 'ok');
      load(filter, page, q, rating);
    } catch (e) { toast(e.message, 'err'); }
  };
  const doDelete = async (r) => {
    if (!(await confirm({ title: 'Delete review', body: 'Delete this review permanently? Rating averages recalculate immediately.', danger: true, ok: 'Delete' }))) return;
    try { await remove(r._id); toast('Review deleted — rating recalculated', 'ok'); load(filter, page, q, rating); } catch (e) { toast(e.message, 'err'); }
  };
  const doReply = async (r, text) => {
    try { await reply(r._id, text); toast(text ? 'Reply saved — live on the PDP' : 'Reply cleared', 'ok'); setReplyBox(null); load(filter, page, q, rating); } catch (e) { toast(e.message, 'err'); }
  };

  const selIds = Object.keys(selected).filter((k) => selected[k]);
  const doBulk = async (action) => {
    if (!selIds.length) return;
    if (action === 'delete' && !(await confirm({ title: 'Bulk delete', body: 'Delete ' + selIds.length + ' review(s) permanently?', danger: true, ok: 'Delete' }))) return;
    try {
      const d = await bulk(selIds, action);
      toast(d.deleted ? ('Deleted ' + d.deleted + ' — ' + d.productsRecalculated + ' product(s) recalculated') : (action + ' ✓ — ' + d.modified + ' review(s), ' + d.productsRecalculated + ' product(s) recalculated'), 'ok');
      load(filter, page, q, rating);
    } catch (e) { toast(e.message, 'err'); }
  };
  const toggleAll = () => {
    const allOn = (items || []).length && (items || []).every((r) => selected[r._id]);
    const next = {};
    (items || []).forEach((r) => { next[r._id] = !allOn; });
    setSelected(next);
  };

  const TABS = [
    ['pending', 'Pending' + (counts.pending ? ' (' + counts.pending + ')' : '')],
    ['approved', 'Approved' + (counts.approved ? ' (' + counts.approved + ')' : '')],
    ['all', 'All' + (counts.all ? ' (' + counts.all + ')' : '')],
  ];

  return (
    <>
      {health ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" id="revStats">
          <div className={CARD}><p className="text-[11px] uppercase tracking-[.08em] text-dim2">Pending</p><p className="mt-1 text-2xl font-extrabold text-yellow">{health.totals.pending}</p></div>
          <div className={CARD}><p className="text-[11px] uppercase tracking-[.08em] text-dim2">Approval rate</p><p className="mt-1 text-2xl font-extrabold">{health.totals.approvalRate}%</p></div>
          <div className={CARD}><p className="text-[11px] uppercase tracking-[.08em] text-dim2">Avg response (30d)</p><p className="mt-1 text-2xl font-extrabold">{health.avgApprovalHours == null ? '—' : health.avgApprovalHours + 'h'}</p></div>
          <div className={CARD}>
            <p className="text-[11px] uppercase tracking-[.08em] text-dim2">Low-rating watchlist</p>
            {(health.watchlist || []).length ? (
              <ul className="mt-1 space-y-0.5 text-[12px]">
                {health.watchlist.slice(0, 2).map((w) => (
                  <li key={w._id} className="truncate text-red">{w.name || w.slug} — {w.avg}★ ({w.n})</li>
                ))}
              </ul>
            ) : <p className="mt-1 text-2xl font-extrabold text-green">Clear ✓</p>}
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2" id="revTabs">
        {TABS.map(([k, t]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={'rounded-lg border px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] ' + (filter === k ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim hover:text-txt')}
            data-tab={k}>{t}</button>
        ))}
        <div className="mx-1 h-6 w-px bg-line2" />
        <input id="revSearch" value={qLive} onChange={(e) => setQLive(e.target.value)} placeholder="Search name / comment…"
          className="w-48 rounded-lg border border-line2 bg-transparent px-3 py-1.5 text-[12.5px] outline-none placeholder:text-dim2 focus:border-acc" />
        <select id="revRating" value={rating} onChange={(e) => setRating(e.target.value)}
          className="rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
        </select>
        <div className="flex-1" />
        {selIds.length ? (
          <div className="flex items-center gap-2" id="revBulkBar">
            <span className="text-[12px] font-bold text-acc">{selIds.length} selected</span>
            <button className={GHOST_BTN} onClick={() => doBulk('approve')}>Approve</button>
            <button className={GHOST_BTN} onClick={() => doBulk('unapprove')}>Un-approve</button>
            <button className={RED_BTN} onClick={() => doBulk('delete')}>Delete</button>
          </div>
        ) : null}
      </div>

      <div className={CARD}>
        <div className="space-y-3" id="revModerationList">
          {(items || []).map((r) => (
            <div key={r._id} className="rounded-xl border border-line2 p-4" data-review={r._id}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <input type="checkbox" checked={!!selected[r._id]} onChange={() => setSelected((s) => ({ ...s, [r._id]: !s[r._id] }))}
                  className="h-4 w-4 accent-[color:var(--acc,#f60)]" aria-label="select review" />
                <span className="text-[13px] font-bold text-acc">{STARS(r.rating)}</span>
                <b className="text-[13px]">{r.name}</b>
                {r.verified ? <span className={CHIP + ' border-green/40 text-green'}>verified buyer</span> : null}
                {r.user ? <span className={CHIP + ' border-line2 text-dim2'}>account</span> : null}
                {r.approved ? <span className={CHIP + ' border-green/40 text-green'}>approved</span> : <span className={CHIP + ' border-yellow/40 text-yellow'}>pending</span>}
                {r.homepageFeatured ? <span className={CHIP + ' border-acc/40 text-acc'}>homepage</span> : null}
                {r.helpfulCount ? <span className="text-[11px] text-dim2">▲ {r.helpfulCount}</span> : null}
                <span className="ml-auto text-[11.5px] text-dim2">{dt(r.createdAt)}</span>
              </div>
              {r.product ? <p className="mt-1 text-[11.5px] text-dim2">Product: <b className="text-dim">{r.product.name}</b> ({r.product.slug})</p> : null}
              <p className="mt-2 text-[13px] leading-relaxed text-dim">{r.comment}</p>
              {(r.images || []).length ? (
                <div className="mt-2 flex gap-2" data-rev-photos>
                  {r.images.map((im, ix) => <img key={ix} src={im.url} alt="" className="h-14 w-14 rounded border border-line2 object-cover" />)}
                </div>
              ) : null}
              {r.reply && r.reply.text ? (
                <div className="mt-2 rounded border-l-2 border-acc bg-white/[.03] px-3 py-2 text-[12.5px]" data-admin-reply>
                  <b className="text-acc">Reply:</b> <span className="text-dim">{r.reply.text}</span>
                  <button className="ml-2 text-[11px] text-dim2 underline hover:text-red" onClick={() => doReply(r, '')}>clear</button>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {!r.approved ? <button className={ACC_BTN} onClick={() => doApprove(r)}>Approve</button> : <button className={GHOST_BTN} onClick={() => doHide(r)}>Un-approve</button>}
                {r.approved ? <button className={GHOST_BTN} onClick={() => doHomepage(r)}>{r.homepageFeatured ? 'Hide homepage' : 'Show homepage'}</button> : null}
                <button className={GHOST_BTN} onClick={() => setReplyBox(replyBox && replyBox.id === r._id ? null : { id: r._id, text: r.reply?.text || '' })}>Reply</button>
                <button className={GHOST_BTN} onClick={() => openModal(<EditReviewForm r={r} onDone={() => load(filter, page, q, rating)} />)}>Edit</button>
                <button className={RED_BTN} onClick={() => doDelete(r)}>Delete</button>
              </div>
              {replyBox && replyBox.id === r._id ? (
                <div className="mt-2.5" id="revReplyBox">
                  <textarea rows={2} value={replyBox.text} onChange={(e) => setReplyBox({ id: r._id, text: e.target.value })}
                    placeholder="Public brand reply — shown under this review on the product page"
                    className="w-full rounded-lg border border-line2 bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-dim2 focus:border-acc" />
                  <div className="mt-1.5 flex gap-2">
                    <button className={ACC_BTN} onClick={() => doReply(r, replyBox.text)}>Save reply</button>
                    <button className={GHOST_BTN} onClick={() => setReplyBox(null)}>Cancel</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {items && !items.length ? <div className="py-8 text-center text-[13px] text-dim2">Nothing here — {filter === 'pending' ? 'no reviews waiting' : 'no reviews yet'}.</div> : null}
          {!items ? <TableSkeleton rows={6} cols={5} /> : null}
        </div>
        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-3" id="revPager">
            <button className={GHOST_BTN} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
            <span className="text-[12px] text-dim2">Page {page} / {pages}</span>
            <button className={GHOST_BTN} disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next →</button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="reviews" title="Product Reviews">
        <ReviewsPage />
      </AdminShell>
    </OverlayProvider>
  );
}
