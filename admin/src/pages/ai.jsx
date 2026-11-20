/* ArixGear ADMIN page — AI SYSTEM CONSOLE
   /admin/ai/:section  (imports · knowledge · chats · analytics · settings)

   The command center for the storefront AI stack:
     · IMPORTS    — paste product URL(s) → AI extracts + rewrites unique
                    Bangla/English SEO copy → duplicate warnings →
                    admin approval creates the real Product.
     · KNOWLEDGE  — what the assistant can "see": source coverage stats
                    + admin-curated FAQ entries (RAG knowledge base).
     · CHATS      — every customer conversation, follow-up threads,
                    privacy-first view (no PII is ever stored/answered).
     · ANALYTICS  — chats/sessions, intent mix, language split, token
                    spend, top questions, import funnel.
     · SETTINGS   — provider (Gemini / open-source endpoint / grounded
                    rules), model, temperature, limits, prompts, feature
                    switches — all live, no redeploy. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Navigate, Link as RLink } from "react-router-dom";
import AdminShell from "../components/AdminShell.jsx";
import { OverlayProvider, useToast } from "../components/Overlays.jsx";
import { TableSkeleton } from "../components/Skeleton.jsx";
import Pagination from "../components/Pagination.jsx";
import { money, dt } from "../lib/admin.js";
import {
  CARD,
  ACC_BTN,
  GHOST_BTN,
  RED_BTN,
  CHIP,
  LBL,
  INP,
  Toggle,
  Empty,
  useConfirm,
} from "../components/ui.jsx";
import { saveSchema } from "../services/specs.js";
import { uploadOne } from "../services/uploads.js";
import * as AI from "../services/ai.js";

const TABS = [
  { k: "imports", t: "AI Import" },
  { k: "knowledge", t: "Knowledge" },
  { k: "chats", t: "Chat History" },
  { k: "analytics", t: "Analytics" },
  { k: "settings", t: "Settings" },
];
const TAB = (on) =>
  "rounded-lg px-4 py-2 text-[12px] font-bold uppercase tracking-[.08em] border transition " +
  (on
    ? "border-acc bg-acc text-white"
    : "border-line2 text-dim hover:text-txt hover:border-dim");
const IMP_CHIP = {
  pending: "border-dim2 text-dim2",
  processing: "border-blue/40 text-blue",
  ready: "border-green/40 text-green",
  imported: "border-green/40 text-green",
  rejected: "border-line2 text-dim2",
  failed: "border-red/40 text-red",
};
const IMPORT_STALE_MS = 10 * 60 * 1000;

function categoryParentId(category) {
  const parent = category?.parent;
  if (!parent) return "";
  if (typeof parent === "object") {
    return String(
      parent._id ||
        (typeof parent.toHexString === "function" ? parent.toHexString() : "") ||
        parent.id ||
        parent,
    );
  }
  return String(parent);
}

function CategoryTreePicker({
  categories = [],
  value = "",
  onChange,
  placeholder = "Select a category",
  ariaLabel = "Category",
  allowEmpty = false,
  emptyLabel = "— none —",
  extraOptions = [],
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const tree = useMemo(() => {
    const nodes = (categories || [])
      .filter((category) => category?.slug)
      .map((category) => ({
        category,
        id: String(category._id || category.slug),
        parentId: categoryParentId(category),
        children: [],
      }));
    const byId = new Map();
    nodes.forEach((node) => {
      byId.set(node.id, node);
      byId.set(String(node.category.slug), node);
    });
    const roots = [];
    nodes.forEach((node) => {
      const parent = byId.get(node.parentId);
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    });
    const sortNodes = (list) => {
      list.sort((a, b) =>
        (a.category.order || 0) - (b.category.order || 0) ||
        String(a.category.name || "").localeCompare(String(b.category.name || "")),
      );
      list.forEach((node) => sortNodes(node.children));
    };
    sortNodes(roots);
    return { roots, byId, nodes };
  }, [categories]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRows = useMemo(() => {
    const included = new Set();
    const matches = (node) => {
      const labels = [];
      let current = node;
      const visited = new Set();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        labels.push(
          current.category.name,
          current.category.nameBn,
          current.category.slug,
        );
        current = tree.byId.get(current.parentId);
      }
      return labels
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    };

    if (normalizedSearch) {
      tree.nodes.forEach((node) => {
        if (!matches(node)) return;
        let current = node;
        const visited = new Set();
        while (current && !visited.has(current.id)) {
          visited.add(current.id);
          included.add(current.id);
          current = tree.byId.get(current.parentId);
        }
      });
    }

    const rows = [];
    const visit = (nodes, depth) => {
      nodes.forEach((node) => {
        if (normalizedSearch && !included.has(node.id)) return;
        rows.push({ node, depth });
        if (
          node.children.length &&
          (normalizedSearch || expanded.has(node.id))
        ) {
          visit(node.children, depth + 1);
        }
      });
    };
    visit(tree.roots, 0);
    return rows;
  }, [expanded, normalizedSearch, tree]);

  const selectedNode = tree.nodes.find((node) => node.category.slug === value);
  let selectedPath = [];
  for (
    let node = selectedNode;
    node && !selectedPath.includes(node.id);
    node = tree.byId.get(node.parentId)
  ) {
    selectedPath.unshift(node.category.name || node.category.slug);
  }
  const selectedLabel =
    selectedPath.join(" › ") ||
    extraOptions.find((option) => option.value === value)?.label ||
    value ||
    placeholder;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const select = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    setSearch("");
  };
  const toggleExpanded = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div ref={rootRef} className={"relative min-w-0 " + className}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="tree"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={INP + " flex w-full items-center justify-between gap-2 text-left"}
      >
        <span className={"min-w-0 truncate " + (value ? "text-txt" : "text-dim")}>
          {selectedLabel}
        </span>
        <span aria-hidden="true" className="shrink-0 text-dim">
          {open ? "⌃" : "⌄"}
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[70] mt-1 overflow-hidden rounded-xl border border-line2 bg-panel shadow-xl">
          <div className="border-b border-line p-2">
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search category / ক্যাটাগরি খুঁজুন"
              aria-label="Search categories"
              className={INP + " w-full"}
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {allowEmpty ? (
              <button
                type="button"
                onClick={() => select("")}
                className={
                  "mb-1 flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-bg " +
                  (!value ? "bg-acc/10 text-acc" : "text-dim")
                }
              >
                {emptyLabel}
              </button>
            ) : null}
            {extraOptions
              .filter((option) =>
                !normalizedSearch ||
                `${option.label} ${option.value}`
                  .toLocaleLowerCase()
                  .includes(normalizedSearch),
              )
              .map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => select(option.value)}
                  className={
                    "mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11.5px] hover:bg-bg " +
                    (value === option.value ? "bg-acc/10 text-acc" : "text-txt")
                  }
                >
                  <span className="truncate">{option.label}</span>
                  {value === option.value ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
            <div role="tree" aria-label="Categories">
              {visibleRows.map(({ node, depth }) => {
                const category = node.category;
                const hasChildren = node.children.length > 0;
                const isExpanded = normalizedSearch || expanded.has(node.id);
                const isSelected = category.slug === value;
                return (
                  <div
                    key={node.id}
                    role="treeitem"
                    aria-level={depth + 1}
                    aria-expanded={hasChildren ? Boolean(isExpanded) : undefined}
                    aria-selected={isSelected}
                    className={
                      "mb-0.5 flex min-w-0 items-center rounded-lg hover:bg-bg " +
                      (isSelected ? "bg-acc/10 text-acc" : "text-txt")
                    }
                    style={{ paddingLeft: 6 + depth * 14 }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${category.name}`}
                        onClick={() => toggleExpanded(node.id)}
                        className="flex h-8 w-7 shrink-0 items-center justify-center text-dim hover:text-acc"
                      >
                        {isExpanded ? "⌄" : "›"}
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      onClick={() => select(category.slug)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pr-2 text-left text-[11.5px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{category.name}</span>
                        {category.nameBn ? (
                          <span className="block truncate text-[10px] text-dim">
                            {category.nameBn}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? (
                        <span aria-hidden="true" className="shrink-0 text-acc">✓</span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
              {!visibleRows.length && !extraOptions.some((option) =>
                !normalizedSearch ||
                `${option.label} ${option.value}`
                  .toLocaleLowerCase()
                  .includes(normalizedSearch),
              ) ? (
                <p className="px-3 py-5 text-center text-[11px] text-dim">
                  No matching categories
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════ IMPORTS ═══════════ */
function ImportsSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [urls, setUrls] = useState("");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // opened import for approve flow
  const [rowAction, setRowAction] = useState(null);
  /* Step 6 — bulk approve selection (ready rows only). Step 7 — per-row
     category override: a mixed queue (laptop + monitor + …) can be approved
     in ONE call with each row landing in its own category. */
  const [picked, setPicked] = useState(new Set());
  const togglePick = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const readyPicked = [...picked].filter((id) =>
    items.some((i) => i._id === id && i.status === "ready"),
  );
  const [cats, setCats] = useState([]);
  const [rowCats, setRowCats] = useState({}); // import id → category slug override ('' = import's own guess)
  const [overrideOpen, setOverrideOpen] = useState(false);
  const listRequest = useRef(null);
  const listRequestId = useRef(0);
  useEffect(() => {
    AI.categories()
      .then((r) => setCats(r.items || r.categories || []))
      .catch(() => {});
  }, []);

  const bulkApprove = async () => {
    if (!readyPicked.length) return;
    const overridden = readyPicked.filter((id) => rowCats[id]).length;
    if (
      !(await confirm({
        title: "Bulk approve",
        body: `Create ${readyPicked.length} product(s) from the selected imports?${overridden ? ` ${overridden} row(s) carry a category override.` : " Each lands in its AI-guessed category."} Unknown spec fields auto-create in each category schema.`,
        ok: "Approve all",
      }))
    )
      return;
    setBusy(true);
    try {
      const items = readyPicked.map((id) => ({
        id,
        ...(rowCats[id] ? { category: rowCats[id] } : {}),
      }));
      const r = await AI.importBulkApproveItems(items);
      toast(
        `Bulk approve — ${r.approved.length} created${r.failed.length ? `, ${r.failed.length} failed: ${r.failed[0].error}` : ""}`,
        r.failed.length ? "err" : "ok",
      );
      setPicked(new Set());
      setRowCats({});
      setOverrideOpen(false);
      load({ force: true, silent: true });
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    const requestKey = `${statusFilter}:${page}:${limit}`;
    if (!force && listRequest.current?.key === requestKey) {
      return listRequest.current.promise;
    }

    const requestId = ++listRequestId.current;
    if (!silent) setLoading(true);
    const request = (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        if (statusFilter !== "all") params.set("status", statusFilter);
        const d = await AI.importList(params.toString());
        if (requestId !== listRequestId.current) return;
        setItems(d.items || []);
        setCounts(d.counts || {});
        setPages(d.pages || 1);
        setTotal(d.total || 0);
      } catch (e) {
        if (requestId === listRequestId.current) toast(e.message, "err");
      } finally {
        if (requestId === listRequestId.current && !silent) setLoading(false);
      }
    })();
    listRequest.current = { key: requestKey, promise: request };
    try {
      await request;
    } finally {
      if (listRequest.current?.promise === request) listRequest.current = null;
    }
  }, [statusFilter, page, limit, toast]);

  useEffect(() => {
    load();
  }, [load]);
  /* Poll active imports without covering the current table with loading rows.
     One-shot timers avoid overlapping list queries when the server is slow. */
  const hasActiveImports = items.some((i) =>
    ["pending", "processing"].includes(i.status),
  );
  useEffect(() => {
    if (!hasActiveImports || loading) return undefined;
    const timer = setTimeout(() => load({ silent: true }), 10000);
    return () => clearTimeout(timer);
  }, [hasActiveImports, loading, load]);

  const submit = async (e) => {
    e.preventDefault();
    const list = urls
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("http") || /\./.test(s));
    if (!list.length) {
      toast("Paste at least one product URL", "err");
      return;
    }
    setBusy(true);
    try {
      await AI.importCreate(list);
      setUrls("");
      toast(`${list.length} URL(s) queued for AI import`);
      load({ force: true, silent: true });
    } catch (ex) {
      toast(ex.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const isStaleImport = (item) => {
    const updatedAt = Date.parse(item.updatedAt || item.createdAt || "");
    return (
      ["pending", "processing"].includes(item.status) &&
      Number.isFinite(updatedAt) &&
      Date.now() - updatedAt >= IMPORT_STALE_MS
    );
  };

  const retryImport = async (item) => {
    setRowAction({ id: item._id, action: "retry" });
    try {
      await AI.importRetry(item._id);
      toast("Import re-queued");
      await load({ force: true, silent: true });
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setRowAction(null);
    }
  };

  const removeImport = async (item) => {
    const productName = item.aiContent?.name || item.extracted?.name || item.host || item.sourceUrl;
    if (
      !(await confirm({
        title: "Delete import",
        body: `Permanently delete "${productName}" from the import queue?${item.status === "imported" ? " The created product will not be deleted." : ""}`,
        danger: true,
        ok: "Delete",
      }))
    ) return;
    setRowAction({ id: item._id, action: "delete" });
    try {
      await AI.importDelete(item._id);
      setPicked((current) => {
        const next = new Set(current);
        next.delete(item._id);
        return next;
      });
      setRowCats((current) => {
        const next = { ...current };
        delete next[item._id];
        return next;
      });
      toast("Import deleted");
      await load({ force: true, silent: true });
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setRowAction(null);
    }
  };

  const openDetail = async (id) => {
    try {
      setDetail((await AI.importGet(id)).item);
    } catch (e) {
      toast(e.message, "err");
    }
  };

  if (detail)
    return (
      <ImportDetail
        item={detail}
        onBack={() => {
          setDetail(null);
          load({ force: true, silent: true });
        }}
      />
    );

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className={CARD} id="aiImportForm">
        <div className="flex items-center justify-between">
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            🤖 AI Product Import
          </h3>
          <span className="text-[11px] text-dim">
            Paste source product URL(s) — AI extracts, rewrites, dedupes; you
            approve.
          </span>
        </div>
        <textarea
          id="aiImportUrls"
          rows={4}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder={
            "https://vendor-site.com/product/whatever-rtx-4060-laptop\nhttps://another-shop.com/p/gaming-monitor  (one URL per line — bulk)"
          }
          className="mt-3 w-full rounded-lg border border-line2 bg-bg px-3 py-2.5 font-mono text-[12px] text-txt outline-none focus:border-acc"
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-dim">
            Auto-detects product, price, brand, category, specs, features and
            images from structured data and page content. Category/brand guesses
            are matched against the catalog and shown for review before approval.
            Rewrite uses your configured AI provider (or a grounded template).
          </p>
          <button
            id="aiImportSubmit"
            disabled={busy}
            className={ACC_BTN + " disabled:opacity-50"}
          >
            {busy ? "Queueing…" : "Import with AI"}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2" id="aiImportFilters">
        {[
          "all",
          "ready",
          "processing",
          "pending",
          "imported",
          "rejected",
          "failed",
        ].map((s) => (
          <button
            key={s}
            onClick={() => {
              setPage(1);
              setStatusFilter(s);
            }}
            className={TAB(statusFilter === s)}
          >
            {s} {counts[s] ? `(${counts[s]})` : ""}
          </button>
        ))}
        {/* Step 6 — bulk approve bar (appears when ready rows are picked) */}
        {readyPicked.length ? (
          <div className="ml-auto flex items-center gap-2" id="aiBulkBar">
            <span className="text-[11.5px] text-dim">
              {readyPicked.length} selected
            </span>
            {/* Step 7 — per-row category override toggle */}
            <button
              onClick={() => setOverrideOpen((o) => !o)}
              id="aiBulkOverrideToggle"
              className={GHOST_BTN}
              title="Give each selected import its own category before approving"
            >
              Categories{" "}
              {Object.keys(rowCats).filter((k) => rowCats[k]).length
                ? `(${Object.keys(rowCats).filter((k) => rowCats[k]).length} overridden)`
                : "· import guesses"}
            </button>
            <button onClick={() => setPicked(new Set())} className={GHOST_BTN}>
              Clear
            </button>
            <button
              onClick={bulkApprove}
              disabled={busy}
              id="aiBulkApprove"
              className={ACC_BTN}
            >
              {busy ? "Approving…" : `Approve selected (${readyPicked.length})`}
            </button>
          </div>
        ) : null}
      </div>

      {/* Step 7 — per-row category override grid (#5): one select per picked row; a row left on “—” keeps the import's AI-guessed category */}
      {overrideOpen && readyPicked.length ? (
        <div
          className="rounded-xl border border-line bg-panel p-4"
          id="aiBulkOverride"
        >
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-dim">
            Per-row category override
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {readyPicked.map((id) => {
              const it = items.find((x) => x._id === id);
              if (!it) return null;
              const guess = it.category || it.categoryGuess || "";
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 text-[11.5px]"
                  data-bulkrow={id}
                >
                  <span
                    className="w-44 shrink-0 truncate text-txt"
                    title={it.aiContent?.name || it.extracted?.name}
                  >
                    {it.aiContent?.name ||
                      it.extracted?.name ||
                      "(extracting…)"}
                  </span>
                  <CategoryTreePicker
                    categories={cats}
                    value={rowCats[id] || ""}
                    onChange={(category) =>
                      setRowCats((m) => ({ ...m, [id]: category }))
                    }
                    allowEmpty
                    emptyLabel={`— import guess${guess ? `: ${guess}` : ""} —`}
                    ariaLabel={`Category override for ${it.aiContent?.name || it.extracted?.name || "import"}`}
                    className="min-w-0 flex-1 text-[11px]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-[12px] font-bold text-txt">Import queue</p>
          <p className="mt-0.5 text-[11px] text-dim">
            {total} total · page {page} of {pages}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={GHOST_BTN}
            onClick={() => load({ force: true })}
            disabled={loading}
            title="Refresh import list"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <label className="flex items-center gap-2 text-[11.5px] text-dim">
            Rows per page
            <select
              value={limit}
              onChange={(event) => {
                setPage(1);
                setLimit(Number(event.target.value));
              }}
              className={INP + " w-[88px]"}
              aria-label="Rows per page"
            >
              {[10, 20, 40, 80].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="min-h-[360px] overflow-hidden rounded-xl border border-line bg-panel"><TableSkeleton rows={limit} cols={8} /></div>
      ) : items.length === 0 ? (
        <Empty
          icon="🛸"
          title="No imports yet"
          sub="Queue a product URL above — the AI extracts specs, prices and images, then rewrites unique bilingual SEO content for your approval."
        />
      ) : (
        <div
          className={"relative min-h-[360px] overflow-hidden rounded-xl border border-line bg-panel transition-opacity " + (loading ? "opacity-60" : "opacity-100")}
          id="aiImportTable"
        >
          {loading ? <div className="absolute inset-0 z-10 overflow-hidden bg-panel"><TableSkeleton rows={items.length || limit} cols={8} /></div> : null}
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim">
              <tr>
                <th className="w-8 px-2 py-2.5"></th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Dupes</th>
                <th className="px-4 py-2.5">Rewriter</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((i) => (
                <tr key={i._id} className="hover:bg-bg/60">
                  <td className="px-2 py-2.5">
                    {/* Step 6 — pick for bulk approve (ready rows only) */}
                    {i.status === "ready" ? (
                      <input
                        type="checkbox"
                        className="w-auto"
                        aria-label="Select for bulk approve"
                        checked={picked.has(i._id)}
                        onChange={() => togglePick(i._id)}
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-txt">
                      {i.aiContent?.name ||
                        i.extracted?.name ||
                        (["pending", "processing"].includes(i.status)
                          ? "(extracting…)"
                          : "(product name not found — review)")}
                    </p>
                    <p className="text-[11px] text-dim">
                      {dt(i.createdAt)} · {i.images?.length || 0} images
                    </p>
                  </td>
                  <td
                    className="max-w-[220px] truncate px-4 py-2.5 text-dim"
                    title={i.sourceUrl}
                  >
                    {i.host || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.price
                      ? money(i.price)
                      : i.extracted?.price
                        ? money(i.extracted.price)
                        : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`${CHIP} ${IMP_CHIP[i.status]}`}>
                      {i.status}
                      {i.status === "processing" ? ` ${i.progress}%` : ""}
                    </span>
                    {isStaleImport(i) ? (
                      <p className="mt-1 text-[10px] text-orange">
                        Stalled · retry available
                      </p>
                    ) : null}
                    {i.error ? (
                      <p className="mt-1 max-w-[180px] truncate text-[10.5px] text-red">
                        {i.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.duplicates?.length ? (
                      <span className="text-orange">
                        ⚠ {i.duplicates.length}
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-dim">
                    {i.meta?.provider || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {["ready", "failed", "imported"].includes(i.status) ? (
                        <button
                          onClick={() => openDetail(i._id)}
                          className={GHOST_BTN + " px-2 py-1"}
                          disabled={rowAction?.id === i._id}
                        >
                          Open
                        </button>
                      ) : null}
                      {i.status === "failed" || isStaleImport(i) ? (
                        <button
                          type="button"
                          onClick={() => retryImport(i)}
                          className={ACC_BTN + " px-2 py-1"}
                          disabled={rowAction?.id === i._id}
                        >
                          {rowAction?.id === i._id && rowAction.action === "retry" ? "Retrying…" : "Retry"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeImport(i)}
                        className={RED_BTN + " px-2 py-1"}
                        disabled={rowAction?.id === i._id}
                        title="Delete import record"
                      >
                        {rowAction?.id === i._id && rowAction.action === "delete" ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={pages} total={total} loading={loading || busy} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

function ImportDetail({ item: initial, onBack }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [item, setItem] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef(null);
  const [editingImage, setEditingImage] = useState(null);
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);
  const [form, setForm] = useState({
    name: item.aiContent?.name || item.extracted?.name || "",
    nameBn: item.aiContent?.nameBn || "",
    shortDesc: item.aiContent?.shortDesc || "",
    shortDescBn: item.aiContent?.shortDescBn || "",
    description: item.aiContent?.description || "",
    descriptionBn: item.aiContent?.descriptionBn || "",
    price: item.price ?? item.extracted?.price ?? "",
    comparePrice: item.comparePrice ?? "",
    category: item.categoryManual ? "" : item.category || item.categoryGuess || "",
    categoryMode: item.categoryManual ? "manual" : "select",
    categoryName: item.manualCategoryName || (item.categoryManual ? item.category : "") || item.extracted?.categoryGuess || "",
    categoryParent: item.categoryParent || "",
    brandId: item.brand?._id || ((item.brandName || item.extracted?.brandGuess) ? "create" : "none"),
    brandName: item.brandName || item.extracted?.brandGuess || "",
    warrantyMonths: item.warrantyMonths || 0,
    stock: 10,
    seoTitle: item.aiContent?.seo?.metaTitle || "",
    seoDesc: item.aiContent?.seo?.metaDescription || "",
  });
  /* Step 5 — editable specs + key features (sent with approve → the backend
     AUTO-CREATES every unknown group/field in the category schema) */
  const [specs, setSpecs] = useState(() => {
    const src = (item.aiContent?.specs || []).length
      ? item.aiContent.specs
      : item.extracted?.specs || [];
    return src.map((s) => ({ k: s.k, v: s.v }));
  });
  const [features, setFeatures] = useState(() => {
    const src = (item.aiContent?.features || []).length
      ? item.aiContent.features
      : item.extracted?.features || [];
    return src.map(String);
  });
  const [featuresBn, setFeaturesBn] = useState(() =>
    (item.aiContent?.featuresBn || []).map(String),
  );

  useEffect(() => {
    Promise.all([
      AI.categories().catch(() => ({ items: [] })),
      AI.brands().catch(() => ({ items: [] })),
    ]).then(([c, b]) => {
      setCats(c.items || c.categories || []);
      setBrands(b.items || b.brands || []);
    });
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  /* Paste a copied spreadsheet/table or a plain "Label: value" list into
     any spec row. */
  const parseSpecPaste = (raw) => {
    const text = String(raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trim();
    if (!text) return [];
    const rows = [];
    const add = (k, v) => {
      const key = String(k || "").replace(/^[•·\-*\s]+/, "").trim();
      const value = String(v || "").replace(/^[：:|\-\s]+/, "").trim();
      if (!key || !value || key.length > 100 || value.length > 500) return;
      if (!rows.some((row) => row.k.toLowerCase() === key.toLowerCase()))
        rows.push({ k: key, v: value });
    };
    for (const line of text.split("\n").map((item) => item.trim()).filter(Boolean)) {
      const cells = line.split(/\t+/).map((item) => item.trim()).filter(Boolean);
      if (cells.length >= 2) {
        add(cells[0], cells.slice(1).join(" "));
        continue;
      }
      const match = line.match(/^([^:：|]{2,100})\s*[:：|]\s*(.+)$/);
      if (match) add(match[1], match[2]);
    }
    /* Also accept copied two-line pairs: Label newline Value. */
    if (!rows.length) {
      const lines = text.split("\n").map((item) => item.trim()).filter(Boolean);
      for (let i = 0; i + 1 < lines.length; i += 2) add(lines[i], lines[i + 1]);
    }
    return rows;
  };
  const handleSpecPaste = (event) => {
    const pasted = parseSpecPaste(event.clipboardData?.getData("text/plain"));
    if (pasted.length < 1) return;
    event.preventDefault();
    setSpecs((list) => {
      const existing = list.filter((row) => String(row.k || "").trim() || String(row.v || "").trim());
      const seen = new Set(existing.map((row) => String(row.k || "").trim().toLowerCase()));
      return [...existing, ...pasted.filter((row) => {
        const key = row.k.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })];
    });
    setMapping(null);
    toast(`${pasted.length} specification row(s) appended from clipboard`, "ok");
  };
  const parseFeaturePaste = (raw) => {
    const text = String(raw || "").replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
    if (!text) return [];
    const values = text
      .split(/\n|\t|[•·]/)
      .map((value) => String(value).replace(/^[\-*✓✔\s]+/, "").trim())
      .filter((value) => value.length >= 2 && value.length <= 300);
    return [...new Set(values.map((value) => value.toLowerCase()))]
      .map((key) => values.find((value) => value.toLowerCase() === key))
      .slice(0, 30);
  };
  const handleFeaturePaste = (event) => {
    const pasted = parseFeaturePaste(event.clipboardData?.getData("text/plain"));
    if (pasted.length < 1) return;
    event.preventDefault();
    setFeatures((list) => {
      const existing = list.map((value) => String(value || "").trim()).filter(Boolean);
      const seen = new Set(existing.map((value) => value.toLowerCase()));
      return [...existing, ...pasted.filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })];
    });
    toast(`${pasted.length} key feature(s) appended from clipboard`, "ok");
  };

  /* Step 5 — schema-mapping preview: which extracted attributes already exist
     in the target category (→ mapped) and which will be AUTO-CREATED. */
  const targetCat = (cats || []).find((c) => c.slug === form.category);
  const detectedCategory = (cats || []).find((c) => c.slug === item.categoryGuess);
  const schemaFields = useMemo(() => {
    const out = [];
    for (const g of (targetCat && targetCat.specGroups) || [])
      for (const f of g.fields || [])
        out.push({
          key: f.key,
          label: String(f.label || "").toLowerCase(),
          labelBn: String(f.labelBn || "").toLowerCase(),
          aliases: Object.keys(f.aliases || {}).map((key) => key.toLowerCase()),
          type: f.type || "text",
          unit: f.unit || "",
          group: g.label || "Specifications",
        });
    return out;
  }, [targetCat]);
  const seededSchemaCategory = useRef("");
  useEffect(() => {
    const categoryKey = String(targetCat?._id || targetCat?.slug || "");
    if (!categoryKey || seededSchemaCategory.current === categoryKey) return;
    seededSchemaCategory.current = categoryKey;
    const schemaRows = (targetCat.specGroups || []).flatMap((group) =>
      (group.fields || []).map((field) => ({
        k: field.label || field.key || "",
        v: "",
      })),
    ).filter((row) => row.k);
    if (!schemaRows.length) return;
    setSpecs((list) => {
      const hasProductSpecs = list.some((row) => String(row.k || "").trim() && String(row.v || "").trim());
      return hasProductSpecs ? list : schemaRows;
    });
  }, [targetCat]);
  const schemaFieldFor = (key) => {
    const want = String(key || "").toLowerCase().trim();
    return schemaFields.find((field) =>
      field.key === want || field.label === want || field.labelBn === want || field.aliases.includes(want),
    );
  };
  const isKnown = (k) =>
    Boolean(schemaFieldFor(k));
  const newCount = specs.filter((s) => s.k && !isKnown(s.k)).length;

  /* Step 6 — AI-ASSISTED SCHEMA MAPPING. The backend suggests type + filterable
     per attribute (LLM when configured, deterministic rules otherwise). Chips
     render next to each spec row; Apply writes the flags into the category
     schema so the facet/filter behaviour is right from the first approve. */
  const [mapping, setMapping] = useState(null); // { suggestions, provider }
  const [mappingBusy, setMappingBusy] = useState(false);
  const mapFor = (k) => {
    if (!mapping) return null;
    const want = String(k || "")
      .toLowerCase()
      .trim();
    return (
      (mapping.suggestions || []).find(
        (s) =>
          String(s.k || "")
            .toLowerCase()
            .trim() === want,
      ) || null
    );
  };
  const suggestMapping = async () => {
    setMappingBusy(true);
    try {
      const r = await AI.importSuggestMapping(item._id);
      setMapping(r);
      toast(
        r.suggestions?.length
          ? `AI suggested mapping for ${r.suggestions.length} attribute(s) (${r.provider})`
          : "No attributes to map",
        r.suggestions?.length ? "ok" : "err",
      );
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setMappingBusy(false);
    }
  };
  const applyMapping = async () => {
    if (!mapping || !targetCat) return;
    const byKey = new Map(
      (mapping.suggestions || []).map((s) => [
        String(s.k || "")
          .toLowerCase()
          .trim(),
        s,
      ]),
    );
    /* clone the category schema; suggested attributes get type/filterable
       patched (existing fields) or materialize as new fields (auto-create) */
    const groups = JSON.parse(JSON.stringify(targetCat.specGroups || []));
    const patched = new Set();
    for (const g of groups) {
      for (const f of g.fields || []) {
        const s =
          byKey.get(
            String(f.label || "")
              .toLowerCase()
              .trim(),
          ) ||
          byKey.get(
            String(f.key || "")
              .toLowerCase()
              .trim(),
          );
        if (s) {
          f.type = s.type;
          f.filterable = !!s.filterable;
          patched.add(
            String(s.k || "")
              .toLowerCase()
              .trim(),
          );
        }
      }
    }
    for (const s of mapping.suggestions || []) {
      if (!s.k || patched.has(String(s.k).toLowerCase().trim())) continue;
      patched.add(String(s.k).toLowerCase().trim());
      let g =
        groups.find(
          (x) => (x.label || "").toLowerCase() === "specifications",
        ) || groups[0];
      if (!g) {
        g = {
          key: "general",
          label: "Specifications",
          labelBn: "",
          collapsed: false,
          order: 0,
          fields: [],
        };
        groups.push(g);
      }
      g.fields = g.fields || [];
      g.fields.push({
        key: "",
        label: s.k,
        labelBn: "",
        type: s.type,
        options: s.type === "select" ? [] : undefined,
        unit: "",
        defaultValue: "",
        repeatable: false,
        filterable: !!s.filterable,
        showInDetails: true,
        required: false,
        icon: "",
        aliases: {},
        showOnCard: false,
        order: g.fields.length,
      });
    }
    try {
      await saveSchema(targetCat._id, {
        specGroups: groups,
        hideEmptyFields: targetCat.hideEmptyFields !== false,
      });
      toast(
        "Schema updated — " +
          patched.size +
          " attribute(s) mapped (filterable flags + types)",
        "ok",
      );
      setMapping(null);
    } catch (e) {
      toast(e.message, "err");
    }
  };

  /* Step 6 — UPDATE MODE: when the staging queue flagged duplicates the admin
     can refresh the EXISTING product instead of creating a second one. */
  const [mode, setMode] = useState("create");
  const [targetId, setTargetId] = useState("");
  const dupTargets = (item.duplicates || []).filter(
    (d) => d.productId && d.productId._id,
  );
  useEffect(() => {
    if (dupTargets.length && !targetId)
      setTargetId(String(dupTargets[0].productId._id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Step 7 — UPDATE-MODE DIFF VIEW (#4): fetch the side-by-side "staged vs
     current" preview so the admin sees EXACTLY what the refresh overwrites
     (price, copy, images, specs delta, schema growth) before confirming. */
  const [diff, setDiff] = useState(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const loadDiff = async () => {
    if (!targetId) {
      toast("Pick the product to update first", "err");
      return;
    }
    setDiffBusy(true);
    try {
      setDiff(await AI.importDiff(item._id, targetId));
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setDiffBusy(false);
    }
  };
  useEffect(() => {
    setDiff(null);
  }, [targetId, mode]); // a new target invalidates the preview

  const saveEdits = async () => {
    if (form.categoryMode === "manual" && !form.categoryName.trim()) {
      toast("Enter a category name", "err");
      return;
    }
    setSaving(true);
    try {
      await AI.importEdit(item._id, {
        price: form.price,
        comparePrice: form.comparePrice === "" ? null : form.comparePrice,
        category: form.categoryMode === "manual" ? form.categoryName.trim() : form.category,
        categoryManual: form.categoryMode === "manual",
        categoryParent: form.categoryMode === "manual" ? form.categoryParent : "",
        brandId: form.brandId,
        brandName: form.brandName,
        warrantyMonths: form.warrantyMonths,
        aiContent: {
          name: form.name,
          nameBn: form.nameBn,
          shortDesc: form.shortDesc,
          shortDescBn: form.shortDescBn,
          description: form.description,
          descriptionBn: form.descriptionBn,
          specs,
          features: features.map((f) => String(f).trim()).filter(Boolean),
          featuresBn: featuresBn.map((f) => String(f).trim()).filter(Boolean),
          seo: { metaTitle: form.seoTitle, metaDescription: form.seoDesc },
        },
      });
      toast("Draft saved");
      setItem((await AI.importGet(item._id)).item);
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const saveImages = async (images) => {
    setImageBusy(true);
    try {
      await AI.importEdit(item._id, { images });
      setItem((current) => ({ ...current, images }));
      toast("Images updated", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setImageBusy(false);
    }
  };

  const replaceImage = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast("Use a JPG, PNG or WEBP image", "err");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Image must be smaller than 5MB", "err");
      return;
    }
    setImageBusy(true);
    try {
      const uploaded = await uploadOne(file);
      const url = uploaded.image?.url || uploaded.url;
      if (!url) throw new Error("Image upload did not return a URL");
      const images = (item.images || []).map((image, ix) =>
        ix === editingImage ? { ...image, url, publicId: uploaded.image?.publicId || uploaded.publicId || "" } : image,
      );
      await AI.importEdit(item._id, { images });
      setItem((current) => ({ ...current, images }));
      setEditingImage(null);
      toast("Image replaced", "ok");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const removeImage = async (index) => {
    const images = (item.images || []).filter((_, ix) => ix !== index);
    if (!images.length) {
      toast("Keep at least one image", "err");
      return;
    }
    await saveImages(images);
  };

  const approve = async () => {
    if (saving) return;
    if (form.categoryMode === "manual" && !form.categoryName.trim()) {
      toast("Enter a category name", "err");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      nameBn: form.nameBn,
      shortDesc: form.shortDesc,
      shortDescBn: form.shortDescBn,
      description: form.description,
      descriptionBn: form.descriptionBn,
      price: form.price,
      comparePrice: form.comparePrice === "" ? null : form.comparePrice,
      category: form.categoryMode === "manual" ? form.categoryName.trim() : form.category,
      categoryManual: form.categoryMode === "manual",
      categoryParent: form.categoryMode === "manual" ? form.categoryParent : "",
      brandId: form.brandId,
      brandName: form.brandName,
      warrantyMonths: form.warrantyMonths,
      stock: form.stock,
      specs,
      features: features.map((f) => String(f).trim()).filter(Boolean),
      featuresBn: featuresBn.map((f) => String(f).trim()).filter(Boolean),
      aiContent: {
        seo: {
          metaTitle: form.seoTitle,
          metaDescription: form.seoDesc,
        },
      },
    };
    if (mode === "update") {
      const tgt = dupTargets.find((d) => String(d.productId._id) === targetId);
      if (!tgt) {
        toast("Pick the product to update", "err");
        return;
      }
      if (
        !(await confirm({
          title: "Update existing product",
          body: `Refresh "${tgt.productId.name}" from this import? Price, copy, images and specs refresh — stock, sold count, rating and SKU stay untouched.${newCount ? " " + newCount + " new specification field(s) will be auto-created." : ""}`,
          ok: "Update product",
        }))
      )
      {
        setSaving(false);
        return;
      }
      try {
        const r = await AI.importApprove(item._id, {
          ...payload,
          mode: "update",
          targetProductId: targetId,
          keepImages: false,
        });
        toast(`Product updated → /product/${r.product.slug}`);
        onBack();
      } catch (e) {
        toast(e.message, "err");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (
      !(await confirm({
        title: "Approve import",
        body: `Create product "${form.name}" at ${money(form.price || 0)} and publish it to the storefront?${newCount ? " " + newCount + " new specification field(s) will be auto-created in the category schema." : ""}`,
        ok: "Approve & publish",
      }))
    )
    {
      setSaving(false);
      return;
    }
    try {
      const r = await AI.importApprove(item._id, payload);
      toast(`Product created → /product/${r.product.slug}`);
      onBack();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (
      !(await confirm({
        title: "Reject import",
        body: "It stays in the queue for audit.",
        danger: true,
        ok: "Reject",
      }))
    )
      return;
    try {
      await AI.importReject(item._id);
      toast("Rejected");
      onBack();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: "Delete import",
        body: "Delete this import permanently?",
        danger: true,
        ok: "Delete",
      }))
    )
      return;
    try {
      await AI.importDelete(item._id);
      toast("Deleted");
      onBack();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const retry = async () => {
    try {
      await AI.importRetry(item._id);
      toast("Re-queued");
      onBack();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const ex = item.extracted || {};
  return (
    <div className="space-y-4" id="aiImportDetail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className={GHOST_BTN}>
          ← Back to queue
        </button>
        <div className="flex items-center gap-2">
          <span className={`${CHIP} ${IMP_CHIP[item.status]}`}>
            {item.status}
          </span>
          {item.meta?.provider ? (
            <span className="text-[11px] text-dim">
              rewriter: {item.meta.provider} · {item.meta.durationMs}ms
            </span>
          ) : null}
          {item.status === "failed" ? (
            <button onClick={retry} className={GHOST_BTN}>
              Retry
            </button>
          ) : null}
          {item.status !== "imported" ? (
            <button onClick={reject} className={RED_BTN}>
              Reject
            </button>
          ) : null}
          {item.status !== "imported" ? (
            <button
              onClick={approve}
              id="aiApprove"
              className={ACC_BTN + " disabled:opacity-50"}
              disabled={saving}
            >
              {saving ? "Approving…" : "Approve → Product"}
            </button>
          ) : null}
          <button onClick={remove} className={RED_BTN}>
            Delete
          </button>
        </div>
      </div>

      {item.duplicates?.length ? (
        <div
          className="rounded-xl border border-orange/50 bg-orange/10 p-4 text-[12.5px] text-orange"
          id="aiDupes"
        >
          <p className="font-bold">
            ⚠ Possible duplicates detected ({item.duplicates.length}) — review
            before approving:
          </p>
          <ul className="mt-1.5 space-y-1">
            {item.duplicates.map((d, i) => (
              <li key={i}>
                • {d.name || "(unknown)"}{" "}
                {d.slug ? (
                  <a className="underline" href={`/admin/products?q=${d.slug}`}>
                    {d.slug}
                  </a>
                ) : null}{" "}
                — {d.reason} ({Math.round((d.score || 0) * 100)}%)
              </li>
            ))}
          </ul>
          {/* Step 6 — update mode: refresh the existing product instead of duplicating */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-orange/30 pt-3">
            <label className="flex items-center gap-1.5 normal-case tracking-normal">
              <input
                type="radio"
                className="w-auto"
                name="aiMode"
                checked={mode === "create"}
                onChange={() => setMode("create")}
              />
              Create as NEW product
            </label>
            <label className="flex items-center gap-1.5 normal-case tracking-normal">
              <input
                type="radio"
                className="w-auto"
                name="aiMode"
                checked={mode === "update"}
                onChange={() => setMode("update")}
              />
              Update existing:
            </label>
            {mode === "update" ? (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-auto rounded border border-orange/40 bg-bg px-2 py-1 text-[11.5px] text-txt"
                id="aiUpdateTarget"
              >
                {dupTargets.map((d) => (
                  <option key={d.productId._id} value={String(d.productId._id)}>
                    {d.productId.name || d.productId.slug}
                  </option>
                ))}
              </select>
            ) : null}
            {mode === "update" ? (
              <button
                onClick={loadDiff}
                disabled={diffBusy}
                id="aiDiffBtn"
                className={GHOST_BTN + " normal-case tracking-normal"}
                title="Side-by-side preview: what the refresh changes on the target product"
              >
                {diffBusy ? "Diffing…" : "🔍 Preview changes"}
              </button>
            ) : null}
            {mode === "update" ? (
              <span className="text-[10.5px] opacity-80">
                sales state (stock · sold · rating · SKU) stays untouched
              </span>
            ) : null}
          </div>

          {/* Step 7 — side-by-side diff (#4): current product column vs staged import column */}
          {diff ? (
            <div
              className="mt-3 rounded-lg border border-orange/30 bg-bg p-3"
              id="aiDiffView"
              data-difftarget={diff.target?.slug}
            >
              <p className="text-[11px] font-bold uppercase tracking-[.12em]">
                Refresh preview — {diff.target?.name}
                <span className="ml-2 font-normal normal-case tracking-normal opacity-80">
                  {diff.summary?.changedRows} field(s) ·{" "}
                  {diff.summary?.specsTouched} spec row(s)
                  {diff.summary?.newFields
                    ? ` · ${diff.summary.newFields} new schema field(s)`
                    : ""}
                </span>
              </p>
              <div className="mt-2 max-h-72 overflow-y-auto rounded border border-line/70 text-[11.5px]">
                <table className="w-full text-left">
                  <thead className="bg-panel2 text-[10px] uppercase tracking-[.12em] text-dim">
                    <tr>
                      <th className="px-2 py-1.5">Field</th>
                      <th className="px-2 py-1.5">Current on product</th>
                      <th className="px-2 py-1.5">Staged in import</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {diff.rows.map((r) => (
                      <tr
                        key={r.field}
                        className={r.changed ? "bg-acc/10" : ""}
                        data-diffrow={r.field}
                      >
                        <td className="px-2 py-1.5 align-top font-semibold">
                          {r.label}
                        </td>
                        <td className="max-w-[240px] px-2 py-1.5 align-top text-dim">
                          {Array.isArray(r.current) ? (
                            `${r.current.length} row(s)`
                          ) : String(r.current ?? "") !== "" ? (
                            String(r.current).slice(0, 140)
                          ) : (
                            <span className="italic opacity-60">(empty)</span>
                          )}
                        </td>
                        <td className="max-w-[240px] px-2 py-1.5 align-top">
                          {Array.isArray(r.staged) ? (
                            <span>
                              {r.staged.length} row(s)
                              {r.added?.length ? (
                                <span
                                  className="ml-1 text-green"
                                  title={r.added.join(", ")}
                                >
                                  +{r.added.length}
                                </span>
                              ) : null}
                              {r.removed?.length ? (
                                <span
                                  className="ml-1 text-red"
                                  title={r.removed.join(", ")}
                                >
                                  −{r.removed.length}
                                </span>
                              ) : null}
                            </span>
                          ) : String(r.staged ?? "") !== "" ? (
                            String(r.staged).slice(0, 140)
                          ) : (
                            <span className="italic opacity-60">(empty)</span>
                          )}
                          {r.changed ? (
                            <span className="ml-1 inline-block rounded border border-acc/60 px-1 text-[9px] font-bold uppercase text-acc">
                              changes
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diff.specs &&
              (diff.specs.added.length ||
                diff.specs.removed.length ||
                diff.specs.changed.length) ? (
                <div className="mt-2 space-y-1 text-[11px]" id="aiDiffSpecs">
                  {diff.specs.added.slice(0, 6).map((s) => (
                    <p key={"a" + s.k} className="text-green">
                      + {s.k}: {s.v.slice(0, 80)}
                    </p>
                  ))}
                  {diff.specs.removed.slice(0, 6).map((s) => (
                    <p key={"r" + s.k} className="text-red">
                      − {s.k}: {s.v.slice(0, 80)}
                    </p>
                  ))}
                  {diff.specs.changed.slice(0, 6).map((s) => (
                    <p key={"c" + s.k} className="text-acc">
                      ~ {s.k}: {s.from.slice(0, 60)} → {s.to.slice(0, 60)}
                    </p>
                  ))}
                </div>
              ) : null}
              {diff.schemaGrowth?.length ? (
                <p className="mt-2 text-[11px] text-acc" id="aiDiffGrowth">
                  ⚡ auto-creates in the category schema:{" "}
                  {diff.schemaGrowth.map((f) => f.label).join(", ")}
                </p>
              ) : null}
              <p className="mt-2 text-[10.5px] text-dim">
                never touched: {diff.untouched?.join(" · ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className={CARD + " lg:col-span-3 space-y-3"}>
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            AI-rewritten content (editable)
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={LBL}>Name (EN)</label>
              <input
                id="aiName"
                value={form.name}
                onChange={set("name")}
                className={INP + " w-full"}
              />
            </div>
            <div>
              <label className={LBL}>Name (BN)</label>
              <input
                id="aiNameBn"
                value={form.nameBn}
                onChange={set("nameBn")}
                className={INP + " w-full"}
              />
            </div>
          </div>
          <div>
            <label className={LBL}>Short description (EN)</label>
            <textarea
              rows={2}
              value={form.shortDesc}
              onChange={set("shortDesc")}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Short description (BN)</label>
            <textarea
              rows={2}
              value={form.shortDescBn}
              onChange={set("shortDescBn")}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Description (EN)</label>
            <textarea
              rows={5}
              value={form.description}
              onChange={set("description")}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Description (BN)</label>
            <textarea
              rows={5}
              value={form.descriptionBn}
              onChange={set("descriptionBn")}
              className={INP + " w-full"}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={LBL}>SEO meta title</label>
              <input
                value={form.seoTitle}
                onChange={set("seoTitle")}
                className={INP + " w-full"}
              />
            </div>
            <div>
              <label className={LBL}>SEO meta description</label>
              <input
                value={form.seoDesc}
                onChange={set("seoDesc")}
                className={INP + " w-full"}
              />
            </div>
          </div>
          <button
            onClick={saveEdits}
            disabled={saving}
            className={GHOST_BTN + " disabled:opacity-50"}
          >
            {saving ? "Saving…" : "Save edits"}
          </button>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className={CARD + " space-y-3"}>
            <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
              Pricing & catalog mapping
            </h3>
            <div>
              <label className={LBL}>Price (৳)</label>
              <input
                id="aiPrice"
                type="number"
                value={form.price}
                onChange={set("price")}
                className={INP + " w-full"}
              />
            </div>
            <div>
              <label className={LBL}>Compare-at price (BDT)</label>
              <input
                id="aiComparePrice"
                type="number"
                min="0"
                value={form.comparePrice}
                onChange={set("comparePrice")}
                className={INP + " w-full"}
                placeholder="Optional — original/list price"
              />
            </div>
            <div>
              <label className={LBL}>Category</label>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, categoryMode: "select" }))}
                  className={form.categoryMode === "select" ? ACC_BTN : GHOST_BTN}
                >
                  Choose existing
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      categoryMode: "manual",
                      categoryName:
                        current.categoryName ||
                        cats.find((category) => category.slug === current.category)?.name ||
                        item.extracted?.categoryGuess ||
                        "",
                    }))
                  }
                  className={form.categoryMode === "manual" ? ACC_BTN : GHOST_BTN}
                >
                  Create manually
                </button>
              </div>
              {form.categoryMode === "manual" ? (
                <div className="space-y-2">
                  <input
                    value={form.categoryName}
                    onChange={set("categoryName")}
                    className={INP + " w-full"}
                    maxLength={80}
                    placeholder="New category name"
                    aria-label="New category name"
                  />
                  <div>
                    <label className={LBL}>Parent category (optional)</label>
                    <CategoryTreePicker
                      categories={cats}
                      value={form.categoryParent}
                      onChange={(categoryParent) =>
                        setForm((current) => ({ ...current, categoryParent }))
                      }
                      placeholder="Root category"
                      allowEmpty
                      emptyLabel="Root category"
                      className="w-full"
                    />
                  </div>
                  <p className="text-[10.5px] text-dim">
                    The category is created when you approve the product. If its slug already exists, that category is reused.
                  </p>
                </div>
              ) : (
                <CategoryTreePicker
                  categories={cats}
                  value={form.category}
                  onChange={(category) =>
                    setForm((current) => ({ ...current, category }))
                  }
                  placeholder="— pick —"
                  allowEmpty
                  emptyLabel="— pick —"
                  extraOptions={
                    item.categoryGuess &&
                    !cats.some((category) => category.slug === item.categoryGuess)
                      ? [{
                          value: item.categoryGuess,
                          label: `${item.extracted?.categoryGuess || item.categoryGuess} (not in catalog)`,
                        }]
                      : []
                  }
                  className="w-full"
                />
              )}
              {item.categoryGuess ? (
                <p className="mt-1 text-[10.5px] text-dim">
                  Auto-detected: {detectedCategory?.name || item.extracted?.categoryGuess || item.categoryGuess}
                  {item.autoDetect?.categoryConfidence > 0
                    ? ` · ${Math.round(item.autoDetect.categoryConfidence * 100)}%`
                    : ""}
                  {item.autoDetect?.categorySource === "source"
                    ? " · from source page; will be created on approval unless mapped"
                    : item.autoDetect?.categorySource === "rules"
                      ? " · catalog match"
                      : item.autoDetect?.model
                        ? ` · ${item.autoDetect.model}`
                        : ""}
                  . Verify before approval.
                </p>
              ) : (
                <p className="mt-1 text-[10.5px] text-acc">
                  No existing category matched confidently. Choose one manually.
                </p>
              )}
            </div>
            <div>
              <label className={LBL}>Brand</label>
              <select
                value={form.brandId}
                onChange={set("brandId")}
                className={INP + " w-full"}
              >
                <option value="none">— none —</option>
                <option value="create">
                  Create new brand on approval
                </option>
                {(brands || []).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {item.brandGuessSlug ? (
                <p className="mt-1 text-[10.5px] text-dim">
                  Auto-detected brand: {item.extracted?.brandGuess || item.brandGuessSlug}
                  {item.autoDetect?.brandConfidence > 0
                    ? ` · ${Math.round(item.autoDetect.brandConfidence * 100)}%`
                    : ""}
                  {item.autoDetect?.brandSource === "source"
                    ? " · not in catalog; review before creating or map to an existing brand"
                    : ""}
                </p>
              ) : null}
              {form.brandId === "create" ? (
                <div className="mt-2">
                  <label className={LBL}>Brand name to create</label>
                  <input
                    value={form.brandName}
                    onChange={set("brandName")}
                    className={INP + " w-full"}
                    maxLength={80}
                    placeholder="Enter the verified brand name"
                  />
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Warranty (months)</label>
                <input
                  type="number"
                  value={form.warrantyMonths}
                  onChange={set("warrantyMonths")}
                  className={INP + " w-full"}
                />
              </div>
              <div>
                <label className={LBL}>Stock</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={set("stock")}
                  className={INP + " w-full"}
                />
              </div>
            </div>
          </div>

          <div className={CARD + " min-w-0"}>
            {/* Step 5 — extracted specs are EDITABLE and schema-mapped; unknown
                attributes materialize in the category schema on approve.
                Step 6 — 🤖 mapping suggestions (type + filterable) per row. */}
            <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
              Specifications ({specs.length})
              {targetCat ? (
                <span
                  className={
                    "ml-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " +
                    (newCount
                      ? "border-acc/60 text-acc"
                      : "border-line2 text-dim2")
                  }
                  id="aiSpecMap"
                >
                  {newCount ? newCount + " will auto-create" : "all mapped"}
                </span>
              ) : null}
              <span className="float-right flex items-center gap-2">
                {mapping ? (
                  <button
                    onClick={applyMapping}
                    id="aiMapApply"
                    className={ACC_BTN + " px-3 py-1.5 text-[11px]"}
                  >
                    Apply to schema
                  </button>
                ) : null}
                <button
                  onClick={suggestMapping}
                  disabled={mappingBusy || !specs.length}
                  id="aiMapSuggest"
                  className={GHOST_BTN}
                  title="AI suggests the field type and whether each attribute should be a shop filter"
                >
                  🤖 {mappingBusy ? "Thinking…" : "Suggest mapping"}
                </button>
              </span>
            </h3>
            <p className="mt-1 text-[10.5px] text-dim2">
              Paste a copied table, tab-separated rows, or <code>Label: value</code> lines into any spec field to auto-format them.
            </p>
            {targetCat && schemaFields.length ? (
              <p className="mt-1 text-[10.5px] text-dim2">
                {schemaFields.length} field(s) loaded from the <b>{targetCat.name}</b> category schema. Empty schema fields are only a guide and are not saved until a value is entered.
              </p>
            ) : targetCat ? (
              <p className="mt-1 text-[10.5px] text-acc">
                This category has no saved spec schema yet. Add a valued row; it will create the new schema field when approved.
              </p>
            ) : null}
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-[11.5px]">
              {specs.map((s, i) => {
                const m = mapFor(s.k);
                const schemaField = schemaFieldFor(s.k);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-1.5"
                    data-aispec={i}
                  >
                    <span
                      className={
                        "h-1.5 w-1.5 shrink-0 rounded-full " +
                        (schemaField ? "bg-green" : "bg-acc")
                      }
                      title={
                        schemaField
                          ? `maps to ${schemaField.group}${schemaField.unit ? ` · unit: ${schemaField.unit}` : ""}`
                          : "auto-creates a new field on approve"
                      }
                    />
                    <input
                      value={s.k}
                      aria-label={"Spec label " + (i + 1)}
                      onPaste={handleSpecPaste}
                      className={INP + " w-[42%] min-w-[130px] px-2 py-1 text-[11px]"}
                      onChange={(e) =>
                        setSpecs((list) =>
                          list.map((x, ix) =>
                            ix === i ? { ...x, k: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      value={s.v}
                      aria-label={"Spec value " + (i + 1)}
                      onPaste={handleSpecPaste}
                      className={INP + " min-w-0 flex-1 px-2 py-1 text-[11px]"}
                      onChange={(e) =>
                        setSpecs((list) =>
                          list.map((x, ix) =>
                            ix === i ? { ...x, v: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    {/* Step 6 — AI suggestion chip: type + filterable verdict */}
                    {m ? (
                      <span
                        className={
                          "inline-block shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold uppercase " +
                          (m.filterable
                            ? "border-green/50 text-green"
                            : "border-line2 text-dim2")
                        }
                        title={m.reason + " · source: " + m.source}
                        data-aimap={s.k}
                      >
                        {m.type}
                        {m.filterable ? " · ◈" : ""}
                      </span>
                    ) : null}
                    <button
                      onClick={() =>
                        setSpecs((list) => list.filter((_, ix) => ix !== i))
                      }
                      className={GHOST_BTN + " px-2 py-1"}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {!specs.length ? (
                <p className="text-dim">None extracted from the source page.</p>
              ) : null}
              <button
                onClick={() => setSpecs((list) => [...list, { k: "", v: "" }])}
                className={GHOST_BTN + " mt-1"}
              >
                + Add spec
              </button>
            </div>
            {targetCat ? (
              <p className="mt-2 text-[10.5px] text-dim2">
                ● green = exists in “{targetCat.name}” · ● blue = auto-created
                in the category schema on approve.
                {mapping
                  ? " 🤖 chips = suggested type (· ◈ = becomes a shop filter). Apply writes them into the schema."
                  : ""}
              </p>
            ) : null}
          </div>

          {/* Step 5 — key features lifted from the source bullets (editable) */}
          <div className={CARD} id="aiFeatures">
            <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
              Key features ({features.filter((f) => String(f).trim()).length})
            </h3>
            <p className="mt-1 text-[10.5px] text-dim2">
              Paste one feature per line, tab, or bullet. New features are appended and duplicates are skipped.
            </p>
            <div className="mt-2 space-y-1.5">
              {features.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5"
                  data-aifeature={i}
                >
                  <span className="text-acc">✓</span>
                  <input
                    value={f}
                    aria-label={"Feature " + (i + 1)}
                    onPaste={handleFeaturePaste}
                    className={INP + " flex-1 px-2 py-1 text-[11px]"}
                    onChange={(e) =>
                      setFeatures((list) =>
                        list.map((x, ix) => (ix === i ? e.target.value : x)),
                      )
                    }
                  />
                  <button
                    onClick={() =>
                      setFeatures((list) => list.filter((_, ix) => ix !== i))
                    }
                    className={GHOST_BTN + " px-2 py-1"}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {!features.length ? (
                <p className="text-[11.5px] text-dim">
                  No feature bullets extracted.
                </p>
              ) : null}
              <button
                onClick={() => setFeatures((list) => [...list, ""])}
                className={GHOST_BTN + " mt-1"}
              >
                + Add feature
              </button>
            </div>
          </div>

          <div className={CARD}>
            <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
              Images ({(item.images || []).length})
            </h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(item.images || []).map((im, i) => (
                <div key={i} className="group relative overflow-hidden rounded-lg border border-line bg-panel2">
                  <img src={im.url} alt={im.alt || `Product image ${i + 1}`} className="h-20 w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-black/75 p-1 opacity-0 transition group-hover:opacity-100">
                    <button type="button" className="flex-1 rounded bg-acc px-1 py-1 text-[10px] font-bold text-white disabled:opacity-50" disabled={imageBusy} onClick={() => { setEditingImage(i); imageInputRef.current?.click(); }}>
                      Edit
                    </button>
                    <button type="button" className="rounded bg-red/80 px-1.5 py-1 text-[10px] text-white disabled:opacity-50" disabled={imageBusy} onClick={() => removeImage(i)} title="Remove image">
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {!(item.images || []).length ? (
                <p className="text-[11.5px] text-dim">
                  No images extracted (or still processing).
                </p>
              ) : null}
            </div>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => replaceImage(e.target.files?.[0])} />
            <p className="mt-2 text-[10.5px] text-dim">Hover an image and choose Edit to replace it. Changes are saved to this import immediately.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ KNOWLEDGE ═══════════ */
function KnowledgeSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [stats, setStats] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [editing, setEditing] = useState(null); // { _id?, q, a, qBn, aBn, topic, tags, active }
  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([AI.knowledgeStats(), AI.faqList()]);
      setStats(s);
      setFaqs(f.items || []);
    } catch (e) {
      toast(e.message, "err");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const saveFaq = async () => {
    try {
      if (editing._id) await AI.faqUpdate(editing._id, editing);
      else await AI.faqCreate(editing);
      toast("Knowledge entry saved");
      setEditing(null);
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  return (
    <div className="space-y-4">
      {stats ? (
        <div className={CARD} id="aiKnowledgeStats">
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            Knowledge coverage — what the assistant can see
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {[
              ["Products", stats.sources.products],
              ["Categories", stats.sources.categories],
              ["Brands", stats.sources.brands],
              ["Live deals", stats.sources.deals],
              ["Combo bundles", stats.sources.bundles],
              ["AI FAQs", stats.sources.faqs],
              ["Imports", stats.sources.imports],
            ].map(([t, n]) => (
              <div
                key={t}
                className="rounded-lg border border-line bg-bg px-3 py-2.5 text-center"
              >
                <p className="font-head text-xl font-bold text-acc">{n}</p>
                <p className="text-[10.5px] uppercase tracking-[.12em] text-dim">
                  {t}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-dim">🔒 {stats.note}</p>
        </div>
      ) : (
        <TableSkeleton rows={3} />
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          AI FAQ knowledge entries ({faqs.length})
        </h3>
        <button
          onClick={() =>
            setEditing({
              q: "",
              a: "",
              qBn: "",
              aBn: "",
              topic: "general",
              tags: "",
              active: true,
            })
          }
          className={ACC_BTN}
          id="aiFaqNew"
        >
          + Add entry
        </button>
      </div>

      {editing ? (
        <div className={CARD + " space-y-3"} id="aiFaqForm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={LBL}>Question (EN) *</label>
              <input
                value={editing.q}
                onChange={(e) => setEditing({ ...editing, q: e.target.value })}
                className={INP + " w-full"}
              />
            </div>
            <div>
              <label className={LBL}>Question (BN)</label>
              <input
                value={editing.qBn}
                onChange={(e) =>
                  setEditing({ ...editing, qBn: e.target.value })
                }
                className={INP + " w-full"}
              />
            </div>
          </div>
          <div>
            <label className={LBL}>Answer (EN) *</label>
            <textarea
              rows={3}
              value={editing.a}
              onChange={(e) => setEditing({ ...editing, a: e.target.value })}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Answer (BN)</label>
            <textarea
              rows={3}
              value={editing.aBn}
              onChange={(e) => setEditing({ ...editing, aBn: e.target.value })}
              className={INP + " w-full"}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className={LBL}>Topic</label>
              <select
                value={editing.topic}
                onChange={(e) =>
                  setEditing({ ...editing, topic: e.target.value })
                }
                className={INP + " w-full"}
              >
                {[
                  "general",
                  "delivery",
                  "payment",
                  "warranty",
                  "returns",
                  "ordering",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LBL}>Tags (comma separated)</label>
              <input
                value={editing.tags}
                onChange={(e) =>
                  setEditing({ ...editing, tags: e.target.value })
                }
                className={INP + " w-full"}
              />
            </div>
            <div className="flex items-end">
              <Toggle
                on={editing.active}
                onClick={() =>
                  setEditing({ ...editing, active: !editing.active })
                }
                label="Active"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveFaq} className={ACC_BTN}>
              Save entry
            </button>
            <button onClick={() => setEditing(null)} className={GHOST_BTN}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {faqs.length === 0 ? (
        <Empty
          icon="📚"
          title="No curated entries yet"
          sub="The assistant also reads the storefront content FAQs. Add AI-optimized entries here for sharper answers."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim">
              <tr>
                <th className="px-4 py-2.5">Question</th>
                <th className="px-4 py-2.5">Topic</th>
                <th className="px-4 py-2.5">Tags</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {faqs.map((f) => (
                <tr key={f._id} className="hover:bg-bg/60">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-txt">{f.q}</p>
                    <p className="text-[11px] text-dim">{f.qBn}</p>
                  </td>
                  <td className="px-4 py-2.5 text-dim">{f.topic}</td>
                  <td className="px-4 py-2.5 text-dim">
                    {(f.tags || []).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`${CHIP} ${f.active ? "border-green/40 text-green" : "border-line2 text-dim2"}`}
                    >
                      {f.active ? "active" : "hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() =>
                        setEditing({ ...f, tags: (f.tags || []).join(", ") })
                      }
                      className={GHOST_BTN}
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Delete knowledge entry",
                            body: "Remove this FAQ from the assistant knowledge base?",
                            danger: true,
                            ok: "Delete",
                          })
                        ) {
                          try {
                            await AI.faqDelete(f._id);
                            load();
                          } catch (e) {
                            toast(e.message, "err");
                          }
                        }
                      }}
                      className={RED_BTN + " ml-2"}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════ CHATS ═══════════ */
function ChatsSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [channel, setChannel] = useState("web");
  const [open, setOpen] = useState(null);
  const [testMsg, setTestMsg] = useState("");
  const [testOut, setTestOut] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const chatRequestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    const requestId = ++chatRequestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channel !== "all") params.set("channel", channel);
      if (debouncedQ) params.set("q", debouncedQ);
      params.set("page", String(page));
      params.set("limit", "40");
      const d = await AI.chatList(params.toString());
      if (requestId !== chatRequestId.current) return;
      setItems(d.items || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
    } catch (e) {
      if (requestId === chatRequestId.current) toast(e.message, "err");
    } finally {
      if (requestId === chatRequestId.current) setLoading(false);
    }
  }, [channel, debouncedQ, page, toast]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => { setPage(1); }, [channel, debouncedQ]);

  const openSession = async (id) => {
    try {
      setOpen((await AI.chatGet(id)).item);
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const runTest = async () => {
    if (!testMsg.trim()) return;
    setTestBusy(true);
    try {
      setTestOut(
        await AI.chatTest({
          message: testMsg,
          sessionKey: "console-" + Date.now().toString(36),
        }),
      );
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setTestBusy(false);
    }
  };

  if (open) {
    return (
      <div className="space-y-4" id="aiChatThread">
        <button onClick={() => setOpen(null)} className={GHOST_BTN}>
          ← All conversations
        </button>
        <div className={CARD}>
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="font-semibold text-txt">
                {open.user
                  ? `Customer: ${open.user.name || open.user.email}`
                  : `Guest session ${open.sessionKey.slice(0, 18)}…`}
              </p>
              <p className="text-[11px] text-dim">
                {open.channel} · {open.messageCount} messages · last intent:{" "}
                {open.lastIntent || "—"} · {dt(open.lastMessageAt)}
              </p>
            </div>
            <button
              onClick={async () => {
                if (
                  await confirm({
                    title: "Delete conversation",
                    body: "Remove this chat thread permanently?",
                    danger: true,
                    ok: "Delete",
                  })
                ) {
                  try {
                    await AI.chatDelete(open._id);
                    setOpen(null);
                    load();
                  } catch (e) {
                    toast(e.message, "err");
                  }
                }
              }}
              className={RED_BTN}
            >
              Delete
            </button>
          </div>
          <div className="mt-3 max-h-[560px] space-y-2.5 overflow-y-auto pr-1">
            {(open.messages || []).map((m, i) => (
              <div
                key={i}
                className={
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12.5px] " +
                  (m.role === "user"
                    ? "ml-auto bg-acc/15 text-txt"
                    : "border border-line bg-bg text-txt")
                }
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className="mt-1 text-[10px] text-dim">
                  {m.role === "assistant"
                    ? `${m.provider || "rules"} · ${m.intent || ""} · `
                    : ""}
                  {dt(m.at)}
                  {m.refs?.length ? ` · [${m.refs.join(", ")}]` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={CARD} id="aiTestConsole">
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          🧪 Assistant test console
        </h3>
        <p className="mt-1 text-[11px] text-dim">
          Runs the exact production pipeline (RAG → provider → grounded answer)
          without touching customer analytics.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            placeholder="Ask anything a customer would…"
            className={INP + " flex-1"}
            id="aiTestInput"
          />
          <button
            onClick={runTest}
            disabled={testBusy}
            className={ACC_BTN + " disabled:opacity-50"}
            id="aiTestRun"
          >
            {testBusy ? "Thinking…" : "Run"}
          </button>
        </div>
        {testOut ? (
          <div
            className="mt-3 rounded-lg border border-line bg-bg p-3"
            id="aiTestOutput"
          >
            <p className="whitespace-pre-wrap text-[12.5px] text-txt">
              {testOut.reply}
            </p>
            <p className="mt-2 text-[10.5px] text-dim">
              intent: {testOut.intent} · lang: {testOut.lang} · provider:{" "}
              {testOut.provider} · products: {testOut.products?.length || 0}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {["web", "admin-test", "all"].map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={TAB(channel === c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages…"
            className={INP}
          />
          <span className="text-[11px] text-dim">{total} sessions</span>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="min-h-[360px] overflow-hidden rounded-xl border border-line bg-panel"><TableSkeleton rows={40} cols={7} /></div>
      ) : items.length === 0 ? (
        <Empty
          icon="💬"
          title="No conversations yet"
          sub="Customer sessions appear here once the storefront widget is used."
        />
      ) : (
        <div className={"relative min-h-[360px] overflow-hidden rounded-xl border border-line bg-panel transition-opacity " + (loading ? "opacity-60" : "opacity-100")}>
          {loading ? <div className="absolute inset-0 z-10 overflow-hidden bg-panel"><TableSkeleton rows={items.length || 40} cols={7} /></div> : null}
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim">
              <tr>
                <th className="px-4 py-2.5">Session</th>
                <th className="px-4 py-2.5">Channel</th>
                <th className="px-4 py-2.5">Lang</th>
                <th className="px-4 py-2.5">Last intent</th>
                <th className="px-4 py-2.5">Msgs</th>
                <th className="px-4 py-2.5">Last activity</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((c) => (
                <tr key={c._id} className="hover:bg-bg/60">
                  <td className="px-4 py-2.5 font-semibold text-txt">
                    {c.user
                      ? c.user.name || c.user.email
                      : `Guest ${String(c.sessionKey).slice(0, 14)}…`}
                  </td>
                  <td className="px-4 py-2.5 text-dim">{c.channel}</td>
                  <td className="px-4 py-2.5 text-dim">{c.lang}</td>
                  <td className="px-4 py-2.5">
                    <span className={CHIP + " border-line2 text-dim"}>
                      {c.lastIntent || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{c.messageCount}</td>
                  <td className="px-4 py-2.5 text-dim">
                    {dt(c.lastMessageAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => openSession(c._id)}
                      className={GHOST_BTN}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pages={pages} total={total} loading={loading} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

/* ═══════════ ANALYTICS ═══════════ */
function AnalyticsSection() {
  const [d, setD] = useState(null);
  useEffect(() => {
    AI.analytics()
      .then(setD)
      .catch(() => {});
  }, []);
  if (!d) return <TableSkeleton rows={5} />;
  const intents = Object.entries(d.intents || {}).sort((a, b) => b[1] - a[1]);
  const maxI = Math.max(1, ...intents.map((x) => x[1]));
  return (
    <div className="space-y-4" id="aiAnalytics">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Chats (7d)", d.totals.chats],
          ["Sessions (7d)", d.totals.sessions],
          ["Prompt tokens", d.totals.promptTokens],
          ["Completion tokens", d.totals.completionTokens],
          ["Provider", d.effectiveProvider],
        ].map(([t, v]) => (
          <div key={t} className={CARD + " text-center"}>
            <p className="font-head text-2xl font-bold text-acc">{v}</p>
            <p className="text-[10.5px] uppercase tracking-[.12em] text-dim">
              {t}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-dim">{d.totals.costNote}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            Intent mix (7d)
          </h3>
          <div className="mt-3 space-y-2">
            {intents.length ? (
              intents.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 text-[12px]">
                  <span className="w-24 capitalize text-dim">{k}</span>
                  <div className="h-3 flex-1 rounded-full bg-bg">
                    <div
                      className="h-3 rounded-full bg-acc"
                      style={{ width: `${Math.round((v / maxI) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-bold text-txt">{v}</span>
                </div>
              ))
            ) : (
              <p className="text-dim">No chats yet.</p>
            )}
          </div>
        </div>
        <div className={CARD}>
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            Language & provider split
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-4 text-[12.5px]">
            <div>
              <p className={LBL}>Languages</p>
              {Object.entries(d.langs || {}).map(([k, v]) => (
                <p
                  key={k}
                  className="flex justify-between border-b border-line/50 py-1"
                >
                  <span className="uppercase text-dim">{k}</span>
                  <span className="font-bold text-txt">{v}</span>
                </p>
              ))}
            </div>
            <div>
              <p className={LBL}>Provider calls</p>
              {Object.entries(d.providerCalls || {}).map(([k, v]) => (
                <p
                  key={k}
                  className="flex justify-between border-b border-line/50 py-1"
                >
                  <span className="capitalize text-dim">{k}</span>
                  <span className="font-bold text-txt">{v}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className={CARD}>
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            Top customer questions
          </h3>
          <div className="mt-2 space-y-1.5 text-[12.5px]">
            {d.topQuestions?.length ? (
              d.topQuestions.map((q, i) => (
                <p
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-line/50 py-1"
                >
                  <span className="truncate text-txt">{q.text}</span>
                  <span className="shrink-0 text-dim">
                    ×{q.n} · {q.intent}
                  </span>
                </p>
              ))
            ) : (
              <p className="text-dim">No questions recorded yet.</p>
            )}
          </div>
        </div>
        <div className={CARD}>
          <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
            Import funnel
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] md:grid-cols-3">
            {["ready", "imported", "failed", "rejected", "pending"].map((k) => (
              <p
                key={k}
                className="flex justify-between rounded-lg border border-line bg-bg px-3 py-2"
              >
                <span className="capitalize text-dim">{k}</span>
                <span className="font-bold text-txt">
                  {(d.imports || {})[k] || 0}
                </span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ SETTINGS ═══════════ */
function SettingsSection() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [categories, setCategories] = useState([]);
  const [initialMasked, setInitialMasked] = useState([]); // Step 2 audit fix — which secrets carried the stored mask at load
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await AI.getSettings();
      setS(d.settings);
      setRuntime(d.runtime);
      const masked = [];
      if (d.settings?.apiKey === "\u2022".repeat(8))
        masked.push("Gemini API key");
      if (d.settings?.openai?.apiKey === "\u2022".repeat(8))
        masked.push("Ollama Cloud / endpoint API key");
      setInitialMasked(masked);
    } catch (e) {
      toast(e.message, "err");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    AI.categories()
      .then((result) => setCategories(result.items || result.categories || []))
      .catch((error) => toast(error.message, "err"));
  }, [toast]);
  if (!s) return <TableSkeleton rows={6} />;

  const set = (path, value) => {
    setS((prev) => {
      const n = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let o = n;
      for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
      o[keys[keys.length - 1]] = value;
      return n;
    });
  };
  const useOpenRouterFree = () => {
    set("provider", "openai");
    set("openai.baseUrl", "https://openrouter.ai/api/v1");
    set("openai.model", "openrouter/free");
  };
  const useOllamaCloud = () => {
    set("provider", "openai");
    set("openai.baseUrl", "https://ollama.com/v1");
  };
  const useLocalOllama = () => {
    set("provider", "openai");
    set("openai.baseUrl", "http://127.0.0.1:11434/v1");
    set("openai.apiKey", "");
  };
  const suggestionsText = (arr) => (arr || []).join("\n");
  const suggestionsArr = (t) =>
    t
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

  const save = async () => {
    /* Step 2 audit fix — empting a masked key silently DESTROYED the stored
       secret on the backend; ask before destroying */
    for (const [label, v] of [
      ["Gemini API key", s.apiKey],
      ["Ollama Cloud / endpoint API key", s.openai?.apiKey],
    ]) {
      if (v === "" && initialMasked.includes(label)) {
        // eslint-disable-next-line no-alert
        if (
          !window.confirm(
            `${label}: the field is empty but a key is stored. Saving will REMOVE the stored key. Continue?`,
          )
        )
          return;
      }
    }
    setSaving(true);
    try {
      const body = {
        ...s,
        suggestions: s.chat.suggestions,
        suggestionsBn: s.chat.suggestionsBn,
      };
      const d = await AI.saveSettings(body);
      setS(d.settings);
      setRuntime(d.runtime);
      toast("AI settings saved — live instantly");
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" id="aiSettings">
      {runtime ? (
        <div
          className={
            "rounded-xl border p-4 text-[12px] " +
            (runtime.effectiveProvider === "rules"
              ? "border-blue/40 bg-blue/10 text-blue"
              : "border-green/40 bg-green/10 text-green")
          }
        >
          <b>Runtime:</b> provider <b>{runtime.effectiveProvider}</b> · key{" "}
          {runtime.keyConfigured
            ? `configured (${runtime.keySource})`
            : "not configured"}{" "}
          · images {runtime.cloudinary ? "Cloudinary" : "local disk"}.
          {runtime.effectiveProvider === "rules"
            ? " — zero-cost grounded mode: the assistant answers ONLY from database facts (nothing can be invented). Configure Gemini or an OpenAI-compatible provider for AI-assisted import and conversational answers."
            : ""}
        </div>
      ) : null}

      <div className={CARD + " space-y-3"}>
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          Provider
        </h3>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel2 p-3">
          <div className="min-w-[220px] flex-1">
            <p className="text-[11.5px] font-bold text-txt">Free model option</p>
            <p className="mt-0.5 text-[10.5px] text-dim">
              OpenRouter&apos;s router selects only currently available free models.
              Free-model limits and availability can change; product facts are
              sent to the selected provider. Add the key in the endpoint-key
              field, then save these settings.
            </p>
          </div>
          <button type="button" className={GHOST_BTN} onClick={useOpenRouterFree}>
            Use OpenRouter free-only preset
          </button>
          <button type="button" className={GHOST_BTN} onClick={useOllamaCloud}>
            Use Ollama Cloud
          </button>
          <button type="button" className={GHOST_BTN} onClick={useLocalOllama}>
            Use local Ollama
          </button>
          <a
            className={GHOST_BTN}
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
          >
            Create API key ↗
          </a>
          <a
            className={GHOST_BTN}
            href="https://ollama.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Create Ollama API key ↗
          </a>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className={LBL}>Provider</label>
            <select
              value={s.provider}
              onChange={(e) => set("provider", e.target.value)}
              className={INP + " w-full"}
            >
              <option value="auto">auto (key → endpoint → rules)</option>
              <option value="gemini">Gemini API (Google AI Studio)</option>
              <option value="openai">OpenAI-compatible endpoint (local / hosted)</option>
              <option value="rules">Grounded rules only (0 cost)</option>
            </select>
          </div>
          <div>
            <label className={LBL}>Gemini model</label>
            <input
              value={s.model}
              onChange={(e) => set("model", e.target.value)}
              className={INP + " w-full"}
              placeholder="gemini-3.8-flash"
            />
          </div>
          <div>
            <label className={LBL}>Gemini API key</label>
            <input
              type="password"
              value={s.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              className={INP + " w-full"}
              placeholder="paste key (or set GEMINI_API_KEY env)"
              id="aiApiKey"
            />
            <p className="mt-1 text-[10.5px] text-dim2">
              Leave the •••••••• dots untouched to keep the stored key; clear
              the field to remove it.
            </p>
          </div>
          <div>
            <label className={LBL}>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={s.temperature}
              onChange={(e) => set("temperature", +e.target.value)}
              className={INP + " w-full"}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className={LBL}>Ollama / compatible endpoint URL</label>
            <input
              value={s.openai.baseUrl}
              onChange={(e) => set("openai.baseUrl", e.target.value)}
              className={INP + " w-full"}
              placeholder="http://127.0.0.1:11434/v1 (Ollama)"
            />
          </div>
          <div>
            <label className={LBL}>Compatible model ID</label>
            <input
              value={s.openai.model}
              onChange={(e) => set("openai.model", e.target.value)}
              className={INP + " w-full"}
              placeholder="openrouter/free / llama3.1"
            />
          </div>
          <div>
            <label className={LBL}>Ollama Cloud / endpoint API key</label>
            <input
              type="password"
              value={s.openai.apiKey}
              onChange={(e) => set("openai.apiKey", e.target.value)}
              className={INP + " w-full"}
              placeholder="Paste Ollama Cloud API key"
            />
            <p className="mt-1 text-[10.5px] text-dim2">
              Ollama Cloud uses this key as a Bearer token; local Ollama usually
              needs no key. Leave the masked value unchanged to keep the stored key.
            </p>
          </div>
          <div>
            <label className={LBL}>Max output tokens</label>
            <input
              type="number"
              value={s.maxOutputTokens}
              onChange={(e) => set("maxOutputTokens", +e.target.value)}
              className={INP + " w-full"}
            />
          </div>
        </div>
        <p className="text-[11px] text-dim">
          Keys are stored server-side only and always come back masked
          (••••••••). Product import sends extracted product facts and allowed
          catalog labels to the selected AI provider; avoid importing personal
          or confidential data. Chat grounding still uses public-field
          projections and PII stripping.
        </p>
      </div>

      <div className={CARD + " space-y-3"}>
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          Features
        </h3>
        <div className="flex flex-wrap gap-6">
          <Toggle
            on={s.enabled}
            onClick={() => set("enabled", !s.enabled)}
            label="AI system master"
          />
          <Toggle
            on={s.features.chat}
            onClick={() => set("features.chat", !s.features.chat)}
            label="Customer support chat"
          />
          <Toggle
            on={s.features.import}
            onClick={() => set("features.import", !s.features.import)}
            label="AI product import"
          />
          <Toggle
            on={s.features.recommend}
            onClick={() => set("features.recommend", !s.features.recommend)}
            label="Recommendations & compare"
          />
        </div>
      </div>

      <div className={CARD + " space-y-3"}>
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          Widget & grounding
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={LBL}>Greeting (EN)</label>
            <textarea
              rows={2}
              value={s.chat.greeting}
              onChange={(e) => set("chat.greeting", e.target.value)}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Greeting (BN)</label>
            <textarea
              rows={2}
              value={s.chat.greetingBn}
              onChange={(e) => set("chat.greetingBn", e.target.value)}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Quick suggestions (EN, one per line)</label>
            <textarea
              rows={3}
              value={suggestionsText(s.chat.suggestions)}
              onChange={(e) =>
                set("chat.suggestions", suggestionsArr(e.target.value))
              }
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Quick suggestions (BN, one per line)</label>
            <textarea
              rows={3}
              value={suggestionsText(s.chat.suggestionsBn)}
              onChange={(e) =>
                set("chat.suggestionsBn", suggestionsArr(e.target.value))
              }
              className={INP + " w-full"}
            />
          </div>
          <div className="md:col-span-2">
            <label className={LBL}>
              Extra store guidance (optional prompt override — e.g. tone rules,
              campaign notes)
            </label>
            <textarea
              rows={2}
              value={s.chat.systemPrompt}
              onChange={(e) => set("chat.systemPrompt", e.target.value)}
              className={INP + " w-full"}
            />
          </div>
        </div>
      </div>

      <div className={CARD + " space-y-3"}>
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          AI Import
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className={LBL}>Max URLs per batch</label>
            <input
              type="number"
              value={s.import.maxBatch}
              onChange={(e) => set("import.maxBatch", +e.target.value)}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Max images per product</label>
            <input
              type="number"
              value={s.import.maxImages}
              onChange={(e) => set("import.maxImages", +e.target.value)}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>Default category fallback</label>
            <CategoryTreePicker
              categories={categories}
              value={s.import.defaultCategory}
              onChange={(category) => set("import.defaultCategory", category)}
              placeholder="— no default category —"
              allowEmpty
              emptyLabel="— no default category —"
              extraOptions={
                s.import.defaultCategory &&
                !categories.some((category) => category.slug === s.import.defaultCategory)
                  ? [{
                      value: s.import.defaultCategory,
                      label: `${s.import.defaultCategory} (saved value)`,
                    }]
                  : []
              }
              ariaLabel="Default category fallback"
            />
          </div>
          <div>
            <label className={LBL}>Extra allowed hosts (QA only)</label>
            <input
              value={s.import.allowHosts}
              onChange={(e) => set("import.allowHosts", e.target.value)}
              className={INP + " w-full"}
              placeholder="keep empty in production"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle
            on={s.import.uploadToCloudinary}
            onClick={() =>
              set("import.uploadToCloudinary", !s.import.uploadToCloudinary)
            }
            label="Re-host images on Cloudinary"
          />
        </div>
      </div>

      <div className={CARD + " space-y-3"}>
        <h3 className="font-head text-[13px] font-bold uppercase tracking-[.12em] text-txt">
          RAG knowledge limits
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className={LBL}>Products per answer</label>
            <input
              type="number"
              value={s.knowledge.maxProducts}
              onChange={(e) => set("knowledge.maxProducts", +e.target.value)}
              className={INP + " w-full"}
            />
          </div>
          <div>
            <label className={LBL}>FAQs per answer</label>
            <input
              type="number"
              value={s.knowledge.maxFaqs}
              onChange={(e) => set("knowledge.maxFaqs", +e.target.value)}
              className={INP + " w-full"}
            />
          </div>
          <div className="flex items-end">
            <Toggle
              on={s.knowledge.includeDeals}
              onClick={() =>
                set("knowledge.includeDeals", !s.knowledge.includeDeals)
              }
              label="Include live deals"
            />
          </div>
          <div className="flex items-end">
            <Toggle
              on={s.knowledge.includePolicies}
              onClick={() =>
                set("knowledge.includePolicies", !s.knowledge.includePolicies)
              }
              label="Include policies & shipping"
            />
          </div>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={ACC_BTN + " disabled:opacity-50"}
        id="aiSettingsSave"
      >
        {saving ? "Saving…" : "Save AI settings"}
      </button>
    </div>
  );
}

/* ═══════════ SHELL ═══════════ */
function AiInner() {
  const { section } = useParams();
  const tab = TABS.some((t) => t.k === section) ? section : "imports";
  const titles = {
    imports: "AI Product Import",
    knowledge: "AI Knowledge",
    chats: "AI Chat History",
    analytics: "AI Analytics",
    settings: "AI Settings",
  };
  return (
    <AdminShell active="ai" title={titles[tab]}>
      <div className="mb-4 flex flex-wrap gap-2" id="aiTabs">
        {TABS.map((t) => (
          <RLink key={t.k} to={"/ai/" + t.k} className={TAB(tab === t.k)}>
            {t.t}
          </RLink>
        ))}
      </div>
      {tab === "imports" ? <ImportsSection /> : null}
      {tab === "knowledge" ? <KnowledgeSection /> : null}
      {tab === "chats" ? <ChatsSection /> : null}
      {tab === "analytics" ? <AnalyticsSection /> : null}
      {tab === "settings" ? <SettingsSection /> : null}
    </AdminShell>
  );
}

export default function AiPage() {
  return (
    <OverlayProvider>
      <AiInner />
    </OverlayProvider>
  );
}
