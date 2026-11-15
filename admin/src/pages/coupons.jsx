/* ArixGear ADMIN page — Coupons (Task 29).
   Hardened form (percent ≤100, code rules, per-user limit, first-order-only,
   public visibility, category/product scoping) · search + status filter ·
   expiring/expired chips · CSV export · bulk campaign-code generator ·
   per-coupon analytics modal. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { money, day } from '../lib/admin.js';
import { download } from '../services/http.js';
import { list as listCoupons, create as createCoupon, update as updateCoupon, remove as removeCoupon, bulkGenerate, analytics, couponAnalytics } from '../services/coupons.js';
import { AccSection, AccChip, useAccordion, AccBulkButtons } from '../components/Accordion.jsx';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4';

function Toggle({ on, onClick }) {
  return (
    <button type="button" aria-pressed={on} title={on ? 'Active' : 'Disabled'} onClick={onClick}
      className={'relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors ' + (on ? 'bg-acc' : 'bg-line2')}>
      <span className={'absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all ' + (on ? 'left-[20px] bg-white' : 'left-[3px] bg-[#888]')} />
    </button>
  );
}

/* ---------- per-coupon analytics modal ---------- */
function CouponAnalytics({ coupon, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState(null);
  useEffect(() => { couponAnalytics(coupon._id).then(setD).catch((e) => toast(e.message, 'err')); }, [coupon._id, toast]);

  const maxOrders = d && d.byDay && d.byDay.length ? Math.max(...d.byDay.map((x) => x.orders)) : 0;
  return (
    <>
      <h2 className="mb-4 text-[17px]">Analytics — {coupon.code}</h2>
      {!d ? <p className="text-[13px] text-dim2">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-line2 p-3"><p className="text-[11px] uppercase text-dim2">Orders</p><p className="text-xl font-extrabold">{d.totals.orders}</p></div>
            <div className="rounded-lg border border-line2 p-3"><p className="text-[11px] uppercase text-dim2">Discount given</p><p className="text-xl font-extrabold text-acc">{money(d.totals.discount)}</p></div>
            <div className="rounded-lg border border-line2 p-3"><p className="text-[11px] uppercase text-dim2">Revenue</p><p className="text-xl font-extrabold">{money(d.totals.revenue)}</p></div>
            <div className="rounded-lg border border-line2 p-3"><p className="text-[11px] uppercase text-dim2">Customers</p><p className="text-xl font-extrabold">{d.totals.customers}</p></div>
          </div>
          <p className="mt-4 text-[12px] uppercase tracking-[.08em] text-dim2">Last 30 days{d.totals.orders ? ' · AOV ' + money(d.totals.aov) : ''}</p>
          <div className="mt-2 flex h-24 items-end gap-1" data-coupon-bars>
            {(d.byDay || []).length ? d.byDay.map((x) => (
              <div key={x._id} title={x._id + ' — ' + x.orders + ' orders'} className="flex-1 rounded-t bg-acc/70" style={{ height: Math.max(6, Math.round((x.orders / maxOrders) * 100)) + '%' }} />
            )) : <p className="text-[12.5px] text-dim2">No redemptions in the last 30 days.</p>}
          </div>
        </>
      )}
      <div className="mt-5 flex justify-end"><button className={GHOST_BTN} onClick={onDone}>Close</button></div>
    </>
  );
}

