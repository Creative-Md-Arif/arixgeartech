/* ArixGear ADMIN page — Centralized Deals & Promotions Manager (Phase 8)
   /admin/deals · ONE module for every campaign type: 11.11, 12.12, flash,
   mega, daily, seasonal, brand, combo, BOGO, clearance, custom — plus
   whatever lands in the backend TYPES registry next (the type picker,
   form fields and validation contract all render from GET /admin/deals/meta,
   so a new deal type needs ZERO admin-side changes).

   State model (computed server-side, no cron):
     draft (unpublished) → published → scheduled → active → expired,
     with the pause switch at any point. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { money } from '../lib/admin.js';
import { CARD, ACC_BTN, GHOST_BTN, RED_BTN, CHIP, LBL, Toggle, Empty, useConfirm } from '../components/ui.jsx';
import { list, meta, stats, create, update, setState, remove } from '../services/deals.js';

const dtLocal = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

const STATUS_CHIP = {
  active: 'border-green/40 text-green', scheduled: 'border-blue/40 text-blue',
  paused: 'border-orange/40 text-orange', expired: 'border-line2 text-dim2',
  draft: 'border-dim2 text-dim2',
};

/* ---------- form ---------- */
function DealForm({ deal, meta: m, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !deal;
  const [name, setName] = useState(deal?.name || '');
  const [nameBn, setNameBn] = useState(deal?.nameBn || '');
  const [type, setType] = useState(deal?.type || 'campaign');
  const [description, setDescription] = useState(deal?.description || '');
  const [badge, setBadge] = useState(deal?.badge || '');
  const [startsAt, setStartsAt] = useState(dtLocal(deal?.startsAt) || dtLocal(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(dtLocal(deal?.endsAt) || '');
  const [kind, setKind] = useState(deal?.discount?.kind || 'percentage');
  const [value, setValue] = useState(deal?.discount?.value ?? 10);
  const [maxOff, setMaxOff] = useState(deal?.discount?.maxOff || 0);
  const [buyQty, setBuyQty] = useState(deal?.bogo?.buyQty || 2);
  const [getQty, setGetQty] = useState(deal?.bogo?.getQty || 1);
  const [bundleSlug, setBundleSlug] = useState(deal?.bundleSlug || '');
  const [scopeKind, setScopeKind] = useState(deal?.scope?.kind || 'categories');
  const [cats, setCats] = useState(deal?.scope?.categories || []);
  const [brands, setBrands] = useState(deal?.scope?.brands || []);
  const [prods, setProds] = useState(deal?.scope?.products || []);
  const [prodQ, setProdQ] = useState('');
  const [priority, setPriority] = useState(deal?.priority ?? 100);
  const [usageLimit, setUsageLimit] = useState(deal?.usageLimit || 0);
  const [minOrder, setMinOrder] = useState(deal?.minOrder || 0);
  const [featured, setFeatured] = useState(!!deal?.featured);
  const [publishNow, setPublishNow] = useState(isNew ? false : !!deal?.published);
  const [busy, setBusy] = useState(false);

  const typeSpec = useMemo(() => (m.types || []).find((t) => t.key === type), [m.types, type]);
  const moneyKinds = typeSpec ? typeSpec.kinds.includes('percentage') : true;
  const isBogo = type === 'bogo';
  const isCombo = type === 'combo';
  const requiredScope = typeSpec?.requiresScope || null;

  useEffect(() => {
    if (requiredScope) setScopeKind(requiredScope);
    else if (!requiredScope && scopeKind === 'brands' && type === 'campaign') setScopeKind('categories');
  }, [requiredScope, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const catLeaves = useMemo(() => (m.categories || []).map((c) => ({ ...c, depth: (c.path || []).length })), [m.categories]);

  const scopeValid =
    (scopeKind === 'all') ||
    (scopeKind === 'categories' && cats.length > 0) ||
    (scopeKind === 'brands' && brands.length > 0) ||
    (scopeKind === 'products' && prods.length > 0);

  const valid = name.trim() && startsAt && endsAt && scopeValid &&
    (isCombo ? !!bundleSlug : isBogo ? (+buyQty >= 1 && +getQty >= 1) : (+value > 0 && (kind !== 'percentage' || +value <= 100)));

  const save = async () => {
    if (!valid) return toast('Name, window, discount/BOGO/bundle and scope are required', 'err');
    setBusy(true);
    try {
      const body = {
        name: name.trim(), nameBn: nameBn.trim(), type,
        description: description.trim(), badge: badge.trim(),
        window: { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() },
        discount: isCombo || isBogo ? { kind: 'percentage', value: 0, maxOff: 0 } : { kind, value: +value, maxOff: +maxOff || 0 },
        bogo: { buyQty: +buyQty, getQty: +getQty },
        bundleSlug,
        scope: { kind: scopeKind, categories: scopeKind === 'categories' ? cats : [], brands: scopeKind === 'brands' ? brands : [], products: scopeKind === 'products' ? prods : [] },
        priority: +priority, usageLimit: +usageLimit, minOrder: +minOrder,
        featured, channels: ['home', 'deals', 'pdp', 'cart'],
        published: publishNow, active: true,
      };
      if (isNew) await create(body); else await update(deal.id, body);
      toast(isNew ? 'Deal created — publish to make it live ✓' : 'Deal saved ✓', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  const filteredProds = (m.products || []).filter((p) =>
    !prodQ || p.name.toLowerCase().includes(prodQ.toLowerCase()) || p.slug.includes(prodQ.toLowerCase()));

  return (
    <div data-testid="dealForm" className="max-h-[76vh] overflow-y-auto pr-1">
      <h2 className="text-[17px]">{isNew ? '+ New Deal' : 'Edit — ' + deal.name}</h2>

      <div className="mt-3">
        <span className={LBL}>Campaign type — rendered from the backend TYPES registry</span>
        <div className="flex flex-wrap gap-1.5">
          {(m.types || []).map((t) => (
            <button key={t.key} type="button" data-testid={'dealType-' + t.key}
              onClick={() => setType(t.key)}
              className={'rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold ' + (type === t.key ? 'border-acc bg-acc/10 text-acc' : 'border-line2 text-dim hover:border-acc')}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block"><span className={LBL}>Name</span><input data-testid="dealName" className="w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="11.11 Mega Sale" /></label>
        <label className="block"><span className={LBL}>Name (বাংলা)</span><input className="w-full" value={nameBn} onChange={(e) => setNameBn(e.target.value)} /></label>
        <label className="block"><span className={LBL}>Starts</span><input type="datetime-local" className="w-full" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
        <label className="block"><span className={LBL}>Ends</span><input type="datetime-local" className="w-full" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
        <label className="block md:col-span-2"><span className={LBL}>Description</span><input className="w-full" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        {!isCombo && !isBogo ? (
          <>
            <label className="block"><span className={LBL}>Badge text (card chip)</span><input className="w-full" value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="11.11 SALE" maxLength={24} /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className={LBL}>Kind</span>
                <select className="w-full" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="percentage">%</option><option value="fixed">৳ fixed</option>
                </select>
              </label>
              <label className="block"><span className={LBL}>{kind === 'percentage' ? 'Percent' : '৳ off'}</span><input type="number" min="1" className="w-full" value={value} onChange={(e) => setValue(e.target.value)} /></label>
              <label className="block"><span className={LBL}>Cap ৳ (0=∞)</span><input type="number" min="0" className="w-full" value={maxOff} onChange={(e) => setMaxOff(e.target.value)} disabled={kind !== 'percentage'} /></label>
            </div>
          </>
        ) : null}
        {isBogo ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={LBL}>Buy qty</span><input data-testid="bogoBuy" type="number" min="1" max="99" className="w-full" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} /></label>
            <label className="block"><span className={LBL}>Get free</span><input data-testid="bogoGet" type="number" min="1" max="99" className="w-full" value={getQty} onChange={(e) => setGetQty(e.target.value)} /></label>
          </div>
        ) : null}
        {isCombo ? (
          <label className="block"><span className={LBL}>Combo bundle (pricing engine link)</span>
            <select data-testid="dealBundle" className="w-full" value={bundleSlug} onChange={(e) => setBundleSlug(e.target.value)}>
              <option value="">— pick a bundle —</option>
              {(m.bundles || []).map((b) => <option key={b.slug} value={b.slug}>{b.title} · {money(b.bundlePrice)}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-4">
        <span className={LBL}>Scope {requiredScope ? <em className="not-italic text-acc">— this type is locked to {requiredScope}</em> : '— categories cover the whole subtree'}</span>
        <div className="mb-2 flex gap-1.5">
          {['all', 'categories', 'brands', 'products'].map((k) => (
            <button key={k} type="button" disabled={!!requiredScope && k !== requiredScope}
              onClick={() => setScopeKind(k)}
              className={'rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold uppercase ' + (scopeKind === k ? 'border-acc bg-acc/10 text-acc' : 'border-line2 text-dim') + (requiredScope && k !== requiredScope ? ' opacity-30' : '')}>
              {k}
            </button>
          ))}
        </div>
        {scopeKind === 'categories' ? (
          <div className="max-h-[160px] overflow-y-auto rounded-lg border border-line2 bg-panel2 p-2">
            {catLeaves.map((c) => (
              <button key={c.slug} type="button" onClick={() => toggleIn(cats, setCats, c.slug)}
                className={'mr-1.5 mb-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ' + (cats.includes(c.slug) ? 'border-acc bg-acc/10 text-acc' : 'border-line2 text-dim')}>
                {'·'.repeat(c.depth)} {c.name}
              </button>
            ))}
          </div>
        ) : null}
        {scopeKind === 'brands' ? (
          <div className="rounded-lg border border-line2 bg-panel2 p-2">
            {(m.brands || []).map((b) => (
              <button key={b.slug} type="button" onClick={() => toggleIn(brands, setBrands, b.slug)}
                className={'mr-1.5 mb-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ' + (brands.includes(b.slug) ? 'border-acc bg-acc/10 text-acc' : 'border-line2 text-dim')}>
                {b.name}
              </button>
            ))}
          </div>
        ) : null}
        {scopeKind === 'products' ? (
          <div className="rounded-lg border border-line2 bg-panel2 p-2">
            <input className="mb-2 w-full" placeholder="search products…" value={prodQ} onChange={(e) => setProdQ(e.target.value)} />
            <div className="max-h-[160px] overflow-y-auto">
              {filteredProds.map((p) => (
                <div key={p.slug} className={'mb-1 flex items-center gap-2 rounded-lg px-2 py-1 ' + (prods.includes(p.slug) ? 'bg-acc/10' : '')}>
                  <Toggle on={prods.includes(p.slug)} onClick={() => toggleIn(prods, setProds, p.slug)} label={'include ' + p.name} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-txt">{p.name}</span>
                  <span className="text-[11px] text-dim2">{money(p.price)} · stock {p.stock}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {scopeKind === 'all' ? <div className="rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[12px] text-dim">Whole active catalog — the discount math caps every product price it beats.</div> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <label className="block"><span className={LBL}>Priority (lower first)</span><input type="number" min="0" className="w-full" value={priority} onChange={(e) => setPriority(e.target.value)} /></label>
        <label className="block"><span className={LBL}>Usage limit (0=∞)</span><input type="number" min="0" className="w-full" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} /></label>
        <label className="block"><span className={LBL}>Min order ৳</span><input type="number" min="0" className="w-full" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></label>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <span className="flex items-center gap-2 text-[12px]"><Toggle on={featured} onClick={() => setFeatured(!featured)} label="featured" /> Featured hero slot</span>
          <span className="flex items-center gap-2 text-[12px]"><Toggle on={publishNow} onClick={() => setPublishNow(!publishNow)} label="publish" /> {publishNow ? 'Publish now' : 'Save as draft'}</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} onClick={closeModal} disabled={busy}>Cancel</button>
        <button className={ACC_BTN} data-testid="dealSave" onClick={save} disabled={busy || !valid}>{isNew ? 'Create Deal' : 'Save'}</button>
      </div>
    </div>
  );
}

/* ---------- page ---------- */
function DealsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);
  const [m, setM] = useState({ types: [], categories: [], brands: [], products: [], bundles: [] });
  const [st, setSt] = useState(null);
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (fType) params.set('type', fType);
      if (fStatus) params.set('status', fStatus);
      if (q) params.set('q', q);
      const [r, mm, ss] = await Promise.all([
        list(params.toString()), meta().catch(() => null), stats().catch(() => null),
      ]);
      setItems(r.items || []);
      if (mm) setM(mm);
      if (ss) setSt(ss);
      setErr('');
    } catch (e) { setErr(e.message); setItems([]); }
  }, [fType, fStatus, q]);
  useEffect(() => { load(); }, [load]);

  const flip = async (d, patch, msg) => {
    try { const r = await setState(d.id, patch); toast(r.message || msg, 'ok'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const del = async (d) => {
    if (!(await confirm({ title: 'Delete deal', body: `Delete "${d.name}"? Order-history provenance stays on past orders.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(d.id); toast('Deal deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const edit = (d) => openModal(<DealForm deal={d} meta={m} onDone={load} />);

  return (
    <AdminShell active="deals" title="Deals & Promotions">
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="dealStats">
        {st ? (
          <>
            <span className={CHIP + ' border-green/40 text-green'}>active {st.byStatus.active || 0}</span>
            <span className={CHIP + ' border-blue/40 text-blue'}>scheduled {st.byStatus.scheduled || 0}</span>
            <span className={CHIP + ' border-dim2 text-dim2'}>draft {st.byStatus.draft || 0}</span>
            <span className={CHIP + ' border-orange/40 text-orange'}>paused {st.byStatus.paused || 0}</span>
            <span className={CHIP + ' border-line2 text-dim2'}>expired {st.byStatus.expired || 0}</span>
          </>
        ) : null}
        <div className="flex-1" />
        <input className="w-[180px]" placeholder="search deals…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={ACC_BTN} data-testid="dealNew" onClick={() => openModal(<DealForm meta={m} onDone={load} />)}>+ New Deal</button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button className={'rounded-full border px-2.5 py-1 text-[11px] font-semibold ' + (!fType ? 'border-acc text-acc' : 'border-line2 text-dim')} onClick={() => setFType('')}>all types</button>
        {(m.types || []).map((t) => (
          <button key={t.key} className={'rounded-full border px-2.5 py-1 text-[11px] font-semibold ' + (fType === t.key ? 'border-acc text-acc' : 'border-line2 text-dim')} onClick={() => setFType(fType === t.key ? '' : t.key)}>
            {t.icon} {t.key}
          </button>
        ))}
        <span className="mx-2 w-px bg-line2" />
        {['', 'active', 'scheduled', 'draft', 'paused', 'expired'].map((s) => (
          <button key={s || 'any'} className={'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ' + (fStatus === s ? 'border-acc text-acc' : 'border-line2 text-dim')} onClick={() => setFStatus(s)}>
            {s || 'any status'}
          </button>
        ))}
      </div>

      {err ? <div className={CARD + ' text-[13px] text-red'}>Failed to load deals — {err}</div> : null}
      {!items ? <TableSkeleton rows={3} /> : null}
      {items && !items.length ? <Empty icon="🎯" title="No deals here" sub="Create one — every campaign type shares this ONE controller, service and model." /> : null}

      {items && items.length ? (
        <div className="space-y-3" data-testid="dealList">
          {items.map((d) => (
            <div key={d.id} className={CARD} data-testid="dealCard">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px] text-txt">{d.name}</b>
                <span className={CHIP + ' ' + (STATUS_CHIP[d.status] || 'border-line2 text-dim2')}>{d.status}</span>
                <span className={CHIP + ' border-acc/40 text-acc'}>{d.type}</span>
                <span className={CHIP + ' border-line2 text-dim2'}>
                  {d.type === 'bogo' ? d.bogo.label : d.type === 'combo' ? 'bundle: ' + d.bundleSlug : d.discount.label}
                </span>
                <span className={CHIP + ' border-line2 text-dim2'}>scope: {d.scope.kind}{d.scope.kind !== 'all' ? ` (${(d.scope.categories || d.scope.brands || d.scope.products || []).length})` : ''}</span>
                {d.featured ? <span className={CHIP + ' border-yellow/40 text-yellow'}>featured</span> : null}
                {d.usageLimit > 0 ? <span className={CHIP + ' border-line2 text-dim2'}>used {d.usedCount}/{d.usageLimit}</span> : d.usedCount > 0 ? <span className={CHIP + ' border-line2 text-dim2'}>used {d.usedCount}</span> : null}
                <div className="flex-1" />
                <Toggle on={d.active} onClick={() => flip(d, { active: !d.active })} label="pause" />
              </div>
              <div className="mt-1.5 text-[12px] text-dim2">
                {new Date(d.startsAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' → '}
                {new Date(d.endsAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · priority ' + d.priority}
              </div>
              {d.description ? <div className="mt-1 text-[12.5px] text-dim">{d.description}</div> : null}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {!d.published
                  ? <button className={ACC_BTN} data-testid="dealPublish" onClick={() => flip(d, { published: true })}>Publish</button>
                  : <button className={GHOST_BTN} data-testid="dealUnpublish" onClick={() => flip(d, { published: false })}>Unpublish</button>}
                <button className={GHOST_BTN} onClick={() => edit(d)}>Edit</button>
                <button className={RED_BTN} onClick={() => del(d)}>Delete</button>
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
      <DealsPage />
    </OverlayProvider>
  );
}
