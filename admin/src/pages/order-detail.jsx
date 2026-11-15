/* ArixGear ADMIN page — order detail (React port of order-detail.html)
   Actions: verify/reject payment (mobile methods only), status select, courier modal.
   Endpoints mirror legacy exactly: PATCH /admin/orders/:id/{verify,reject,status,courier} */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { money, dt } from '../lib/admin.js';
import { detail as orderDetail, verify, reject, setStatus, setCourier, pushCourier, remove as removeOrder } from '../services/orders.js';
import { download } from '../services/http.js';
import { navTo } from '../lib/nav.js';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm, usePrompt } from '../components/ui.jsx';
import ManualOrderForm from '../components/ManualOrderForm.jsx';
import { StChip, PmChip, PayChip, GuestChip, ManualChip } from '../components/OrdersTable.jsx';
import { AccSection, AccChip, useAccordion, AccBulkButtons } from '../components/Accordion.jsx';
import { tr, useLang } from '../lib/i18n.jsx';

const Card = ({ title, children, className = '' }) => (
  <div className={'rounded-[10px] border border-line bg-panel p-5 ' + className}>
    {title ? <h3 className="mb-3.5 text-[15px] tracking-[.08em]">{title}</h3> : null}
    {children}
  </div>
);

const KV = 'grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]';
const Kv = ({ k, children }) => (
  <>
    <span className="text-dim2">{k}</span>
    <span className="min-w-0 break-words">{children}</span>
  </>
);

const BTN_GHOST = 'rounded-lg border border-line2 px-3.5 py-2 text-[11.5px] font-bold uppercase tracking-[.08em] text-txt transition-colors hover:border-acc hover:text-acc disabled:opacity-50';
const BTN_GREEN = 'rounded-lg bg-green px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-black transition-[filter] hover:brightness-110 disabled:opacity-50';
const BTN_RED = 'rounded-lg border border-red/40 bg-red/10 px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-red transition-colors hover:bg-red/25 disabled:opacity-50';

const STATUS_FLOW = ['processing', 'packed', 'shipped', 'delivered', 'cancelled'];

/* courier modal form (legacy 🚚 Courier → modal) */
function CourierForm({ order, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const ask = usePrompt();
  const [name, setName] = useState(order.courier?.name || '');
  const [cons, setCons] = useState(order.courier?.consignmentNo || '');
  const [url, setUrl] = useState(order.courier?.trackingUrl || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await setCourier(order._id, { name: name.trim(), consignmentNo: cons.trim(), trackingUrl: url.trim() });
      toast(tr('Courier saved'), 'ok');
      onSaved();
    } catch (e) { toast(e.message || String(e), 'err'); }
    setBusy(false);
  };

  return (
    <>
      <h2 className="mb-5 text-[19px]">{tr('Courier Info — {num}', { num: order.orderNumber })}</h2>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label>{tr('Courier')}</label>
          <input id="cuName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Steadfast / Pathao / Sundarban" />
        </div>
        <div>
          <label>{tr('Consignment No')}</label>
          <input id="cuCons" value={cons} onChange={(e) => setCons(e.target.value)} placeholder="SF78451236" />
        </div>
        <div className="sm:col-span-2">
          <label>{tr('Tracking URL (optional)')}</label>
          <input id="cuUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div className="mt-[22px] flex justify-end gap-2.5 border-t border-line pt-4">
        <button className={BTN_GHOST} onClick={onClose}>{tr('Cancel')}</button>
        <button className="rounded-lg bg-acc px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-white hover:bg-acc-hi disabled:opacity-50" onClick={save} disabled={busy}>{tr('Save')}</button>
      </div>
    </>
  );
}

