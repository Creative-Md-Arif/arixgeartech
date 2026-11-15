/* ArixGear ADMIN page — Inventory Log (Phase 5, 5.3 · C3 net-new)
   /admin/stock · the StockLog ledger (order/restore/adjust rows with
   before→after) + a race-safe stock adjustment tool. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { CARD, ACC_BTN, GHOST_BTN, CHIP, LBL, Empty } from '../components/ui.jsx';
import { logs, adjust } from '../services/stock.js';
import { list as listProducts } from '../services/products.js';

const REASON_CHIP = {
  order: 'border-red/40 text-red',
  restore: 'border-green/40 text-green',
  adjust: 'border-acc/40 text-acc',
  'manual-order': 'border-purple/40 text-purple',
  return: 'border-yellow/40 text-yellow',
  import: 'border-line2 text-dim2',
  correction: 'border-blue/40 text-blue',
};
const dt = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function StockPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ reason: '', q: '' });
  const [prods, setProds] = useState([]);
  const [adj, setAdj] = useState({ productId: '', delta: '', note: '' });

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (f.reason) params.set('reason', f.reason);
      if (f.q.trim()) params.set('orderNumber', f.q.trim().toUpperCase());
      const d = await logs(params.toString());
      setItems(d.items || []);
      setTotal(d.total || 0);
    } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [f, toast]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listProducts({ limit: '60' }).then((d) => setProds(d.items || [])).catch(() => {}); }, []);

  const doAdjust = async () => {
    const delta = Number(adj.delta);
    if (!adj.productId || !Number.isInteger(delta) || delta === 0) {
      return toast('Pick a product and a non-zero whole-number delta', 'err');
    }
    try {
      const r = await adjust({ productId: adj.productId, delta, note: adj.note.trim() });
      toast(`Stock → ${r.stock} (${delta > 0 ? '+' : ''}${delta})`, 'ok');
      setAdj({ productId: '', delta: '', note: '' });
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="inventory" title="Inventory Log">
      <div className={CARD + ' mb-5'}>
        <h2 className="text-[14px]">Adjust stock</h2>
        <p className="mt-0.5 text-[12px] text-dim2">Restock, shrinkage, corrections — every delta lands in the ledger below. Race-safe: stock can never go negative.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block w-[280px]"><span className={LBL}>Product</span>
            <select data-testid="adjustProduct" value={adj.productId} onChange={(e) => setAdj((a) => ({ ...a, productId: e.target.value }))}>
              <option value="">— pick a product —</option>
              {prods.map((p) => <option key={p._id} value={p._id}>{p.name} (stock {p.stock})</option>)}
            </select></label>
          <label className="block w-[120px]"><span className={LBL}>Delta (±)</span>
            <input data-testid="adjustDelta" type="number" step="1" value={adj.delta} onChange={(e) => setAdj((a) => ({ ...a, delta: e.target.value }))} placeholder="+10 / -2" /></label>
          <label className="block w-[240px]"><span className={LBL}>Note</span>
            <input value={adj.note} onChange={(e) => setAdj((a) => ({ ...a, note: e.target.value }))} placeholder="e.g. supplier restock #4471" /></label>
          <button className={ACC_BTN} data-testid="adjustApply" onClick={doAdjust}>Apply</button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="w-[160px]" value={f.reason} onChange={(e) => setF((s) => ({ ...s, reason: e.target.value }))}>
          <option value="">all movements</option>
          {['order', 'restore', 'adjust', 'manual-order', 'return', 'import', 'correction'].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="max-w-[260px] flex-1" placeholder="Filter by order number…" value={f.q}
          onChange={(e) => setF((s) => ({ ...s, q: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <button className={GHOST_BTN} onClick={load}>Filter</button>
        <span className="text-[12px] text-dim2">{total} ledger rows</span>
      </div>

      {!items ? <TableSkeleton rows={8} /> : null}
      {items && !items.length ? <Empty icon="📋" title="No stock movements" sub="Every order, restore and adjustment writes a row here — stock changes are never silent." /> : null}

      {items && items.length ? (
        <div className="tbl-wrap overflow-x-auto rounded-xl border border-line bg-panel" data-testid="stockLedger">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-line text-left text-dim2">
              <th className="px-3 py-2.5">When</th><th className="px-3 py-2.5">Product</th><th className="px-3 py-2.5">Reason</th>
              <th className="px-3 py-2.5 text-right">Δ</th><th className="px-3 py-2.5 text-center">Stock</th><th className="px-3 py-2.5">Ref</th><th className="px-3 py-2.5">By</th>
            </tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r._id} className="border-b border-line/60 last:border-0" data-testid="stockRow">
                  <td className="whitespace-nowrap px-3 py-2 text-dim2">{dt(r.createdAt)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-txt">{r.productName || r.productSlug}</td>
                  <td className="px-3 py-2"><span className={CHIP + ' ' + (REASON_CHIP[r.reason] || '')}>{r.reason}</span></td>
                  <td className={'px-3 py-2 text-right font-bold ' + (r.delta < 0 ? 'text-red' : 'text-green')}>{r.delta > 0 ? '+' : ''}{r.delta}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-center text-dim">{r.before} → <b className="text-txt">{r.after}</b></td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-[11.5px] text-dim2">{r.orderNumber || r.note || '—'}</td>
                  <td className="px-3 py-2 text-dim2">{r.actorName || 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <StockPage />
    </OverlayProvider>
  );
}
