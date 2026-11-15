/* Step 5 — PER-PRODUCT DYNAMIC SPEC VALUES EDITOR.
   Renders the category's live specGroups schema (groups → fields by type)
   and edits this product's specValues rows [{g,k,v}]. Schema-driven: a new
   field added in Catalog → Specs appears here automatically — zero code.
   Fields missing from the schema (legacy imports) show under
   "Other specifications" as label+value rows and survive every save. */
import { tr } from '../lib/i18n.jsx';
import { FIELD_TYPES } from './dnd.jsx';

const GHOST_BTN = 'rounded-lg border border-line2 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const FULL = 'col-span-full';

const is_empty = (v) => v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');

export default function SpecValuesEditor({ schema, values, onChange, hideEmpty, onHideEmpty, toast }) {
  const setVal = (g, k, v) => {
    onChange((rows) => {
      const others = rows.filter((r) => !(r.g === g && r.k === k));
      return is_empty(v) ? others : [...others, { g, k, v }];
    });
  };
  const getVal = (g, k) => (values.find((r) => r.g === g && r.k === k) || {}).v;

  /* orphan rows = values whose (g,k) the schema no longer knows — never lost */
  const schemaKeys = new Set((schema || []).flatMap((g) => (g.fields || []).map((f) => f.key)));
  const orphans = values.filter((r) => !schemaKeys.has(r.k));
  const setOrphan = (idx, patch) => onChange((rows) => rows.map((r, ix) => (ix === idx ? { ...r, ...patch } : r)));
  const delOrphan = (idx) => onChange((rows) => rows.filter((_, ix) => ix !== idx));

  const fillDefaults = () => {
    let filled = 0;
    onChange((rows) => {
      const next = [...rows];
      for (const g of schema || []) {
        for (const f of g.fields || []) {
          if (f.defaultValue === undefined || f.defaultValue === null || String(f.defaultValue).trim() === '') continue;
          const cur = next.find((r) => r.g === g.key && r.k === f.key);
          const empty = !cur || is_empty(cur.v);
          if (!empty) continue;
          const dv = f.type === 'multiselect' ? String(f.defaultValue).split(',').map((s) => s.trim()).filter(Boolean)
            : f.type === 'number' ? Number(f.defaultValue)
            : f.type === 'boolean' ? /^(true|yes|1)$/i.test(String(f.defaultValue))
            : String(f.defaultValue);
          if (is_empty(dv)) continue;
          filled++;
          next.push({ g: g.key, k: f.key, v: dv });
        }
      }
      return next;
    });
    return filled;
  };

  return (
    <div className={FULL} id="pfSpecBlock">
      <div className="mb-3 flex flex-wrap items-center gap-3 border border-line bg-panel2 p-3">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-bold text-txt">{tr('Specifications — from the category schema')}</h3>
            {schema && schema.length ? (
              <span className="border border-acc/30 bg-acc/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-acc">
                {schema.reduce((total, group) => total + (group.fields || []).length, 0)} {tr('fields')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-dim2">
            {schema && schema.length
              ? tr('Values are organized by the selected category schema.')
              : tr('(no schema yet — define groups in Catalog → Specs)')}
          </p>
        </div>
        <button type="button" id="pfSpecFill" className={GHOST_BTN} disabled={!schema || !schema.length}
          title={tr('Fill every empty field with the schema default value')}
          onClick={() => { const n = fillDefaults(); if (toast) toast(n ? tr('{n} field(s) filled from defaults', { n }) : tr('Nothing to fill — every field already has a value'), n ? 'ok' : undefined); }}>
          {tr('Fill defaults')}
        </button>
        <label className="m-0 flex items-center gap-1.5 text-[11.5px] normal-case tracking-normal text-dim">
          <input type="checkbox" className="w-auto" checked={!!hideEmpty} onChange={(e) => onHideEmpty(e.target.checked)} />
          {tr('Hide empty fields on the product page')}
        </label>
      </div>

      {!schema || !schema.length ? (
        <div className="border border-dashed border-line2 bg-panel p-4">
          <label htmlFor="pfSpecs" className="mb-2 block text-[11px] font-bold uppercase tracking-[.08em] text-dim">
            {tr('Legacy specifications')}
          </label>
          <textarea id="pfSpecs" rows={3} className="w-full"
            value={orphans.map((r) => r.k + ': ' + r.v).join('\n')}
            onChange={(e) => onChange(() => e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
              const ix = l.indexOf(':');
              return ix > 0 ? { g: 'general', k: l.slice(0, ix).trim(), v: l.slice(ix + 1).trim() } : null;
            }).filter(Boolean))}
            placeholder={tr('Field: Value — one per line (schema-less fallback)')} />
        </div>
      ) : (
        <div className="space-y-4">
          {schema.map((g) => {
            const fields = g.fields || [];
            const filledCount = fields.filter((f) => !is_empty(getVal(g.key, f.key))).length;
            return (
              <section key={g.key} className="overflow-hidden border border-line bg-panel">
                <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[12px] font-bold uppercase tracking-[.08em] text-txt">{tr(g.label)}</h4>
                    {g.labelBn ? <p className="mt-0.5 text-[11px] text-dim2">{g.labelBn}</p> : null}
                  </div>
                  <span className="border border-line2 px-2 py-1 text-[10px] font-bold text-dim">
                    {filledCount}/{fields.length} {tr('filled')}
                  </span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] border-collapse text-left text-[12px]">
                    <thead className="bg-panel2/60 text-[10px] uppercase tracking-[.08em] text-dim">
                      <tr>
                        <th scope="col" className="w-[30%] min-w-[170px] px-4 py-2.5">{tr('Specification')}</th>
                        <th scope="col" className="px-4 py-2.5">{tr('Value')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f) => {
                        const v = getVal(g.key, f.key);
                        const id = 'pfSpec_' + g.key + '_' + f.key;
                        return (
                          <tr key={f.key} className="border-t border-line/80 align-top transition-colors hover:bg-panel2/30">
                            <th scope="row" className="px-4 py-3 text-left font-normal">
                              <label htmlFor={id} className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-txt">
                                {tr(f.label)}
                                {f.required ? <b className="text-red">*</b> : null}
                                {f.filterable ? <span className="border border-acc/30 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-acc">{tr('Filter')}</span> : null}
                              </label>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-dim2">
                                {f.labelBn ? <span>{f.labelBn}</span> : null}
                                {f.unit ? <span>({f.unit})</span> : null}
                                <span className="uppercase tracking-wide">{tr(f.type)}</span>
                              </div>
                            </th>
                            <td className="px-4 py-3">
                              {f.type === 'select' ? (
                                <select id={id} className="w-full" value={v == null ? '' : String(v)} onChange={(e) => setVal(g.key, f.key, e.target.value)}>
                                  <option value="">{tr('— none —')}</option>
                                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                  {v && !(f.options || []).some((o) => o === String(v)) ? <option value={String(v)}>{String(v)}</option> : null}
                                </select>
                              ) : f.type === 'multiselect' ? (
                                <div id={id} className="flex flex-wrap gap-1.5">
                                  {(f.options || []).map((o) => {
                                    const arr = Array.isArray(v) ? v : (v ? String(v).split(',').map((s) => s.trim()) : []);
                                    const on = arr.some((x) => String(x).toLowerCase() === o.toLowerCase());
                                    return (
                                      <button key={o} type="button" aria-pressed={on}
                                        className={'border px-2.5 py-1.5 text-[10.5px] font-semibold transition-colors ' + (on ? 'border-acc bg-acc/15 text-acc' : 'border-line2 bg-panel text-dim hover:border-acc hover:text-txt')}
                                        onClick={() => setVal(g.key, f.key, on ? arr.filter((x) => String(x).toLowerCase() !== o.toLowerCase()) : [...arr, o])}>
                                        {o}
                                      </button>
                                    );
                                  })}
                                  {!((f.options || []).length) ? <span className="text-[11px] text-dim2">{tr('No options defined')}</span> : null}
                                </div>
                              ) : f.type === 'boolean' ? (
                                <div id={id} className="flex gap-2">
                                  <button type="button" aria-pressed={v === true} className={'border px-3 py-1.5 text-[11.5px] font-bold ' + (v === true ? 'border-acc bg-acc/15 text-acc' : 'border-line2 text-dim')} onClick={() => setVal(g.key, f.key, true)}>{tr('Yes')}</button>
                                  <button type="button" aria-pressed={v === false} className={'border px-3 py-1.5 text-[11.5px] font-bold ' + (v === false ? 'border-acc bg-acc/15 text-acc' : 'border-line2 text-dim')} onClick={() => setVal(g.key, f.key, false)}>{tr('No')}</button>
                                </div>
                              ) : f.type === 'number' ? (
                                <input id={id} className="w-full" type="number" step="any" value={v == null ? '' : String(v)} onChange={(e) => setVal(g.key, f.key, e.target.value === '' ? '' : Number(e.target.value))} />
                              ) : f.type === 'textarea' ? (
                                <textarea id={id} className="w-full" rows={2} value={v == null ? '' : String(v)} onChange={(e) => setVal(g.key, f.key, e.target.value)} />
                              ) : f.type === 'text' && f.repeatable ? (
                                <div id={id} className="space-y-1.5">
                                  {(Array.isArray(v) ? v : v ? [String(v)] : []).map((piece, pi) => (
                                    <div key={pi} className="flex gap-1.5">
                                      <input className="min-w-0 flex-1" value={String(piece)} onChange={(e) => {
                                        const arr = Array.isArray(v) ? v.slice() : (v ? [String(v)] : []);
                                        arr[pi] = e.target.value;
                                        setVal(g.key, f.key, arr);
                                      }} />
                                      <button type="button" className={GHOST_BTN} onClick={() => setVal(g.key, f.key, (Array.isArray(v) ? v : [String(v)]).filter((_, x) => x !== pi))}>✕</button>
                                    </div>
                                  ))}
                                  <button type="button" className={GHOST_BTN} onClick={() => setVal(g.key, f.key, [...(Array.isArray(v) ? v : v ? [String(v)] : []), ''])}>+ {tr('Add value')}</button>
                                </div>
                              ) : (
                                <input id={id} className="w-full" value={v == null ? '' : String(v)} onChange={(e) => setVal(g.key, f.key, e.target.value)} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!fields.length ? <tr><td colSpan={2} className="px-4 py-4 text-center text-[11px] text-dim2">{tr('No fields in this group')}</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {orphans.length ? (
            <section className="overflow-hidden border border-yellow/40 bg-yellow/5">
              <header className="border-b border-yellow/30 px-4 py-3 text-[11px] font-bold uppercase tracking-[.08em] text-yellow">
                {tr('Other specifications (not in the schema — kept and shown)')}
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left text-[12px]">
                  <thead className="text-[10px] uppercase tracking-[.08em] text-dim">
                    <tr>
                      <th scope="col" className="w-[28%] px-4 py-2.5">{tr('Label')}</th>
                      <th scope="col" className="px-4 py-2.5">{tr('Value')}</th>
                      <th scope="col" className="w-16 px-4 py-2.5">{tr('Action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphans.map((r, ix) => {
                      const rowIndex = values.indexOf(r);
                      return (
                        <tr key={ix} className="border-t border-yellow/20" data-orphanrow={ix}>
                          <td className="px-4 py-2.5">
                            <input className="w-full" value={r.k} onChange={(e) => setOrphan(rowIndex, { k: e.target.value })} placeholder={tr('Label')} aria-label={tr('Orphan label')} />
                          </td>
                          <td className="px-4 py-2.5">
                            <input className="w-full" value={Array.isArray(r.v) ? r.v.join(', ') : String(r.v ?? '')} onChange={(e) => setOrphan(rowIndex, { v: e.target.value })} aria-label={tr('Orphan value')} />
                          </td>
                          <td className="px-4 py-2.5">
                            <button type="button" className={GHOST_BTN} onClick={() => delOrphan(rowIndex)} aria-label={tr('Remove specification')}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