function OrderDetail() {
  const { t } = useLang();
  const { id: oid } = useParams();   /* route: /orders/:id */
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusSel, setStatusSel] = useState('');
  const [badImgs, setBadImgs] = useState({});
  /* Task 35 — 6 accordion sections (Courier renders only when present) */
  const SECS = ['items', 'payment', 'customer', 'shipping', 'courier', 'timeline'];
  const acc = useAccordion(['items', 'payment']);

  const load = useCallback(async () => {
    if (!oid) return;
    try {
      const d = await orderDetail(oid);   /* legacy: ({ order: o } = await api(...)) */
      setOrder(d.order);
      setErr('');
    } catch (e) { setErr(e.message || String(e)); }
  }, [oid]);

  useEffect(() => { load(); }, [load]);

  if (!oid) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
        <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">{tr('NO ORDER SELECTED')}</span>
        {tr('Pick an order from the')} <Link to="/orders" className="text-acc underline">{tr('Orders')}</Link>{tr(' list.')}
      </div>
    );
  }
  if (err && !order) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
        <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">{tr('ERROR')}</span>
        {err}
      </div>
    );
  }
  if (!order) {
    return <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">{tr('Loading…')}</div>;
  }

  const o = order;
  const isCod = o.payment.method === 'cod';
  const canPayAct = !isCod && o.payment.status === 'pending';   /* legacy gate — also blocks COD reject */
  const itemCount = (o.items || []).reduce((a, i) => a + (i.qty || 0), 0);
  const history = [...(o.statusHistory || [])].reverse();

  /* ---------- actions (legacy bindOrderActions) ---------- */
  const doVerify = async () => {
    if (!(await confirm({ title: 'Verify payment', body: tr('Verify {method} payment of {amt} for {num}?\n\nOnly click after checking your merchant statement!', { method: o.payment.method.toUpperCase(), amt: money(o.payment.expectedAmount), num: o.orderNumber }), ok: 'Verify' }))) return;
    setBusy(true);
    try {
      await verify(oid, {});
      toast(tr('Payment verified ✓ order moved to processing'), 'ok');
      await load();
    } catch (e) { toast(e.message || String(e), 'err'); }
    setBusy(false);
  };

  const doReject = async () => {
    const reason = await ask({ title: 'Reject payment', label: tr('Rejection reason (sent to customer):\ne.g. "TrxID not found in bKash statement"'), required: true, multiline: true, ok: 'Reject' });
    if (reason === null) return;
    setBusy(true);
    try {
      await reject(oid, { reason });
      toast(tr('Payment rejected'), 'ok');
      await load();
    } catch (e) { toast(e.message || String(e), 'err'); }
    setBusy(false);
  };

  const doStatus = async (status) => {
    if (!status) return;
    const note = (await ask({ title: 'Status → ' + status, label: tr('Note for "{status}" (optional):', { status }), multiline: true, ok: 'Apply' })) || '';
    setBusy(true);
    try {
      await setStatus(oid, { status, note });
      toast(tr('Status → {status}', { status }), 'ok');
      setStatusSel('');
      await load();
    } catch (e) { toast(e.message || String(e), 'err'); setStatusSel(''); }
    setBusy(false);
  };

  const openCourier = () => openModal(
    <CourierForm order={o} onClose={closeModal} onSaved={async () => { closeModal(); await load(); }} />
  );

  /* Task 28 — one-click dispatch to the configured courier (Steadfast/Pathao).
     Not configured → server answers dry-run and the toast explains it. */
  const doPushCourier = async () => {
    if (!(await confirm({ title: 'Courier dispatch', body: tr('Push {num} to the configured courier?\n\nCOD amount {amt} · {phone}', { num: o.orderNumber, amt: money(o.totals.grandTotal), phone: o.customer.phone }), ok: 'Push' }))) return;
    setBusy(true);
    try {
      const d = await pushCourier(oid);
      const r = d.result || {};
      if (r.ok) toast(tr('Courier ✓ {x}', { x: r.consignmentNo || 'created' }), 'ok');
      else toast((r.dryRun ? tr('Courier not configured') : tr('Courier push failed')) + ' — ' + (r.message || tr('Configure Admin → Settings → Courier')), 'err');
      await load();
    } catch (e) { toast(e.message || String(e), 'err'); }
    setBusy(false);
  };

  /* Task 28 — PDF invoice (JWT admin access, no phone needed) */
  const doInvoice = async () => {
    try {
      await download('/orders/' + o.orderNumber + '/invoice.pdf', 'ARG-' + o.orderNumber + '.pdf');
      toast(tr('Invoice downloaded'), 'ok');
    } catch (e) { toast(e.message || String(e), 'err'); }
  };

  /* wrong-entry correction — manual orders only; online orders are customer records */
  const canEdit = o.source === 'manual' && o.status !== 'delivered';
  const canDelete = o.status !== 'delivered';
  const openEdit = () => openModal(
    <ManualOrderForm order={o} onDone={async () => { closeModal(); await load(); }} />
  );
  const doDelete = async () => {
    if (!(await confirm({ title: 'Delete order', body: tr('Delete order {num}?\n\n{cust} · {amt}\nStock will be restored. This cannot be undone.', { num: o.orderNumber, cust: o.customer.name, amt: money(o.totals.grandTotal) }), danger: true, ok: 'Delete' }))) return;
    setBusy(true);
    try {
      const r = await removeOrder(oid);
      toast(r.message || tr('Order deleted'), 'ok');
      navTo('/orders');
    } catch (e) { toast(e.message || String(e), 'err'); setBusy(false); }
  };

  const copyTrx = async () => {
    try {
      await navigator.clipboard.writeText(o.payment.trxId || '');
      toast(tr('TrxID copied'), 'ok');
    } catch (_) { toast(tr('Copy failed — select the TrxID manually'), 'err'); }
  };

  const totLine = 'flex justify-between py-1 text-[13px] text-dim';

  return (
    <>
      <Link className="mb-3.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-dim2 transition-colors hover:text-acc" to="/orders">{tr('← Back to Orders')}</Link>

      {/* detail head */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5 border-b border-line pb-4">
        <h2 className="text-[26px]">{o.orderNumber}</h2>
        <StChip s={o.status} />
        <PmChip m={o.payment.method} />
        <PayChip p={o.payment.status} />
        {o.source === 'manual' ? <ManualChip channel={o.channel} /> : null}
        {o.isGuest && o.source !== 'manual' ? <GuestChip label="GUEST ORDER" /> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {canPayAct ? <button className={BTN_GREEN} onClick={doVerify} disabled={busy}>{tr('✓ Verify Payment')}</button> : null}
          {canPayAct ? <button className={BTN_RED} onClick={doReject} disabled={busy}>{tr('✕ Reject Payment')}</button> : null}
          {canEdit ? <button className={BTN_GHOST} onClick={openEdit} disabled={busy} title={tr('Correct this manual entry')}>✎ {tr('Edit')}</button> : null}
          {canDelete ? <button className={BTN_RED} onClick={doDelete} disabled={busy} title={tr('Delete order — stock restored')}>🗑 {tr('Delete')}</button> : null}
          <select
            className="w-auto"
            value={statusSel}
            disabled={busy}
            onChange={(e) => doStatus(e.target.value)}
            aria-label="Change status"
          >
            <option value="">{tr('Change status…')}</option>
            {STATUS_FLOW.map((s) => <option key={s} value={s} disabled={o.status === s}>{s}</option>)}
          </select>
          <button className={BTN_GHOST} onClick={openCourier} disabled={busy}>{tr('🚚 Courier')}</button>
          <button className={BTN_GHOST} onClick={doPushCourier} disabled={busy} title="Push to the configured courier API (Settings → Courier)">{tr('📤 Push to Courier')}</button>
          <button className={BTN_GHOST} onClick={doInvoice} disabled={busy} title="Download PDF invoice">{tr('⬇ Invoice')}</button>
        </div>
        <div className="w-full text-[12px] text-dim2">
          {tr('Placed {date}', { date: dt(o.createdAt) })}{o.user ? ' · ' + tr('account: {x}', { x: o.user.name || o.user.email || 'registered' }) : ''}
          {o.source === 'manual' ? ' · ' + tr('manual entry — received via {ch}', { ch: o.channel || 'WhatsApp' }) : ''}
        </div>
      </div>

      {/* Task 35 — accordion sections; every action button stays pinned in the head above */}
      <div className="mb-3 flex items-center justify-end gap-2">
        <AccBulkButtons ids={SECS} acc={acc} prefix="od" />
      </div>
      <div className="space-y-2.5">
        <AccSection id="items" icon="🛒" title={tr('Items & Totals')} open={acc.isOpen('items')} onToggle={() => acc.toggle('items')}
          chips={<>
            <AccChip text={itemCount + ' PCS'} tone="acc" />
            <AccChip text={o.items.length + ' LINE' + (o.items.length === 1 ? '' : 'S')} tone="dim" />
            <AccChip text={tr('TOTAL ৳{n}', { n: (+o.totals.grandTotal).toLocaleString('en-IN') })} tone="green" />
          </>}>
          {(o.items || []).map((i, idx) => (
            <div key={idx} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
              <img
                src={i.image}
                alt=""
                onError={() => setBadImgs((b) => ({ ...b, [idx]: true }))}
                className={'h-14 w-14 shrink-0 rounded-[7px] bg-panel2 object-cover' + (badImgs[idx] ? ' invisible' : '')}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{i.name}</div>
                <div className="mt-0.5 text-[11.5px] text-dim2">
                  {i.slug ? '#' + i.slug + ' · ' : ''}
                  {i.size ? 'Size ' + i.size + ' · ' : ''}
                  {i.color ? i.color + ' · ' : ''}
                  {money(i.price)} × {i.qty}
                </div>
              </div>
              <div className="ml-auto shrink-0 font-cond text-[16px] font-bold">{money(i.lineTotal)}</div>
            </div>
          ))}
          <div className="mt-3.5">
            <div className={totLine}><span>{tr('Subtotal')}</span><span>{money(o.totals.subtotal)}</span></div>
            {o.totals.discount > 0 ? (
              <div className={totLine}>
                <span>{tr('Discount ({code})', { code: o.totals.couponCode || '' })}</span>
                <span className="text-green">−{money(o.totals.discount)}</span>
              </div>
            ) : null}
            <div className={totLine}>
              <span>{tr('Shipping ({x})', { x: o.shipping.division })}</span>
              <span>{o.totals.shipping === 0 ? tr('FREE') : money(o.totals.shipping)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-line2 pt-2.5 text-[16px] font-extrabold text-txt">
              <span>{tr('Grand Total')}</span>
              <span className="font-disp text-[20px] text-acc">{money(o.totals.grandTotal)}</span>
            </div>
          </div>
        </AccSection>

        <AccSection id="payment" icon="💳" title={tr('Payment')} open={acc.isOpen('payment')} onToggle={() => acc.toggle('payment')}
          chips={<>
            <AccChip text={(o.payment.method || '').toUpperCase()} tone="acc" />
            <AccChip text={(o.payment.status || '').toUpperCase()} tone={o.payment.status === 'rejected' ? 'red' : o.payment.status === 'pending' ? 'dim' : 'green'} />
          </>}>
          {isCod ? (
            <div className={KV}>
              <Kv k={tr('Method')}>{tr('Cash on Delivery')}</Kv>
              <Kv k={tr('Collect')}><span className="font-cond text-[18px] font-bold">{money(o.totals.grandTotal)}</span></Kv>
              {o.payment.status === 'cod-collected' ? <Kv k={tr('Cash')}><span className="text-green">✓ {tr('Collected')}</span></Kv> : null}
            </div>
          ) : (
            <>
              <div className={KV}>
                <Kv k="TrxID">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[19px] font-extrabold tracking-[.1em]">{o.payment.trxId || '—'}</span>
                    {o.payment.trxId ? (
                      <button className={BTN_GHOST + ' !px-2.5 !py-1 !text-[11px]'} onClick={copyTrx} title={tr('Copy TrxID')}>{tr('⧉ Copy')}</button>
                    ) : null}
                  </span>
                </Kv>
                <Kv k={tr('Expected')}>{money(o.payment.expectedAmount)}</Kv>
                {o.payment.senderNumber ? <Kv k={tr('Sender')}><span className="font-mono">{o.payment.senderNumber}</span></Kv> : null}
                {o.payment.verifiedAt ? <Kv k={tr('Verified')}><span className="text-green">✓ {dt(o.payment.verifiedAt)}</span></Kv> : null}
                {o.payment.rejectReason ? <Kv k={tr('Rejection')}><span className="text-red">{o.payment.rejectReason}</span></Kv> : null}
              </div>
              {o.payment.refunds && o.payment.refunds.length ? (
                <div className="mt-2.5 rounded-[10px] border border-red/30 bg-red/10 px-3.5 py-2.5">
                  <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[.14em] text-red">{tr('Refund ledger (RMA)')}</div>
                  {o.payment.refunds.map((r, i) => (
                    <div key={i} className="flex justify-between gap-2 py-0.5 text-[12px]">
                      <span className="min-w-0 truncate text-dim">{dt(r.at)} · {r.by || 'admin'}{r.note ? ' · ' + r.note : ''}</span>
                      <b className="shrink-0 text-red">−{money(r.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : null}
              {o.payment.screenshot && o.payment.screenshot.url ? (
                <>
                  <a href={o.payment.screenshot.url} target="_blank" rel="noreferrer">
                    <img
                      src={o.payment.screenshot.url}
                      alt="payment proof screenshot"
                      className="mt-3.5 block w-full max-w-[480px] cursor-zoom-in rounded-[10px] border border-line2 bg-panel2"
                    />
                  </a>
                  <div className="mt-2.5 text-[11.5px] leading-relaxed text-dim2">
                    ↗ Click the screenshot to open it full-size — cross-check the TrxID and amount with your {o.payment.method} merchant statement before verifying.
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-[10px] border border-line bg-panel2 px-4 py-3.5 text-center text-[13px] text-dim2">{tr('No screenshot attached')}</div>
              )}
            </>
          )}
        </AccSection>

        <AccSection id="customer" icon="👤" title={tr('Customer')} open={acc.isOpen('customer')} onToggle={() => acc.toggle('customer')}
          chips={<AccChip text={'✓ ' + (o.customer.phone || '')} tone="green" />}>
          <div className={KV}>
            <Kv k={tr('Name')}>{o.customer.name}</Kv>
            <Kv k={tr('Phone')}>{o.customer.phone}</Kv>
            {o.customer.email ? <Kv k={tr('Email')}>{o.customer.email}</Kv> : null}
            {o.user ? <Kv k={tr('Account')}>{o.user.email || 'registered'}</Kv> : null}
          </div>
        </AccSection>

        <AccSection id="shipping" icon="🚚" title={tr('Shipping Address')} open={acc.isOpen('shipping')} onToggle={() => acc.toggle('shipping')}
          chips={<>
            <AccChip text={'ADDRESS ✓'} tone={o.shipping.address ? 'green' : 'red'} />
            <AccChip text={(o.shipping.division || '').toUpperCase()} tone="acc" />
          </>}>
          <div className={KV}>
            <Kv k={tr('Address')}>{o.shipping.address}</Kv>
            <Kv k={tr('City')}>{o.shipping.city}</Kv>
            <Kv k={tr('Division')}>
              {o.shipping.division}{' '}
              <span className="text-[11px] text-dim2">shipping {o.totals.shipping === 0 ? 'FREE' : money(o.totals.shipping)}</span>
            </Kv>
            {o.shipping.postal ? <Kv k={tr('Postal')}>{o.shipping.postal}</Kv> : null}
            {o.shipping.notes ? <Kv k={tr('Notes')}>{o.shipping.notes}</Kv> : null}
          </div>
        </AccSection>

        {o.courier && o.courier.name ? (
          <AccSection id="courier" icon="📦" title={tr('Courier')} open={acc.isOpen('courier')} onToggle={() => acc.toggle('courier')}
            chips={<AccChip text={(o.courier.name || '').toUpperCase()} tone="acc" />}>
            <div className={KV}>
              <Kv k={tr('Courier')}>{o.courier.name}</Kv>
              <Kv k={tr('Consignment')}><span className="font-mono">{o.courier.consignmentNo || '—'}</span></Kv>
              {o.courier.trackingUrl ? (
                <Kv k={tr('Tracking')}><a href={o.courier.trackingUrl} target="_blank" rel="noreferrer" className="text-acc">{tr('↗ open')}</a></Kv>
              ) : null}
            </div>
          </AccSection>
        ) : null}

        <AccSection id="timeline" icon="🕑" title={tr('Status Timeline')} open={acc.isOpen('timeline')} onToggle={() => acc.toggle('timeline')}
          chips={<AccChip text={history.length + ' EVENTS'} tone="dim" />}>
          {history.length ? (
            <div className="ml-1.5 border-l-2 border-line2 pl-[18px]">
              {history.map((h, idx) => (
                <div key={idx} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[24px] top-[3px] h-2.5 w-2.5 rounded-full bg-acc ring-4 ring-acc-dim" />
                  <div className="text-[12.5px] font-bold uppercase tracking-[.06em]">
                    {h.status} <StChip s={h.status} />
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-dim2">{dt(h.at)} · {h.by}{h.note ? ' · ' + h.note : ''}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-[13.5px] text-dim2">{tr('No history yet.')}</div>
          )}
        </AccSection>
      </div>
    </>
  );
}

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="orders" title={tr('Order Detail')}>
        <OrderDetail />
      </AdminShell>
    </OverlayProvider>
  );
}
