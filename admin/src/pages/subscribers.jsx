/* ArixGear ADMIN page — Newsletter Subscribers (Phase 5, 5.3 · C3 net-new)
   /admin/subscribers · canonical list: search, status filter, opt-out /
   resubscribe, CSV export (customers module). */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { CARD, ACC_BTN, GHOST_BTN, CHIP, Empty, useConfirm } from '../components/ui.jsx';
import { list, update, remove, csvPath } from '../services/subscribers.js';
import { download } from '../services/http.js';

const dt = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function SubscribersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [f, setF] = useState({ status: '', q: '' });

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (f.status) params.set('status', f.status);
      if (f.q.trim()) params.set('q', f.q.trim());
      const d = await list(params.toString());
      setItems(d.items || []);
      setTotal(d.total || 0);
      setActiveCount(d.activeCount || 0);
    } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [f, toast]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const del = async (s) => {
    if (!(await confirm({ title: 'Erase subscriber', body: `Erase ${s.email} from the list? GDPR-friendly — they can re-subscribe any time.`, danger: true, ok: 'Erase' }))) return;
    try { await remove(s._id); toast('Subscriber erased', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="subscribers" title="Newsletter Subscribers">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="w-[160px]" value={f.status} onChange={(e) => setF((s) => ({ ...s, status: e.target.value }))}>
          <option value="">all statuses</option>
          <option value="active">active</option>
          <option value="unsubscribed">unsubscribed</option>
        </select>
        <input className="max-w-[300px] flex-1" placeholder="Search email…" value={f.q}
          onChange={(e) => setF((s) => ({ ...s, q: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <button className={GHOST_BTN} onClick={load}>Search</button>
        <span className="text-[12px] text-dim2">{total} total · <b className="text-green">{activeCount} active</b></span>
        <div className="flex-1" />
        <button className={ACC_BTN} data-testid="subscribersCsv" onClick={() => download(csvPath(), 'arixgear-subscribers.csv')}>⬇ Export CSV</button>
      </div>

      {!items ? <TableSkeleton rows={6} /> : null}
      {items && !items.length ? <Empty icon="✉️" title="No subscribers" sub="Footer newsletter signups land here with their ARIX10 welcome coupon." /> : null}

      {items && items.length ? (
        <div className="space-y-2" data-testid="subscriberList">
          {items.map((s) => (
            <div key={s._id} className={CARD + ' flex flex-wrap items-center gap-3 py-3.5'} data-testid="subscriberRow">
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[13.5px] text-txt">{s.email}</b>
                  <span className={CHIP + ' ' + (s.status === 'active' ? 'border-green/40 text-green' : 'border-line2 text-dim2')}>{s.status}</span>
                  <span className={CHIP + ' border-line2 text-dim2'}>{s.source || 'footer'}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-dim2">
                  joined {dt(s.createdAt)}{s.unsubscribedAt ? <span> · opted out {dt(s.unsubscribedAt)}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className={GHOST_BTN} onClick={() => update(s._id, { status: s.status === 'active' ? 'unsubscribed' : 'active' })
                  .then(load).then(() => toast(s.status === 'active' ? 'Opted out' : 'Re-subscribed', 'ok')).catch((e) => toast(e.message, 'err'))}>
                  {s.status === 'active' ? 'Opt out' : 'Re-subscribe'}
                </button>
                <button className={GHOST_BTN} onClick={() => del(s)}>Erase</button>
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
      <SubscribersPage />
    </OverlayProvider>
  );
}
