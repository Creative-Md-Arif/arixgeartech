/* ArixGear ADMIN page — orders (React port of orders.html) */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadCsv, money } from '../lib/admin.js';
import { list as listOrders, exportCsv, remove as removeOrder } from '../services/orders.js';
import AdminShell from '../components/AdminShell.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import OrdersTable, { openOrder } from '../components/OrdersTable.jsx';
import ManualOrderForm from '../components/ManualOrderForm.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { tr, useLang } from '../lib/i18n.jsx';

const STATUSES = ['verifying', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'payment-rejected'];
const METHODS = ['bkash', 'nagad', 'rocket', 'cod'];
const SOURCES = ['online', 'manual'];
const BTN_GHOST = 'rounded-lg border border-line2 px-3 py-2 text-[11px] font-bold uppercase tracking-[.08em] text-txt transition-colors hover:border-acc hover:text-acc';
const BTN_ACC = 'rounded-lg bg-acc px-3 py-2 text-[11px] font-bold uppercase tracking-[.08em] text-white transition-colors hover:bg-acc-hi disabled:opacity-50';

function Orders() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [filters, setFilters] = useState({ status: '', method: '', search: '', source: '' });
  const [debounced, setDebounced] = useState('');
  const [data, setData] = useState(null);
  const [count, setCount] = useState(null);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  /* debounced search (~400ms) — backend does the actual search */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters.search), 400);
    return () => clearTimeout(t);
  }, [filters.search]);

  /* legacy query string + source= (manual order management) */
  const qs = useMemo(() => {
    const q = new URLSearchParams();
    if (filters.status) q.set('status', filters.status);
    if (filters.method) q.set('method', filters.method);
    if (filters.source) q.set('source', filters.source);
    if (debounced) q.set('search', debounced);
    return q.toString();
  }, [filters.status, filters.method, filters.source, debounced]);

  const load = useCallback(async () => {
    try {
      const d = await listOrders(Object.fromEntries(new URLSearchParams(qs)));   /* same query string as legacy */
      setData(d);
      setCount(d.total);
      setErr('');
    } catch (e) { setErr(e.message || String(e)); }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  const doExport = async () => {
    setExporting(true);
    try {
      const text = await exportCsv({ status: filters.status, method: filters.method, source: filters.source, search: debounced });
      downloadCsv(text, 'forged-orders.csv');
      toast(tr('CSV exported ✓ — check your downloads'), 'ok');
    } catch (e) { toast(tr('Export failed: {err}', { err: e.message || e }), 'err'); }
    setExporting(false);
  };

  const reset = () => {
    setFilters({ status: '', method: '', search: '', source: '' });
    setDebounced('');
  };

  const openManual = () => openModal(<ManualOrderForm onDone={load} />);

  /* wrong-entry correction — manual orders open the same form prefilled (PUT) */
  const openEdit = (o) => openModal(<ManualOrderForm order={o} onDone={load} />);

  const doDelete = async (o) => {
    const kind = o.source === 'manual' ? tr('MANUAL order') : tr('ONLINE order');
    if (!(await confirm({ title: 'Delete order', body: tr('Delete {kind} {num}?\n\n{cust} · {amt}\nStock will be restored. This cannot be undone.', { kind, num: o.orderNumber, cust: o.customer?.name, amt: o.totals?.grandTotal ? money(o.totals.grandTotal) : '' }), danger: true, ok: 'Delete' }))) return;
    try {
      const r = await removeOrder(o._id);
      toast(r.message || tr('Order deleted'), 'ok');
      load();
    } catch (e) { toast(e.message || String(e), 'err'); }
  };

  return (
    <>
      {/* filter toolbar — stacks on mobile */}
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="text"
          id="ofSearch"
          placeholder={tr('Search order #, name, phone, TrxID…')}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <select id="ofStatus" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">{tr('All statuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select id="ofMethod" value={filters.method} onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}>
          <option value="">{tr('All methods')}</option>
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select id="ofSource" value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} aria-label="Filter by source">
          <option value="">{tr('All sources')}</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s === 'manual' ? tr('Manual (WhatsApp/phone)') : tr('Online (storefront)')}</option>)}
        </select>
        <button className={BTN_GHOST} id="ofReset" onClick={reset}>{tr('Reset')}</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="flex-1" />
        <button className={BTN_ACC} id="ofManual" onClick={openManual} title="Enter an order received via WhatsApp / phone / inbox">
          {tr('+ Manual Order')}
        </button>
        <button className={BTN_GHOST} id="ofExport" onClick={doExport} disabled={exporting}
          title="Download the current filtered list as CSV (Excel-friendly, ৳ BDT)">
          {tr('⬇ Export CSV')}
        </button>
        <span className="count text-[12px] text-dim2" id="ofCount">{count === null ? '' : tr('{n} orders', { n: count })}</span>
      </div>

      {err ? (
        <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
          <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">{tr('ERROR')}</span>
          {err}
        </div>
      ) : !data ? (
        <TableSkeleton rows={9} cols={6} />
      ) : data.items?.length ? (
        <OrdersTable items={data.items} onOpen={openOrder} onEdit={openEdit} onDelete={doDelete} />
      ) : (
        <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
          <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">{tr('NO ORDERS')}</span>
          {tr('No orders match these filters.')}
        </div>
      )}
    </>
  );
}

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="orders" title={tr('Orders')}>
        <Orders />
      </AdminShell>
    </OverlayProvider>
  );
}