/* ---------- bulk campaign-code generator modal ---------- */
function BulkGenerateForm({ onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const [prefix, setPrefix] = useState('ARIX'); // Step 2 audit fix — forge-era default
  const [count, setCount] = useState(10);
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [minOrder, setMinOrder] = useState(0);
  const [maxUses, setMaxUses] = useState(0);
  const [perUser, setPerUser] = useState(1);
  const [expires, setExpires] = useState('');
  const [pub, setPub] = useState(false);
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (value === '') return toast('Discount value required', 'err');
    setBusy(true);
    try {
      const d = await bulkGenerate({
        count: Number(count), prefix, type, value: Number(value),
        minOrder: Number(minOrder) || 0, maxUses: Number(maxUses) || 0,
        perUser: Number(perUser) || 0,
        expiresAt: expires ? new Date(expires).toISOString() : null,
        public: pub, description: 'Campaign code',
      });
      setCodes(d.codes || []);
      toast(d.created + ' codes generated', 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <h2 className="mb-4 text-[17px]">Bulk-generate campaign codes</h2>
      {!codes ? (
        <>
          <div className={FRM}>
            <div><label>Prefix</label><input id="bgPrefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="ARIX10" /></div>
            <div><label>How many (1–100)</label><input id="bgCount" type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} /></div>
            <div>
              <label>Type</label>
              <select id="bgType" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="percent">percent (%)</option>
                <option value="fixed">fixed (৳ BDT)</option>
              </select>
            </div>
            <div><label>Value *</label><input id="bgValue" type="number" min="0" step="1" value={value} onChange={(e) => setValue(Math.max(0, e.target.value))} /></div>
            <div><label>Min order (৳)</label><input id="bgMin" type="number" min="0" value={minOrder} onChange={(e) => setMinOrder(Math.max(0, e.target.value))} /></div>
            <div><label>Max uses total (0 = ∞)</label><input id="bgMax" type="number" min="0" value={maxUses} onChange={(e) => setMaxUses(Math.max(0, e.target.value))} /></div>
            <div><label>Per customer (0 = ∞)</label><input id="bgPer" type="number" min="0" value={perUser} onChange={(e) => setPerUser(Math.max(0, e.target.value))} /></div>
            <div><label>Expires</label><input id="bgExp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px] text-dim">
            <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="h-4 w-4" /> Show in storefront coupon picker
          </label>
          <div className="mt-5 flex justify-end gap-2.5">
            <button className={GHOST_BTN} onClick={closeModal}>Cancel</button>
            <button id="bgGo" className={ACC_BTN} disabled={busy} onClick={generate}>{busy ? 'Generating…' : 'Generate'}</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-dim">{codes.length} unique codes ready:</p>
          <textarea readOnly rows={8} value={codes.join('\n')} className="mt-2 w-full font-mono text-[12.5px]" data-generated-codes />
          <div className="mt-3 flex justify-end gap-2.5">
            <button className={GHOST_BTN} onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy all</button>
            <button className={ACC_BTN} onClick={closeModal}>Done</button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- create / edit coupon modal ---------- */
function CouponForm({ c, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !c;
  const [code, setCode] = useState(c?.code || '');
  const [type, setType] = useState(c?.type || 'percent');
  const [value, setValue] = useState(c?.value ?? '');
  const [minOrder, setMinOrder] = useState(c?.minOrder ?? 0);
  const [maxUses, setMaxUses] = useState(c?.maxUses ?? 0);
  const [perUser, setPerUser] = useState(c?.perUser ?? 0);
  const [firstOrderOnly, setFirstOrderOnly] = useState(!!c?.firstOrderOnly);
  const [pub, setPub] = useState(!!c?.public);
  const [description, setDescription] = useState(c?.description || '');
  const [descriptionBn, setDescriptionBn] = useState(c?.descriptionBn || ''); // Task 58
  const [scopeMode, setScopeMode] = useState(c?.appliesTo?.mode || 'all');
  const [scopeCats, setScopeCats] = useState((c?.appliesTo?.categories || []).join(', '));
  const [scopeProds, setScopeProds] = useState((c?.appliesTo?.products || []).join(', '));
  const [expires, setExpires] = useState(c?.expiresAt ? String(c.expiresAt).slice(0, 10) : '');
  const [busy, setBusy] = useState(false);

  /* Task 34 — 4 accordion sections + validation auto-open */
  const CF_SECTIONS = ['basic', 'rules', 'scope', 'storefront'];
  const acc = useAccordion(['basic']);

  const save = async () => {
    if (!code.trim() || value === '') {
      acc.openOnly(['basic']);
      return toast('Code and value required', 'err');
    }
    /* Step 2 audit fix — the form comment claimed a hardened percent check but
       none existed client-side; percent >100 silently became 100%-off */
    if (type === 'percent' && Number(value) > 100) {
      acc.openOnly(['basic']);
      return toast('Percent discount cannot exceed 100', 'err');
    }
    const body = {
      code: code.trim().toUpperCase(),
      type,
      value: +value,
      minOrder: +minOrder || 0,
      maxUses: +maxUses || 0,
      perUser: +perUser || 0,
      firstOrderOnly,
      public: pub,
      description: description.trim(),
      descriptionBn: descriptionBn.trim(), // Task 58
      appliesTo: {
        mode: scopeMode,
        categories: scopeMode === 'categories' ? scopeCats.split(',').map((s) => s.trim()).filter(Boolean) : [],
        products: scopeMode === 'products' ? scopeProds.split(',').map((s) => s.trim()).filter(Boolean) : [],
      },
      expiresAt: expires ? new Date(expires).toISOString() : null,
    };
    setBusy(true);
    try {
      if (isNew) await createCoupon(body);
      else await updateCoupon(c._id, body);
      toast(isNew ? 'Coupon created' : 'Coupon saved', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px]">{isNew ? 'New Coupon' : 'Edit — ' + (c.code || '')}</h2>
        <AccBulkButtons ids={CF_SECTIONS} acc={acc} prefix="cf" />
      </div>
      <div className="space-y-2.5">
        <AccSection id="basic" icon="🏷" title="Basic" open={acc.isOpen('basic')} onToggle={() => acc.toggle('basic')}
          chips={<>
            <AccChip text={code.trim() ? '✓ ' + code.trim().toUpperCase() : '— code'} tone={code.trim() ? 'green' : 'red'} />
            <AccChip text={type === 'percent' ? '-' + (value || 0) + '%' : '-' + money(value || 0)} tone="acc" />
          </>}>
          <div className={FRM}>
            <div><label>Code *</label><input id="cfCode" className="uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ARIX10" /></div>
            <div>
              <label>Type</label>
              <select id="cfType" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="percent">percent (%)</option>
                <option value="fixed">fixed (৳ BDT)</option>
              </select>
            </div>
            <div><label>Value * {type === 'percent' ? '(1–100)' : '(৳ BDT)'}</label><input id="cfValue" type="number" min="0" step="1" value={value} onChange={(e) => setValue(Math.max(0, e.target.value))} /></div>
          </div>
        </AccSection>

        <AccSection id="rules" icon="💰" title="Rules & Limits" open={acc.isOpen('rules')} onToggle={() => acc.toggle('rules')}
          chips={<>
            {minOrder > 0 ? <AccChip text={'min ' + money(minOrder)} tone="acc" /> : null}
            <AccChip text={maxUses > 0 ? 'max ' + maxUses : '∞ uses'} />
            <AccChip text={perUser > 0 ? perUser + '/user' : '∞/user'} />
            {expires ? <AccChip text={'→ ' + expires} tone="dim" /> : null}
          </>}>
          <div className={FRM}>
            <div><label>Min order (৳ BDT)</label><input id="cfMin" type="number" min="0" step="1" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></div>
            <div><label>Max uses (0 = ∞)</label><input id="cfMax" type="number" min="0" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></div>
            <div><label>Per customer (0 = ∞)</label><input id="cfPerUser" type="number" min="0" value={perUser} onChange={(e) => setPerUser(e.target.value)} /></div>
            <div><label>Expires</label><input id="cfExp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px] text-dim"><input id="cfFirst" type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirstOrderOnly(e.target.checked)} className="h-4 w-4" /> First order only</label>
        </AccSection>

        <AccSection id="scope" icon="🎯" title="Scope" open={acc.isOpen('scope')} onToggle={() => acc.toggle('scope')}
          chips={<AccChip text={scopeMode === 'all' ? 'ALL PRODUCTS' : scopeMode === 'categories' ? (scopeCats.split(',').filter((s) => s.trim()).length + ' CATS') : (scopeProds.split(',').filter((s) => s.trim()).length + ' PRODUCTS')} tone={scopeMode === 'all' ? 'dim' : 'acc'} />}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label>Applies to</label>
              <select id="cfScope" value={scopeMode} onChange={(e) => setScopeMode(e.target.value)}>
                <option value="all">All products</option>
                <option value="categories">Selected categories</option>
                <option value="products">Selected products</option>
              </select>
            </div>
            {scopeMode === 'categories' ? <div className="md:col-span-2"><label>Categories (comma-separated, e.g. laptops, monitors)</label><input id="cfCats" value={scopeCats} onChange={(e) => setScopeCats(e.target.value)} /></div> : null}
            {scopeMode === 'products' ? <div className="md:col-span-2"><label>Product slugs (comma-separated)</label><input id="cfProds" value={scopeProds} onChange={(e) => setScopeProds(e.target.value)} /></div> : null}
          </div>
          <p className="mt-3 text-[11.5px] text-dim2">Scoped coupons discount ONLY the eligible items — other items pay full price. Minimum order still uses the full cart.</p>
        </AccSection>

        <AccSection id="storefront" icon="📣" title="Storefront Visibility" open={acc.isOpen('storefront')} onToggle={() => acc.toggle('storefront')}
          chips={<>
            <AccChip text={pub ? 'PUBLIC' : 'PICKER HIDDEN'} tone={pub ? 'green' : 'dim'} />
            {description.trim() ? <AccChip text={'✓ desc'} tone="green" /> : null}
          </>}>
          <div className={FRM}>
            <div className="md:col-span-2"><label>Description (storefront)</label><input id="cfDesc" maxLength={140} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Eid drop — 10% everything" /></div>
            <div className="md:col-span-2"><label>বিবরণ (বাংলা)</label><input id="cfDescBn" maxLength={140} value={descriptionBn} onChange={(e) => setDescriptionBn(e.target.value)} placeholder="ঈদ ড্রপ — সব পণ্যে ১০% ছাড়" /></div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px] text-dim"><input id="cfPublic" type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="h-4 w-4" /> Show in storefront picker</label>
        </AccSection>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
        <button id="cfCancel" className={GHOST_BTN} onClick={closeModal}>Cancel</button>
        <button id="cfSave" className={ACC_BTN} disabled={busy} onClick={save}>{isNew ? 'Create' : 'Save'}</button>
      </div>
    </>
  );
}

/* ---------- coupons table ---------- */
function CouponsPage() {
  const confirm = useConfirm(); // Step 2 audit fix — confirm() was declared in a sibling component; every delete click crashed
  const toast = useToast();
  const { openModal } = useModal();
  const [items, setItems] = useState(null); /* null = loading */
  const [error, setError] = useState('');
  const [qLive, setQLive] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const load = useCallback(async () => {
    try {
      const d = await listCoupons({ q, status });
      setItems(d.items || []);
      setError('');
    } catch (e) { setError(e.message); }
  }, [q, status]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { const t = setTimeout(() => setQ(qLive), 450); return () => clearTimeout(t); }, [qLive]);

  const toggle = async (c) => {
    try {
      await updateCoupon(c._id, { active: !c.active });
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const del = async (c) => {
    if (!(await confirm({ title: 'Delete coupon', body: 'Delete coupon ' + c.code + '? Orders already using it keep their discount.', danger: true, ok: 'Delete' }))) return;
    try {
      await removeCoupon(c._id);
      toast('Coupon deleted', 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  if (error) {
    return (
      <div className={CARD}>
        <div className="text-[13px] text-red">Failed to load coupons — {error}</div>
        <button className={GHOST_BTN + ' mt-3'} onClick={load}>Retry</button>
      </div>
    );
  }
  if (!items) return <div className={CARD}>Loading…</div>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">{items.length} coupons</span>
        <input id="cSearch" value={qLive} onChange={(e) => setQLive(e.target.value)} placeholder="Search code / description…"
          className="w-52 rounded-lg border border-line2 bg-transparent px-3 py-1.5 text-[12.5px] outline-none placeholder:text-dim2 focus:border-acc" />
        <select id="cStatus" value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expiring">Expiring ≤7d</option>
          <option value="expired">Expired</option>
        </select>
        <div className="flex-1" />
        <button id="cExport" className={GHOST_BTN} onClick={() => download('/admin/coupons/export.csv', 'arixgear-coupons.csv')}>⬇ Export CSV</button>
        <button id="cBulk" className={GHOST_BTN} onClick={() => openModal(<BulkGenerateForm onDone={load} />)}>⚡ Bulk generate</button>
        <button id="cNew" className={ACC_BTN} onClick={() => openModal(<CouponForm onDone={load} />)}>+ New Coupon</button>
      </div>
      <div className="tbl-wrap overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[.08em] text-dim2">
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">Discount</th>
              <th className="px-3 py-2.5">Min Order</th>
              <th className="px-3 py-2.5">Used</th>
              <th className="px-3 py-2.5">Per User</th>
              <th className="px-3 py-2.5">Scope</th>
              <th className="px-3 py-2.5">Expires</th>
              <th className="px-3 py-2.5">Flags</th>
              <th className="px-3 py-2.5">Active</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c._id} className="border-b border-line hover:bg-panel2">
                <td className="px-3 py-2.5">
                  <span className="font-extrabold tracking-[.08em]">{c.code}</span>
                  {c.description ? <p className="text-[11px] text-dim2">{c.description}</p> : null}
                </td>
                <td className="px-3 py-2.5 text-acc">{c.type === 'percent' ? c.value + '%' : money(c.value)}</td>
                <td className="px-3 py-2.5">{c.minOrder ? money(c.minOrder) : '—'}</td>
                <td className="px-3 py-2.5">{c.usedCount}{c.maxUses ? '/' + c.maxUses : ''}</td>
                <td className="px-3 py-2.5">{c.perUser || '∞'}</td>
                <td className="px-3 py-2.5">
                  {c.appliesTo && c.appliesTo.mode !== 'all'
                    ? <span className={CHIP + ' border-acc/40 text-acc'}>{c.appliesTo.mode === 'products' ? (c.appliesTo.products || []).length + ' products' : (c.appliesTo.categories || []).length + ' cats'}</span>
                    : <span className="text-dim2">all</span>}
                </td>
                <td className="px-3 py-2.5">
                  {c.expiresAt ? day(c.expiresAt) : '—'}
                  {c.isExpiringSoon ? <span className={CHIP + ' ml-1.5 border-yellow/40 text-yellow'}>soon</span> : null}
                  {c.isExpired ? <span className={CHIP + ' ml-1.5 border-red/40 text-red'}>expired</span> : null}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {c.public ? <span className={CHIP + ' border-green/40 text-green'}>public</span> : null}
                    {c.firstOrderOnly ? <span className={CHIP + ' border-blue/40 text-blue'}>1st order</span> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5"><Toggle on={c.active} onClick={() => toggle(c)} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-2">
                    <button className={GHOST_BTN} onClick={() => openModal(<CouponAnalytics coupon={c} onDone={() => {}} />)}>📊</button>
                    <button className={GHOST_BTN} onClick={() => openModal(<CouponForm c={c} onDone={load} />)}>Edit</button>
                    <button className={RED_BTN} title="Delete coupon" onClick={() => del(c)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length ? <tr><td colSpan={10} className="px-3 py-6 text-center text-dim2">No coupons match</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="coupons" title="Coupons">
        <CouponsPage />
      </AdminShell>
    </OverlayProvider>
  );
}
