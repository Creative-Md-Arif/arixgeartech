/* ArixGear ADMIN page — Flash Campaigns (Phase 5, 5.3 · C3 net-new module)
   /admin/flash-campaigns · Phase 4 lifecycle: author a window + per-product
   deal prices → APPLY syncs deal prices onto the product flash engine →
   END clears them. Live-state chips keep the admin honest. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { money } from '../lib/admin.js';
import { CARD, ACC_BTN, GHOST_BTN, RED_BTN, CHIP, LBL, Toggle, Empty, useConfirm } from '../components/ui.jsx';
import { adminList, create, update, remove, apply, end } from '../services/flashCampaigns.js';
import { list as listProducts } from '../services/products.js';

const dtLocal = (d) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function CampaignForm({ c, prods, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !c;
  const [title, setTitle] = useState(c?.title || '');
  const [titleBn, setTitleBn] = useState(c?.titleBn || '');
  const [description, setDescription] = useState(c?.description || '');
  const [startsAt, setStartsAt] = useState(dtLocal(c?.startsAt) || dtLocal(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(dtLocal(c?.endsAt) || '');
  const [deals, setDeals] = useState(() => Object.fromEntries((c?.products || []).map((p) => [p.slug, p.dealPrice])));
  const [busy, setBusy] = useState(false);

  const bySlug = useMemo(() => Object.fromEntries((prods || []).map((p) => [p.slug, p])), [prods]);
  const chosen = Object.keys(deals);
  const valid = title.trim() && startsAt && endsAt && chosen.length >= 1 &&
    chosen.every((s) => Number(deals[s]) > 0 && Number(deals[s]) < (bySlug[s]?.price || 0));

  const toggleProduct = (slug) => {
    setDeals((d) => {
      const next = { ...d };
      if (slug in next) delete next[slug];
      else next[slug] = Math.max(1, Math.round((bySlug[slug]?.price || 0) * 0.7));
      return next;
    });
  };

  const save = async () => {
    if (!valid) return toast('Title, window, and deals BELOW each regular price are required', 'err');
    setBusy(true);
    try {
      const body = {
        title: title.trim(), titleBn: titleBn.trim(), description: description.trim(),
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
        products: chosen.map((s) => ({ slug: s, dealPrice: Number(deals[s]) })),
      };
      if (isNew) await create(body); else await update(c._id, body);
      toast(isNew ? 'Campaign created — APPLY it to sync deal prices ✓' : 'Campaign saved ✓', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <div data-testid="campaignForm">
      <h2 className="text-[17px]">{isNew ? '+ New Flash Campaign' : 'Edit — ' + c.title}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block"><span className={LBL}>Title</span><input data-testid="campaignTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend Gaming Hour" /></label>
        <label className="block"><span className={LBL}>Title (বাংলা)</span><input value={titleBn} onChange={(e) => setTitleBn(e.target.value)} /></label>
        <label className="block"><span className={LBL}>Starts</span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
        <label className="block"><span className={LBL}>Ends</span><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
        <label className="block md:col-span-2"><span className={LBL}>Description (storefront strip)</span><input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      </div>

      <div className="mt-4">
        <span className={LBL}>Deal products — deal price must sit below the regular price</span>
        <div className="max-h-[240px] overflow-y-auto rounded-lg border border-line2 bg-panel2 p-2" data-testid="campaignPicker">
          {(prods || []).map((p) => {
            const on = p.slug in deals;
            return (
              <div key={p.slug} className={'mb-1 flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ' + (on ? 'bg-acc/10' : '')}>
                <Toggle on={on} onClick={() => toggleProduct(p.slug)} label={'include ' + p.name} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt">{p.name}</span>
                <span className="text-[11.5px] text-dim2">reg {money(p.price)}</span>
                {on ? (
                  <input type="number" min="1" className="w-[110px] text-[12px]" value={deals[p.slug]}
                    onChange={(e) => setDeals((d) => ({ ...d, [p.slug]: e.target.value }))}
                    aria-label={'deal price for ' + p.name} />
                ) : null}
                {on && Number(deals[p.slug]) >= p.price ? <span className={CHIP + ' border-red/40 text-red'}>not a deal</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} onClick={closeModal} disabled={busy}>Cancel</button>
        <button className={ACC_BTN} data-testid="campaignSave" onClick={save} disabled={busy || !valid}>{isNew ? 'Create Campaign' : 'Save'}</button>
      </div>
    </div>
  );
}

function CampaignsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);
  const [prods, setProds] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([adminList(), listProducts({ limit: '60' }).catch(() => ({ items: [] }))]);
      setItems(c.items || []);
      setProds(p.items || []);
      setErr('');
    } catch (e) { setErr(e.message); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doApply = async (c) => {
    if (!(await confirm({ title: 'Apply campaign', body: `Push ${c.products.length} deal price(s) onto the live products for the campaign window? The storefront, cards and order totals will charge the deal prices.`, ok: 'Apply' }))) return;
    try { const r = await apply(c._id); toast(r.message, 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const doEnd = async (c) => {
    if (!(await confirm({ title: 'End campaign', body: 'Clear the deal prices from every product and deactivate the campaign?', danger: true, ok: 'End' }))) return;
    try { const r = await end(c._id); toast(r.message, 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };
  const del = async (c) => {
    if (!(await confirm({ title: 'Delete campaign', body: `Delete campaign "${c.title}"? Applied deal prices stay until you END the campaign.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(c._id); toast('Campaign deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="flash" title="Flash Campaigns">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">{items ? items.length + ' campaigns · deal prices sync onto the product flash engine' : 'Loading…'}</span>
        <div className="flex-1" />
        <button className={ACC_BTN} data-testid="campaignNew" onClick={() => openModal(<CampaignForm prods={prods} onDone={load} />)}>+ New Campaign</button>
      </div>

      {err ? <div className={CARD + ' text-[13px] text-red'}>Failed to load campaigns — {err}</div> : null}
      {!items ? <TableSkeleton rows={3} /> : null}
      {items && !items.length ? <Empty icon="⚡" title="No campaigns yet" sub="Author a window + deal prices, then APPLY to make them live. END clears them — no cron anywhere." /> : null}

      {items && items.length ? (
        <div className="space-y-3" data-testid="campaignList">
          {items.map((c) => (
            <div key={c._id} className={CARD} data-testid="campaignCard">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px] text-txt">{c.title}</b>
                <span className={CHIP + ' ' + (c.live ? 'border-green/40 text-green' : c.active ? 'border-blue/40 text-blue' : 'border-line2 text-dim2')}>
                  {c.live ? 'LIVE' : c.active ? 'scheduled/ended window' : 'inactive'}
                </span>
                <span className={CHIP + ' border-line2 text-dim2'}>{c.productCount} products</span>
                {c.appliedAt ? <span className={CHIP + ' border-acc/40 text-acc'}>applied {new Date(c.appliedAt).toLocaleDateString('en-GB')}</span> : null}
                <div className="flex-1" />
                <Toggle on={c.active} onClick={() => update(c._id, { active: !c.active }).then(load).catch((e) => toast(e.message, 'err'))} />
              </div>
              <div className="mt-1.5 text-[12px] text-dim2">
                {new Date(c.startsAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} → {new Date(c.endsAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {c.products.map((p) => (
                  <span key={p.slug} className={CHIP + ' border-line2 text-dim'}>{p.name}: {money(p.dealPrice)} <s className="text-dim2">{money(p.basePrice)}</s></span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button className={ACC_BTN} data-testid="campaignApply" onClick={() => doApply(c)}>⚡ Apply</button>
                <button className={GHOST_BTN} data-testid="campaignEnd" onClick={() => doEnd(c)}>End</button>
                <button className={GHOST_BTN} onClick={() => openModal(<CampaignForm c={c} prods={prods} onDone={load} />)}>Edit</button>
                <button className={RED_BTN} onClick={() => del(c)}>Delete</button>
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
      <CampaignsPage />
    </OverlayProvider>
  );
}
