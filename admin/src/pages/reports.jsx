/* ArixGear ADMIN page — sales report (দিন/মাস অনুযায়ী manual vs online বিক্রয় বিশ্লেষণ)
   GET /api/admin/reports/sales?granularity=day|month&from=&to=  (Asia/Dhaka dates)
   - summary cards: total / online / manual (orders, units, revenue, AOV, share)
   - stacked revenue chart (manual = brand orange, online = blue)
   - per-period table + payment-method breakdown + CSV export */
import { useCallback, useEffect, useState } from "react";
import { money, downloadCsv } from "../lib/admin.js";
import { sales, salesCsv } from "../services/reports.js";
import AdminShell from "../components/AdminShell.jsx";
import { OverlayProvider, useToast } from "../components/Overlays.jsx";
import { tr, useLang } from "../lib/i18n.jsx";
import Pagination from "../components/Pagination.jsx";

/* Dhaka calendar helpers (BDT = UTC+6, no DST) */
const dhakaToday = () =>
  new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n) =>
  new Date(Date.now() + 6 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

const BTN_GHOST =
  "rounded-lg border border-line2 px-3 py-2 text-[11px] font-bold uppercase tracking-[.08em] text-txt transition-colors hover:border-acc hover:text-acc disabled:opacity-50";
const BTN_ACC =
  "rounded-lg bg-acc px-3 py-2 text-[11px] font-bold uppercase tracking-[.08em] text-white transition-colors hover:bg-acc-hi disabled:opacity-50";
const PRESET_ACTIVE =
  "rounded-lg border border-acc bg-acc/10 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-acc";
const PRESET_IDLE =
  "rounded-lg border border-line2 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-dim transition-colors hover:border-acc hover:text-acc";
const REPORT_PAGE_SIZE = 12;
const REPORT_SKEL = "animate-pulse rounded bg-line/60";

const Stat = ({ k, v, s, hot, dot }) => (
  <div className="stat relative overflow-hidden rounded-xl border border-line bg-panel p-5">
    {hot ? (
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-acc-dim blur-xl" />
    ) : null}
    <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.18em] text-dim">
      {dot ? (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: dot }}
        />
      ) : null}
      {k}
    </div>
    <div
      className={
        "mt-2 font-disp text-[30px] leading-none" + (hot ? " text-acc" : "")
      }
    >
      {v}
    </div>
    <div className="mt-1.5 text-[11.5px] text-dim2">{s}</div>
  </div>
);

function ReportSkeleton() {
  return (
    <div
      data-testid="reportSkeleton"
      aria-busy="true"
      aria-label="Loading sales report"
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-[122px] rounded-xl border border-line bg-panel p-5"
          >
            <div className={REPORT_SKEL + " h-3 w-24"} />
            <div className={REPORT_SKEL + " mt-3 h-8 w-32"} />
            <div className={REPORT_SKEL + " mt-2 h-3 w-44 opacity-70"} />
          </div>
        ))}
      </div>
      <div className="h-[250px] rounded-[10px] border border-line bg-panel p-5">
        <div className={REPORT_SKEL + " h-4 w-48"} />
        <div className={REPORT_SKEL + " mt-5 h-[170px] w-full opacity-60"} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="min-h-[520px] rounded-xl border border-line bg-panel p-3">
          <div className={REPORT_SKEL + " mb-3 h-8 w-full"} />
          {Array.from({ length: REPORT_PAGE_SIZE }, (_, i) => (
            <div
              key={i}
              className="flex h-9 items-center gap-3 border-b border-line"
            >
              <div className={REPORT_SKEL + " h-3 w-20"} />
              <div className={REPORT_SKEL + " h-3 flex-1"} />
              <div className={REPORT_SKEL + " h-3 flex-1"} />
              <div className={REPORT_SKEL + " h-3 flex-1"} />
            </div>
          ))}
        </div>
        <div className="min-h-[260px] rounded-[10px] border border-line bg-panel p-5">
          <div className={REPORT_SKEL + " h-4 w-36"} />
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="mt-5 flex justify-between">
              <div className={REPORT_SKEL + " h-3 w-20"} />
              <div className={REPORT_SKEL + " h-4 w-24"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  { label: "7D", from: () => daysAgo(6), to: dhakaToday, gran: "day" },
  { label: "30D", from: () => daysAgo(29), to: dhakaToday, gran: "day" },
  { label: "90D", from: () => daysAgo(89), to: dhakaToday, gran: "day" },
  {
    label: "This month",
    from: () => dhakaToday().slice(0, 8) + "01",
    to: dhakaToday,
    gran: "day",
  },
  {
    label: "This year",
    from: () => dhakaToday().slice(0, 5) + "01-01",
    to: dhakaToday,
    gran: "month",
  },
];
const presetLabel = (l) => tr(l);

