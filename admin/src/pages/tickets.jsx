/* ArixGear ADMIN page — Complaints / Service tickets (Phase 5, 5.3 · C3 net-new)
   /admin/tickets · ARG-SRV-… queue: status/priority/category filters, detail
   drawer with the full timeline, status transitions + notes, staff assignment. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useDrawer } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { CARD, ACC_BTN, GHOST_BTN, RED_BTN, CHIP, LBL, Empty, usePrompt, useConfirm } from '../components/ui.jsx';
import { list, detail, update, remove } from '../services/tickets.js';

const STATUS_CHIP = {
  open: 'border-red/40 text-red',
  'in-review': 'border-blue/40 text-blue',
  approved: 'border-acc/40 text-acc',
  'in-service': 'border-purple/40 text-purple',
  resolved: 'border-green/40 text-green',
  closed: 'border-line2 text-dim2',
  rejected: 'border-red/50 text-red',
  cancelled: 'border-line2 text-dim2',
};
const PRIORITY_CHIP = { low: 'border-line2 text-dim2', medium: 'border-yellow/40 text-yellow', high: 'border-red/40 text-red' };
const FLOW = ['open', 'in-review', 'approved', 'in-service', 'resolved', 'closed'];
const dt = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function TicketDetail({ id, onChanged }) {
  const toast = useToast();
  const { closeDrawer } = useDrawer();
  const ask = usePrompt();
  const [t, setT] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try { const d = await detail(id); setT(d.ticket); } catch (e) { toast(e.message, 'err'); }
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  const nextStatus = () => FLOW[Math.min(FLOW.indexOf(t.status) + 1, FLOW.length - 1)];

  const doStatus = async () => {
    const ns = nextStatus();
    const n = await ask({ title: 'Status → ' + ns, label: 'Note for the timeline (visible to the customer):', multiline: true, ok: 'Apply' });
    if (n === null) return;
    try { const d = await update(id, { status: ns, note: n }); setT(d.ticket); toast('Ticket → ' + ns, 'ok'); onChanged(); } catch (e) { toast(e.message, 'err'); }
  };
  const doNote = async () => {
    if (!note.trim()) return;
    try { const d = await update(id, { note: note.trim() }); setT(d.ticket); setNote(''); toast('Note added to the timeline', 'ok'); onChanged(); } catch (e) { toast(e.message, 'err'); }
  };
  const doPriority = async (p) => {
    try { const d = await update(id, { priority: p }); setT(d.ticket); toast('Priority → ' + p, 'ok'); onChanged(); } catch (e) { toast(e.message, 'err'); }
  };

  if (!t) return <div className="text-[13px] text-dim2">Loading ticket…</div>;

  return (
    <div data-testid="ticketDetail">
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-mono text-[14px] text-acc">{t.ticketNumber}</b>
        <span className={CHIP + ' ' + (STATUS_CHIP[t.status] || '')}>{t.status}</span>
        <span className={CHIP + ' ' + (PRIORITY_CHIP[t.priority] || '')}>{t.priority}</span>
        <span className={CHIP + ' border-line2 text-dim2'}>{t.category}</span>
        <div className="flex-1" />
        <button className={GHOST_BTN} onClick={closeDrawer}>✕ Close</button>
      </div>
      <h3 className="mt-2 text-[15px] text-txt">{t.subject}</h3>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-dim">{t.description}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-line2 bg-panel2 p-3 text-[12px] text-dim md:grid-cols-2">
        <div><b className="text-txt">{t.customer?.name}</b> · {t.customer?.phone}{t.customer?.email ? <span> · {t.customer.email}</span> : null}</div>
        <div>Order: {t.orderNumber || '—'}{t.productName ? <span> · {t.productName}</span> : null}</div>
        {t.warrantyRegNumber ? <div>Warranty: <b className="text-acc">{t.warrantyRegNumber}</b></div> : null}
        <div>opened {dt(t.createdAt)}{t.resolvedAt ? <span> · resolved {dt(t.resolvedAt)}</span> : null}</div>
      </div>

      <div className="mt-4">
        <span className={LBL}>Timeline</span>
        <div className="space-y-1.5">
          {t.timeline.map((e, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px]" data-testid="ticketTimelineRow">
              <span className={CHIP + ' shrink-0 ' + (STATUS_CHIP[e.status] || '')}>{e.status}</span>
              <span className="min-w-0 flex-1 text-dim">{e.note || <span className="text-dim2">—</span>}</span>
              <span className="shrink-0 text-[11px] text-dim2">{e.by} · {dt(e.at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className={ACC_BTN} data-testid="ticketAdvance" onClick={doStatus}>→ Advance to {nextStatus()}</button>
        {['low', 'medium', 'high'].map((p) => (
          <button key={p} className={GHOST_BTN + ' ' + (t.priority === p ? 'border-acc text-acc' : '')} onClick={() => doPriority(p)}>{p}</button>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <label className="block flex-1"><span className={LBL}>Add a timeline note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replacement fan ordered — ETA 2 days" /></label>
        <button className={GHOST_BTN} onClick={doNote}>+ Note</button>
      </div>
    </div>
  );
}

function TicketsPage() {
  const toast = useToast();
  const { openDrawer } = useDrawer();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [f, setF] = useState({ status: 'open', category: '', q: '' });

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (f.status) params.set('status', f.status);
      if (f.category) params.set('category', f.category);
      if (f.q.trim()) params.set('q', f.q.trim());
      const d = await list(params.toString());
      setItems(d.items || []);
      setOpenCount(d.openCount || 0);
    } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [f, toast]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const del = async (t) => {
    if (!(await confirm({ title: 'Delete ticket', body: `Delete ${t.ticketNumber} permanently? Prefer "closed" — the customer loses tracking otherwise.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(t._id); toast('Ticket deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="tickets" title="Complaints & Service Tickets">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="w-[150px]" value={f.status} onChange={(e) => setF((s) => ({ ...s, status: e.target.value }))}>
          <option value="">all statuses</option>
          {FLOW.concat(['rejected', 'cancelled']).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="w-[160px]" value={f.category} onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))}>
          <option value="">all categories</option>
          {['complaint', 'service', 'warranty-claim', 'return', 'general'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="max-w-[280px] flex-1" placeholder="Search ticket · name · phone…" value={f.q}
          onChange={(e) => setF((s) => ({ ...s, q: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <button className={GHOST_BTN} onClick={load}>Search</button>
        <span className={CHIP + (openCount ? ' border-red/40 text-red' : ' border-line2 text-dim2')} data-testid="ticketsOpenCount">{openCount} open</span>
      </div>

      {!items ? <TableSkeleton rows={5} /> : null}
      {items && !items.length ? <Empty icon="🎫" title="No tickets here" sub="Complaints land here from the storefront quick-services block — customers track them by number + phone." /> : null}

      {items && items.length ? (
        <div className="space-y-2" data-testid="ticketList">
          {items.map((t) => (
            <div key={t._id} className={CARD + ' flex flex-wrap items-center gap-3 py-3.5'} data-testid="ticketRow">
              <div className="min-w-[240px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="font-mono text-[13px] text-acc">{t.ticketNumber}</b>
                  <span className={CHIP + ' ' + (STATUS_CHIP[t.status] || '')}>{t.status}</span>
                  <span className={CHIP + ' ' + (PRIORITY_CHIP[t.priority] || '')}>{t.priority}</span>
                  <span className={CHIP + ' border-line2 text-dim2'}>{t.category}</span>
                </div>
                <div className="mt-0.5 text-[13px] text-txt">{t.subject}</div>
                <div className="text-[11.5px] text-dim2">{t.customer?.name} · {t.customer?.phone} · {dt(t.createdAt)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className={ACC_BTN} onClick={() => openDrawer(<TicketDetail id={t._id} onChanged={load} />)}>Open</button>
                <button className={RED_BTN} onClick={() => del(t)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </AdminShell>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <TicketsPage />
    </OverlayProvider>
  );
}
