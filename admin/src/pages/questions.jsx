/* ArixGear ADMIN page — Product Questions.
   Visitor questions arrive UNANSWERED; admin writes the answer (plain text),
   saves, and it appears on the PDP Q&A instantly. Tabs: unanswered / answered / all.
   Task 30: stats strip (response time / trend), search, bulk delete, unanswer. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { dt } from '../lib/admin.js';
import { list, answer, unanswer, bulk, remove, stats } from '../services/questions.js';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const INPUT = 'w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc';

function StatBox({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-line bg-panel2 px-3 py-2.5" data-stat={label}>
      <div className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{label}</div>
      <div className="mt-0.5 text-[16px] font-extrabold text-txt">{value}</div>
      {sub ? <div className="text-[10.5px] text-dim2">{sub}</div> : null}
    </div>
  );
}

function QuestionsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState('unanswered');
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState({}); /* { [id]: answer text } */
  const [busyId, setBusyId] = useState(null);
  const [checked, setChecked] = useState({}); /* { id: bool } bulk selection */

  const load = useCallback(async (f, q = '') => {
    try {
      const d = await list({ filter: f, q });
      setItems(d.items || []);
      setCounts(d.counts || null);
    } catch (e) { toast(e.message, 'err'); }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try { setStatsData(await stats()); } catch (_e) { /* strip is cosmetic */ }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { load(filter, search); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = (e) => { e && e.preventDefault(); load(filter, search); };

  const save = async (qa) => {
    const text = (drafts[qa._id] ?? qa.answer ?? '').trim();
    if (!text) return toast('Write the answer first', 'err');
    setBusyId(qa._id);
    try {
      await answer(qa._id, text);
      toast('Answer published ✓ — live on the product page', 'ok');
      load(filter, search); loadStats();
    } catch (e) { toast(e.message, 'err'); } finally { setBusyId(null); }
  };

  const pullBack = async (qa) => {
    if (!(await confirm({ title: 'Withdraw answer', body: 'Pull this answer back to the unanswered queue? It disappears from the product page.', ok: 'Withdraw' }))) return;
    try { await unanswer(qa._id); toast('Answer withdrawn — question is unanswered again', 'ok'); load(filter, search); loadStats(); } catch (e) { toast(e.message, 'err'); }
  };

  const doDelete = async (qa) => {
    if (!(await confirm({ title: 'Delete question', body: 'Delete this question permanently?', danger: true, ok: 'Delete' }))) return;
    try { await remove(qa._id); toast('Question deleted', 'ok'); load(filter, search); loadStats(); } catch (e) { toast(e.message, 'err'); }
  };

  const doBulk = async () => {
    const ids = Object.keys(checked).filter((k) => checked[k]);
    if (!ids.length) return toast('Select questions first', 'err');
    if (!(await confirm({ title: 'Bulk delete', body: `Delete ${ids.length} selected question(s) permanently?`, danger: true, ok: 'Delete' }))) return;
    try {
      const r = await bulk(ids, 'delete');
      toast(`${r.deleted} deleted`, 'ok');
      setChecked({});
      load(filter, search); loadStats();
    } catch (e) { toast(e.message, 'err'); }
  };

  const selCount = Object.values(checked).filter(Boolean).length;
  const TABS = [
    ['unanswered', 'Unanswered' + (counts ? ' (' + counts.unanswered + ')' : '')],
    ['answered', 'Answered' + (counts ? ' (' + counts.answered + ')' : '')],
    ['all', 'All' + (counts ? ' (' + counts.all + ')' : '')],
  ];

  return (
    <>
      {/* Task 30 — stats strip */}
      {statsData ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" id="qaStats">
          <StatBox label="Total questions" value={statsData.counts.all} sub={`${statsData.asked7} in last 7 days`} />
          <StatBox label="Unanswered" value={statsData.counts.unanswered} sub={`${statsData.counts.all ? Math.round((statsData.counts.unanswered / statsData.counts.all) * 100) : 0}% of queue`} />
          <StatBox label="Avg response" value={statsData.avgResponseHours !== null && statsData.avgResponseHours !== undefined ? statsData.avgResponseHours + 'h' : '—'} sub={statsData.avgResponseHours30 !== null && statsData.avgResponseHours30 !== undefined ? statsData.avgResponseHours30 + 'h (30d)' : 'no answers yet'} />
          <StatBox label="Top product" value={statsData.topProducts && statsData.topProducts[0] ? statsData.topProducts[0].count : '—'} sub={statsData.topProducts && statsData.topProducts[0] ? (statsData.topProducts[0].name || '').slice(0, 22) : 'no questions yet'} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2" id="qaTabs">
        {TABS.map(([k, t]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={'rounded-lg border px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] ' + (filter === k ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim hover:text-txt')}
            data-tab={k}>{t}</button>
        ))}
        <div className="flex-1" />
        <form onSubmit={doSearch} className="flex gap-2">
          <input className={INPUT + ' w-48'} placeholder="Search name / text / answer" value={search} onChange={(e) => setSearch(e.target.value)} id="qaSearch" />
          <button className={GHOST_BTN} type="submit">Search</button>
        </form>
        {selCount ? <button className={RED_BTN} onClick={doBulk} id="qaBulkDelete">Delete selected ({selCount})</button> : null}
      </div>

      <div className={CARD}>
        <div className="space-y-3" id="qaModerationList">
          {(items || []).map((qa) => (
            <div key={qa._id} className="rounded-xl border border-line2 p-4" data-question={qa._id}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <input type="checkbox" className="w-auto" checked={!!checked[qa._id]}
                  onChange={(e) => setChecked((c) => ({ ...c, [qa._id]: e.target.checked }))} />
                <b className="text-[13px]">{qa.name}</b>
                {qa.answered ? <span className={CHIP + ' border-green/40 text-green'}>answered</span> : <span className={CHIP + ' border-yellow/40 text-yellow'}>unanswered</span>}
                {qa.product ? <span className="text-[11.5px] text-dim2">Product: <b className="text-dim">{qa.product.name}</b> ({qa.product.slug})</span> : null}
                <span className="ml-auto text-[11.5px] text-dim2">{dt(qa.createdAt)}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-txt"><span className="mr-1.5 font-bold text-acc">Q:</span>{qa.question}</p>
              {qa.answered ? <p className="mt-1.5 text-[13px] leading-relaxed text-dim"><span className="mr-1.5 font-bold text-green">A:</span>{qa.answer}</p> : null}
              <div className="mt-3">
                <textarea
                  rows={2}
                  placeholder="Write the answer — plain text, no formatting needed"
                  value={drafts[qa._id] ?? qa.answer ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [qa._id]: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={ACC_BTN} disabled={busyId === qa._id} onClick={() => save(qa)}>{busyId === qa._id ? 'Saving…' : qa.answered ? 'Update answer' : 'Publish answer'}</button>
                  {qa.answered ? <button className={GHOST_BTN} onClick={() => pullBack(qa)}>↩ Unanswer</button> : null}
                  <button className={RED_BTN} onClick={() => doDelete(qa)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
          {items && !items.length ? <div className="py-8 text-center text-[13px] text-dim2">Nothing here — {filter === 'unanswered' ? 'all questions answered 🎉' : 'no questions match'}.</div> : null}
          {!items ? <div className="py-8 text-center text-[13px] text-dim2">Loading…</div> : null}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="questions" title="Product Questions">
        <QuestionsPage />
      </AdminShell>
    </OverlayProvider>
  );
}
