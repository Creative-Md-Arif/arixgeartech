/* ArixGear ADMIN page — Combo Bundles (Phase 5, 5.3 · C3 net-new module)
   /admin/bundles · Phase 4 ComboBundle CRUD: 2–8 components (live product
   picker), bundle price must beat the components total, optional window,
   live save badge + orderable flag per card. */
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../components/AdminShell.jsx";
import {
  OverlayProvider,
  useToast,
  useModal,
} from "../components/Overlays.jsx";
import { TableSkeleton } from "../components/Skeleton.jsx";
import { money } from "../lib/admin.js";
import {
  CARD,
  ACC_BTN,
  GHOST_BTN,
  RED_BTN,
  CHIP,
  LBL,
  Toggle,
  Empty,
  useConfirm,
} from "../components/ui.jsx";
import {
  adminList,
  create,
  update,
  remove,
  products,
} from "../services/bundles.js";

const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

function BundleForm({ b, prods, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !b;
  const [title, setTitle] = useState(b?.title || "");
  const [titleBn, setTitleBn] = useState(b?.titleBn || "");
  const [tagline, setTagline] = useState(b?.tagline || "");
  const [taglineBn, setTaglineBn] = useState(b?.taglineBn || "");
  const [tag, setTag] = useState(b?.tag || "");
  const [bundlePrice, setBundlePrice] = useState(b?.bundlePrice ?? "");
  const [startsAt, setStartsAt] = useState(() => toLocalDateTime(b?.window?.startsAt));
  const [endsAt, setEndsAt] = useState(() => toLocalDateTime(b?.window?.endsAt));
  const [sortOrder, setSortOrder] = useState(b?.sortOrder ?? 0);
  const [active, setActive] = useState(b ? b.active : true);
  const [items, setItems] = useState(() =>
    (b?.items || []).map((i) => ({ slug: i.slug, qty: i.qty || 1 })),
  );
  const [busy, setBusy] = useState(false);

  const bySlug = useMemo(
    () => {
      const map = Object.fromEntries((prods || []).map((p) => [p.slug, p]));
      (b?.items || []).forEach((item) => {
        if (!map[item.slug]) map[item.slug] = { slug: item.slug, name: item.name, price: item.price, active: false };
      });
      return map;
    },
    [prods, b],
  );
  const pickerProducts = useMemo(() => Object.values(bySlug).sort((a, b) => a.name.localeCompare(b.name)), [bySlug]);
  const total = useMemo(
    () =>
      items.reduce(
        (s, i) => s + (bySlug[i.slug]?.price || 0) * (i.qty || 1),
        0,
      ),
    [items, bySlug],
  );
  const priceNum = Number(bundlePrice) || 0;
  const valid =
    title.trim() && title.trim().length <= 80 && titleBn.trim().length <= 80 &&
    tagline.trim().length <= 160 && taglineBn.trim().length <= 160 && tag.trim().length <= 24 &&
    items.length >= 2 && items.length <= 8 && items.every((i) => Number.isInteger(+i.qty) && +i.qty >= 1 && +i.qty <= 10) &&
    Number.isInteger(+sortOrder) && +sortOrder >= 0 && +sortOrder <= 999 &&
    (!startsAt || Number.isFinite(new Date(startsAt).getTime())) &&
    (!endsAt || Number.isFinite(new Date(endsAt).getTime())) &&
    (!startsAt || !endsAt || new Date(startsAt) <= new Date(endsAt)) &&
    priceNum > 0 && priceNum < total;

  const toggleItem = (slug) => {
    setItems((list) =>
      list.some((i) => i.slug === slug)
        ? list.filter((i) => i.slug !== slug)
        : [...list, { slug, qty: 1 }],
    );
  };

  const save = async () => {
    if (!valid)
      return toast(
        "Title, 2+ components and a bundle price BELOW the components total are required",
        "err",
      );
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        titleBn: titleBn.trim(),
        tagline: tagline.trim(),
        taglineBn: taglineBn.trim(),
        tag: tag.trim().slice(0, 24),
        bundlePrice: priceNum,
        active,
        window: {
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        },
        sortOrder: Number(sortOrder),
        items,
      };
      if (isNew) await create(body);
      else await update(b.id || b._id, body);
      toast(isNew ? "Bundle created ✓" : "Bundle saved ✓", "ok");
      closeModal();
      onDone();
    } catch (e) {
      toast(e.message, "err");
      setBusy(false);
    }
  };

  return (
    <div data-testid="bundleForm">
      <h2 className="text-[17px]">
        {isNew ? "+ New Combo Bundle" : "Edit Bundle — " + b.title}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className={LBL}>Title</span>
          <input
            data-testid="bundleTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Budget Gaming Build"
          />
        </label>
        <label className="block">
          <span className={LBL}>Title (বাংলা)</span>
          <input
            value={titleBn}
            onChange={(e) => setTitleBn(e.target.value)}
            placeholder="বাজেট গেমিং বিল্ড"
          />
        </label>
        <label className="block md:col-span-2">
          <span className={LBL}>Tagline</span>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="CPU + GPU + RAM — 1080p-ready."
          />
        </label>
        <label className="block md:col-span-2">
          <span className={LBL}>Tagline (বাংলা)</span>
          <input value={taglineBn} onChange={(e) => setTaglineBn(e.target.value)} maxLength={160} placeholder="কম্বো বান্ডেলের সংক্ষিপ্ত বিবরণ" />
        </label>
        <label className="block">
          <span className={LBL}>Corner chip</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="BUILD KIT"
          />
        </label>
        <label className="block">
          <span className={LBL}>
            Bundle price (৳) — must be below the total
          </span>
          <input
            data-testid="bundlePrice"
            type="number"
            min="1"
            value={bundlePrice}
            onChange={(e) => setBundlePrice(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={LBL}>Starts at (optional)</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="block">
          <span className={LBL}>Ends at (optional)</span>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <label className="block">
          <span className={LBL}>Sort order (0–999)</span>
          <input type="number" min="0" max="999" step="1" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>

      <div className="mt-4">
        <span className={LBL}>
          Components — pick {items.length < 2 ? "at least 2" : "more if needed"}{" "}
          (live prices)
        </span>
        <div
          className="max-h-[220px] overflow-y-auto rounded-lg border border-line2 bg-panel2 p-2"
          data-testid="bundlePicker"
        >
          {pickerProducts.map((p) => {
            const on = items.some((i) => i.slug === p.slug);
            return (
              <div
                key={p.slug}
                className={
                  "mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 " +
                  (on ? "bg-acc/10" : "")
                }
              >
                <Toggle
                  on={on}
                  onClick={() => toggleItem(p.slug)}
                  label={"include " + p.name}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt">
                  {p.name}{p.active === false ? " (inactive)" : ""}
                </span>
                <span className="text-[11.5px] text-dim2">
                  {money(p.price)}
                </span>
                {on ? (
                  <select
                    className="w-[64px] text-[12px]"
                    value={items.find((i) => i.slug === p.slug)?.qty || 1}
                    disabled={p.active === false}
                    onChange={(e) =>
                      setItems((l) =>
                        l.map((i) =>
                          i.slug === p.slug
                            ? { ...i, qty: Number(e.target.value) }
                            : i,
                        ),
                      )
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        ×{n}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-dim">
          Components total: <b className="text-txt">{money(total)}</b>
        </span>
        <span className="text-dim">
          Bundle: <b className="text-acc">{money(priceNum)}</b>
        </span>
        {priceNum > 0 && total > 0 && priceNum < total ? (
          <span className={CHIP + " border-green/40 text-green"}>
            customer saves {money(total - priceNum)} (
            {Math.round((1 - priceNum / total) * 100)}%)
          </span>
        ) : (
          <span className={CHIP + " border-red/40 text-red"}>
            {total > 0 && priceNum >= total
              ? "not a deal — price must be below the total"
              : "incomplete"}
          </span>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-dim">
          <Toggle on={active} onClick={() => setActive((v) => !v)} /> active
        </label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} onClick={closeModal} disabled={busy}>
          Cancel
        </button>
        <button
          className={ACC_BTN}
          data-testid="bundleSave"
          onClick={save}
          disabled={busy || !valid}
        >
          {isNew ? "Create Bundle" : "Save"}
        </button>
      </div>
    </div>
  );
}

function BundlesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);
  const [prods, setProds] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([adminList(), products()]);
      setItems(b.items || []);
      setProds(p.items || []);
      setErr("");
    } catch (e) {
      setErr(e.message);
      setItems([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const del = async (b) => {
    if (
      !(await confirm({
        title: "Delete bundle",
        body: `Delete bundle "${b.title}"? The homepage section keeps its config copy — this removes the purchasable bundle.`,
        danger: true,
        ok: "Delete",
      }))
    )
      return;
    try {
      await remove(b.id);
      toast("Bundle deleted", "ok");
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  return (
    <AdminShell active="bundles" title="Combo Bundles">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">
          {items
            ? items.length +
              " bundles · order-time allocation pricing (Phase 4)"
            : "Loading…"}
        </span>
        <div className="flex-1" />
        <button
          className={ACC_BTN}
          data-testid="bundleNew"
          onClick={() => openModal(<BundleForm prods={prods} onDone={load} />)}
        >
          + New Bundle
        </button>
      </div>

      {err ? (
        <div className={CARD + " text-[13px] text-red"}>
          Failed to load bundles — {err}
        </div>
      ) : null}
      {!items ? <TableSkeleton rows={4} /> : null}
      {items && !items.length ? (
        <Empty
          icon="📦"
          title="No bundles yet"
          sub="Combo bundles let customers buy a setup for one price — the backend expands them into components at checkout."
        />
      ) : null}

      {items && items.length ? (
        <div className="w-full overflow-x-auto rounded-xl border border-line bg-panel" data-testid="bundleTableWrap">
          <table className="w-full min-w-[1080px] border-collapse text-left text-[12.5px]" data-testid="bundleTable">
            <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim2">
              <tr>
                <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Bundle</th>
                <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Components</th>
                <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Pricing</th>
                <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Sales</th>
                <th className="whitespace-nowrap border-b border-line px-4 py-3 text-center font-bold">Active</th>
                <th className="whitespace-nowrap border-b border-line px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-line/70 align-top transition-colors last:border-b-0 hover:bg-panel2/60" data-testid="bundleRow">
                  <td className="w-[24%] px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2"><b className="text-[14px] text-txt">{b.title}</b>{b.tag ? <span className={CHIP + " border-acc/50 text-acc"}>{b.tag}</span> : null}</div>
                    {b.tagline ? <p className="mt-1 max-w-[260px] text-[11.5px] leading-relaxed text-dim2">{b.tagline}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5"><span className={CHIP + " " + (b.live ? "border-green/40 text-green" : "border-line2 text-dim2")}>{b.live ? "live" : "off"}</span>{!b.orderable && b.live ? <span className={CHIP + " border-red/40 text-red"}>unavailable</span> : null}</div>
                  </td>
                  <td className="w-[35%] px-4 py-4"><div className="flex max-w-[420px] flex-wrap gap-1.5">{(b.items || []).map((item) => <span key={item.slug} className={CHIP + " border-line2 text-dim"}>{item.name} ×{item.qty}</span>)}</div></td>
                  <td className="whitespace-nowrap px-4 py-4"><div className="text-[11px] text-dim2">Components <b className="text-txt line-through">{money(b.componentsTotal)}</b></div><div className="mt-1 text-[14px] font-bold text-acc">Bundle {money(b.bundlePrice)}</div>{b.savePct > 0 ? <span className={CHIP + " mt-1 border-green/40 text-green"}>−{b.savePct}%</span> : null}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-dim"><b className="text-txt">{b.sold || 0}</b> sold</td>
                  <td className="px-4 py-4 text-center"><Toggle on={b.active} onClick={() => update(b.id, { active: !b.active }).then(load).catch((e) => toast(e.message, "err"))} /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right"><div className="inline-flex gap-2"><button className={GHOST_BTN} onClick={() => openModal(<BundleForm b={b} prods={prods} onDone={load} />)}>Edit</button><button className={RED_BTN} onClick={() => del(b)}>Delete</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {false && items && items.length ? (
        <div
          className="grid grid-cols-1 gap-3 lg:grid-cols-2"
          data-testid="bundleGrid"
        >
          {items.map((b) => (
            <div key={b.id} className={CARD} data-testid="bundleCard">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[15px] text-txt">{b.title}</b>
                    {b.tag ? (
                      <span className={CHIP + " border-acc/50 text-acc"}>
                        {b.tag}
                      </span>
                    ) : null}
                    <span
                      className={
                        CHIP +
                        " " +
                        (b.live
                          ? "border-green/40 text-green"
                          : "border-line2 text-dim2")
                      }
                    >
                      {b.live ? "live" : "off"}
                    </span>
                    {!b.orderable && b.live ? (
                      <span className={CHIP + " border-red/40 text-red"}>
                        components unavailable
                      </span>
                    ) : null}
                    {b.sold ? (
                      <span className={CHIP + " border-purple/40 text-purple"}>
                        {b.sold} sold
                      </span>
                    ) : null}
                  </div>
                  {b.tagline ? (
                    <div className="mt-0.5 text-[12px] text-dim2">
                      {b.tagline}
                    </div>
                  ) : null}
                </div>
                <Toggle
                  on={b.active}
                  onClick={() =>
                    update(b.id, { active: !b.active })
                      .then(load)
                      .catch((e) => toast(e.message, "err"))
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.items.map((i) => (
                  <span
                    key={i.slug}
                    className={CHIP + " border-line2 text-dim"}
                  >
                    {i.name} ×{i.qty}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3 text-[13px]">
                <span className="text-dim">
                  total{" "}
                  <b className="text-txt line-through">
                    {money(b.componentsTotal)}
                  </b>
                </span>
                <span className="text-acc">
                  bundle <b>{money(b.bundlePrice)}</b>
                </span>
                {b.savePct > 0 ? (
                  <span className={CHIP + " border-green/40 text-green"}>
                    −{b.savePct}%
                  </span>
                ) : null}
                <div className="flex-1" />
                <button
                  className={GHOST_BTN}
                  onClick={() =>
                    openModal(<BundleForm b={b} prods={prods} onDone={load} />)
                  }
                >
                  Edit
                </button>
                <button className={RED_BTN} onClick={() => del(b)}>
                  Delete
                </button>
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
      <BundlesPage />
    </OverlayProvider>
  );
}
