/* ArixGear ADMIN page — Audit Log (Task 39, owner-only).
   Append-only trail of every staff mutation: who did what, to which entity,
   when, from which IP. Filter by entity / action or free-text search.        */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { list } from '../services/audit.js';
import { dt } from '../lib/admin.js';

const GHOST_BTN = 'rounded-lg border border-line2 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const INPUT = 'rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[12.5px] outline-none focus:border-acc';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide';

const ACTION_CHIP = {
  create: 'border-green/40 bg-green/10 text-green',
  update: 'border-blue/40 bg-blue/10 text-blue',
  delete: 'border-red/40 bg-red/10 text-red',
  duplicate: 'border-purple/40 bg-purple/10 text-purple',
  bulk: 'border-purple/40 bg-purple/10 text-purple',
  import: 'border-purple/40 bg-purple/10 text-purple',
  status: 'border-teal/40 bg-teal/10 text-teal',
  verify: 'border-green/40 bg-green/10 text-green',
  reject: 'border-red/40 bg-red/10 text-red',
  dispatch: 'border-yellow/40 bg-yellow/10 text-yellow',
  compose: 'border-orange/40 bg-orange/10 text-orange',
  'reset-password': 'border-yellow/40 bg-yellow/10 text-yellow',
};
const ENTITIES = ['product', 'category', 'badge', 'banner', 'home-section', 'coupon', 'order', 'return', 'setting', 'seo', 'customer', 'review', 'question', 'message', 'subadmin'];
const ACTIONS = ['create', 'update', 'delete', 'duplicate', 'bulk', 'import', 'status', 'verify', 'reject', 'dispatch', 'compose', 'reset-password'];

function AuditInner() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [schemaEdits, setSchemaEdits] = useState([]); // Step 7 — schema edit stream (#7)
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (f = {}, pageN = 1) => {
    setLoading(true);
    try {
      const d = await list({ ...f, page: pageN, limit: 50 });
      setRows(d.items || []);
      setSchemaEdits(d.schemaEdits || []);
      setPage(d.page || pageN);
      setPages(d.pages || 1);
      setTotal(d.total || 0);
    } catch (e) { toast(e.message || 'Load failed', 'err'); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load({}, 1); }, [load]);

  const currentFilters = () => ({ entity, action, q });
  const applyFilter = (next) => { setPage(1); load(next, 1); };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2" id="auditFilters">
        <select className={INPUT} value={entity} onChange={(e) => { const value = e.target.value; setEntity(value); applyFilter({ entity: value, action, q }); }}>
          <option value="">All entities</option>
          {ENTITIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={INPUT} value={action} onChange={(e) => { const value = e.target.value; setAction(value); applyFilter({ entity, action: value, q }); }}>
          <option value="">All actions</option>
          {ACTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); applyFilter(currentFilters()); }}>
          <input className={INPUT + ' w-[210px]'} placeholder="Search label / email / id…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={GHOST_BTN} type="submit">Search</button>
        </form>
        <button className={GHOST_BTN} onClick={() => { setEntity(''); setAction(''); setQ(''); setPage(1); load({}, 1); }}>Reset</button>
        <span className="ml-auto text-[11.5px] text-dim2">{loading ? 'Loading…' : `${rows.length} events`}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-panel" id="auditTable">
        {!loading && !rows.length ? (
          <div className="p-8 text-center text-[12.5px] text-dim">No audit events match — mutations performed in the console will appear here.</div>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-[.12em] text-dim2">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-panel2/40">
                  <td className="whitespace-nowrap px-4 py-2.5 text-[11.5px] text-dim">{dt(r.at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-txt">{r.actorName || '—'}</div>
                    <div className="text-[10.5px] text-dim2">{r.actorEmail}{r.actorRole === 'subadmin' ? ' · staff' : ''}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={CHIP + ' ' + (ACTION_CHIP[r.action] || 'border-line2 text-dim')}>{r.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-dim">{r.entity}</td>
                  <td className="max-w-[360px] px-4 py-2.5">
                    <div className="truncate text-txt" title={r.label}>{r.label || '—'}</div>
                    {r.entityId ? <div className="truncate font-mono text-[10px] text-dim2">{r.entityId}</div> : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[10.5px] text-dim2">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Step 7 — SCHEMA EDIT STREAM (#7): the spec-schema audit trail (Step 6's
          per-category schemaAudit) surfaces on the Audit page — editor saves,
          template applies and AI-import auto-creates in one stream. */}
      {!loading && pages > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button className={GHOST_BTN} disabled={page <= 1} onClick={() => load(currentFilters(), page - 1)}>← Previous</button>
          <span className="text-[12px] text-dim2">Page {page} of {pages} · {total} events</span>
          <button className={GHOST_BTN} disabled={page >= pages} onClick={() => load(currentFilters(), page + 1)}>Next →</button>
        </div>
      ) : null}

      {schemaEdits.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel" id="auditSchemaEdits">
          <div className="flex items-center justify-between border-b border-line bg-panel2 px-4 py-2.5">
            <h3 className="font-head text-[12px] font-bold uppercase tracking-[.12em] text-txt">Spec schema edits <span className="ml-1.5 font-normal normal-case tracking-normal text-dim2">— versioned per category (last 40)</span></h3>
            <span className="text-[11px] text-dim2">schema · template · ai-import</span>
          </div>
          <table className="w-full text-left text-[12px]">
            <tbody>
              {schemaEdits.map((s, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0 hover:bg-panel2/40" data-schemaedit={s.category}>
                  <td className="w-[110px] whitespace-nowrap px-4 py-2 text-[11px] text-dim">{dt(s.at)}</td>
                  <td className="w-[64px] px-2 py-2"><span className={CHIP + ' border-acc/60 text-acc'}>v{s.version}</span></td>
                  <td className="w-[150px] px-2 py-2 font-semibold text-txt">{s.categoryName}</td>
                  <td className="w-[90px] px-2 py-2"><span className={CHIP + ' ' + (ACTION_CHIP[s.action] || 'border-line2 text-dim')}>{s.action}</span></td>
                  <td className="px-2 py-2 text-txt" title={s.summary}>{s.summary}</td>
                  <td className="w-[190px] whitespace-nowrap px-4 py-2 text-[11px] text-dim2">{s.by}{s.byEmail ? ' · ' + s.byEmail : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export default function AuditPage() {
  return (
    <OverlayProvider>
      <AdminShell active="audit" title="Audit Log — Staff Activity">
        <AuditInner />
      </AdminShell>
    </OverlayProvider>
  );
}
