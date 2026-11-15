/* ArixGear ADMIN page — Returns / RMA management (Task 28, Layer 3).
   List of customer return requests → Approve / Reject / Mark Refunded.
   On "refunded" the amount is written to the ORDER's payment.refunds ledger. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money, dt } from '../lib/admin.js';
import { listReturns, resolveReturn } from '../services/orders.js';
import AdminShell from '../components/AdminShell.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { useConfirm, usePrompt } from '../components/ui.jsx';
import { tr, useLang } from '../lib/i18n.jsx';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const TAB = 'rounded-lg border px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] transition-colors';
const BTN_GREEN = 'rounded-lg bg-green px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-black transition-[filter] hover:brightness-110 disabled:opacity-50';
const BTN_RED = 'rounded-lg border border-red/40 bg-red/10 px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-red transition-colors hover:bg-red/25 disabled:opacity-50';
const BTN_ACC = 'rounded-lg bg-acc px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-white hover:bg-acc-hi disabled:opacity-50';

const ST_STYLE = {
  requested: 'border-yellow/40 text-yellow',
  approved: 'border-acc/50 text-acc',
  rejected: 'border-red/40 text-red',
  refunded: 'border-green/50 text-green',
};

const REASON_LABELS = {
  damaged: 'Damaged / defective',
  'wrong-item': 'Wrong item',
  'size-issue': 'Size issue',
  'not-as-described': 'Not as described',
  late: 'Too late',
  other: 'Other',
};

function ReturnsList() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const ask = usePrompt();
  const [tab, setTab] = useState('');
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await listReturns(tab ? { status: tab } : {});
      setItems(d.items || []);
      setErr('');
    } catch (e) { setErr(e.message || String(e)); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (r, status) => {
    let note = '';
    let refundAmount = 0;
    if (status === 'rejected') {
      note = await ask({ title: 'Reject return', label: 'Rejection note (sent to the customer):', required: true, multiline: true, ok: 'Reject' });
      if (!note) return;
    }
    if (status === 'refunded') {
      const suggested = r.items.reduce((a, i) => a + (i.price || 0) * (i.qty || 0), 0);
      const raw = await ask({ title: 'Refund ' + r.orderNumber, label: 'Refund amount (BDT):', initial: String(Math.round(suggested * 100) / 100), ok: 'Next' });
      if (raw === null) return;
      refundAmount = Math.max(0, Number(raw) || 0);
      note = await ask({ title: 'Refund note', label: 'Refund note (optional):', multiline: true, ok: 'Refund' }) || '';
    }
    setBusy(true);
    try {
      await resolveReturn(r._id, { status, note, refundAmount });
      toast(status === 'refunded'
        ? tr('Return {status} ✓ — {amt} logged on the order', { status, amt: money(refundAmount) })
        : tr('Return {status} ✓', { status }), 'ok');
      await load();
    } catch (e) { toast(e.message || String(e), 'err'); }
    setBusy(false);
  };

  const tabs = ['', 'requested', 'approved', 'rejected', 'refunded'];

  return (
    <>
      {/* status tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button key={t || 'all'} onClick={() => setTab(t)} disabled={busy}
            className={TAB + ' ' + (tab === t ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim hover:text-txt hover:border-line2')}>
            {t || tr('All')}
          </button>
        ))}
        <button onClick={load} className={TAB + ' ml-auto border-line2 text-dim hover:text-txt'}>{tr('⟳ Refresh')}</button>
      </div>

      {err ? (
        <div className={CARD}>
          <div className="text-[13px] text-red">{tr('Failed to load returns — {err}', { err })}</div>
          <button className={TAB + ' mt-3 border-line2 text-dim'} onClick={load}>{tr('Retry')}</button>
        </div>
      ) : !items ? (
        <div className={CARD}><TableSkeleton rows={5} cols={5} /></div>
      ) : !items.length ? (
        <div className={CARD + ' py-12 text-center text-[13.5px] text-dim2'}>
          <span className="mb-2 block font-disp text-[22px] tracking-[.04em] text-line2">{tr('NO RETURN REQUESTS')}</span>
          {tr('Delivered customers open RMA requests from the storefront tracking page — they land here.')}
        </div>
      ) : (
        <div className="grid gap-3.5">
          {items.map((r) => (
            <div key={r._id} className={CARD}>
              <div className="mb-3 flex flex-wrap items-center gap-2.5 border-b border-line pb-3">
                <h3 className="text-[16px]">{r.orderNumber}</h3>
                <span className={'rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ' + (ST_STYLE[r.status] || '')}>{r.status}</span>
                <span className="text-[11.5px] text-dim2">
                  {dt(r.createdAt)} · {r.customer?.name} · {r.customer?.phone}
                </span>
                <Link to={'/orders/' + r.order} className="ml-auto text-[11px] font-bold uppercase tracking-[.1em] text-acc hover:underline">{tr('order →')}</Link>
              </div>

              <div className="grid gap-3.5 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Items to return')}</div>
                  {(r.items || []).map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-line py-1.5 text-[12.5px] last:border-b-0">
                      <span className="min-w-0 truncate pr-3">{i.name} <span className="text-dim2">#{i.slug}</span></span>
                      <span className="shrink-0 font-cond font-bold">×{i.qty} · {money(i.price * i.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[12.5px]">
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Reason & note')}</div>
                  <div><b className="text-txt">{tr(REASON_LABELS[r.reason] || r.reason)}</b></div>
                  {r.note ? <div className="mt-1 text-dim">“{r.note}”</div> : null}
                  {r.resolveNote ? <div className="mt-1 text-dim2">{tr('Admin: {note}', { note: r.resolveNote })}</div> : null}
                  {r.status === 'refunded' ? (
                    <div className="mt-1.5 font-cond text-[15px] font-bold text-green">{tr('Refunded {amt}', { amt: money(r.refundAmount) })}</div>
                  ) : null}
                </div>
              </div>

              {r.status === 'requested' ? (
                <div className="mt-3.5 flex flex-wrap gap-2.5 border-t border-line pt-3.5">
                  <button className={BTN_GREEN} onClick={() => act(r, 'approved')} disabled={busy}>{tr('✓ Approve Return')}</button>
                  <button className={BTN_RED} onClick={() => act(r, 'rejected')} disabled={busy}>{tr('✕ Reject')}</button>
                  <button className={BTN_ACC} onClick={() => act(r, 'refunded')} disabled={busy} title="Approve + log the refund on the order in one step">{tr('৳ Mark Refunded')}</button>
                </div>
              ) : null}
              {r.status === 'approved' ? (
                <div className="mt-3.5 flex flex-wrap gap-2.5 border-t border-line pt-3.5">
                  <button className={BTN_ACC} onClick={() => act(r, 'refunded')} disabled={busy}>{tr('৳ Mark Refunded')}</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="returns" title={tr('Returns / RMA')}>
        <ReturnsList />
      </AdminShell>
    </OverlayProvider>
  );
}
