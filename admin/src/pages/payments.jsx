/* ArixGear ADMIN page — Payments / Transactions ledger (Task 40)
   GET /admin/payments · every payment across all orders (SSLCOMMERZ gateway,
   manual bKash/Nagad/Rocket, COD) with method/pay-status filters, search,
   date range, stats chips and a gateway refund action (simulator or real). */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { listTransactions, refundGateway } from '../services/payments.js';
import Pagination from '../components/Pagination.jsx';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const INP = 'rounded-lg border border-line2 bg-bg px-3 py-2 text-[12.5px] outline-none focus:border-acc';
const PAYMENT_PAGE_SIZE = 25;
const PAYMENT_SKEL = 'animate-pulse rounded bg-line/60';

const PAY_CHIP = {
  verified: 'border-green/40 text-green',
  paid: 'border-green/40 text-green',
  pending: 'border-yellow/40 text-yellow',
  'cod-pending': 'border-yellow/40 text-yellow',
  'cod-collected': 'border-green/40 text-green',
  rejected: 'border-red/50 text-red',
  failed: 'border-red/50 text-red',
};
/* Step 2 audit fix — aligned with OrdersTable's method palette (theme tokens
   only): the old map used raw tailwind-palette colors unreadable in light
   mode and a dead `text-orange` class for Nagad */
const METHOD_CHIP = {
  gateway: 'border-acc/50 text-acc',
  bkash: 'border-red/50 text-red',
  nagad: 'border-orange/50 text-orange',
  rocket: 'border-purple/50 text-purple',
  cod: 'border-line2 text-dim2',
};

/* Step 2 audit fix — 'en-BD' is not a valid locale (console warning +
   inconsistent formatting); en-US matches lib/admin money() */
const taka = (n) => '৳' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dt = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function PaymentTableSkeleton({ rows = 8 }) {
  return (
    <div data-testid="paymentSkeleton" aria-busy="true" aria-label="Loading payments" className="min-w-[900px]">
      <div className="flex h-10 items-center gap-6 border-b border-line">
        {[70, 130, 70, 150, 80, 85, 105, 55].map((w, i) => <span key={i} className={PAYMENT_SKEL + ' h-3 shrink-0'} style={{ width: w }} />)}
      </div>
      {Array.from({ length: Math.max(1, rows) }, (_, i) => (
        <div key={i} className="flex min-h-[58px] items-center gap-6 border-b border-line/60">
          <span className={PAYMENT_SKEL + ' h-3 w-[70px] shrink-0'} />
          <div className="w-[130px] shrink-0"><span className={PAYMENT_SKEL + ' block h-3 w-[92px]'} /><span className={PAYMENT_SKEL + ' mt-2 block h-2.5 w-[72px] opacity-70'} /></div>
          <span className={PAYMENT_SKEL + ' h-5 w-[62px] shrink-0 rounded-full'} />
          <div className="w-[150px] shrink-0"><span className={PAYMENT_SKEL + ' block h-3 w-[115px]'} /><span className={PAYMENT_SKEL + ' mt-2 block h-2.5 w-[88px] opacity-70'} /></div>
          <span className={PAYMENT_SKEL + ' h-5 w-[68px] shrink-0 rounded-full'} />
          <span className={PAYMENT_SKEL + ' h-3 w-[72px] shrink-0'} />
          <span className={PAYMENT_SKEL + ' h-3 w-[100px] shrink-0'} />
          <span className={PAYMENT_SKEL + ' ml-auto h-7 w-[68px] shrink-0 rounded-lg'} />
        </div>
      ))}
    </div>
  );
}

function PaymentStatsSkeleton({ count = 4 }) {
  return (
    <div data-testid="paymentStatsSkeleton" aria-hidden="true" className="flex min-h-[26px] flex-wrap items-center gap-2">
      {Array.from({ length: Math.max(1, count) }, (_, i) => <span key={i} className={PAYMENT_SKEL + ' h-5 w-[150px] rounded-full'} />)}
      <span className={PAYMENT_SKEL + ' h-3 w-[125px] opacity-70'} />
    </div>
  );
}

