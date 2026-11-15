/* ArixGear ADMIN page — Service Centers (Phase 5, 5.3 · C3 net-new)
   /admin/service-centers · walk-in network CRUD powering the storefront
   "Servicing Center" quick-service and the /service page. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { CARD, ACC_BTN, GHOST_BTN, RED_BTN, CHIP, LBL, Toggle, Empty, useConfirm } from '../components/ui.jsx';
import { adminList, create, update, remove } from '../services/serviceCenters.js';

function CenterForm({ c, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !c;
  const [f, setF] = useState({
    name: c?.name || '', city: c?.city || '', address: c?.address || '', phone: c?.phone || '',
    email: c?.email || '', hours: c?.hours || 'Sat–Thu 10:00–19:00', mapUrl: c?.mapUrl || '',
    services: (c?.services || []).join(', '), active: c ? c.active : true, sortOrder: c?.sortOrder ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !f.city.trim() || !f.address.trim() || !f.phone.trim()) {
      return toast('Name, city, address and phone are required', 'err');
    }
    setBusy(true);
    try {
      const body = { ...f, services: f.services.split(',').map((s) => s.trim()).filter(Boolean), sortOrder: Number(f.sortOrder) || 0 };
      if (isNew) await create(body); else await update(c._id, body);
      toast(isNew ? 'Service center added ✓' : 'Service center saved ✓', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <div data-testid="centerForm">
      <h2 className="text-[17px]">{isNew ? '+ New Service Center' : 'Edit — ' + c.name}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block"><span className={LBL}>Name</span><input data-testid="centerName" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="ArixGear Service Hub — Dhaka" /></label>
        <label className="block"><span className={LBL}>City</span><input value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Dhaka" /></label>
        <label className="block md:col-span-2"><span className={LBL}>Address</span><input value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
        <label className="block"><span className={LBL}>Phone</span><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label className="block"><span className={LBL}>Email (optional)</span><input value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label className="block"><span className={LBL}>Hours</span><input value={f.hours} onChange={(e) => set('hours', e.target.value)} /></label>
        <label className="block"><span className={LBL}>Map URL (optional)</span><input value={f.mapUrl} onChange={(e) => set('mapUrl', e.target.value)} /></label>
        <label className="block md:col-span-2"><span className={LBL}>Services (comma-separated)</span><input value={f.services} onChange={(e) => set('services', e.target.value)} placeholder="Diagnostics, Repairs, Warranty claims" /></label>
        <label className="block"><span className={LBL}>Sort order</span><input type="number" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} /></label>
        <div className="flex items-center gap-2 pt-5"><Toggle on={f.active} onClick={() => set('active', !f.active)} /><span className="text-[12px] text-dim">visible on the storefront</span></div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} onClick={closeModal} disabled={busy}>Cancel</button>
        <button className={ACC_BTN} data-testid="centerSave" onClick={save} disabled={busy}>{isNew ? 'Add Center' : 'Save'}</button>
      </div>
    </div>
  );
}

function CentersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try { const d = await adminList(); setItems(d.items || []); } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const del = async (c) => {
    if (!(await confirm({ title: 'Delete service center', body: `Delete "${c.name}" (${c.city})? Walk-in customers lose the listed address.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(c._id); toast('Center deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="centers" title="Service Centers">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">{items ? items.length + ' centers · the storefront lists active ones sorted by order → city' : 'Loading…'}</span>
        <div className="flex-1" />
        <button className={ACC_BTN} data-testid="centerNew" onClick={() => openModal(<CenterForm onDone={load} />)}>+ New Center</button>
      </div>

      {!items ? <TableSkeleton rows={5} /> : null}
      {items && !items.length ? <Empty icon="🔧" title="No service centers" sub="Add walk-in points — they power the Servicing Center card and the support pages." /> : null}

      {items && items.length ? (
        <div className="w-full overflow-x-auto rounded-xl border border-line bg-panel" data-testid="centerTableWrap">
          <table className="w-full min-w-[1050px] border-collapse text-left text-[12.5px]" data-testid="centerTable">
            <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim2"><tr>
              <th className="border-b border-line px-4 py-3 font-bold">Center</th><th className="border-b border-line px-4 py-3 font-bold">Location</th><th className="border-b border-line px-4 py-3 font-bold">Contact</th><th className="border-b border-line px-4 py-3 font-bold">Services</th><th className="border-b border-line px-4 py-3 text-center font-bold">Status</th><th className="border-b border-line px-4 py-3 text-right font-bold">Actions</th>
            </tr></thead>
            <tbody>{items.map((c) => (
              <tr key={c._id} className="border-b border-line/70 align-middle transition-colors last:border-b-0 hover:bg-panel2/60" data-testid="centerRow">
                <td className="min-w-[220px] px-4 py-4"><b className="text-[14px] text-txt">{c.name}</b><div className="mt-1 text-[11px] text-dim2">Order #{c.sortOrder ?? 0}</div></td>
                <td className="min-w-[260px] px-4 py-4"><div className="text-dim">{c.address}</div><div className="mt-1 text-[11.5px] text-dim2">{c.city}</div></td>
                <td className="whitespace-nowrap px-4 py-4"><div className="text-txt">{c.phone}</div><div className="mt-1 text-[11.5px] text-dim2">{c.hours}</div></td>
                <td className="min-w-[260px] px-4 py-4"><div className="flex max-w-[360px] flex-wrap gap-1.5">{(c.services || []).map((service) => <span key={service} className={CHIP + ' border-line2 text-dim'}>{service}</span>)}</div></td>
                <td className="px-4 py-4 text-center"><Toggle on={c.active} onClick={() => update(c._id, { active: !c.active }).then(load).catch((e) => toast(e.message, 'err'))} /><div className="mt-1 text-[10.5px] text-dim2">{c.active ? 'active' : 'hidden'}</div></td>
                <td className="whitespace-nowrap px-4 py-4 text-right"><div className="inline-flex gap-2"><button className={GHOST_BTN} onClick={() => openModal(<CenterForm c={c} onDone={load} />)}>Edit</button><button className={RED_BTN} onClick={() => del(c)}>Delete</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {false && items && items.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="centerGrid">
          {items.map((c) => (
            <div key={c._id} className={CARD} data-testid="centerCard">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14.5px] text-txt">{c.name}</b>
                    <span className={CHIP + ' ' + (c.active ? 'border-green/40 text-green' : 'border-line2 text-dim2')}>{c.active ? 'active' : 'hidden'}</span>
                  </div>
                  <div className="mt-1 text-[12.5px] text-dim">{c.address}</div>
                  <div className="mt-1 text-[11.5px] text-dim2">{c.city} · {c.phone} · {c.hours}</div>
                  {c.services?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">{c.services.map((s) => <span key={s} className={CHIP + ' border-line2 text-dim'}>{s}</span>)}</div>
                  ) : null}
                </div>
                <Toggle on={c.active} onClick={() => update(c._id, { active: !c.active }).then(load).catch((e) => toast(e.message, 'err'))} />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button className={GHOST_BTN} onClick={() => openModal(<CenterForm c={c} onDone={load} />)}>Edit</button>
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
      <CentersPage />
    </OverlayProvider>
  );
}