function Reports() {
  useLang(); /* hook kept for lang subscription; strings go through tr() */
  const toast = useToast();
  const [gran, setGran] = useState("day");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(dhakaToday());
  const [preset, setPreset] = useState("30D");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await sales({
        granularity: gran,
        from,
        to,
        page,
        limit: REPORT_PAGE_SIZE,
      });
      setData(d);
      setErr("");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [gran, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [gran, from, to]);

  const applyPreset = (p) => {
    setPreset(p.label);
    setGran(p.gran);
    setFrom(p.from());
    setTo(p.to());
    setPage(1);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const text = await salesCsv({ granularity: gran, from, to });
      downloadCsv(text, `forged-sales-${gran}-${from}_${to}.csv`);
      toast(tr("Sales report CSV exported ✓"), "ok");
    } catch (e) {
      toast(e.message || String(e), "err");
    }
    setExporting(false);
  };

  const series = data?.series || [];
  const t = data?.totals;
  const maxRev = Math.max(
    ...series.map((r) => r.online.revenue + r.manual.revenue),
    1,
  );
  const labelStep = Math.max(1, Math.ceil(series.length / 16));

  return (
    <>
      {/* ---------- controls ---------- */}
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <select
          id="rpGran"
          value={gran}
          onChange={(e) => {
            setGran(e.target.value);
            setPreset("");
          }}
          aria-label="Granularity"
        >
          <option value="day">Daily (দিন অনুযায়ী)</option>
          <option value="month">Monthly (মাস অনুযায়ী)</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            id="rpFrom"
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("");
            }}
            aria-label="From date"
          />
          <input
            id="rpTo"
            type="date"
            value={to}
            min={from}
            max={dhakaToday()}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("");
            }}
            aria-label="To date"
          />
        </div>
        <button className={BTN_GHOST} id="rpApply" onClick={load}>
          {tr("↻ Apply")}
        </button>
        <button
          className={BTN_ACC}
          id="rpExport"
          onClick={doExport}
          disabled={exporting}
          title="Excel-friendly CSV (৳ BDT)"
        >
          {tr("⬇ Export CSV")}
        </button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[.18em] text-dim2">
          {tr("Range")}
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={preset === p.label ? PRESET_ACTIVE : PRESET_IDLE}
            onClick={() => applyPreset(p)}
          >
            {presetLabel(p.label)}
          </button>
        ))}
        {data ? (
          <span className="ml-auto text-[11.5px] text-dim2">
            {data.meta.from} → {data.meta.to} · {data.meta.buckets}{" "}
            {tr(data.meta.granularity === "day" ? "{n} days" : "{n} months", {
              n: data.meta.buckets,
            })}{" "}
            · Asia/Dhaka
          </span>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
          <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">
            {tr("ERROR")}
          </span>
          {err}
        </div>
      ) : !data ? (
        <ReportSkeleton />
      ) : (
        <>
          {/* ---------- summary cards ---------- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              k={tr("Total Sales")}
              v={money(t.total.revenue)}
              s={tr("{n} order{s} · {u} pcs · AOV {amt}", {
                n: t.total.orders,
                s: t.total.orders === 1 ? "" : "s",
                u: t.total.units,
                amt: money(t.avgOrder),
              })}
              hot
            />
            <Stat
              k={tr("Online (storefront)")}
              v={money(t.online.revenue)}
              s={tr("{n} order{s} · {u} pcs · {p}% of sales", {
                n: t.online.orders,
                s: t.online.orders === 1 ? "" : "s",
                u: t.online.units,
                p: t.total.revenue
                  ? Math.round((t.online.revenue / t.total.revenue) * 1000) / 10
                  : 0,
              })}
              dot="#3b82f6"
            />
            <Stat
              k={tr("Manual (WhatsApp/ERP)")}
              v={money(t.manual.revenue)}
              s={tr("{n} order{s} · {u} pcs · {p}% of sales", {
                n: t.manual.orders,
                s: t.manual.orders === 1 ? "" : "s",
                u: t.manual.units,
                p: t.manualShare,
              })}
              dot="#ff5a1f"
            />
          </div>

          {/* ---------- stacked revenue chart ---------- */}
          <div className="mt-4 rounded-[10px] border border-line bg-panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] tracking-[.08em]">
                {tr("Revenue — Manual vs Online")}
              </h3>
              <span className="flex items-center gap-4 text-[11px] text-dim2">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-acc" />{" "}
                  {tr("Manual")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3b82f6]" />{" "}
                  {tr("Online")}
                </span>
              </span>
            </div>
            {series.length ? (
              <div className="pb-6 pt-2">
                <div className="flex h-[170px] items-end gap-[3px]">
                  {series.map((r, ix) => {
                    const tot = r.online.revenue + r.manual.revenue;
                    const hT = (tot / maxRev) * 100;
                    const hM = tot ? (r.manual.revenue / tot) * 100 : 0;
                    return (
                      <div
                        key={r.period}
                        className="relative flex h-full min-w-[4px] flex-1 items-end"
                        data-period={r.period}
                      >
                        <div
                          className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px]"
                          style={{ height: Math.max(tot ? 3 : 1.5, hT) + "%" }}
                          title={`${r.period}\nManual: ${money(r.manual.revenue)} (${r.manual.orders} orders)\nOnline: ${money(r.online.revenue)} (${r.online.orders} orders)\nTotal: ${money(tot)}`}
                        >
                          <div
                            className="w-full bg-[#3b82f6]"
                            style={{ height: 100 - hM + "%" }}
                          />
                          <div
                            className="w-full bg-acc"
                            style={{ height: hM + "%" }}
                          />
                        </div>
                        {ix % labelStep === 0 ? (
                          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] text-dim2">
                            {r.period.length === 7
                              ? r.period
                              : r.period.slice(5)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-[13.5px] text-dim2">
                {tr("No periods in range")}
              </div>
            )}
          </div>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
            <div>
              {/* ---------- per-period table ---------- */}
              <div className="tbl-wrap min-h-[520px] overflow-x-auto rounded-xl border border-line bg-panel">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {[
                        "Period",
                        "Online",
                        "Online Revenue",
                        "Manual",
                        "Manual Revenue",
                        "Total Revenue",
                      ].map((h) => (
                        <th
                          key={h}
                          className="border-b border-line2 px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.14em] text-dim whitespace-nowrap"
                        >
                          {tr(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((r) => {
                      const tot = r.online.orders + r.manual.orders;
                      return (
                        <tr
                          key={r.period}
                          data-rrow={r.period}
                          className={
                            "border-b border-line transition-colors last:border-b-0 hover:bg-panel2" +
                            (tot ? "" : " opacity-45")
                          }
                        >
                          <td className="px-3 py-2.5 font-semibold">
                            {r.period}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.online.orders || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[#6ea8ff]">
                            {r.online.revenue ? money(r.online.revenue) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            {r.manual.orders || "—"}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-acc">
                            {r.manual.revenue ? money(r.manual.revenue) : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-cond text-[15px] font-bold">
                            {tot
                              ? money(r.online.revenue + r.manual.revenue)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line2 bg-panel2/40">
                      <td className="px-3 py-3 text-[11px] font-bold uppercase tracking-[.14em]">
                        {tr("Total")}
                      </td>
                      <td className="px-3 py-3 font-bold">{t.online.orders}</td>
                      <td className="px-3 py-3 font-bold text-[#6ea8ff]">
                        {money(t.online.revenue)}
                      </td>
                      <td className="px-3 py-3 font-bold">{t.manual.orders}</td>
                      <td className="px-3 py-3 font-bold text-acc">
                        {money(t.manual.revenue)}
                      </td>
                      <td className="px-3 py-3 font-disp text-[16px] text-acc">
                        {money(t.total.revenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <Pagination
                page={data.meta.page || page}
                pages={data.meta.pages || 1}
                total={data.meta.total || data.meta.buckets || 0}
                loading={loading}
                onPageChange={setPage}
              />
            </div>

            {/* ---------- payment method breakdown ---------- */}
            <div className="rounded-[10px] border border-line bg-panel p-5">
              <h3 className="mb-3.5 text-[15px] tracking-[.08em]">
                {tr("Payment Methods")}
              </h3>
              {data.methods.length ? (
                data.methods.map((m) => (
                  <div
                    key={m.method}
                    className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-b-0"
                    data-pm={m.method}
                  >
                    <span className="uppercase tracking-[.06em]">
                      {m.method === "cod" ? tr("COD") : m.method}
                    </span>
                    <span className="text-right">
                      <b className="block font-cond text-[16px] font-extrabold text-acc">
                        {money(m.revenue)}
                      </b>
                      <span className="text-[11px] text-dim2">
                        {m.orders} order{m.orders === 1 ? "" : "s"}
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-[13.5px] text-dim2">
                  {tr("No payments in this range")}
                </div>
              )}
              <p className="mt-3.5 text-[11px] leading-relaxed text-dim2">
                Cancelled ও payment-rejected অর্ডার হিসাবের বাইরে — dashboard-এর
                revenue-এর সাথে একই নিয়ম।
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="reports" title={tr("Sales Report")}>
        <Reports />
      </AdminShell>
    </OverlayProvider>
  );
}