function PaymentsPage() {
  const toast = useToast();
  const [data, setData] = useState({ items: [], stats: [], total: 0, pages: 1 });
  const [f, setF] = useState({ method: '', status: '', q: '', from: '', to: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [refundRow, setRefundRow] = useState(null); // { orderNumber, amount, refunded }
  const [refundAmt, setRefundAmt] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundBusy, setRefundBusy] = useState(false); // Step 2 audit fix — money action, no double submit
  const [loaded, setLoaded] = useState(false);
  const [skeletonRows, setSkeletonRows] = useState(8);
  const [skeletonStats, setSkeletonStats] = useState(4);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listTransactions({ ...f, page: f.page || 1, limit: PAYMENT_PAGE_SIZE });
      setData(d);
      setSkeletonRows(Math.max(1, (d.items || []).length));
      setSkeletonStats(Math.max(1, (d.stats || []).length));
    } catch (e) { toast(e.message, 'err'); } finally { setLoaded(true); setLoading(false); }
  }, [f]); /* eslint-disable-line react-hooks/exhaustive-deps */

  useEffect(() => { load(); }, [f.method, f.status, f.from, f.to, f.page]);
  useEffect(() => {
    const t = setTimeout(() => { if (f.page !== 1) setF((p) => ({ ...p, page: 1 })); else load(); }, 350);
    return () => clearTimeout(t);
  }, [f.q]); /* eslint-disable-line react-hooks/exhaustive-deps */

  const openRefund = (row) => {
    setRefundRow(row);
    setRefundAmt('');
    setRefundNote('');
  };

  const doRefund = async () => {
    if (!refundRow || refundBusy) return;
    setRefundBusy(true);
    try {
      const d = await refundGateway(refundRow.orderNumber, {
        amount: refundAmt === '' ? undefined : Number(refundAmt),
        note: refundNote,
      });
      toast(`Refund ৳${Number(d.refund.amount).toFixed(2)} recorded — ref ${d.refund.refundRef}`, 'ok');
      setRefundRow(null);
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setRefundBusy(false); }
  };

  const remaining = refundRow ? (refundRow.amount - (refundRow.refunds || []).reduce((a, r) => a + (+r.amount || 0), 0)) : 0;

  return (
    <div>
      {/* stats chips */}
      <div className="mb-4 flex min-h-[26px] flex-wrap items-center gap-2">
        {!loaded ? <PaymentStatsSkeleton count={skeletonStats} /> : <>
        {(data.stats || []).map((s) => (
          <span key={s.method + s.payStatus} className={CHIP + ' ' + ((PAY_CHIP[s.payStatus] || '') + ' ' + (METHOD_CHIP[s.method] || ''))}>
            {s.method} · {s.payStatus} — {s.count}× {taka(s.amount)}
          </span>
        ))}
        <span className="text-[11.5px] text-dim2">{data.total} transaction(s) total</span>
        </>}
      </div>

      {/* filters */}
      <div className={CARD + ' mb-4 flex flex-wrap items-end gap-3'}>
        <div>
          <label>Search (order / phone / TrxID / val)</label>
          <input id="txQ" className={INP + ' w-[240px]'} placeholder="ARG-… / 017… / TRX…" value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} />
        </div>
        <div>
          <label>Method</label>
          <select id="txMethod" className={INP} value={f.method} onChange={(e) => setF((p) => ({ ...p, method: e.target.value, page: 1 }))}>
            <option value="">All methods</option>
            <option value="gateway">Gateway (SSLCOMMERZ)</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="rocket">Rocket</option>
            <option value="cod">COD</option>
          </select>
        </div>
        <div>
          <label>Payment status</label>
          <select id="txStatus" className={INP} value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value, page: 1 }))}>
            <option value="">All statuses</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="cod-pending">COD pending</option>
            <option value="cod-collected">COD collected</option>
            <option value="rejected">Rejected</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label>From</label>
          <input id="txFrom" type="date" className={INP} value={f.from} onChange={(e) => setF((p) => ({ ...p, from: e.target.value, page: 1 }))} />
        </div>
        <div>
          <label>To</label>
          <input id="txTo" type="date" className={INP} value={f.to} onChange={(e) => setF((p) => ({ ...p, to: e.target.value, page: 1 }))} />
        </div>
        <button className={GHOST_BTN} onClick={() => setF({ method: '', status: '', q: '', from: '', to: '', page: 1 })}>Reset</button>
      </div>

      {/* table */}
      <div className={CARD + ' overflow-x-auto'}>
        {loading && !loaded ? <PaymentTableSkeleton rows={skeletonRows} /> : (
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-[.12em] text-dim2">
              <th className="py-2.5 pr-3">Order</th>
              <th className="py-2.5 pr-3">Customer</th>
              <th className="py-2.5 pr-3">Method</th>
              <th className="py-2.5 pr-3">Proof / Reference</th>
              <th className="py-2.5 pr-3">Status</th>
              <th className="py-2.5 pr-3 text-right">Amount</th>
              <th className="py-2.5 pr-3">Date</th>
              <th className="py-2.5" />
            </tr>
          </thead>
          <tbody>
            {!data.items.length ? (
              <tr><td colSpan={8} className="py-6 text-center text-dim2">No transactions match these filters.</td></tr>
            ) : data.items.map((t) => (
              <tr key={t.orderNumber} id={'tx-' + t.orderNumber} className="border-b border-line/60 align-top">
                <td className="py-2.5 pr-3 font-bold text-txt">{t.orderNumber}</td>
                <td className="py-2.5 pr-3">{t.customer?.name || '—'}<div className="text-[11px] text-dim2">{t.customer?.phone}</div></td>
                <td className="py-2.5 pr-3">
                  <span className={CHIP + ' ' + (METHOD_CHIP[t.method] || '')}>{t.method}</span>
                  {t.method === 'gateway' && t.gateway.ipnVerified ? <div className="mt-1 text-[10px] text-green">IPN ✓</div> : null}
                  {t.source === 'manual' ? <div className="mt-1 text-[10px] text-dim2">manual entry</div> : null}
                </td>
                <td className="py-2.5 pr-3 font-mono text-[11px] text-dim">
                  {t.method === 'gateway'
                    ? (t.gateway.valId ? <span>val {t.gateway.valId}</span> : <span className="text-dim2">no session yet{t.gateway.attempts ? ` · ${t.gateway.attempts} attempt(s)` : ''}</span>)
                    : (t.trxId || (t.method === 'cod' ? 'cash on delivery' : '—'))}
                  {t.method === 'gateway' && t.gateway.cardType ? <div className="text-[10.5px] text-dim2">{t.gateway.cardType} · {t.gateway.bankTrxId || ''}</div> : null}
                  {(t.refunds || []).length ? (
                    <div className="text-[10.5px] text-yellow">refunded {(t.refunds).reduce((a, r) => a + (+r.amount || 0), 0).toLocaleString()}৳</div>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3"><span className={CHIP + ' ' + (PAY_CHIP[t.payStatus] || '')}>{t.payStatus}</span></td>
                <td className="py-2.5 pr-3 text-right font-bold text-txt">{taka(t.amount)}</td>
                <td className="py-2.5 pr-3 text-dim2 text-[11.5px]">{dt(t.createdAt)}</td>
                <td className="py-2.5 text-right">
                  {/* Step 2 audit fix — SSLCOMMERZ settled payments carry status
                      'paid' (not 'verified'); the refund button never showed */}
                  {t.method === 'gateway' && ['paid', 'verified'].includes(t.payStatus) && !t.gateway.refunded ? (
                    <button id={'txRefund-' + t.orderNumber} className={GHOST_BTN} onClick={() => openRefund(t)}>Refund</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        <Pagination page={data.page || f.page} pages={data.pages || 1} total={data.total || 0} loading={loading} onPageChange={(nextPage) => setF((p) => ({ ...p, page: nextPage }))} />
        {false && data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-1 pt-3 text-[12px] text-dim2">
            <span>Page {data.page} / {data.pages}</span>
            <div className="flex gap-2">
              <button className={GHOST_BTN} disabled={data.page <= 1} onClick={() => setF((p) => ({ ...p, page: p.page - 1 }))}>← Prev</button>
              <button className={GHOST_BTN} disabled={data.page >= data.pages} onClick={() => setF((p) => ({ ...p, page: p.page + 1 }))}>Next →</button>
            </div>
          </div>
        ) : null}
      </div>

      {/* refund modal (self-contained — no shared Confirm component needed) */}
      {refundRow ? (
        <div className="fixed inset-0 z-[2500] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" id="refundModal"
          onClick={(e) => { if (e.target.id === 'refundModal') setRefundRow(null); }}>
          <div className="max-h-[90vh] w-[min(560px,96vw)] overflow-y-auto rounded-xl border border-line bg-panel p-5">
            <h3 className="text-[15px] tracking-[.08em]">Refund — {refundRow.orderNumber}</h3>
            <p className="mt-1 text-[12.5px] text-dim2">Paid ৳{Number(refundRow.amount).toFixed(2)} · refundable balance <b className="text-txt">৳{remaining.toFixed(2)}</b></p>
            <div className="mt-4 grid gap-3">
              <div>
                <label>Amount (৳) — blank = full remaining</label>
                <input id="refundAmt" type="number" min="1" step="0.01" max={remaining} className="w-full" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} />
              </div>
              <div>
                <label>Note (refund remarks)</label>
                <input id="refundNote" className="w-full" placeholder="e.g. RMA-12 accepted, item damaged" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
              </div>
              <p className="text-[11.5px] text-dim2">This records the refund in the order's refund ledger (visible on the order + reports). Execute the gateway-side refund from the SSLCOMMERZ merchant panel — the ledger keeps the books consistent.</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-line2 px-4 py-2 text-[12px] font-bold uppercase tracking-[.08em] text-dim2 hover:text-txt" onClick={() => setRefundRow(null)}>Cancel</button>
              <button id="refundGo" disabled={refundBusy} className="rounded-lg bg-acc px-4 py-2 text-[12px] font-bold uppercase tracking-[.08em] text-white hover:bg-acc-hi disabled:opacity-50" onClick={doRefund}>{refundBusy ? 'Recording…' : 'Issue Refund'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="payments" title="Payments & Transactions">
        <PaymentsPage />
      </AdminShell>
    </OverlayProvider>
  );
}
