/* Step 5 — CATEGORY SPEC SCHEMA MANAGER (Admin → Catalog → "Spec Schema").
   Unlimited groups · custom fields · 6 field types · dropdown options ·
   repeatable values · filterable/showInDetails/required switches · drag & drop
   sorting of groups AND fields · reusable templates (save current schema,
   apply a template in merge or replace mode). Everything is schema-driven:
   adding a field here instantly drives the product editor, the PDP and the
   shop filters — no developer code changes. */
import { useEffect, useRef, useState } from 'react';
import { tr, useLang } from '../lib/i18n.jsx';
import { useConfirm, usePrompt } from './ui.jsx';
import { saveSchema, listTemplates, createTemplate, applyTemplate, removeTemplate, applyDefaults, aliasSuggestions } from '../services/specs.js';
import { useDragState, makeDragHandlers, FIELD_TYPES } from './dnd.jsx';

const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const DRAG = 'cursor-grab select-none text-dim2 hover:text-acc';
const TOGGLE = (on) => 'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + (on ? 'border-acc bg-acc/15 text-acc' : 'border-line2 text-dim2');

/* parse a compact alias CSV ("raw=canonical, raw2=canonical2") → object */
const parseAliases = (s) => Object.fromEntries(
  String(s || '').split(',').map((p) => p.split('='))
    .filter((p) => p.length >= 2 && p[0].trim() && p[1].trim())
    .map((p) => [p[0].trim().slice(0, 120), p.slice(1).join('=').trim().slice(0, 120)])
);
/* object → compact CSV (for the input) */
const aliasesCsv = (o) => Object.entries(o || {}).map(([k, v]) => k + '=' + v).join(', ');

/* Step 7 — CARD BADGE PREVIEW (#3): a live mini product card that mirrors the
   storefront's showOnCard chips (max 3, schema order, bn titles) AS the admin
   toggles them — instant feedback, no save needed. Sample values come from
   the field's defaultValue / first option. */
