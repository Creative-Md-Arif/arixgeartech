/* ArixGear ADMIN page — Loyalty (Task 56-a)
   Points ledger for every customer: stats strip, editable rules, searchable
   table with inline ± adjust and a full history drawer per customer. */
import { useEffect, useState } from 'react';
import { money, day } from '../lib/admin.js';
import { list, detail, adjust, getSettings, saveSettings } from '../services/loyalty.js';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useDrawer, useToast, useModal } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { tr, useLang } from '../lib/i18n.jsx';

const TH = 'px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.14em] text-dim border-b border-line2 whitespace-nowrap';
const TD = 'px-3 py-3 text-[12.5px] border-b border-line align-middle';
const ACT = 'rounded-md border border-line2 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-dim transition hover:border-acc hover:text-acc';
const INPUT = 'rounded-lg border border-line2 bg-bg px-3 py-2 text-[12.5px] text-txt outline-none focus:border-acc';

const TYPE_BADGE = {
  earn: 'text-green', redeem: 'text-acc', referral: 'text-yellow',
  adjust: 'text-txt', refund: 'text-green',
};

/* ── history drawer (per-customer ledger replay) ── */
function HistoryDrawer({ customerId, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { detail(customerId).then(setD).catch(() => setD({ customer: null, logs: [] })); }, [customerId]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h3 className="text-[15px] tracking-[.08em]">{d ? tr('Points History — {name}', { name: d.customer?.name || '…' }) : tr('Loading…')}</h3>
        <button onClick={onClose} className={ACT}>{tr('Close')}</button>
      </div>
      {d && d.customer ? (
        <p className="mt-2 text-[12px] text-dim2">
          {d.customer.email}{d.customer.phone ? ' · ' + d.customer.phone : ''} ·
          {' '}<b className="text-acc">{d.customer.points}</b> {tr('points')} ·
          {' '}{tr('code')} <b className="text-txt">{d.customer.referralCode || '—'}</b>
        </p>
      ) : null}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {!d ? <p className="py-6 text-center text-[12.5px] text-dim2">{tr('Loading…')}</p> : !d.logs.length ? (
          <p className="py-6 text-center text-[12.5px] text-dim2">{tr('No point activity yet.')}</p>
        ) : d.logs.map((h) => (
          <div key={h.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[12.5px] last:border-b-0">
            <div className="min-w-0">
              <span className={'font-bold ' + (TYPE_BADGE[h.type] || 'text-txt')}>{h.points > 0 ? '+' : ''}{h.points}</span>
              <span className="ml-2 uppercase tracking-[.06em] text-dim2">[{tr(h.type)}]</span>
              <span className="ml-2 text-dim">{h.note}{h.orderNumber ? ' · ' + h.orderNumber : ''}</span>
            </div>
            <span className="shrink-0 text-[10.5px] text-dim2">{day(h.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── adjust modal body ── */
function AdjustForm({ row, busy, onSubmit, onClose }) {
  const [pts, setPts] = useState('');
  const [note, setNote] = useState('');
  const n = Math.trunc(Number(pts));
  const valid = Number.isFinite(n) && n !== 0;
  return (
    <div>
      <h3 className="text-[16px]">{tr('Adjust Points — {name}', { name: row.name })}</h3>
      <p className="mt-1 text-[12px] text-dim2">{tr('Current balance: {n} points', { n: row.points })}</p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim2">{tr('Points (+credit / −debit)')}</label>
          <input id="adjPoints" type="number" step="1" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="e.g. 100 or -50" className={INPUT + ' w-full'} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim2">{tr('Note (customer sees this)')}</label>
          <input id="adjNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('Compensation, campaign bonus…')} className={INPUT + ' w-full'} />
        </div>
        <div className="flex flex-wrap gap-2">
          {[100, 250, 500].map((v) => (
            <button key={v} onClick={() => setPts(String(v))} className={ACT}>+{v}</button>
          ))}
          {row.points > 0 && <button onClick={() => setPts(String(-Math.min(100, row.points)))} className={ACT}>−100</button>}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button id="adjSave" disabled={!valid || busy} onClick={() => onSubmit(n, note)}
          className="rounded-lg bg-acc px-3.5 py-2 text-[12px] font-bold uppercase tracking-[.06em] text-white transition hover:bg-acc-hi disabled:opacity-40">
          {busy ? tr('Saving…') : tr('Apply')}
        </button>
        <button className="rounded-lg border border-line2 px-3.5 py-2 text-[12px] text-dim2 transition hover:text-txt" onClick={onClose}>{tr('Cancel')}</button>
      </div>
    </div>
  );
}

/* ── rules card ── */
function RulesCard({ rules, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(rules);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(rules), [rules]);
  const numField = (key, label, sub, step = '1') => (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim2">{label}</label>
      <input id={'rl-' + key} type="number" step={step} min="0" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className={INPUT + ' w-full'} />
      {sub ? <p className="mt-1 text-[10.5px] text-dim2">{sub}</p> : null}
    </div>
  );
  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveSettings({
        enabled: f.enabled,
        earnPer100: Number(f.earnPer100), pointValue: Number(f.pointValue),
        minRedeem: Number(f.minRedeem), maxRedeemPct: Number(f.maxRedeemPct),
      });
      toast(tr('Loyalty rules saved'));
      onSaved(saved);
    } catch (e) { toast(e.message || tr('Save failed'), 'err'); }
    setBusy(false);
  };
  return (
    <div className="rounded-[10px] border border-line bg-panel p-5" id="loyaltyRules">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] tracking-[.08em]">{tr('Program Rules')}</h3>
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] font-bold uppercase tracking-[.08em] text-dim">
          <input id="rl-enabled" type="checkbox" checked={!!f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--acc)]" />
          {tr('Redemption ON')}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numField('earnPer100', tr('Earn rate'), tr('points per ৳100 delivered'))}
        {numField('pointValue', tr('Point value'), tr('৳ per point at checkout'), '0.1')}
        {numField('minRedeem', tr('Min redeem'), tr('smallest usable balance'))}
        {numField('maxRedeemPct', tr('Max redeem'), tr('% of subtotal cap'))}
      </div>
      <button id="rlSave" onClick={save} disabled={busy}
        className="mt-3.5 rounded-lg bg-acc px-4 py-2 text-[11.5px] font-bold uppercase tracking-[.08em] text-white transition hover:bg-acc-hi disabled:opacity-40">
        {busy ? tr('Saving…') : tr('Save Rules')}
      </button>
    </div>
  );
}

function Loyalty() {
  const { t } = useLang();
  const toast = useToast();
  const { openDrawer, closeDrawer } = useDrawer();
  const { openModal, closeModal } = useModal();
  const [d, setD] = useState(null);
  const [rules, setRules] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('points');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = async (opts = {}) => {
    try {
      const query = { q: opts.q ?? q, sort: opts.sort ?? sort, page: opts.page ?? page };
      const [data, r] = await Promise.all([list(query), getSettings()]);
      setD(data); setRules(r); setErr('');
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, [sort, page]);

  const openAdjust = (row) => {
    openModal(<AdjustForm row={row} busy={busy} onClose={closeModal} onSubmit={(n, note) => doAdjust(row, n, note)} />);
  };

  const doAdjust = async (row, n, note) => {
    setBusy(true);
    try {
      const r = await adjust(row.id, n, note);
      toast(r.message || tr('Balance updated'));
      closeModal();
      await load();
    } catch (e) { toast(e.message || tr('Adjust failed'), 'err'); }
    setBusy(false);
  };

  const openHistory = (row) => {
    openDrawer(
      tr('Points History — {name}', { name: row.name }),
      <HistoryDrawer customerId={row.id} onClose={closeDrawer} />
    );
  };

  const s = d ? d.stats : {};

  return (
    <>
      {/* stats strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard k={tr('Outstanding Points')} v={s.outstanding ?? '…'} s={tr('live customer balances')} hot />
        <StatCard k={tr('Liability Value')} v={s.value != null ? money(s.value) : '…'} s={tr('৳ owed at current point value')} />
        <StatCard k={tr('Point Holders')} v={s.holders ?? '…'} s={tr('customers with balance > 0')} />
        <StatCard k={tr('Redeemed (30d)')} v={s.redeemed30 ?? '…'} s={tr('earned 30d: {n}', { n: s.earned30 ?? '…' })} />
      </div>

      {/* rules */}
      <div className="mt-4">{rules ? <RulesCard rules={rules} onSaved={setRules} /> : <div className="h-[150px] animate-pulse rounded-[10px] border border-line bg-panel" />}</div>

      {/* search + sort */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input id="loySearch" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load({ q, page: 1 }); } }}
          placeholder={tr('Search name / email / phone / referral code…')} className={INPUT + ' min-w-[240px] flex-1'} />
        <button id="loySearchBtn" onClick={() => { setPage(1); load({ q, page: 1 }); }} className={ACT}>{tr('Search')}</button>
        <select id="loySort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className={INPUT}>
          <option value="points">{tr('Top points first')}</option>
          <option value="recent">{tr('Newest customers')}</option>
        </select>
      </div>

      {/* table */}
      <div className="mt-3 overflow-x-auto rounded-[10px] border border-line bg-panel" id="loyTable">
        {err ? <div className="px-4 py-6 text-center text-[12.5px] text-red">{err}</div>
          : !d ? <TableSkeleton rows={8} cols={5} />
            : !d.items.length ? <div className="px-4 py-10 text-center text-[13px] text-dim2">{tr('No customers match this search.')}</div>
              : (
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className={TH}>{tr('Customer')}</th>
                      <th className={TH}>{tr('Contact')}</th>
                      <th className={TH}>{tr('Points')}</th>
                      <th className={TH}>{tr('Value')}</th>
                      <th className={TH}>{tr('Referral Code')}</th>
                      <th className={TH + ' text-right'}>{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-panel2">
                        <td className={TD}>
                          <b className="text-txt">{r.name}</b>
                          {!r.active ? <span className="ml-2 rounded bg-red/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-red">{tr('disabled')}</span> : null}
                        </td>
                        <td className={TD + ' text-dim'}>{r.email || r.phone || '—'}</td>
                        <td className={TD}><b className="font-disp text-[16px] text-acc">{r.points}</b></td>
                        <td className={TD + ' text-dim'}>{money(r.points * (rules ? rules.pointValue : 1))}</td>
                        <td className={TD + ' font-cond text-[12px] font-bold tracking-[.08em] text-txt'}>{r.referralCode || '—'}</td>
                        <td className={TD + ' text-right'}>
                          <div className="flex justify-end gap-1.5">
                            <button className={ACT} onClick={() => openAdjust(r)}>{tr('± Adjust')}</button>
                            <button className={ACT} onClick={() => openHistory(r)}>{tr('History')}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
      </div>

      {/* pager */}
      {d && d.pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-[12px] text-dim2">
          <span>{tr('Page {p} of {n}', { p: d.page, n: d.pages })} · {d.total} {tr('customers')}</span>
          <div className="flex gap-1.5">
            <button className={ACT} disabled={d.page <= 1} onClick={() => setPage(d.page - 1)}>← {tr('Prev')}</button>
            <button className={ACT} disabled={d.page >= d.pages} onClick={() => setPage(d.page + 1)}>{tr('Next')} →</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* StatCard — same visual language as dashboard */
function StatCard({ k, v, s, hot }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-panel p-5">
      {hot ? <div className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-acc-dim blur-xl" /> : null}
      <div className="text-[10.5px] font-bold uppercase tracking-[.18em] text-dim">{k}</div>
      <div className={'mt-2 font-disp text-[30px] leading-none' + (hot ? ' text-acc' : '')}>{v}</div>
      <div className="mt-1.5 text-[11.5px] text-dim2">{s}</div>
    </div>
  );
}

function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="loyalty" title={tr('Loyalty')}>
        <Loyalty />
      </AdminShell>
    </OverlayProvider>
  );
}

export default Page;
