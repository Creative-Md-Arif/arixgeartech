/* ArixGear ADMIN page — Catalog: Categories + Badges + Spec Schema managers.
   Categories: Admin→Catalog creates NEW categories (name, slug auto, tile image,
   order, active). Products can use any of them instantly — no code, no enum.
   Badges: admin-created chips (label, key, color) that products reference by key;
   the storefront resolves label + color live from /api/badges.
   Step 5 — Spec Schema: per-category unlimited spec groups + custom fields
   (6 types, dropdown options, repeatable values, filterable/showInDetails
   switches) with drag & drop sorting and reusable templates — the dynamic
   specification system's control room. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { pickImages } from '../lib/admin.js';
import * as cats from '../services/categories.js';
import * as badges from '../services/badges.js';
import { uploadOne } from '../services/uploads.js';
import { tr, useLang } from '../lib/i18n.jsx';
import SpecSchemaEditor from '../components/SpecSchemaEditor.jsx';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';

/* ---------------- Categories TREE manager (Phase 5, 5.4) ----------------
   Roots with expandable children (parent → child path drives the storefront
   branch filter), per-node product counts, add child inline, parent moves
   with the backend cycle-guard answering 400 on nonsense. */
export function CategoriesCard() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [slug, setSlug] = useState('');
  const [parent, setParent] = useState('');
  const [order, setOrder] = useState('0');
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    try {
      const [adm, pub] = await Promise.all([cats.adminList(), cats.list().catch(() => ({ items: [] }))]);
      setItems(adm.items || []);
      const c = {};
      for (const x of pub.items || []) c[x.slug] = x.productCount || 0;
      setCounts(c);
    } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => {
    const all = items || [];
    const roots = all.filter((c) => !c.parent).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const kidsOf = {};
    for (const c of all) {
      if (!c.parent) continue;
      const key = String(c.parent);
      (kidsOf[key] = kidsOf[key] || []).push(c);
    }
    for (const k of Object.keys(kidsOf)) kidsOf[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return { roots, kidsOf };
  }, [items]);

  const pickImage = () => pickImages(async (files) => {
    try {
      const d = await uploadOne(files[0]);
      setImgFile(d.image); setImgPreview(d.image.url);
      toast('Image uploaded ✓', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }, false);

  const add = async () => {
    if (!name.trim()) return toast(tr('Category name is required'), 'err');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('nameBn', nameBn.trim());
      if (slug.trim()) fd.append('slug', slug.trim());
      fd.append('order', order === '' ? '0' : order);
      if (parent) fd.append('parent', parent);
      if (imgFile) fd.append('image', imgFile);
      await cats.create(fd);
      toast(tr('Category created ✓ — child nodes inherit the parent\'s branch filter'), 'ok');
      setName(''); setNameBn(''); setSlug(''); setOrder('0'); setImgFile(null); setImgPreview('');
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const saveRow = async (c) => {
    const d = drafts[c._id] || {};
    const fd = new FormData();
    fd.append('name', d.name ?? c.name);
    fd.append('nameBn', (d.nameBn ?? c.nameBn ?? ''));
    fd.append('slug', d.slug ?? c.slug);
    fd.append('order', String(d.order ?? c.order ?? 0));
    fd.append('active', String(c.active));
    if (d.image !== undefined) fd.append('image', d.image);
    const newParent = d.parent !== undefined ? d.parent : (c.parent || '');
    fd.append('parent', newParent);
    try {
      await cats.update(c._id, fd);
      toast(tr('Saved ✓ — path recomputed'), 'ok');
      setDrafts((x) => ({ ...x, [c._id]: {} }));
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const toggle = async (c) => {
    const fd = new FormData();
    fd.append('name', c.name); fd.append('order', String(c.order ?? 0));
    fd.append('active', String(!c.active));
    if (c.parent) fd.append('parent', c.parent);
    try { await cats.update(c._id, fd); load(); } catch (e) { toast(e.message, 'err'); }
  };

  const del = async (c) => {
    if (!(await confirm({ title: 'Delete category', body: tr('Delete category "{name}"? Products keep their category label but lose the chip filter.', { name: c.name }), danger: true, ok: 'Delete' }))) return;
    try { await cats.remove(c._id); toast(tr('Category deleted'), 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  const setDraft = (id, f, v) => setDrafts((x) => ({ ...x, [id]: { ...(x[id] || {}), [f]: v } }));

  const pickRowImage = (id, file) => {
    if (!file) return;
    uploadOne(file).then((d) => {
      setDraft(id, 'image', d.image?.url || d.url || '');
      toast(tr('Image uploaded — press Save to apply'), 'ok');
    }).catch((e) => toast(e.message, 'err'));
  };

  const ParentSelect = ({ c }) => {
    const d = drafts[c._id] || {};
    const val = d.parent !== undefined ? d.parent : (c.parent || '');
    return (
      <select className="w-[150px] text-[12px]" value={val}
        onChange={(e) => setDraft(c._id, 'parent', e.target.value)}>
        <option value="">— root —</option>
        {(items || []).filter((r) => String(r._id) !== String(c._id) && !(c.slug && (r.path || []).includes(c.slug))).map((r) => (
          <option key={r._id} value={r._id}>{r.name}</option>
        ))}
      </select>
    );
  };

  const Row = ({ c, depth }) => {
    const d = drafts[c._id] || {};
    const kids = tree.kidsOf[String(c._id)] || [];
    const open = expanded[c._id];
    return (
      <>
        <tr key={c._id} className="border-b border-line hover:bg-panel2" data-testid="catRow" style={{ background: depth ? 'rgba(47,129,247,.04)' : undefined }}>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2" style={{ paddingLeft: depth * 22 }}>
              {kids.length ? (
                <button type="button" onClick={() => setExpanded((e) => ({ ...e, [c._id]: !e[c._id] }))}
                  className="w-4 text-center text-dim2 hover:text-acc" aria-expanded={!!open}>{open ? '▾' : '▸'}</button>
              ) : <span className="w-4" />}
              {(d.image ?? c.image) ? <img src={d.image ?? c.image} alt="" className="h-9 w-9 rounded-lg bg-panel2 object-cover" /> : <span className={CHIP + ' text-dim2'}>{tr('no image')}</span>}
              <label className="cursor-pointer text-[10px] text-acc hover:underline">
                {tr('Edit image')}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickRowImage(c._id, e.target.files?.[0])} />
              </label>
              {(d.image ?? c.image) ? <button type="button" className="text-[10px] text-red hover:underline" onClick={() => setDraft(c._id, 'image', '')}>{tr('Clear')}</button> : null}
            </div>
          </td>
          <td className="px-3 py-2.5">
            <input className="w-[150px]" value={d.name ?? c.name} onChange={(e) => setDraft(c._id, 'name', e.target.value)} />
            <input className="mt-1 w-[150px] text-[12px]" placeholder="বাংলা নাম" value={d.nameBn ?? c.nameBn ?? ''} onChange={(e) => setDraft(c._id, 'nameBn', e.target.value)} />
          </td>
          <td className="px-3 py-2.5">
            <input className="w-[150px] text-[11px]" value={d.slug ?? c.slug} onChange={(e) => setDraft(c._id, 'slug', e.target.value)} />
            {depth ? <div className="mt-1 text-[10.5px] text-dim2">/{(c.path || []).join('/')}</div> : null}
          </td>
          <td className="px-3 py-2.5 text-center">
            <span className={CHIP + (counts[c.slug] ? ' border-acc/40 text-acc' : ' border-line2 text-dim2')} data-testid={'catCount-' + c.slug}>{counts[c.slug] ?? 0}</span>
            <div className="mt-1 text-[10px] text-dim2">{tr('products (branch)')}</div>
          </td>
          <td className="px-3 py-2.5"><input className="w-[64px]" type="number" value={d.order ?? c.order ?? 0} onChange={(e) => setDraft(c._id, 'order', e.target.value)} /></td>
          <td className="px-3 py-2.5"><ParentSelect c={c} /></td>
          <td className="px-3 py-2.5">
            <button type="button" onClick={() => toggle(c)} className={CHIP + (c.active ? ' border-green/40 text-green' : ' border-line2 text-dim2')}>{c.active ? tr('active') : tr('hidden')}</button>
          </td>
          <td className="px-3 py-2.5">
            <div className="flex gap-2">
              <button className={GHOST_BTN} onClick={() => saveRow(c)}>{tr('Save')}</button>
              <button className={GHOST_BTN} onClick={() => { setParent(String(c._id)); setExpanded((e) => ({ ...e, [c._id]: true })); }}>{tr('+ child')}</button>
              <button className={RED_BTN} onClick={() => del(c)}>{tr('Delete')}</button>
            </div>
          </td>
        </tr>
        {open && kids.map((k) => <Row key={k._id} c={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className={CARD + ' mb-[18px]'}>
      <h3 className="mb-[14px] text-[15px] tracking-[.08em]">{tr('🗂️ Category Tree')}</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-6">
        <div><label>{tr('New category name *')}</label><input id="catName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gaming Laptops" /></div>
        <div><label>{tr('নাম (বাংলা)')}</label><input id="catNameBn" value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder="গেমিং ল্যাপটপ" /></div>
        <div><label>{tr('Slug (optional — auto from name)')}</label><input id="catSlug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gaming-laptops" /></div>
        <div>
          <label>{tr('Parent')}</label>
          <select id="catParent" value={parent} onChange={(e) => setParent(e.target.value)} data-testid="catParent">
            <option value="">— root —</option>
            {(tree.roots || []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </div>
        <div><label>{tr('Tile order')}</label><input id="catOrder" type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></div>
        <div>
          <label>{tr('Tile image (optional)')}</label>
          <button type="button" id="catImage" className={GHOST_BTN + ' w-full'} onClick={pickImage}>{imgPreview ? tr('Replace image') : tr('Upload image')}</button>
          {imgPreview ? <img src={imgPreview} alt="" className="mt-2 h-12 w-12 rounded-lg object-cover" /> : null}
        </div>
      </div>
      <button id="catAdd" className={ACC_BTN + ' mb-5'} disabled={busy} onClick={add}>{parent ? tr('+ Add Child Category') : tr('+ Add Root Category')}</button>

      <div className="tbl-wrap overflow-x-auto rounded-xl border border-line" data-testid="catTree">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[.08em] text-dim2">
              <th className="px-3 py-2.5">{tr('Image')}</th><th className="px-3 py-2.5">{tr('Name')}</th><th className="px-3 py-2.5">{tr('Slug / Path')}</th>
              <th className="px-3 py-2.5">{tr('Products')}</th><th className="px-3 py-2.5">{tr('Order')}</th><th className="px-3 py-2.5">{tr('Parent')}</th><th className="px-3 py-2.5">{tr('Active')}</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items && tree.roots.map((r) => <Row key={r._id} c={r} depth={0} />)}
            {items && !tree.roots.length ? <tr><td colSpan={8} className="px-3 py-6 text-center text-dim2">{tr('No categories — add the first one above')}</td></tr> : null}
            {!items ? <tr><td colSpan={8} className="px-3 py-6 text-center text-dim2">{tr('Loading…')}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-dim2">{tr('Branch counts = products under this node and every child (the storefront /shop?cat=slug filter behaves exactly the same). Moving a node recomputes its path; cycles are refused by the backend.')}</p>
    </div>
  );
}

/* ---------------- Badges manager ---------------- */
export function BadgesCard() {
  const confirm = useConfirm(); // Step 2 audit fix — confirm() was declared in a sibling component; every delete click crashed
  const { t } = useLang();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [label, setLabel] = useState('');
  const [labelBn, setLabelBn] = useState(''); // Task 58 — Bengali chip label
  const [key, setKey] = useState('');
  const [color, setColor] = useState('#2F81F7');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({}); /* { [id]: {label, color} } */

  const load = useCallback(async () => {
    try {
      const d = await badges.list();
      setItems(d.items || []);
    } catch (e) { toast(e.message, 'err'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!label.trim()) return toast(tr('Badge label is required'), 'err');
    setBusy(true);
    try {
      await badges.create({ key: key.trim(), label: label.trim(), labelBn: labelBn.trim(), color }); // Task 58
      toast(tr('Badge created ✓ — select it on any product'), 'ok');
      setKey(''); setLabel(''); setLabelBn('');
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const saveRow = async (b) => {
    const d = drafts[b._id] || {};
    try {
      await badges.update(b._id, { key: d.key ?? b.key, label: d.label ?? b.label, labelBn: d.labelBn ?? b.labelBn ?? '', color: d.color ?? b.color, order: d.order ?? b.order ?? 0, active: b.active }); // Task 58
      toast(tr('Saved ✓ — storefront chips update live'), 'ok');
      setDrafts((x) => ({ ...x, [b._id]: {} }));
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const toggle = async (b) => {
    try { await badges.update(b._id, { active: !b.active }); load(); } catch (e) { toast(e.message, 'err'); }
  };

  const del = async (b) => {
    if (!(await confirm({ title: 'Delete badge', body: tr('Delete badge "{label}"? Products carrying it simply stop showing a chip.', { label: b.label }), danger: true, ok: 'Delete' }))) return;
    try { await badges.remove(b._id); toast(tr('Badge deleted'), 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  const setDraft = (id, f, v) => setDrafts((x) => ({ ...x, [id]: { ...(x[id] || {}), [f]: v } }));

  return (
    <div className={CARD}>
      <h3 className="mb-[14px] text-[15px] tracking-[.08em]">{tr('🏷️ Badges')}</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div><label>{tr('Key (optional)')}</label><input id="badgeKey" value={key} onChange={(e) => setKey(e.target.value)} placeholder="limited-drop" /></div>
        <div><label>{tr('New badge label *')}</label><input id="badgeLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Limited Drop" /></div>
        <div><label>{tr('লেবেল (বাংলা)')}</label><input id="badgeLabelBn" value={labelBn} onChange={(e) => setLabelBn(e.target.value)} placeholder="লিমিটেড ড্রপ" /></div>
        <div><label>{tr('Chip color')}</label><input id="badgeColor" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[38px] w-full cursor-pointer" /></div>
        <div className="flex items-end"><button id="badgeAdd" className={ACC_BTN + ' w-full'} disabled={busy} onClick={add}>{tr('+ Add Badge')}</button></div>
      </div>

      <div className="tbl-wrap overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[.08em] text-dim2">
              <th className="px-3 py-2.5">{tr('Preview')}</th><th className="px-3 py-2.5">{tr('Key')}</th><th className="px-3 py-2.5">{tr('Label')}</th><th className="px-3 py-2.5">{tr('লেবেল (বাংলা)')}</th>
              <th className="px-3 py-2.5">{tr('Color')}</th><th className="px-3 py-2.5">{tr('Order')}</th><th className="px-3 py-2.5">{tr('Active')}</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((b) => {
              const d = drafts[b._id] || {};
              const curKey = d.key ?? b.key;
              const curLabel = d.label ?? b.label;
              const curColor = d.color ?? b.color;
              const curLabelBn = d.labelBn ?? b.labelBn ?? '';
              return (
                <tr key={b._id} className="border-b border-line hover:bg-panel2">
                  <td className="px-3 py-2.5"><span className="inline-block rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: curColor, color: '#000' }}>{curLabel}</span></td>
                  <td className="px-3 py-2.5"><input className="w-[120px] text-[11px]" value={curKey} onChange={(e) => setDraft(b._id, 'key', e.target.value)} /></td>
                  <td className="px-3 py-2.5"><input className="w-[130px]" value={curLabel} onChange={(e) => setDraft(b._id, 'label', e.target.value)} /></td>
                  <td className="px-3 py-2.5"><input className="w-[120px]" placeholder="বাংলা লেবেল" value={curLabelBn} onChange={(e) => setDraft(b._id, 'labelBn', e.target.value)} /></td>
                  <td className="px-3 py-2.5"><input type="color" className="h-[30px] w-[52px] cursor-pointer" value={/^#[0-9a-fA-F]{6}$/.test(curColor) ? curColor : '#2F81F7'} onChange={(e) => setDraft(b._id, 'color', e.target.value)} /></td>
                  <td className="px-3 py-2.5"><input type="number" className="w-[60px]" value={d.order ?? b.order ?? 0} onChange={(e) => setDraft(b._id, 'order', e.target.value)} /></td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => toggle(b)} className={CHIP + (b.active ? ' border-green/40 text-green' : ' border-line2 text-dim2')}>{b.active ? tr('active') : tr('hidden')}</button>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-2">
                      <button className={GHOST_BTN} onClick={() => saveRow(b)}>{tr('Save')}</button>
                      <button className={RED_BTN} onClick={() => del(b)}>{tr('Delete')}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items && !items.length ? <tr><td colSpan={8} className="px-3 py-6 text-center text-dim2">{tr('No badges — add the first one above')}</td></tr> : null}
            {!items ? <tr><td colSpan={8} className="px-3 py-6 text-center text-dim2">{tr('Loading…')}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-dim2">{tr('Products reference badges by key (Admin → Products → Badge dropdown). Deleting a badge never touches products — their chips just disappear.')}</p>
    </div>
  );
}

/* ---------------- Step 5 — SPEC SCHEMA card (dynamic specification system) ---------------- */
export function SpecSchemaCard() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const load = useCallback(() => cats.list().then((d) => setItems((d.items || []).filter((c) => c.slug))).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className={CARD + ' mt-6'} id="specSchemaCard">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px]">🧩 {tr('Spec Schema — dynamic specification groups & fields')}</h2>
        <div className="flex-1" />
        <span className="text-[11.5px] text-dim2">{tr('Unlimited groups · dropdown · multi-select · number+unit · yes/no · repeatable · filterable · templates · drag & drop')}</span>
      </div>
      <p className="mb-3 text-[12px] text-dim2">{tr('Everything you define here drives the product editor, the AI-import auto-creation, the product page and the shop filters automatically — no code changes, ever.')}</p>
      {items ? <SpecSchemaEditor categories={items} onSaved={load} toast={toast} /> : <div className="text-[12.5px] text-dim2">{tr('Loading…')}</div>}
    </div>
  );
}

function CatalogPage() {
  return (
    <>
      <CategoriesCard />
      <BadgesCard />
      <SpecSchemaCard />
    </>
  );
}

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="catalog" title={tr('Catalog — Categories & Badges')}>
        <CatalogPage />
      </AdminShell>
    </OverlayProvider>
  );
}