function CardPreview({ cat, groups, isBn }) {
  const chips = [];
  for (const g of [...groups].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    for (const f of [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
      if (!f.showOnCard || chips.length >= 3) continue;
      const sample = f.defaultValue != null && f.defaultValue !== ''
        ? (Array.isArray(f.defaultValue) ? f.defaultValue.join(', ') : String(f.defaultValue))
        : ((f.options || [])[0] || '…');
      chips.push({ label: (isBn && f.labelBn ? f.labelBn : f.label) + ': ' + sample, icon: f.icon || '', v: String(sample).slice(0, 60) });
    }
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel2 p-3" id="ssCardPreview" data-chips={chips.length}>
      <div className="w-[178px] shrink-0 rounded-lg border border-line bg-panel p-2">
        <div className="mb-1.5 flex h-[62px] items-center justify-center rounded bg-panel2 text-[22px]">🖼️</div>
        <p className="truncate text-[11px] font-bold text-txt">{cat.name} — {isBn ? 'নমুনা প্রোডাক্ট' : 'Sample product'}</p>
        <p className="text-[11px] font-bold text-acc">৳49,900</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {chips.map((c, i) => (
            <span key={i} className="inline-flex max-w-[152px] items-center gap-0.5 rounded border border-line2 bg-panel2 px-1 py-0.5 text-[9.5px] text-dim" title={c.label}>
              {c.icon ? <span aria-hidden="true">{c.icon}</span> : null}
              <span className="truncate">{c.v}</span>
            </span>
          ))}
        </div>
        {!chips.length ? <p className="mt-1 text-[9.5px] leading-tight text-dim2">{isBn ? 'কোনো ফিল্ডে ⬆ card চালু নেই' : 'No field has ⬆ card on yet'}</p> : null}
      </div>
      <p className="max-w-[420px] text-[11px] leading-snug text-dim2">
        {isBn
          ? 'লাইভ কার্ড প্রিভিউ — শপ গ্রিডের কার্ডে চিপগুলো ঠিক এভাবেই রেন্ডার হবে (সর্বোচ্চ ৩টি, স্কিমা অর্ডার অনুযায়ী, বাংলা লেবেল সহ)। ⬆ card টগল করলেই এখানে দেখা যাবে — সেভ করার দরকার নেই।'
          : 'Live card preview — the shop grid renders the ⬆ card chips exactly like this (max 3, schema order, bn titles). Toggles apply instantly; no save needed.'}
      </p>
    </div>
  );
}

export default function SpecSchemaEditor({ categories, initialSlug, onSaved, toast }) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { isBn } = useLang();
  const [slug, setSlug] = useState(initialSlug || (categories[0] && categories[0].slug) || '');
  const cat = categories.find((c) => c.slug === slug);
  const [groups, setGroups] = useState([]);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [version, setVersion] = useState(null); // Step 6 — schemaVersion chip

  useEffect(() => {
    const c = categories.find((x) => x.slug === slug);
    setGroups(JSON.parse(JSON.stringify((c && c.specGroups) || [])));
    setHideEmpty(c ? c.hideEmptyFields !== false : true);
    setDirty(false);
    setVersion(c ? (c.schemaVersion || 0) : null);
    setShowAudit(false);
  }, [slug, categories]);

  const loadTemplates = () => listTemplates().then((d) => setTemplates(d.items || [])).catch(() => {});
  useEffect(() => { loadTemplates(); }, []);

  /* group + field DnD — one shared drag state (hook-safe inside maps) */
  const dragRef = useDragState();
  const gDrag = makeDragHandlers(dragRef, 'groups', (from, to) => {
    setGroups((gs) => { const n = [...gs]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n.map((g, i) => ({ ...g, order: i })); });
    setDirty(true);
  });
  const fieldDragFor = (gi) => makeDragHandlers(dragRef, 'field-' + gi, (from, to) => {
    setGroups((gs) => gs.map((g, ix) => {
      if (ix !== gi) return g;
      const n = [...(g.fields || [])]; const [m] = n.splice(from, 1); n.splice(to, 0, m);
      return { ...g, fields: n.map((f, i) => ({ ...f, order: i })) };
    }));
    setDirty(true);
  });

  const addGroup = () => setGroups((gs) => [...gs, { key: '', label: '', labelBn: '', collapsed: false, order: gs.length, fields: [] }]);
  const delGroup = async (gi) => {
    const g = groups[gi];
    if (!(await confirm({ title: 'Delete spec group', body: `Delete "${g.label || g.key}" and its ${(g.fields || []).length} field(s)? Products keep their stored values — the fields just stop being edited/displayed by schema.`, danger: true, ok: 'Delete' }))) return;
    setGroups((gs) => gs.filter((_, ix) => ix !== gi).map((g2, i) => ({ ...g2, order: i })));
    setDirty(true);
  };
  const patchGroup = (gi, patch) => { setGroups((gs) => gs.map((g, ix) => (ix === gi ? { ...g, ...patch } : g))); setDirty(true); };

  const addField = (gi) => patchGroup(gi, { fields: [...(groups[gi].fields || []), { key: '', label: '', labelBn: '', type: 'text', options: [], unit: '', defaultValue: '', repeatable: false, filterable: false, showInDetails: true, required: false, icon: '', aliases: {}, showOnCard: false, order: (groups[gi].fields || []).length }] });
  const patchField = (gi, fi, patch) => patchGroup(gi, { fields: groups[gi].fields.map((f, ix) => (ix === fi ? { ...f, ...patch } : f)) });
  const delField = (gi, fi) => patchGroup(gi, { fields: groups[gi].fields.filter((_, ix) => ix !== fi).map((f, i) => ({ ...f, order: i })) });
  const moveField = (gi, fi, dir) => {
    const fields = [...groups[gi].fields];
    const to = fi + dir;
    if (to < 0 || to >= fields.length) return;
    const [m] = fields.splice(fi, 1); fields.splice(to, 0, m);
    patchGroup(gi, { fields: fields.map((f, i) => ({ ...f, order: i })) });
  };

  const save = async () => {
    for (const g of groups) if (!String(g.label || '').trim()) { return toast(tr('Every group needs a label'), 'err'); }
    setBusy(true);
    try {
      const r = await saveSchema(cat._id, { specGroups: groups, hideEmptyFields: hideEmpty });
      setDirty(false);
      onSaved && onSaved();
      toast(tr('Spec schema saved — the product editor, PDP and shop filters pick it up instantly'), 'ok');
      if (r && r.schemaVersion) setVersion(r.schemaVersion);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  /* Step 6 — BULK SPEC FILL: apply this schema's defaultValue(s) to every
     product of the category in one server-side pass. */
  const fillAll = async () => {
    const n = groups.reduce((a, g) => a + (g.fields || []).filter((f) => f.defaultValue !== '' && f.defaultValue != null && !(Array.isArray(f.defaultValue) && !f.defaultValue.length)).length, 0);
    if (!n) { toast(tr('No defaultValue set on any field — set fill defaults first'), 'err'); return; }
    if (!(await confirm({ title: tr('Fill all products with defaults'), body: tr('Apply {n} schema default(s) to EVERY product of "{c}"? Only fields the product has no value for are filled — existing values are never overwritten.', { n, c: cat.name }), ok: 'Fill products' }))) return;
    setBusy(true);
    try {
      const r = await applyDefaults(cat._id);
      toast(tr('Filled {f} field(s) across {u} product(s) (of {s} scanned)', { f: r.filled, u: r.updated, s: r.scanned }), 'ok');
      onSaved && onSaved();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const saveAsTemplate = async () => {
    const name = await prompt({ title: tr('Save as reusable template'), body: tr('Name this template (it captures every group + field of this category):'), placeholder: 'Gaming laptops core schema', ok: 'Save template' });
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      await createTemplate({ name: name.trim(), fromCategory: cat.slug });
      await loadTemplates();
      toast(tr('Template saved — apply it to any category from the picker'), 'ok');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const applyTpl = async (templateId, mode) => {
    const t = templates.find((x) => x._id === templateId);
    if (!t) return;
    if (mode === 'replace' && !(await confirm({ title: tr('Replace schema'), body: tr('Replace the WHOLE schema of this category with the template? Groups not in the template are removed (product values survive).'), danger: true, ok: 'Replace' }))) return;
    setBusy(true);
    try {
      const r = await applyTemplate(cat._id, templateId, mode);
      setGroups(JSON.parse(JSON.stringify(r.groups || [])));
      setDirty(false);
      onSaved && onSaved();
      toast(tr('Template applied ({mode})', { mode: mode }), 'ok');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const delTemplate = async (id) => {
    const t = templates.find((x) => x._id === id);
    if (!(await confirm({ title: tr('Delete template'), body: tr('Delete template "{n}"?', { n: t.name }), danger: true, ok: 'Delete' }))) return;
    try { await removeTemplate(id); await loadTemplates(); toast(tr('Template deleted'), 'ok'); } catch (e) { toast(e.message, 'err'); }
  };

  /* Step 7 — FACET ALIAS AUTO-SUGGEST (#1): mine the category's own product
     values and propose raw=canonical pairs; applying one patches the field's
     alias map in the LOCAL draft (marked dirty) — the admin stays in control. */
  const [aliasSug, setAliasSug] = useState(null); // { fields:[{key,label,suggestions:[{raw,canonical,count}]}], scanned }
  const [aliasBusy, setAliasBusy] = useState(false);
  const mineAliases = async () => {
    setAliasBusy(true);
    try {
      const r = await aliasSuggestions(cat._id);
      setAliasSug(r);
      toast(r.fields?.length ? tr('Found {n} alias suggestion(s) across {f} field(s) — review below', { n: r.totalSuggestions, f: r.fields.length }) : tr('No alias-worthy value variants found in this category'), r.fields?.length ? 'ok' : 'err');
    } catch (e) { toast(e.message, 'err'); } finally { setAliasBusy(false); }
  };
  const applyAliasPair = (fieldKey, raw, canonical) => {
    setGroups((gs) => gs.map((g) => ({ ...g, fields: (g.fields || []).map((f) => (f.key === fieldKey ? { ...f, aliases: { ...(f.aliases || {}), [raw]: canonical } } : f)) })));
    setAliasSug((s) => ({ ...s, fields: (s.fields || []).map((f) => ({ ...f, suggestions: f.suggestions.filter((x) => !(x.raw === raw && x.canonical === canonical)) })).filter((f) => f.suggestions.length) }));
    setDirty(true);
  };

  if (!cat) return <div className="text-[12.5px] text-dim2">{tr('Create a category first.')}</div>;

  return (
    <div id="specSchemaEditor">
      {/* category picker + template actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select id="ssCat" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-auto">
          {categories.map((c) => <option key={c.slug} value={c.slug}>{(c.path && c.path.length > 1 ? c.path[0] + ' → ' : '') + c.name}</option>)}
        </select>
        <span className="text-[11.5px] text-dim2">{groups.length} {tr('groups')} · {groups.reduce((a, g) => a + (g.fields || []).length, 0)} {tr('fields')}</span>
        {dirty ? <span className={TOGGLE(true)}>{tr('unsaved')}</span> : null}
        {/* Step 6 — schema version + audit trail (who edited what, last 20) */}
        {version != null ? (
          <span className="relative inline-flex items-center">
            <button type="button" className={TOGGLE(false)} id="ssVersion" title={tr('Schema version — click for the edit history')} onClick={() => setShowAudit((v) => !v)}>v{version} · {tr('schema')}</button>
            {showAudit && (cat.schemaAudit || []).length ? (
              <div className="absolute left-0 top-7 z-30 w-[320px] rounded-lg border border-line bg-panel2 p-2.5 text-[10.5px] shadow-xl">
                <p className="mb-1 font-bold uppercase tracking-wide text-dim">{tr('Schema edit history')}</p>
                {cat.schemaAudit.map((a, i) => (
                  <p key={i} className="border-t border-line/60 py-1 text-dim"><b className="text-txt">v{version - i}</b> · {a.action} · {a.by}{a.byEmail ? ` (${a.byEmail})` : ''} · {a.summary}</p>
                ))}
              </div>
            ) : null}
          </span>
        ) : null}
        <div className="flex-1" />
        <button type="button" className={GHOST_BTN} disabled={busy || aliasBusy} id="ssMineAliases" onClick={mineAliases} title={tr('Mine this category\'s product values and propose raw=canonical alias pairs')}>{aliasBusy ? '⛏…' : '🤖 ' + tr('Suggest aliases')}</button>
        <button type="button" className={GHOST_BTN} disabled={busy} id="ssFillAll" onClick={fillAll} title={tr('Apply every field defaultValue to all products of this category')}>{tr('Fill products with defaults')}</button>
        <select id="ssTplApply" className="w-auto" value="" disabled={busy || !templates.length}
          onChange={(e) => { const v = e.target.value; e.target.value = ''; if (!v) return; const [id, mode] = v.split('|'); applyTpl(id, mode); }}>
          <option value="">{templates.length ? tr('Apply template…') : tr('No templates yet')}</option>
          {templates.map((t) => <option key={t._id + '|merge'} value={t._id + '|merge'}>▸ {t.name} — {tr('merge')}</option>)}
          {templates.map((t) => <option key={t._id + '|replace'} value={t._id + '|replace'}>▸ {t.name} — {tr('replace')}</option>)}
        </select>
        <button id="ssTplSave" className={GHOST_BTN} disabled={busy} onClick={saveAsTemplate}>{tr('Save as template')}</button>
        <button id="ssSave" className={ACC_BTN} disabled={busy} onClick={save}>{tr('Save schema')}</button>
      </div>

      {/* Step 7 — live card preview + alias miner, right under the toolbar */}
      <CardPreview cat={cat} groups={groups} isBn={isBn} />
      {aliasSug && aliasSug.fields?.length ? (
        <div className="mb-3 rounded-xl border border-acc/40 bg-panel2 p-3" id="ssAliasSug">
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-acc">🤖 {tr('Alias suggestions')} <span className="ml-1.5 font-normal normal-case tracking-normal text-dim2">{tr('mined from {n} product(s) of this branch', { n: aliasSug.scanned })}</span></p>
          <div className="mt-2 space-y-2 text-[11.5px]">
            {aliasSug.fields.map((f) => (
              <div key={f.key} data-sugfield={f.key}>
                <p className="font-bold text-txt">{isBn && f.labelBn ? f.labelBn : f.label} <span className="font-normal text-dim2">({f.distinct} {tr('distinct values')})</span></p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {f.suggestions.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full border border-line2 bg-panel px-2 py-0.5" title={tr('{c} product(s) carry this raw variant', { c: s.count })}>
                      <span className="text-dim">{s.raw}</span>
                      <span className="text-acc">→ {s.canonical}</span>
                      <button type="button" className="font-bold text-acc hover:underline" onClick={() => applyAliasPair(f.key, s.raw, s.canonical)}>{tr('apply')}</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] text-dim2">{tr('Apply writes the pair into the field\'s alias map below (draft) — save the schema to publish it to facets and filter queries.')}</p>
        </div>
      ) : null}

      {/* groups — drag & drop reorder */}
      <div className="space-y-2.5">
        {groups.map((g, gi) => {
          const fd = fieldDragFor(gi);
          return (
            <div key={gi} className="rounded-xl border border-line bg-panel2 p-3" data-specgroup={gi}
              onDragOver={gDrag.onDragOver(gi)} onDrop={gDrag.onDrop(gi)}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={DRAG} title={tr('Drag to reorder')} draggable onDragStart={gDrag.onDragStart(gi)} onDragEnd={gDrag.onDragEnd}>⠿</span>
                <input className="w-[200px]" value={g.label} placeholder={tr('Group label (e.g. Performance)')} aria-label={tr('Group label')} onChange={(e) => patchGroup(gi, { label: e.target.value })} />
                <input className="w-[170px]" value={g.labelBn || ''} placeholder={tr('গ্রুপ লেবেল (বাংলা)')} aria-label={tr('Group label Bangla')} onChange={(e) => patchGroup(gi, { labelBn: e.target.value })} />
                <button type="button" className={TOGGLE(g.collapsed)} onClick={() => patchGroup(gi, { collapsed: !g.collapsed })} title={tr('Collapsed by default on the PDP')}>{g.collapsed ? tr('collapsed') : tr('open')}</button>
                <div className="flex-1" />
                <button type="button" className={RED_BTN} onClick={() => delGroup(gi)}>{tr('Delete')}</button>
              </div>
              <div className="space-y-1.5">
                {(g.fields || []).map((f, fi) => (
                  <div key={fi} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2" data-specfield={gi + '-' + fi}
                    onDragOver={fd.onDragOver(fi)} onDrop={fd.onDrop(fi)}>
                    <span className={DRAG} title={tr('Drag to reorder')} draggable onDragStart={fd.onDragStart(fi)} onDragEnd={fd.onDragEnd}>⠿</span>
                    <input className="w-[170px]" value={f.label} placeholder={tr('Field label')} aria-label={tr('Field label')} onChange={(e) => patchField(gi, fi, { label: e.target.value })} />
                    <input className="w-[150px]" value={f.labelBn || ''} placeholder={tr('ফিল্ড (বাংলা)')} aria-label={tr('Field label Bangla')} onChange={(e) => patchField(gi, fi, { labelBn: e.target.value })} />
                    <select className="w-auto" value={f.type} aria-label={tr('Field type')} onChange={(e) => patchField(gi, fi, { type: e.target.value })}>
                      {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {f.type === 'number' ? <input className="w-[90px]" value={f.unit || ''} placeholder={tr('unit')} aria-label={tr('Unit')} onChange={(e) => patchField(gi, fi, { unit: e.target.value })} /> : null}
                    {f.type === 'select' || f.type === 'multiselect' ? (
                      <input className="flex-1 min-w-[180px]" value={(f.options || []).join(', ')} placeholder={tr('Options — comma separated')} aria-label={tr('Field options')}
                        onChange={(e) => patchField(gi, fi, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                    ) : (
                      <input className="w-[170px]" value={f.defaultValue == null ? '' : String(f.defaultValue)} placeholder={tr('Fill default')} aria-label={tr('Default value')} onChange={(e) => patchField(gi, fi, { defaultValue: e.target.value })} />
                    )}
                    {/* Step 6 — per-field icon (PDP + compare rows) */}
                    <input className="w-[56px] text-center" value={f.icon || ''} placeholder="⊞" aria-label={tr('Field icon')}
                      title={tr('Icon for the spec row (emoji or glyph)')} onChange={(e) => patchField(gi, fi, { icon: e.target.value.slice(0, 8) })} />
                    {/* Step 6 — facet aliases: raw=canonical pairs fold messy legacy
                        values into one facet bucket and one filter click */}
                    <input className="w-[220px]" value={aliasesCsv(f.aliases)} placeholder={tr('aliases: raw=canonical, …')}
                      aria-label={tr('Facet value aliases')}
                      title={tr('Fold messy legacy values into one bucket: "512GB NVMe SSD (M.2 2280)=512GB SSD"')}
                      onChange={(e) => patchField(gi, fi, { aliases: parseAliases(e.target.value) })} />
                    <button type="button" className={TOGGLE(f.filterable)} onClick={() => patchField(gi, fi, { filterable: !f.filterable })} title={tr('Show as a shop filter facet')}>◈ {tr('filter')}</button>
                    <button type="button" className={TOGGLE(f.showInDetails !== false)} onClick={() => patchField(gi, fi, { showInDetails: f.showInDetails === false })} title={tr('Show on the product page')}>👁</button>
                    {/* Step 6 — card chip flag: value surfaces on shop product cards */}
                    <button type="button" className={TOGGLE(f.showOnCard)} onClick={() => patchField(gi, fi, { showOnCard: !f.showOnCard })} title={tr('Show the value as a chip on product cards')}>⬆ {tr('card')}</button>
                    <button type="button" className={TOGGLE(f.repeatable)} onClick={() => patchField(gi, fi, { repeatable: !f.repeatable })} title={tr('Allow multiple values')}>⟳</button>
                    <button type="button" className={TOGGLE(f.required)} onClick={() => patchField(gi, fi, { required: !f.required })} title={tr('Required')}>✱</button>
                    <button type="button" className={GHOST_BTN} title={tr('Move up')} onClick={() => moveField(gi, fi, -1)}>↑</button>
                    <button type="button" className={GHOST_BTN} title={tr('Move down')} onClick={() => moveField(gi, fi, 1)}>↓</button>
                    <button type="button" className={RED_BTN} onClick={() => delField(gi, fi)}>✕</button>
                  </div>
                ))}
              </div>
              <button type="button" className={GHOST_BTN + ' mt-2'} onClick={() => addField(gi)}>+ {tr('Add field')}</button>
            </div>
          );
        })}
        {!groups.length ? <p className="text-[12.5px] text-dim2">{tr('No spec groups yet — add the first one; every product in this category gets it instantly.')}</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button id="ssAddGroup" className={GHOST_BTN} onClick={addGroup}>+ {tr('Add group')}</button>
        <label className="m-0 flex items-center gap-1.5 text-[11.5px] normal-case tracking-normal text-dim">
          <input type="checkbox" className="w-auto" checked={hideEmpty} onChange={(e) => { setHideEmpty(e.target.checked); setDirty(true); }} />
          {tr('Hide empty fields on product pages of this category')}
        </label>
        {templates.length ? (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-dim2">{tr('Templates')}:</span>
            {templates.map((t) => (
              <span key={t._id} className="inline-flex items-center gap-1 rounded-full border border-line2 px-2 py-0.5 text-[10.5px]">
                {isBn && t.nameBn ? t.nameBn : t.name}
                <button type="button" className="text-dim2 hover:text-red" title={tr('Delete template')} onClick={() => delTemplate(t._id)}>✕</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
