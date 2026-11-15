/* ArixGear ADMIN page — Warranty registrations (Phase 5, 5.3 · C3 net-new)
   /admin/warranty · ARG-W-… registry: search, expiry state, claim flag,
   link to ticket number, notes. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { CARD, ACC_BTN, GHOST_BTN, CHIP, LBL, Toggle, Empty, useConfirm } from '../components/ui.jsx';
import { list, update, remove } from '../services/warranty.js';

const dt = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function WarrantyPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [showClaimed, setShowClaimed] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (query = q) => {
    try {
      const d = await list(query);
      setItems(d.items || []);
      setTotal(d.total || 0);
    } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [q, toast]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (w, body, msg) => {
    setBusyId(w._id);
    try { await update(w._id, body); toast(msg, 'ok'); load(); } catch (e) { toast(e.message, 'err'); } finally { setBusyId(null); }
  };
  const del = async (w) => {
    if (!(await confirm({ title: 'Delete registration', body: `Delete warranty ${w.regNumber} for "${w.productName}"? The customer loses their online proof — prefer expiring it via a claim note.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(w._id); toast('Registration deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  const shown = (items || []).filter((w) => (showClaimed ? true : w.status === 'active'));

  return (
    <AdminShell active="warranty" title="Warranty Registrations">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input data-testid="warrantySearch" className="max-w-[340px] flex-1" placeholder="Search reg · order · phone · serial · product…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(q); }} />
        <button className={GHOST_BTN} onClick={() => load(q)}>Search</button>
        <span className="text-[12px] text-dim2">{total} registration{total === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-dim"><Toggle on={showClaimed} onClick={() => setShowClaimed((v) => !v)} /> include claimed</label>
      </div>

      {!items ? <TableSkeleton rows={6} /> : null}
      {items && !shown.length ? <Empty icon="🛡" title="No warranty registrations" sub="Customers register from the storefront after delivery — order number + checkout phone required." /> : null}

      {shown.length ? (
        <div className="space-y-2.5" data-testid="warrantyList">
          {shown.map((w) => {
            const expired = w.expired || (w.expiresAt && new Date(w.expiresAt) < new Date());
            return (
              <div key={w._id} className={CARD + ' flex flex-wrap items-center gap-3'} data-testid="warrantyRow">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="font-mono text-[13.5px] text-acc">{w.regNumber}</b>
                    <span className={CHIP + ' ' + (expired ? 'border-red/40 text-red' : w.status === 'claimed' ? 'border-blue/40 text-blue' : 'border-green/40 text-green')}>
                      {expired ? 'EXPIRED' : w.status.toUpperCase()}
                    </span>
                    {w.ticketNumber ? <span className={CHIP + ' border-line2 text-dim2'}>ticket {w.ticketNumber}</span> : null}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-txt">{w.productName}{w.sku ? <span className="text-dim2"> · {w.sku}</span> : null}</div>
                  <div className="text-[11.5px] text-dim2">{w.orderNumber} · {w.customer?.name} · {w.customer?.phone}{w.serial ? ' · SN ' + w.serial : ''}</div>
                </div>
                <div className="text-right text-[11.5px] text-dim2">
                  <div>purchased {dt(w.purchaseDate)}</div>
                  <div className={expired ? 'text-red' : 'text-dim2'}>expires {dt(w.expiresAt)}</div>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <label className="flex items-center gap-1.5 text-[11px] text-dim2"><Toggle on={w.status === 'claimed'} disabled={busyId === w._id}
                    onClick={() => patch(w, { status: w.status === 'claimed' ? 'active' : 'claimed' }, w.status === 'claimed' ? 'Marked active' : 'Marked claimed')} /> claimed</label>
                  <input className="w-[150px] text-[12px]" placeholder="ticket # (link)"
                    defaultValue={w.ticketNumber || ''}
                    onBlur={(e) => { if ((e.target.value || '') !== (w.ticketNumber || '')) patch(w, { ticketNumber: e.target.value }, 'Ticket link saved'); }} />
                  <button className={GHOST_BTN} onClick={() => del(w)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-4 text-[11.5px] text-dim2">
        Registration requires the customer to prove ownership (order number + checkout phone). Warranty length comes from the product's warranty block — edit it in Admin → Products.
      </p>
    </AdminShell>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <WarrantyPage />
    </OverlayProvider>
  );
}
