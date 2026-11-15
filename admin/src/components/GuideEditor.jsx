/* ArixGear ADMIN component — shared Size Guide table editor (Task 32).
   Used by: Settings (global table), Settings (category tables), Products form
   (custom table). Pure editor — parent owns the guide state and the save.
   props: { value: {title?, note?, headers[], rows[]}, onChange(g), prefix } */
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';

import { tr } from '../lib/i18n.jsx';

export default function GuideEditor({ value, onChange, prefix = 'ge' }) {
  const g = value || { headers: ['Size'], rows: [] };
  const setHeaders = (headers) => onChange({ ...g, headers });
  const setRows = (rows) => onChange({ ...g, rows });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="!mb-0">{tr('Columns')}</label>
        {g.headers.map((h, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <input id={prefix + 'H' + i} className="w-36" value={h} aria-label={'Column ' + (i + 1)}
              onChange={(e) => setHeaders(g.headers.map((x, j) => (j === i ? e.target.value : x)))} />
            <button id={prefix + 'DelCol' + i} type="button"
              className="rounded border border-line2 px-1.5 py-1 text-[11px] text-dim2 hover:border-red hover:text-red disabled:opacity-30"
              title={tr('Remove column')} disabled={g.headers.length <= 1}
              onClick={() => onChange({ ...g, headers: g.headers.filter((_, j) => j !== i), rows: g.rows.map((r) => r.filter((_, j) => j !== i)) })}>✕</button>
          </span>
        ))}
        <button id={prefix + 'AddCol'} type="button" className={GHOST_BTN} disabled={g.headers.length >= 6}
          onClick={() => onChange({ ...g, headers: [...g.headers, 'New column'], rows: g.rows.map((r) => [...r, '']) })}>
          {tr('+ Add column')}
        </button>
      </div>

      <div className="space-y-1.5">
        {g.rows.map((row, ri) => (
          <div key={ri} className="flex flex-wrap items-center gap-1.5">
            {row.map((cell, ci) => (
              <input key={ci} id={prefix + 'Cell' + ri + '-' + ci}
                className={(ci === 0 ? 'w-24 font-bold' : 'w-36') + (ri === 0 ? ' border-acc/60' : '')} value={cell}
                aria-label={'Row ' + (ri + 1) + ' cell ' + (ci + 1)}
                onChange={(e) => setRows(g.rows.map((r0, rj) => (rj === ri ? r0.map((c0, cj) => (cj === ci ? e.target.value : c0)) : r0)))} />
            ))}
            <button id={prefix + 'DelRow' + ri} type="button"
              className="rounded border border-line2 px-1.5 py-1 text-[11px] text-dim2 hover:border-red hover:text-red"
              title={tr('Remove row')} onClick={() => setRows(g.rows.filter((_, j) => j !== ri))}>✕</button>
          </div>
        ))}
        {!g.rows.length ? <p className="text-[12px] text-dim2">{tr('No rows yet — add one.')}</p> : null}
      </div>
      <button id={prefix + 'AddRow'} type="button" className={GHOST_BTN + ' mt-2'} disabled={g.rows.length >= 30}
        onClick={() => setRows([...g.rows, g.headers.map(() => '')])}>{tr('+ Add row')}</button>
    </div>
  );
}
