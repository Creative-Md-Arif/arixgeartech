/* ArixGear ADMIN page — dashboard (React port of dashboard.html) */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../lib/admin.js';
import { getStats } from '../services/stats.js';
import { api } from '../services/http.js';
import { list as listOrders } from '../services/orders.js';
import { ga4Funnel, orderFunnel } from '../services/analytics.js';
import { stats as reviewStats } from '../services/reviews.js';
import { analytics as couponAnalytics } from '../services/coupons.js';
import { stats as questionStats } from '../services/questions.js';
import AdminShell from '../components/AdminShell.jsx';
import { CardsSkeleton, PanelSkeleton } from '../components/Skeleton.jsx';
import OrdersTable, { openOrder } from '../components/OrdersTable.jsx';
import { OverlayProvider } from '../components/Overlays.jsx';
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { tr, useLang } from '../lib/i18n.jsx';

const Stat = ({ k, v, s, hot }) => (
  <div className="stat relative overflow-hidden rounded-xl border border-line bg-panel p-5">
    {hot ? <div className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-acc-dim blur-xl" /> : null}
    <div className="text-[10.5px] font-bold uppercase tracking-[.18em] text-dim">{k}</div>
    <div className={'mt-2 font-disp text-[34px] leading-none' + (hot ? ' text-acc' : '')}>{v}</div>
    <div className="mt-1.5 text-[11.5px] text-dim2">{s}</div>
  </div>
);

const Card = ({ title, children, className = '' }) => (
  <div className={'rounded-[10px] border border-line bg-panel p-5 ' + className}>
    {title ? <h3 className="mb-3.5 text-[15px] tracking-[.08em]">{title}</h3> : null}
    {children}
  </div>
);

/* Task 57 — SLA breach banner: live orders unshipped for >24h, red flag on top */
const SlaBanner = ({ stats }) => {
  const breaches = stats.slaBreaches || [];
  if (!stats.slaBreachCount) return null;
  return (
    <div className="rounded-[10px] border border-red/50 bg-red/10 p-5" id="slaBanner" data-testid="slaBanner">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-red text-[15px] font-black text-white">!</span>
        <h3 className="text-[15px] font-bold tracking-[.04em] text-red" id="slaTitle">
          {tr('SLA BREACH — {n} order(s) unshipped for over {h} hours', { n: stats.slaBreachCount, h: stats.slaHours || 24 })}
        </h3>
      </div>
      <div className="mt-3 divide-y divide-red/20">
        {breaches.map((o) => (
          <button
            key={o._id}
            onClick={() => openOrder(o._id)}
            className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-[13px] transition-colors hover:text-acc"
          >
            <span className="font-bold text-red">{o.orderNumber}</span>
            <span className="text-dim">{o.customer || '—'}</span>
            <span className="text-dim2">{o.status}</span>
            <span className="font-cond font-extrabold text-red">{o.hours}h overdue</span>
            <span>{money(o.total)}</span>
          </button>
        ))}
      </div>
      {stats.slaBreachCount > breaches.length ? (
        <p className="mt-2 text-[11.5px] text-dim2">{tr('+{n} more in the orders list — ship or update status today', { n: stats.slaBreachCount - breaches.length })}</p>
      ) : null}
    </div>
  );
};

const QUICK = [
  ['/orders', 'Orders'],
  ['/returns', 'Returns'],
  ['/products', 'Products'],
  ['/customers', 'Customers'],
  ['/messages', 'Messages'],
  ['/coupons', 'Coupons'],
  ['/settings', 'Settings'],
];

/* Task 56-c — sales trend LINE chart (7/30/90d) drawn from /admin/analytics/trend.
   Pure inline SVG: area gradient + revenue polyline + order-count sparkline dots.
   Hover targets per day show date, revenue and order count in a title tooltip. */
function SalesTrend() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr('');
    api('/admin/analytics/trend?days=' + days)
      .then((x) => { if (alive) setD(x); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  const W = 720, H = 190, PAD = 8;
  const series = d ? d.series || [] : [];
  const max = Math.max(...series.map((s) => s.revenue), 1);
  const maxOrd = Math.max(...series.map((s) => s.orders), 1);
  const px = (i) => PAD + (i * (W - PAD * 2)) / Math.max(1, series.length - 1);
  const py = (v) => H - PAD - (v / max) * (H - PAD * 2 - 18);
  const oy = (v) => H - PAD - (v / maxOrd) * (H - PAD * 2 - 18) * 0.55;
  const line = series.map((s, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(s.revenue).toFixed(1)}`).join(' ');
  const area = series.length ? `${line} L${px(series.length - 1).toFixed(1)},${H - PAD} L${px(0).toFixed(1)},${H - PAD} Z` : '';
  const labelEvery = Math.ceil(series.length / 10);

  return (
    <div className="mt-4 rounded-[10px] border border-line bg-panel p-5" id="salesTrend">
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] tracking-[.08em]">{tr('Sales Trend')}</h3>
        {d ? (
          <span className="text-[11px] text-dim2">
            {money(d.total)} · {d.orders} {tr('orders')} · {tr('cancellations excluded')}
          </span>
        ) : null}
        <div className="ml-auto flex gap-1.5">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)}
              className={'rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ' + (days === n ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim hover:text-txt')}>
              {n}d
            </button>
          ))}
        </div>
      </div>
      {err ? <div className="rounded-lg border border-red/30 bg-red/10 px-4 py-2.5 text-[12.5px] text-red">{err}</div>
        : !d ? <div className="h-[190px] animate-pulse rounded-lg bg-panel2" data-testid="trendSkeleton" />
          : (
            <div className={'relative h-[190px] transition-opacity ' + (loading ? 'opacity-50' : 'opacity-100')}>
            {loading ? <div className="absolute inset-0 z-10 animate-pulse rounded-lg bg-panel2/70" data-testid="trendRefreshing" /> : null}
            <ResponsiveContainer width="100%" height={190} data-testid="trendChart">
              <AreaChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--c-acc))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="rgb(var(--c-acc))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgb(var(--c-line))" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 9, fill: 'rgb(var(--c-dim2))' }} tickLine={false} axisLine={{ stroke: 'rgb(var(--c-line))' }} minTickGap={28} />
                <YAxis yAxisId="rev" tick={{ fontSize: 9, fill: 'rgb(var(--c-dim2))' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : v)} />
                <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 9, fill: 'rgb(var(--c-dim2))' }} tickLine={false} axisLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: 'var(--c-panel2)', border: '1px solid var(--c-line2)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--c-txt)', fontWeight: 700 }}
                  formatter={(v, name) => (name === 'revenue' ? [money(v), 'revenue'] : [v, 'orders'])}
                />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="rgb(var(--c-acc))" strokeWidth={2.2} fill="url(#trendFill)" />
                <Line yAxisId="ord" type="monotone" dataKey="orders" stroke="rgb(var(--c-dim2))" strokeWidth={1.4} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )}
    </div>
  );
}

/* ── internal ORDER funnel (Task 28) — placed → verified → shipped → delivered,
   COD confirmation rate, fulfillment speed, rejection reasons ── */
function OrderFunnel() {
  const { t } = useLang();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setD(await orderFunnel(days));
        setErr('');
      } catch (e) { setErr(e.message || String(e)); }
    })();
  }, [days]);

  const f = d ? d.funnel || {} : {};
  const steps = [
    ['Placed', f.placed || 0],
    ['Payment verified', f.verified || 0],
    ['Shipped', f.shipped || 0],
    ['Delivered', f.delivered || 0],
  ];
  const max = Math.max(...steps.map((s) => s[1]), 1);

  return (
    <div className="mt-4 rounded-[10px] border border-line bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] tracking-[.08em]">{tr('Order Funnel & Health')}</h3>
        <div className="ml-auto flex gap-1.5">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)}
              className={'rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ' + (days === n ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim hover:text-txt')}>
              {n}d
            </button>
          ))}
        </div>
      </div>

      {err ? (
        <div className="rounded-lg border border-red/30 bg-red/10 px-4 py-2.5 text-[12.5px] text-red">Order funnel error — {err}</div>
      ) : !d ? (
        <div className="py-6 text-center text-[13.5px] text-dim2">{tr('Loading…')}</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          {/* funnel bars */}
          <div>
            {steps.map(([label, n], i) => (
              <div key={label} className="mb-2.5 last:mb-0">
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span className="font-bold uppercase tracking-[.08em] text-dim">{tr(label)}</span>
                  <span>
                    <b className="font-disp text-[16px] text-txt">{n}</b>
                    {i > 0 && steps[i - 1][1] > 0 ? <span className="ml-2 text-[10.5px] text-dim2">{tr('{p}% of previous', { p: Math.round((n / steps[i - 1][1]) * 100) })}</span> : null}
                  </span>
                </div>
                <div className="h-[10px] w-full overflow-hidden rounded-full bg-panel2">
                  <div className={'h-full rounded-full ' + ['bg-acc', 'bg-acc/80', 'bg-acc/60', 'bg-green/80'][i]} style={{ width: Math.max(2, (n / max) * 100) + '%' }} />
                </div>
              </div>
            ))}
            <div className="mt-3 grid grid-cols-3 gap-2.5 border-t border-line pt-3 text-center">
              <div>
                <b className="block font-disp text-[20px] text-red">{Math.round((f.cancelRate || 0) * 100)}%</b>
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Cancel + reject')}</span>
              </div>
              <div>
                <b className="block font-disp text-[20px] text-acc">{d.revenue ? money(d.revenue.aov) : '৳0'}</b>
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">AOV</span>
              </div>
              <div>
                <b className="block font-disp text-[20px] text-txt">{d.revenue ? money(d.revenue.total) : '৳0'}</b>
                <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Revenue ({days}d)', { days })}</span>
              </div>
            </div>
          </div>

          {/* health metrics */}
          <div className="grid gap-3">
            <div className="rounded-lg border border-line bg-panel2 px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.14em] text-dim2">{tr('COD confirmation rate')}</span>
                <b className="font-disp text-[20px] text-acc">{Math.round((d.payment?.codRate || 0) * 100)}%</b>
              </div>
              <div className="mt-1 text-[11px] text-dim2">{tr('delivered COD ÷ all COD orders in window')}</div>
            </div>
            <div className="rounded-lg border border-line bg-panel2 px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Avg fulfillment')}</span>
                <b className="font-disp text-[20px] text-txt">{d.fulfillment?.avgHours != null ? d.fulfillment.avgHours + 'h' : '—'}</b>
              </div>
              <div className="mt-1 text-[11px] text-dim2">{tr('order placed → delivered ({n} delivered)', { n: d.fulfillment?.deliveredCount || 0 })}</div>
            </div>
            <div className="rounded-lg border border-line bg-panel2 px-4 py-3">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Top rejection reasons')}</div>
              {d.payment?.rejectReasons?.length ? d.payment.rejectReasons.map((r) => (
                <div key={r.reason} className="flex justify-between gap-2 py-0.5 text-[12px]">
                  <span className="min-w-0 truncate text-dim">{r.reason}</span>
                  <b className="shrink-0 text-red">{r.n}</b>
                </div>
              )) : <div className="text-[12px] text-dim2">{tr('No payment rejections 🎉')}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── GA4 e-commerce funnel (Task 26) — powered by the GA4 Data API ── */
const FUNNEL_COLORS = ['bg-acc', 'bg-acc/75', 'bg-acc/50', 'bg-gradient-to-r from-acc to-acc/40'];

function Ga4Funnel() {
  const { t } = useLang();
  const [days, setDays] = useState(28);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr('');
    ga4Funnel(days)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message || String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  const pill = (n) => 'rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] border transition ' +
    (days === n ? 'border-acc bg-acc text-white' : 'border-line2 text-dim hover:text-txt hover:border-dim');

  return (
    <div className="mt-4 rounded-[10px] border border-line bg-panel p-5" id="ga4Funnel">
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] tracking-[.08em]">{tr('GA4 E-commerce Funnel')}</h3>
        {data && data.configured && !data.error ? (
          <span className="text-[10.5px] text-dim2">property {data.propertyId} · updated {new Date(data.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        ) : null}
        <div className="ml-auto flex gap-1.5">
          {[7, 28, 90].map((n) => <button key={n} className={pill(n)} onClick={() => setDays(n)}>{n}d</button>)}
        </div>
      </div>

      {err ? <div className="py-6 text-center text-[13px] text-dim2">{err}</div> : null}

      {!err && !data ? <div className="py-6 text-center text-[13px] text-dim2">{tr('Loading GA4…')}</div> : null}

      {!err && data && !data.configured ? (
        <div className="rounded-lg border border-dashed border-line2 px-4 py-6 text-center">
          <p className="text-[13px]">{tr('Connect Google Analytics to see the funnel — view item → add to cart → checkout → purchase.')}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-dim2">
            1 · Measurement ID (G-…) in <Link to="/seo" className="text-acc hover:underline">SEO → Site &amp; Schema</Link> so events start flowing ·
            2 · Service account + numeric Property ID in <Link to="/seo" className="text-acc hover:underline">SEO → Google Services</Link> for this report
          </p>
        </div>
      ) : null}

      {!err && data && data.configured && data.error ? (
        <div className="py-5 text-center text-[12.5px] text-red">GA4 error — {data.error}</div>
      ) : null}

      {!err && data && data.configured && !data.error ? (
        (() => {
          const f = data.funnel || [];
          const ov = data.overview || {};
          const first = f.length ? f[0].users : 0;
          const trend = data.trend || [];
          const maxTrend = Math.max(...trend.map((t) => t.revenue), 1);
          const empty = !first && !ov.sessions && !(data.topProducts || []).length;
          return (
            <>
              {/* overview stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  ['Sessions', String(ov.sessions ?? 0)],
                  ['Purchases', String(ov.transactions ?? 0)],
                  ['Revenue', money(ov.revenue || 0)],
                  ['AOV', money(ov.aov || 0)],
                  ['Conv. rate', (ov.convRate || 0).toFixed(2) + '%'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line bg-panel2 px-3.5 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[.14em] text-dim2">{tr(k)}</div>
                    <div className="mt-1 font-disp text-[20px] leading-none">{v}</div>
                  </div>
                ))}
              </div>

              {empty ? (
                <p className="mt-4 rounded-lg border border-dashed border-line2 px-4 py-6 text-center text-[12px] text-dim2">
                  {tr('No GA4 data in this range yet — events flow once the Measurement ID is live in SEO → Site & Schema and visitors start browsing.')}
                </p>
              ) : (
                <>
                  {/* funnel bars */}
                  <div className="mt-4 space-y-2">
                    {f.map((s, i) => {
                      const width = first ? Math.max(2, (s.users / first) * 100) : 2;
                      const share = first ? Math.round((s.users / first) * 100) : 0;
                      const prev = i > 0 ? f[i - 1].users : 0;
                      const step = prev ? Math.round((s.users / prev) * 100) : (i === 0 ? 100 : 0);
                      return (
                        <div key={s.key} className="flex items-center gap-3">
                          <div className="w-[120px] shrink-0 truncate text-[11.5px] font-semibold text-dim">{s.label}</div>
                          <div className="relative h-6 flex-1 overflow-hidden rounded bg-panel2">
                            <div className={'h-full rounded ' + (FUNNEL_COLORS[i] || 'bg-acc/40')} style={{ width: width + '%' }}
                              title={`${s.users} users · ${share}% of viewers · ${step}% from previous step`} />
                          </div>
                          <div className="w-[150px] shrink-0 text-right text-[11.5px]">
                            <b>{s.users}</b> <span className="text-dim2">· {share}%{i > 0 ? ` (↑ ${step}% from prev)` : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {/* revenue trend */}
                    <div>
                      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Revenue by day')}</p>
                      {trend.length ? (
                        <div className="flex h-[90px] items-end gap-[3px]">
                          {trend.map((t) => (
                            <div key={t.date} className="relative min-h-[3px] flex-1 rounded-t bg-gradient-to-b from-acc to-acc/25"
                              style={{ height: Math.max(3, (t.revenue / maxTrend) * 100) + '%' }}
                              title={`${t.date.slice(0, 4)}-${t.date.slice(4, 6)}-${t.date.slice(6, 8)}: ${money(t.revenue)} (${t.transactions} orders)`} />
                          ))}
                        </div>
                      ) : <div className="py-8 text-center text-[12.5px] text-dim2">{tr('No revenue recorded')}</div>}
                    </div>
                    {/* top products */}
                    <div>
                      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">{tr('Top products (by GA4 revenue)')}</p>
                      {(data.topProducts || []).length ? data.topProducts.map((p) => (
                        <div key={p.name} className="flex items-center justify-between border-b border-line py-1.5 text-[12.5px] last:border-b-0">
                          <span className="truncate pr-3">{p.name}</span>
                          <span className="whitespace-nowrap font-cond text-[14px] font-extrabold text-acc">{money(p.revenue)} · {p.transactions}</span>
                        </div>
                      )) : <div className="py-8 text-center text-[12.5px] text-dim2">{tr('No product revenue yet')}</div>}
                    </div>
                  </div>
                </>
              )}
            </>
          );
        })()
      ) : null}
    </div>
  );
}

/* Task 29 — reviews moderation health + coupon savings, one row, two cards */
function ReviewsCoupons() {
  const { t } = useLang();
  const [rv, setRv] = useState(null);
  const [cp, setCp] = useState(null);

  useEffect(() => {
    reviewStats().then(setRv).catch(() => {});
    couponAnalytics().then(setCp).catch(() => {});
  }, []);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2" id="dashReviewsCoupons">
      <div className="rounded-[10px] border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] tracking-[.08em]">{tr('Reviews Health')}</h3>
          <Link to="/reviews" className="text-[11.5px] font-bold uppercase tracking-[.08em] text-acc hover:underline">{tr('Moderate →')}</Link>
        </div>
        {!rv ? <div className="py-4 text-center text-[13px] text-dim2">Loading…</div> : (
          <>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Pending')}</p><p className="font-disp text-xl text-yellow">{rv.totals.pending}</p></div>
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Approval')}</p><p className="font-disp text-xl">{rv.totals.approvalRate}%</p></div>
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Response')}</p><p className="font-disp text-xl">{rv.avgApprovalHours == null ? '—' : rv.avgApprovalHours + 'h'}</p></div>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[.08em] text-dim2">{tr('Low-rating watchlist')}</p>
            {(rv.watchlist || []).length ? (
              <ul className="mt-1.5 space-y-1 text-[12.5px]">
                {rv.watchlist.slice(0, 3).map((w) => (
                  <li key={w._id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-dim">{w.name || w.slug}</span>
                    <span className="whitespace-nowrap font-bold text-red">{w.avg}★ ({w.n})</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-[12.5px] text-green">{tr('All products healthy ✓')}</p>}
          </>
        )}
      </div>

      <div className="rounded-[10px] border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] tracking-[.08em]">{tr('Coupons & Discounts')}</h3>
          <Link to="/coupons" className="text-[11.5px] font-bold uppercase tracking-[.08em] text-acc hover:underline">{tr('Manage →')}</Link>
        </div>
        {!cp ? <div className="py-4 text-center text-[13px] text-dim2">Loading…</div> : (
          <>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Savings given')}</p><p className="font-disp text-xl text-acc">৳{Math.round(cp.global.discount || 0).toLocaleString('en-US')}</p></div>
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Coupon orders')}</p><p className="font-disp text-xl">{cp.global.orders || 0}</p></div>
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Active / total')}</p><p className="font-disp text-xl">{cp.coupons.active}/{cp.coupons.total}</p></div>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[.08em] text-dim2">{tr('Top codes')}</p>
            {(cp.topCodes || []).length ? (
              <ul className="mt-1.5 space-y-1 text-[12.5px]">
                {cp.topCodes.slice(0, 3).map((c) => (
                  <li key={c._id} className="flex items-center justify-between gap-2">
                    <span className="font-bold tracking-[.06em] text-txt">{c._id}</span>
                    <span className="text-dim">{c.orders} orders · ৳{Math.round(c.discount).toLocaleString('en-US')} off</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-[12.5px] text-dim2">{tr('No coupon redemptions yet.')}</p>}
            {(cp.expiringSoon || []).length ? (
              <p className="mt-2 text-[11.5px] text-yellow">⏳ {cp.expiringSoon.length} coupon(s) expiring within 7 days</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* Task 30 — Q&A response health. Phase 2: the gym-membership card was
   removed with the archived vertical; Q&A keeps the row to itself. */
function QaHealth() {
  const { t } = useLang();
  const [qa, setQa] = useState(null);

  useEffect(() => {
    questionStats().then(setQa).catch(() => {});
  }, []);

  return (
    <div className="mt-4" id="dashQaHealth">
      <div className="rounded-[10px] border border-line bg-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] tracking-[.08em]">{tr('Q&A Health')}</h3>
          <Link to="/questions" className="text-[11.5px] font-bold uppercase tracking-[.08em] text-acc hover:underline">{tr('Answer →')}</Link>
        </div>
        {!qa ? <div className="py-4 text-center text-[13px] text-dim2">Loading…</div> : (
          <>
            <div className="grid grid-cols-3 gap-2.5 text-center md:max-w-[560px]">
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Unanswered')}</p><p className="font-disp text-xl text-yellow">{qa.counts.unanswered}</p></div>
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Asked 7d')}</p><p className="font-disp text-xl">{qa.asked7}</p></div>
              <div className="rounded-lg border border-line2 p-2.5"><p className="text-[10.5px] uppercase tracking-[.08em] text-dim2">{tr('Response')}</p><p className="font-disp text-xl">{qa.avgResponseHours30 == null ? '—' : qa.avgResponseHours30 + 'h'}</p></div>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[.08em] text-dim2">{tr('Most asked products')}</p>
            {(qa.topProducts || []).length ? (
              <ul className="mt-1.5 space-y-1 text-[12.5px]">
                {qa.topProducts.slice(0, 3).map((t) => (
                  <li key={t._id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-dim">{t.name || '—'}</span>
                    <span className="whitespace-nowrap font-bold text-txt">{t.count} Q</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-[12.5px] text-dim2">{tr('No questions yet.')}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div data-testid="dashSkeleton" className="space-y-4">
      <CardsSkeleton n={5} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <PanelSkeleton h={230} />
        <PanelSkeleton h={230} />
      </div>
      <PanelSkeleton h={245} />
      <PanelSkeleton h={285} />
      <PanelSkeleton h={285} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton h={220} />
        <PanelSkeleton h={220} />
      </div>
      <PanelSkeleton h={165} />
      <PanelSkeleton h={250} />
      <PanelSkeleton h={54} />
    </div>
  );
}

function Dashboard() {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, o] = await Promise.all([getStats(), listOrders({ limit: 5 })]);
        setStats(s);
        setOrders(o);
      } catch (e) { setErr(e.message || String(e)); }
    })();
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
        <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">{tr('ERROR')}</span>
        {err}
      </div>
    );
  }
  if (!stats || !orders) return <DashboardSkeleton />;


/* Phase 5 — live pills: open complaints, open warranty claims?, subscribers,
   low stock — quick-glance counters linking into the new modules */
function LivePills() {
  const [p, setP] = useState(null);
  useEffect(() => {
    (async () => {
      const [tk, sub] = await Promise.all([
        api('/admin/tickets?status=open').then((d) => d.openCount || 0).catch(() => 0),
        api('/admin/subscribers?status=active').then((d) => d.activeCount || 0).catch(() => 0),
      ]);
      setP({ tickets: tk, subscribers: sub });
    })();
  }, []);
  const Pill = ({ to, n, label, hot }) => (
    <Link to={to} className={'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.06em] transition ' + (n > 0 && hot ? 'border-red/50 text-red hover:bg-red/10' : 'border-line2 text-dim hover:border-acc hover:text-acc')} data-testid={'pill-' + to.slice(1)}>
      {n > 0 ? <span className={'grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9.5px] font-black ' + (hot ? 'bg-red text-white' : 'bg-acc text-white')}>{n}</span> : <span className="h-1.5 w-1.5 rounded-full bg-green" />}
      {label}
    </Link>
  );
  if (!p) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="livePills">
      <Pill to="/tickets" n={p.tickets} label="open complaints" hot />
      <Pill to="/subscribers" n={p.subscribers} label="active subscribers" />
    </div>
  );
}

  const week = stats.week || [];
  const maxWk = Math.max(...week.map((w) => w.total), 1);
  const lowStock = stats.lowStock || [];
  const topProducts = stats.topProducts || [];
  const mostViewed = stats.mostViewed || []; /* Task 27 — PDP view counter */

  return (
    <>
      {/* Task 57 — SLA red flag sits above everything when orders are overdue */}
      <SlaBanner stats={stats} />
      <LivePills />

      {/* stat cards — exact legacy labels */}
      <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5' + (stats.slaBreachCount ? ' mt-4' : '')}>
        <Stat k={tr("Today's Orders")} v={stats.todayOrders} s={tr('{m} manual · {o} online', { m: stats.todayManual || 0, o: stats.todayOnline || 0 })} />
        <Stat k={tr("Today's Revenue")} v={money(stats.todayRevenue)} s={tr('excl. cancelled · ৳ BDT')} />
        <Stat k={tr('Verifying Payments')} v={stats.verifying} s={tr('action needed — check TrxID')} hot />
        <Stat k={tr('COD In Progress')} v={stats.processing} s={tr('collect cash on delivery')} />
        <Stat k={tr('Delivered')} v={stats.delivered} s={tr('all time')} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* last 7 days revenue bars */}
        <Card title={tr('Last 7 Days Revenue')}>
          <div className="pb-6 pt-2.5">
            {week.length ? (
              <div className="flex h-[120px] items-end gap-[7px]">
                {week.map((w) => (
                  <div
                    key={w._id}
                    className="relative min-h-[4px] flex-1 rounded-t bg-gradient-to-b from-acc to-acc/25"
                    style={{ height: Math.max(4, (w.total / maxWk) * 100) + '%' }}
                    title={`${w._id}: ${money(w.total)} (${w.n} orders)`}
                  >
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] text-dim2">{w._id.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-[13.5px] text-dim2">{tr('No orders yet')}</div>
            )}
          </div>
        </Card>

        {/* low stock + top sellers */}
        <Card>
          <h3 className="mb-3.5 text-[15px] tracking-[.08em]">{tr('Low Stock (≤5)')}</h3>
          {lowStock.length ? (
            lowStock.map((p) => (
              <div key={p._id || p.slug || p.name} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-b-0">
                <span>{p.name}</span>
                <span className="font-cond text-[16px] font-extrabold text-red">{tr('{n} left', { n: p.stock })}</span>
              </div>
            ))
          ) : (
            <div className="py-5 text-center text-[13.5px] text-dim2">{tr('All stocked up')}</div>
          )}
          <h3 className="mb-3.5 mt-[22px] text-[15px] tracking-[.08em]">{tr('Top Sellers')}</h3>
          {topProducts.length ? (
            /* Task 56-c — bar-chart upgrade: each row is a scaled bar, not a bare list */
            (() => {
              const maxSold = Math.max(...topProducts.map((p) => p.sold || 0), 1);
              return (
                <div className="space-y-2.5">
                  {topProducts.map((p) => (
                    <div key={p._id || p.slug || p.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="shrink-0 whitespace-nowrap font-cond text-[14px] font-extrabold text-acc">{tr('{n} sold', { n: p.sold })}</span>
                      </div>
                      <div className="h-[8px] w-full overflow-hidden rounded-full bg-panel2">
                        <div className="h-full rounded-full bg-gradient-to-r from-acc to-acc/40" style={{ width: Math.max(4, ((p.sold || 0) / maxSold) * 100) + '%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          ) : (
            <div className="py-5 text-center text-[13.5px] text-dim2">{tr('No sales yet')}</div>
          )}
          {/* Task 27 — most viewed (catalog view counter) */}
          {mostViewed.length ? (
            <>
              <h3 className="mb-3.5 mt-[22px] text-[15px] tracking-[.08em]">{tr('Most Viewed')}</h3>
              {mostViewed.map((p) => (
                <div key={p._id} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-b-0">
                  <span className="truncate pr-3">{p.name}</span>
                  <span className="whitespace-nowrap font-cond text-[16px] font-extrabold text-acc">{tr('{n} views', { n: p.views })}</span>
                </div>
              ))}
            </>
          ) : null}
        </Card>
      </div>

      {/* Task 56-c — sales trend line chart (7/30/90d) */}
      <SalesTrend />

      {/* GA4 e-commerce funnel (SEO → Google Services connection) */}
      <Ga4Funnel />

      {/* internal order funnel + COD/fulfillment health (Task 28) */}
      <OrderFunnel />

      {/* reviews moderation health + coupon savings (Task 29) */}
      <ReviewsCoupons />

      {/* Q&A response health (Task 30) */}
      <QaHealth />

      {/* recent orders */}
      <div className="mt-4">
        <Card title={tr('Recent Orders')}>
          {orders ? (
            orders.items?.length
              ? <OrdersTable items={orders.items} onOpen={openOrder} />
              : <div className="py-10 text-center text-[13.5px] text-dim2">{tr('No orders yet.')}</div>
          ) : (
            <div className="py-10 text-center text-[13.5px] text-dim2">{tr('Loading…')}</div>
          )}
        </Card>
      </div>

      {/* quick links */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-panel px-4 py-3">
        <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[.18em] text-dim2">{tr('Quick Links')}</span>
        {QUICK.map(([to, t]) => (
          <Link key={to} to={to} className="rounded-lg border border-line2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-dim transition-colors hover:border-acc hover:text-acc">
            {tr(t)}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  useLang();   /* subscribe → page subtree re-renders on BN/EN toggle */
  return (
    <OverlayProvider>
      <AdminShell active="dashboard" title={tr('Dashboard')}>
        <Dashboard />
      </AdminShell>
    </OverlayProvider>
  );
}
