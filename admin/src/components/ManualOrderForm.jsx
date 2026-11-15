/* ArixGear ADMIN — Manual Order Entry / Edit form (WhatsApp / phone / inbox orders)
   Create: admin types what the customer ordered → saved as an Order (source: 'manual').
   Edit  : pass { order } → same form prefilled, saved via PUT (wrong-entry correction).
   Every dashboard metric (orders, revenue, 7-day chart, top sellers) updates
   automatically because both sources share the same collection. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../lib/admin.js';
import { createManual, updateManual } from '../services/orders.js';
import { list as listProducts } from '../services/products.js';
import { get as getSettings } from '../services/settings.js';
import { useToast, useModal } from './Overlays.jsx';
import { AccSection, AccChip, useAccordion, AccBulkButtons } from './Accordion.jsx';
import { tr, useLang } from '../lib/i18n.jsx';

const CHANNELS = ['WhatsApp', 'Phone', 'Facebook', 'Instagram', 'Walk-in', 'Other'];
const METHODS = [
  ['cod', 'COD (cash on delivery)'],
  ['bkash', 'bKash'],
  ['nagad', 'Nagad'],
  ['rocket', 'Rocket'],
  ['cash', 'Cash (walk-in / pickup)'],
  ['bank', 'Bank transfer'],
];
const MOBILE = ['bkash', 'nagad', 'rocket'];

/* size-based pricing — same rule as storefront checkout */
const unitFor = (p, size) => {
  if (size && Array.isArray(p.sizePrices)) {
    const hit = p.sizePrices.find((v) => String(v.s) === String(size));
    if (hit && +hit.price > 0) return +hit.price;
  }
  return +p.price || 0;
};
/* Task 34 — sections are accordion (shared AccSection); the old static box is gone */

export default function ManualOrderForm({ order, onDone }) {
  const { t } = useLang();   /* subscribe → re-render on BN/EN toggle */
  const toast = useToast();
  const { closeModal } = useModal();
  const isEdit = !!order; /* edit mode = wrong-entry correction for an existing manual order */

  /* Task 34 — 5 accordion sections + validation auto-open */
  const MO_SECTIONS = ['customer', 'shipping', 'items', 'adjustments', 'payment'];
  const mo = useAccordion(['customer']);

  const [cust, setCust] = useState({
    name: order?.customer?.name || '', phone: order?.customer?.phone || '', email: order?.customer?.email || '',
  });
  const [ship, setShip] = useState({
    address: order?.shipping?.address || '', city: order?.shipping?.city || '',
    division: order?.shipping?.division || 'dhaka', postal: order?.shipping?.postal || '', notes: order?.shipping?.notes || '',
  });
  const [divisions, setDivisions] = useState({});
  const [freeAt, setFreeAt] = useState(0);
  const [items, setItems] = useState([]); /* {productId,name,slug,image,stock,sizeOpts,size,color,qty,price,_origQty} */
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [discount, setDiscount] = useState(isEdit && +order.totals?.discount > 0 ? String(+order.totals.discount) : '');
  /* edit mode: shipping stays pinned to the saved value (not auto) so totals don't jump */
  const [shipCost, setShipCost] = useState(isEdit ? String(+order.totals?.shipping || 0) : '');
  const [pay, setPay] = useState({
    channel: order?.channel || 'WhatsApp',
    method: order?.payment?.method || 'cod',
    paid: isEdit ? ['verified', 'cod-collected'].includes(order.payment?.status) : false,
    trxId: order?.payment?.trxId || '',
    senderNumber: order?.payment?.senderNumber || '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  /* edit mode: hydrate item lines from the order snapshot + fresh product docs
     (size options + live stock). Lines whose product was deleted stay editable. */
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const d = await listProducts({});
        const byId = Object.fromEntries((d.items || []).map((p) => [p._id, p]));
        setItems((order.items || []).map((i) => {
          const p = byId[i.product] || null;
          return {
            productId: i.product, name: i.name, slug: i.slug || '', image: i.image || '',
            stock: p ? +p.stock || 0 : 9999,
            _prod: p, _origQty: i.qty, _missing: !p,
            sizeOpts: p ? (p.sizePrices || []).map((s) => s.s) : (i.size ? [i.size] : []),
            size: i.size || '', color: i.color || '',
            qty: i.qty, price: +i.price || 0,
          };
        }));
      } catch (_) { /* lines stay empty → admin still sees the order detail */ }
    })();
  }, [isEdit]);

  /* settings → division charges + free-shipping threshold */
  useEffect(() => {
    (async () => {
      try {
        const d = await getSettings();
        setDivisions(d.setting?.shipping?.divisions || {});
        setFreeAt(+d.setting?.shipping?.freeThreshold || 0);
      } catch (_) { /* defaults still usable */ }
    })();
  }, []);

  /* debounced product search (active products only) */
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await listProducts({ search: search.trim() });
        setResults((d.items || []).filter((p) => p.active !== false).slice(0, 6));
        setShowResults(true);
      } catch (_) { /* ignore transient */ }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  /* close the picker dropdown on outside click */
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addProduct = (p) => {
    if (items.some((i) => i.productId === p._id)) { toast(tr('Already added — adjust its quantity'), 'err'); return; }
    setItems((xs) => [...xs, {
      productId: p._id, name: p.name, slug: p.slug,
      image: p.images?.[0]?.url || '', stock: +p.stock || 0,
      _prod: p, /* raw product — size switch re-prices from sizePrices */
      sizeOpts: (p.sizePrices || []).map((s) => s.s), size: '', color: '',
      qty: 1, price: +p.price || 0,
    }]);
    setSearch(''); setResults([]); setShowResults(false);
  };
  const setLine = (ix, f, v) => setItems((xs) => xs.map((x, i) => (i === ix ? { ...x, [f]: v } : x)));
  const removeLine = (ix) => setItems((xs) => xs.filter((_, i) => i !== ix));
  /* size switch re-prices the line from sizePrices (admin can still override after) */
  const pickSize = (ix, size) => setItems((xs) => xs.map((x, i) => (i === ix ? { ...x, size, price: size && x._prod ? unitFor(x._prod, size) : x.price } : x)));

  const subtotal = useMemo(() => items.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 0), 0), [items]);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const autoShip = useMemo(() => {
    const key = String(ship.division || '').toLowerCase();
    if (!(key in divisions)) return 0;
    return subtotal - disc >= freeAt ? 0 : (+divisions[key] || 0);
  }, [divisions, freeAt, ship.division, subtotal, disc]);
  const shipping = shipCost === '' ? autoShip : Math.max(0, Number(shipCost) || 0);
  const grand = Math.round((subtotal - disc + shipping) * 100) / 100;
  const isMobile = MOBILE.includes(pay.method);

  const save = async () => {
    if (!cust.name.trim()) { mo.openOnly(['customer']); return toast(tr('Customer name is required'), 'err'); }
    const digits = cust.phone.replace(/\D/g, '').replace(/^880/, '0');
    if (!/^01[3-9]\d{8}$/.test(digits)) { mo.openOnly(['customer']); return toast(tr('Valid BD phone required (e.g. 01712345678)'), 'err'); }
    if (!ship.address.trim() || !ship.city.trim()) { mo.openOnly(['shipping']); return toast(tr('Shipping address and city are required'), 'err'); }
    if (!items.length) { mo.openOnly(['items']); return toast(tr('Add at least one product'), 'err'); }
    for (const i of items) {
      if (!Number.isInteger(+i.qty) || +i.qty < 1) { mo.openOnly(['items']); return toast(tr('Qty must be ≥ 1 for {name}', { name: i.name }), 'err'); }
      /* edit mode: the order's own qty is already deducted from stock — allow re-using it */
      if (+i.qty > i.stock + (isEdit ? i._origQty || 0 : 0)) {
        mo.openOnly(['items']);
        return toast(tr('{name}: only {avail} available ({stock} in stock{extra})', { name: i.name, avail: i.stock + (isEdit ? i._origQty || 0 : 0), stock: i.stock, extra: isEdit ? tr(' + {n} from this order', { n: i._origQty || 0 }) : '' }), 'err');
      }
      if (!(+i.price >= 0)) { mo.openOnly(['items']); return toast(tr('Invalid price for {name}', { name: i.name }), 'err'); }
      if (isEdit && i._missing) { mo.openOnly(['items']); return toast(tr('{name} was deleted from the catalog — remove the line first', { name: i.name }), 'err'); }
    }
    if (isMobile && pay.trxId.trim()) {
      const tx = pay.trxId.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (tx.length < 6 || tx.length > 12) { mo.openOnly(['payment']); return toast(tr('TrxID must be 6-12 letters/digits (or leave empty)'), 'err'); }
    }
    setBusy(true);
    try {
      const body = {
        customer: { name: cust.name.trim(), phone: digits, email: cust.email.trim() },
        shipping: { address: ship.address.trim(), city: ship.city.trim(), division: ship.division, postal: ship.postal.trim(), notes: ship.notes.trim() },
        items: items.map((i) => ({
          productId: i.productId, qty: +i.qty, price: +i.price,
          ...(i.size ? { size: i.size } : {}), ...(i.color ? { color: i.color } : {}),
        })),
        ...(discount !== '' ? { discount: +discount } : {}),
        ...(shipCost !== '' ? { shippingCost: +shipCost } : {}),
        paymentMethod: pay.method, paid: pay.paid,
        channel: pay.channel,
        /* edit mode always sends trxId/senderNumber so clearing the field clears it on the order */
        ...(isEdit || pay.trxId.trim() ? { trxId: pay.trxId.trim() } : {}),
        ...(isEdit || pay.senderNumber.trim() ? { senderNumber: pay.senderNumber.trim() } : {}),
        ...(pay.note.trim() ? { note: pay.note.trim() } : {}),
      };
      const d = isEdit ? await updateManual(order._id, body) : await createManual(body);
      toast(isEdit
        ? tr('✓ Order {num} updated — now {amt}', { num: d.order.orderNumber, amt: money(d.order.totals.grandTotal) })
        : tr('✓ Manual order {num} created — {amt}', { num: d.order.orderNumber, amt: money(d.order.totals.grandTotal) }), 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message || String(e), 'err'); }
    setBusy(false);
  };

  return (
    <>
      <h2 className="mb-1 text-[19px]">{isEdit ? tr('Edit Manual Order — {num}', { num: order.orderNumber }) : tr('Manual Order Entry')}</h2>
      <p className="mb-4 text-[12px] text-dim2">
        {isEdit
          ? <>ভুল এন্ট্রি সংশোধন করুন — items, দাম, ঠিকানা, payment সব বদলানো যাবে। Stock অটো রিকনসাইল হবে, payment status না বদলালে অপরিবর্তিত থাকবে।</>
          : <>WhatsApp / phone-এ আসা অর্ডার এখানে এন্ট্রি দিন — dashboard-এর orders, revenue ও সব হিসাব অটো আপডেট হবে।</>}
      </p>
      {isEdit ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel2/40 px-3 py-2 text-[11.5px] text-dim2">
          Current: <b className="text-txt">{order.status}</b> · payment <b className="text-txt">{order.payment?.status}</b> · {tr('Placed {date}', { date: new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) })}
        </p>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] text-dim2">{tr('5 sections · validation opens the problem section automatically')}</span>
        <AccBulkButtons ids={MO_SECTIONS} acc={mo} prefix="mo" />
      </div>

      {/* ---------- customer ---------- */}
      <AccSection id="customer" icon="👤" title={tr('Customer')} open={mo.isOpen('customer')} onToggle={() => mo.toggle('customer')}
        chips={<>
          <AccChip text={cust.name.trim() ? '✓ ' + cust.name.trim().slice(0, 14) : '— name'} tone={cust.name.trim() ? 'green' : 'red'} />
          <AccChip text={/^[0-9+\- ]{9,}$/.test(cust.phone.trim()) ? '✓ phone' : '— phone'} tone={/^[0-9+\- ]{9,}$/.test(cust.phone.trim()) ? 'green' : 'red'} />
        </>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label>{tr('Name *')}</label>
            <input value={cust.name} onChange={(e) => setCust((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Rakib Hasan" />
          </div>
          <div>
            <label>{tr('Phone *')}</label>
            <input value={cust.phone} onChange={(e) => setCust((c) => ({ ...c, phone: e.target.value }))} placeholder="01712345678" inputMode="tel" />
          </div>
          <div>
            <label>{tr('Email (optional)')}</label>
            <input value={cust.email} onChange={(e) => setCust((c) => ({ ...c, email: e.target.value }))} placeholder="optional" />
          </div>
        </div>
      </AccSection>

      {/* ---------- shipping ---------- */}
      <AccSection id="shipping" icon="🚚" title={tr('Shipping')} open={mo.isOpen('shipping')} onToggle={() => mo.toggle('shipping')}
        chips={<>
          <AccChip text={ship.city.trim() ? '✓ ' + ship.city.trim().slice(0, 12) : '— city'} tone={ship.city.trim() ? 'green' : 'red'} />
          <AccChip text={(ship.division || '').toUpperCase()} tone="acc" />
        </>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label>{tr('Address *')}</label>
            <input value={ship.address} onChange={(e) => setShip((s) => ({ ...s, address: e.target.value }))} placeholder="House / road / area" />
          </div>
          <div>
            <label>{tr('City *')}</label>
            <input value={ship.city} onChange={(e) => setShip((s) => ({ ...s, city: e.target.value }))} placeholder="e.g. Dhaka" />
          </div>
          <div>
            <label>{tr('Division *')}</label>
            <select value={ship.division} onChange={(e) => setShip((s) => ({ ...s, division: e.target.value }))}>
              {Object.entries(divisions).map(([k, v]) => <option key={k} value={k}>{k} — delivery ৳{v}</option>)}
              {!Object.keys(divisions).length ? <option value="dhaka">dhaka</option> : null}
            </select>
          </div>
          <div>
            <label>{tr('Postal (optional)')}</label>
            <input value={ship.postal} onChange={(e) => setShip((s) => ({ ...s, postal: e.target.value }))} placeholder="1213" />
          </div>
          <div>
            <label>{tr('Note (optional)')}</label>
            <input value={ship.notes} onChange={(e) => setShip((s) => ({ ...s, notes: e.target.value }))} placeholder="landmark / instruction" />
          </div>
        </div>
      </AccSection>

      {/* ---------- items ---------- */}
      <AccSection id="items" icon="🛒" title={tr('Items')} open={mo.isOpen('items')} onToggle={() => mo.toggle('items')}
        chips={<>
          <AccChip text={items.length + ' LINE' + (items.length === 1 ? '' : 'S')} tone={items.length ? 'green' : 'red'} />
          {items.length ? <AccChip text={'SUB ৳' + subtotal.toLocaleString('en-IN')} tone="acc" /> : null}
        </>}>
        <div ref={boxRef} className="relative mb-3">
          <label>{tr('Search product')}</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => results.length && setShowResults(true)}
            placeholder={tr('type product name…')}
            autoComplete="off"
          />
          {showResults && results.length ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-[10px] border border-line2 bg-panel shadow-2xl">
              {results.map((p) => (
                <button
                  type="button"
                  key={p._id}
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-white/[.04]"
                >
                  <img src={p.images?.[0]?.url || ''} alt="" className="h-9 w-9 rounded-md bg-panel2 object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{p.name}</span>
                    <span className="block text-[11px] text-dim2">{tr('stock {n}', { n: p.stock })} · {money(p.price)}</span>
                  </span>
                  <span className="text-acc">{tr('+ add')}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {items.length ? (
          <div className="space-y-2.5">
            {items.map((i, ix) => (
              <div key={i.productId} className="rounded-[10px] border border-line2 bg-panel p-2.5" data-moline={ix}>
                <div className="mb-2 flex items-center gap-2.5">
                  <img src={i.image} alt="" className="h-10 w-10 rounded-md bg-panel2 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{i.name}</div>
                    <div className="text-[11px] text-dim2">{tr('stock {n}', { n: i.stock })} · {tr('line {amt}', { amt: money((Number(i.price) || 0) * (Number(i.qty) || 0)) })}</div>
                  </div>
                  <button type="button" className="text-red transition-opacity hover:opacity-70" onClick={() => removeLine(ix)} title={tr('Remove')}>✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label>{tr('Qty')}</label>
                    <input type="number" min="1" max="999" value={i.qty} onChange={(e) => setLine(ix, 'qty', e.target.value === '' ? '' : Math.max(1, Math.floor(+e.target.value || 1)))} />
                  </div>
                  <div>
                    <label>{tr('Unit price ৳')}</label>
                    <input type="number" min="0" value={i.price} onChange={(e) => setLine(ix, 'price', e.target.value === '' ? '' : Math.max(0, +e.target.value || 0))} />
                  </div>
                  <div>
                    <label>{tr('Size')}</label>
                    {i.sizeOpts.length ? (
                      <select value={i.size} onChange={(e) => pickSize(ix, e.target.value)}>
                        <option value="">—</option>
                        {i.sizeOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input value={i.size} onChange={(e) => setLine(ix, 'size', e.target.value)} placeholder="free size" disabled />
                    )}
                  </div>
                  <div>
                    <label>{tr('Color')}</label>
                    <input value={i.color} onChange={(e) => setLine(ix, 'color', e.target.value)} placeholder="optional" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[10px] border border-dashed border-line2 px-4 py-5 text-center text-[12.5px] text-dim2">
            {tr('No items yet — search a product above to add it.')}
          </p>
        )}
      </AccSection>

      {/* ---------- pricing adjustments ---------- */}
      <AccSection id="adjustments" icon="⚖" title={tr('Adjustments')} open={mo.isOpen('adjustments')} onToggle={() => mo.toggle('adjustments')}
        chips={<>
          {disc > 0 ? <AccChip text={'−৳' + disc.toLocaleString('en-IN')} tone="green" /> : null}
          <AccChip text={shipCost === '' ? 'SHIP AUTO ৳' + autoShip : 'SHIP ৳' + (+shipCost || 0)} tone="acc" />
          <AccChip text={'TOTAL ৳' + grand.toLocaleString('en-IN')} tone="green" />
        </>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label>{tr('Discount ৳ (optional)')}</label>
            <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value === '' ? '' : Math.max(0, +e.target.value || 0))} placeholder="0" />
          </div>
          <div>
            <label>{tr('Shipping ৳ — empty = auto')}</label>
            <input type="number" min="0" value={shipCost} onChange={(e) => setShipCost(e.target.value === '' ? '' : Math.max(0, +e.target.value || 0))} placeholder={'auto ৳' + autoShip} />
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-panel px-3.5 py-3 text-[13px]">
          <div className="flex justify-between py-0.5 text-dim"><span>{tr('Subtotal ({n} line{s})', { n: items.length, s: items.length === 1 ? '' : 's' })}</span><span>{money(subtotal)}</span></div>
          {disc > 0 ? <div className="flex justify-between py-0.5 text-green"><span>{tr('Discount')}</span><span>−{money(disc)}</span></div> : null}
          <div className="flex justify-between py-0.5 text-dim"><span>{tr('Shipping ({x})', { x: ship.division + (shipping === 0 ? ' · ' + tr('FREE') : '') })}</span><span>{shipping === 0 ? tr('FREE') : money(shipping)}</span></div>
          <div className="mt-1.5 flex justify-between border-t border-line2 pt-2 font-extrabold"><span>{tr('Grand Total')}</span><span className="font-disp text-[18px] text-acc">{money(grand)}</span></div>
        </div>
      </AccSection>

      {/* ---------- payment ---------- */}
      <AccSection id="payment" icon="💳" title={tr('Payment')} open={mo.isOpen('payment')} onToggle={() => mo.toggle('payment')}
        chips={<>
          <AccChip text={pay.channel.toUpperCase()} tone="dim" />
          <AccChip text={pay.method.toUpperCase()} tone="acc" />
          <AccChip text={pay.paid ? 'PAID ✓' : 'UNPAID'} tone={pay.paid ? 'green' : 'red'} />
        </>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label>{tr('Received via')}</label>
            <select value={pay.channel} onChange={(e) => setPay((p) => ({ ...p, channel: e.target.value }))}>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>{tr('Method')}</label>
            <select value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))}>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>{tr('Payment state')}</label>
            <select value={pay.paid ? 'paid' : 'unpaid'} onChange={(e) => setPay((p) => ({ ...p, paid: e.target.value === 'paid' }))}>
              <option value="unpaid">{isMobile ? tr('Unpaid — verify TrxID later') : tr('Unpaid (collect on delivery/pickup)')}</option>
              <option value="paid">{tr('Paid ✓ (money already received)')}</option>
            </select>
          </div>
          {isMobile ? (
            <>
              <div>
                <label>{tr('TrxID (optional now)')}</label>
                <input value={pay.trxId} onChange={(e) => setPay((p) => ({ ...p, trxId: e.target.value.toUpperCase() }))} placeholder="e.g. 9HX2K8A1" className="font-mono" maxLength={14} />
              </div>
              <div>
                <label>{tr('Sender number')}</label>
                <input value={pay.senderNumber} onChange={(e) => setPay((p) => ({ ...p, senderNumber: e.target.value }))} placeholder="01XXXXXXXXX" />
              </div>
            </>
          ) : null}
          <div className={isMobile ? 'sm:col-span-1' : 'sm:col-span-3'}>
            <label>{tr('Order note')}</label>
            <input value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. confirmed on WhatsApp at 9:40pm" />
          </div>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-dim2">
          {isEdit
            ? (pay.paid
              ? tr('Marked paid — a verified payment stays verified unless you change the method or state here.')
              : tr('Marked unpaid — the current payment status is kept unless you change the method or state above.'))
            : (pay.paid
              ? tr('Paid orders start at "processing" — payment recorded instantly.')
              : isMobile
                ? tr('Unpaid mobile orders start at "verifying" — verify from Orders → TrxID check later.')
                : tr('COD/cash orders start at "processing" — mark collected on delivery.'))}
          {' '}{isEdit ? tr('Stock is reconciled by the difference — no double counting.') : tr('Stock is deducted immediately, same as online orders.')}
        </p>
      </AccSection>

      <div className="flex justify-end gap-2.5 border-t border-line pt-4">
        <button type="button" className="rounded-lg border border-line2 px-3.5 py-2 text-[11.5px] font-bold uppercase tracking-[.08em] text-txt transition-colors hover:border-acc hover:text-acc" onClick={closeModal} disabled={busy}>{tr('Cancel')}</button>
        <button
          type="button"
          className="rounded-lg bg-acc px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-white transition-colors hover:bg-acc-hi disabled:opacity-50"
          onClick={save}
          disabled={busy || !items.length}
        >
          {busy ? tr('Saving…') : isEdit ? tr('Save Changes — {amt}', { amt: money(grand) }) : tr('Create Order — {amt}', { amt: money(grand) })}
        </button>
      </div>
    </>
  );
}
