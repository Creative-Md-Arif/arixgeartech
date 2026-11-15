/* ArixGear ADMIN page — Homepage Sections (React port of legacy homepage.html)
   GET /admin/home-sections · POST /admin/home-sections · PUT /admin/home-sections/:id (body {key,type,title,subtitle,order,active,config}) · DELETE
   per-section: order number input + up/down · active toggle · config editors per type
   (ticker items list · new-arrivals limit+source · goal-panels goals with slug chips · arsenal product slugs multi-select ·
   html/athletes + html/stories structured editors: eyebrow/heading/desc, item cards, comm/stat "value|label" pairs) · raw JSON (legacy) */
import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "../components/AdminShell.jsx";
import {
  OverlayProvider,
  useToast,
  useModal,
} from "../components/Overlays.jsx";
import { useConfirm } from "../components/ui.jsx";
import {
  list as listSections,
  metadata as getMetadata,
  create as createSection,
  update as updateSection,
  remove as removeSection,
} from "../services/homeSections.js";
import {
  AccSection,
  AccChip,
  useAccordion,
  AccBulkButtons,
} from "../components/Accordion.jsx";
import { list as listProducts } from "../services/products.js";
import { list as listCategories } from "../services/categories.js";

const CARD = "rounded-xl border border-line bg-panel p-5";
const ACC_BTN =
  "bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]";
const GHOST_BTN =
  "rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc";
const RED_BTN =
  "rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20";
const CHIP =
  "inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide";
const FRM = "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4";
const FULL = "md:col-span-2 lg:col-span-4";

function Toggle({ on, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? "Active" : "Hidden"}
      onClick={onClick}
      className={
        "relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors " +
        (on ? "bg-acc" : "bg-line2")
      }
    >
      <span
        className={
          "absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all " +
          (on ? "left-[20px] bg-white" : "left-[3px] bg-[#888]")
        }
      />
    </button>
  );
}

/* slug chip input — used by goals/arsenal/categories config editors */
function SlugChips({ value, onChange, suggestions, placeholder }) {
  const [txt, setTxt] = useState("");
  const add = (s) => {
    const v = String(s || "").trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setTxt("");
  };
  const rest = (suggestions || [])
    .filter((s) => !value.includes(s))
    .slice(0, 24);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full border border-acc/50 bg-acc/10 px-2 py-0.5 text-[11px] font-bold text-acc"
          >
            {s}
            <button
              type="button"
              className="text-dim2 hover:text-red"
              onClick={() => onChange(value.filter((x) => x !== s))}
            >
              ✕
            </button>
          </span>
        ))}
        {!value.length ? (
          <span className="text-[11px] text-dim2">none yet</span>
        ) : null}
      </div>
      <div className="mt-1.5 flex gap-2">
        <input
          className="min-w-0 flex-1"
          value={txt}
          placeholder={placeholder || "product-slug"}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(txt);
            }
          }}
        />
        <button type="button" className={GHOST_BTN} onClick={() => add(txt)}>
          Add
        </button>
      </div>
      {rest.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {rest.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-line2 px-2 py-0.5 text-[10.5px] text-dim2 hover:border-acc hover:text-acc"
              onClick={() => add(s)}
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* "value|label" text ⇄ [value, label] pair — strict: no pipe = not written (defensive, never throws) */
const parsePair = (s) => {
  const t = String(s == null ? "" : s);
  const ix = t.indexOf("|");
  if (ix < 0) return null;
  const v = t.slice(0, ix).trim();
  const l = t.slice(ix + 1).trim();
  return v || l ? [v, l] : null;
};
const fmtPair = (p) =>
  Array.isArray(p) && p.length
    ? String(p[0] == null ? "" : p[0]) + "|" + String(p[1] == null ? "" : p[1])
    : "";
const splitList = (s) =>
  String(s == null ? "" : s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/* repeatable "value|label" rows ⇄ config.comm / config.items[i].stats ([[value,label],…]).
   Local text state keeps mid-typing stable; re-syncs when the config value changes from outside
   (JSON textarea edits, item add/remove). Bad rows (no pipe) simply never reach the JSON. */
function PairRows({ value, onChange, rows = 4, hint }) {
  const arr = Array.isArray(value) ? value : [];
  const textsFrom = (a) =>
    Array.from({ length: Math.max(rows, a.length) }, (_, i) => fmtPair(a[i]));
  const [texts, setTexts] = useState(() => textsFrom(arr));
  const emitted = useRef(JSON.stringify(arr));
  useEffect(() => {
    const ser = JSON.stringify(arr);
    if (ser !== emitted.current) {
      emitted.current = ser;
      setTexts(textsFrom(arr));
    }
  });
  const emit = (next) => {
    setTexts(next);
    const pairs = next.map(parsePair).filter(Boolean);
    emitted.current = JSON.stringify(pairs);
    onChange(pairs);
  };
  return (
    <div>
      {texts.map((t, ix) => (
        <input
          key={ix}
          className="mb-1.5 w-full"
          value={t}
          placeholder={hint}
          aria-label={"pair row " + (ix + 1)}
          onChange={(e) =>
            emit(texts.map((x, i) => (i === ix ? e.target.value : x)))
          }
        />
      ))}
    </div>
  );
}

/* single input ⇄ string[] (comma-separated, e.g. athlete wears) — same local-state pattern */
function ListText({ value, onChange, placeholder }) {
  const arr = Array.isArray(value) ? value : [];
  const [txt, setTxt] = useState(() => arr.join(", "));
  const emitted = useRef(JSON.stringify(arr));
  useEffect(() => {
    const ser = JSON.stringify(arr);
    if (ser !== emitted.current) {
      emitted.current = ser;
      setTxt(arr.join(", "));
    }
  });
  const emit = (t) => {
    setTxt(t);
    const list = splitList(t);
    emitted.current = JSON.stringify(list);
    onChange(list);
  };
  return (
    <input
      value={txt}
      placeholder={placeholder || "item one, item two"}
      onChange={(e) => emit(e.target.value)}
    />
  );
}

/* order number input — commits on blur/Enter (legacy 'change' event parity) */
function OrderInput({ value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const n = +v;
    if (!Number.isNaN(n) && n !== value) onSave(n);
  };
  return (
    <input
      className="w-[58px]"
      type="number"
      aria-label="Section order"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/* ---------- New / Edit section modal ---------- */
function SectionForm({ s, onDone, metadata }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { closeModal } = useModal();
  const isNew = !s;
  const [key, setKey] = useState(s?.key || "");
  const [type, setType] = useState(s?.type || "");
  const [title, setTitle] = useState(s?.title || "");
  const [subtitle, setSubtitle] = useState(s?.subtitle || "");
  const [titleBn, setTitleBn] = useState(s?.titleBn || ""); // Task 58 — Bengali twins
  const [subtitleBn, setSubtitleBn] = useState(s?.subtitleBn || "");
  const [order, setOrder] = useState(s?.order ?? 10);
  const [active, setActive] = useState(!s || s.active);
  const [cfgText, setCfgText] = useState(
    JSON.stringify(s?.config || {}, null, 2),
  );
  const [slugs, setSlugs] = useState([]);
  const [categorySlugs, setCategorySlugs] = useState([]);
  const [busy, setBusy] = useState(false);
  const sectionTypes = Array.isArray(metadata?.sectionTypes) ? metadata.sectionTypes : [];
  const sourceOptions = Array.isArray(metadata?.sources) ? metadata.sources : [];
  const actionOptions = Array.isArray(metadata?.actions) ? metadata.actions : [];
  const isCommunity = type === "html" && ["athletes", "stories"].includes(key.trim());
  const isQuickServices = type === "quick-services";

  useEffect(() => {
    if (!type && sectionTypes.length) setType(sectionTypes[0].value);
  }, [sectionTypes, type]);

  useEffect(() => {
    let live = true;
    Promise.allSettled([listProducts(), listCategories()])
      .then(([productsResult, categoriesResult]) => {
        if (!live) return;
        if (productsResult.status === "fulfilled") {
          setSlugs((productsResult.value.items || []).map((x) => x.slug));
        }
        if (categoriesResult.status === "fulfilled") {
          setCategorySlugs((categoriesResult.value.items || []).map((x) => x.slug).filter(Boolean));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const cfgObj = () => {
    try {
      return JSON.parse(cfgText || "{}");
    } catch (_) {
      return null;
    }
  };
  const cfgEdit = (fn) => {
    const obj = cfgObj();
    if (obj == null) {
      toast("Fix the Config JSON first — must be valid JSON", "err");
      return;
    }
    fn(obj);
    setCfgText(JSON.stringify(obj, null, 2));
  };
  const cfg = cfgObj() || {};

  const save = async () => {
    if (!key.trim()) {
      acc.openOnly(["settings"]);
      return toast("Key required", "err");
    }
    try {
      JSON.parse(cfgText || "{}");
    } catch (_) {
      acc.openOnly(["config"]);
      return toast("Config must be valid JSON", "err");
    }
    const savedConfig = JSON.parse(cfgText || "{}");
    if (type === "combo-bundles") {
      // Bundle content belongs exclusively to ComboBundle.
      Object.keys(savedConfig).forEach((field) => delete savedConfig[field]);
    }
    if (isCommunity) {
      // Community content is generated from approved reviews and delivered orders.
      Object.keys(savedConfig).forEach((field) => delete savedConfig[field]);
    }
    if (type === "quick-services") {
      const cards = Array.isArray(savedConfig.cards) ? savedConfig.cards : [];
      const cardKeys = cards.map((card) => String(card?.key || "").trim());
      if (cardKeys.some((cardKey) => !cardKey) || new Set(cardKeys).size !== cardKeys.length) {
        acc.openOnly(["config"]);
        return toast("Every Quick Service card needs a unique key", "err");
      }
      const supportedActions = actionOptions.map((action) => action.value);
      const actionMap = new Map(actionOptions.map((action) => [action.value, action]));
      const invalidCard = cards.find((card) =>
        !card ||
        !supportedActions.includes(card.action || "none") ||
        (actionMap.get(card.action || "none")?.requiresHref &&
          !(typeof card.href === "string" && (actionMap.get(card.action || "none")?.kind === "external-link"
            ? /^https?:\/\//i.test(card.href)
            : card.href.startsWith("/") && !card.href.startsWith("//")))),
      );
      if (invalidCard) {
        acc.openOnly(["config"]);
        return toast("Choose a supported action and provide an internal link beginning with /", "err");
      }
    }
    const body = {
      key: key.trim(),
      type,
      title,
      subtitle,
      titleBn,
      subtitleBn,
      order: +order || 0,
      active,
      config: JSON.stringify(savedConfig),
    }; // Task 58
    setBusy(true);
    try {
      if (isNew) await createSection(body);
      else await updateSection(s._id, body);
      toast("Section saved", "ok");
      closeModal();
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  const items = Array.isArray(cfg.items) ? cfg.items : [];
  const goals = Array.isArray(cfg.goals) ? cfg.goals : [];
  const products = Array.isArray(cfg.products) ? cfg.products : [];
  const cats = Array.isArray(cfg.categories) ? cfg.categories : [];
  const isAthletes = false;
  const isStories = false;

  /* Task 34 — 2 accordion sections + validation auto-open */
  const SF_SECTIONS = ["settings", "config"];
  const acc = useAccordion(["settings"]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px]">
          {isNew ? "New Section" : "Edit — " + (s.title || s.key || "")}
        </h2>
        <AccBulkButtons ids={SF_SECTIONS} acc={acc} prefix="sf" />
      </div>
      <div className="space-y-2.5">
        <AccSection
          id="settings"
          icon="⚙"
          title="Section Settings"
          open={acc.isOpen("settings")}
          onToggle={() => acc.toggle("settings")}
          chips={
            <>
              <AccChip
                text={key.trim() ? "✓ " + key.trim().slice(0, 14) : "— key"}
                tone={key.trim() ? "green" : "red"}
              />
              <AccChip text={type} tone="acc" />
              <AccChip
                text={active ? "ACTIVE" : "HIDDEN"}
                tone={active ? "green" : "red"}
              />
            </>
          }
        >
          <div className={FRM}>
            <div>
              <label>Key (unique) *</label>
              <input
                id="sfKey"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="summer-drop"
              />
            </div>
            <div>
              <label>Type *</label>
              <select
                id="sfType"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {sectionTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label || option.value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Title</label>
              <input
                id="sfTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label>Subtitle</label>
              <input
                id="sfSub"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>
            <div>
              <label>টাইটেল (বাংলা)</label>
              <input
                id="sfTitleBn"
                value={titleBn}
                onChange={(e) => setTitleBn(e.target.value)}
              />
            </div>
            <div>
              <label>সাবটাইটেল (বাংলা)</label>
              <input
                id="sfSubBn"
                value={subtitleBn}
                onChange={(e) => setSubtitleBn(e.target.value)}
              />
            </div>
            <div>
              <label>Order</label>
              <input
                id="sfOrder"
                type="number"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="m-0 flex items-center gap-2 text-[13px] normal-case tracking-normal">
                <input
                  id="sfActive"
                  type="checkbox"
                  className="w-auto"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />{" "}
                Active
              </label>
            </div>
          </div>
        </AccSection>

        <AccSection
          id="config"
          icon="🧩"
          title="Content Config"
          open={acc.isOpen("config")}
          onToggle={() => acc.toggle("config")}
          chips={
            <>
              <AccChip
                text={cfgObj() ? "JSON ✓" : "JSON ✗"}
                tone={cfgObj() ? "green" : "red"}
              />
              {items.length ? (
                <AccChip text={items.length + " ITEMS"} tone="dim" />
              ) : null}
              {products.length ? (
                <AccChip text={products.length + " PRODUCTS"} tone="dim" />
              ) : null}
            </>
          }
        >
          <div className={FRM}>
            {/* ---- type-aware config editors (write through to the JSON config) ---- */}
            {type === "ticker" ? (
              <div className={FULL}>
                <label>Ticker items (config.items)</label>
                {items.map((it, ix) => (
                  <div key={ix} className="mb-1.5 flex gap-2">
                    <input
                      value={it}
                      onChange={(e) =>
                        cfgEdit((o) => {
                          o.items = o.items || [];
                          o.items[ix] = e.target.value;
                        })
                      }
                    />
                    <button
                      type="button"
                      className={RED_BTN}
                      onClick={() =>
                        cfgEdit((o) => {
                          (o.items || []).splice(ix, 1);
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={GHOST_BTN + " mt-1"}
                  onClick={() =>
                    cfgEdit((o) => {
                      o.items = o.items || [];
                      o.items.push("");
                    })
                  }
                >
                  + Add Item
                </button>
              </div>
            ) : null}

            {type === "product-carousel" || type === "best-sellers" ? (
              <>
                <div>
                  <label>Limit (config.limit)</label>
                  <input
                    type="number"
                    min="1"
                    value={cfg.limit ?? ""}
                    onChange={(e) =>
                      cfgEdit((o) => {
                        o.limit = +e.target.value || 0;
                      })
                    }
                  />
                </div>
                <div>
                  <label>Source (config.source)</label>
                  <select
                    value={cfg.source || ""}
                    onChange={(e) =>
                      cfgEdit((o) => {
                        o.source = e.target.value;
                      })
                    }
                  >
                    <option value="">Select source</option>
                    {sourceOptions.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label || source.value}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {type === "product-grid" ? (
              <div className={FULL}>
                <label>Product slugs (config.products) — multi-select</label>
                <SlugChips
                  value={products}
                  suggestions={slugs}
                  placeholder="product-slug"
                  onChange={(v) =>
                    cfgEdit((o) => {
                      o.products = v;
                    })
                  }
                />
              </div>
            ) : null}

            {type === "categories" ? (
              <div className={FULL}>
                <label>Category slugs (config.categories)</label>
                <SlugChips
                  value={cats}
                  suggestions={categorySlugs}
                  placeholder="category"
                  onChange={(v) =>
                    cfgEdit((o) => {
                      o.categories = v;
                    })
                  }
                />
              </div>
            ) : null}

            {false && type === "quick-services" ? (
              <div className={FULL}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <label>Quick Service cards (config.cards) — display order</label>
                    <p className="text-xs text-dim">Manage bilingual card content, icon, visibility and supported action.</p>
                  </div>
                  <button
                    type="button"
                    className={GHOST_BTN}
                    onClick={() =>
                      cfgEdit((o) => {
                        o.cards = Array.isArray(o.cards) ? o.cards : [];
                        o.cards.push({
                          key: `service-${Date.now()}`,
                          icon: "",
                          title: "",
                          titleBn: "",
                          description: "",
                          descriptionBn: "",
                          actionText: "",
                          actionTextBn: "",
                          action: "none",
                          href: "",
                          active: true,
                        });
                      })
                    }
                  >
                    + Add Card
                  </button>
                </div>
                {(Array.isArray(cfg.cards) ? cfg.cards : []).map((card, ix, cardList) => (
                  <div key={card.key || ix} className="mb-3 rounded-lg border border-line2 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <strong className="text-xs">Card {ix + 1}: {card.key || "new"}</strong>
                      <div className="flex items-center gap-2">
                        <button type="button" className={GHOST_BTN} disabled={ix === 0} onClick={() => cfgEdit((o) => { [o.cards[ix - 1], o.cards[ix]] = [o.cards[ix], o.cards[ix - 1]]; })}>↑</button>
                        <button type="button" className={GHOST_BTN} disabled={ix === cardList.length - 1} onClick={() => cfgEdit((o) => { [o.cards[ix + 1], o.cards[ix]] = [o.cards[ix], o.cards[ix + 1]]; })}>↓</button>
                        <button type="button" className={RED_BTN} onClick={() => cfgEdit((o) => { o.cards.splice(ix, 1); })}>Remove</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {[
                        ["key", "Unique key"],
                        ["icon", "Icon (emoji or image URL)"],
                        ["title", "Title"],
                        ["titleBn", "Title (Bangla)"],
                        ["description", "Description"],
                        ["descriptionBn", "Description (Bangla)"],
                        ["actionText", "Button text"],
                        ["actionTextBn", "Button text (Bangla)"],
                      ].map(([field, label]) => (
                        <div key={field}>
                          <label>{label}</label>
                          <input value={card[field] || ""} onChange={(e) => cfgEdit((o) => { o.cards[ix][field] = e.target.value; })} />
                        </div>
                      ))}
                      <div>
                        <label>Action</label>
                        <select value={card.action || "none"} onChange={(e) => cfgEdit((o) => { o.cards[ix].action = e.target.value; })}>
                          {actionOptions.map((action) => (
                            <option key={action.value} value={action.value}>
                              {action.label || action.value}
                            </option>
                          ))}
                        </select>
                      </div>
                      {card.action === "link" ? (
                        <div>
                          <label>Internal URL</label>
                          <input value={card.href || ""} placeholder="/contact" onChange={(e) => cfgEdit((o) => { o.cards[ix].href = e.target.value; })} />
                        </div>
                      ) : null}
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={card.active !== false} onChange={(e) => cfgEdit((o) => { o.cards[ix].active = e.target.checked; })} />
                        Show this card
                      </label>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {actionOptions.filter((action) => action.configurable).map((tool) => (
                    <div key={tool.value}>
                      <label>{tool.label || tool.value} options (JSON)</label>
                      <textarea
                        rows={5}
                        defaultValue={JSON.stringify(cfg[tool.value] || {}, null, 2)}
                        onBlur={(e) => {
                          try {
                            const value = JSON.parse(e.target.value || "{}");
                            cfgEdit((o) => { o[tool.value] = value; });
                          } catch (_) {
                            toast(`${tool.label || tool.value} settings must be valid JSON before saving`, "err");
                          }
                        }}
                        placeholder="{}"
                      />
                      <p className="mt-1 text-[11px] text-dim">Leave empty to use the built-in defaults. Edit JSON for ranges, labels, category matching, and calculator rules.</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {type === "goal-panels" ? (
              <div className={FULL}>
                <label>Goals (config.goals)</label>
                {goals.map((g, ix) => (
                  <div
                    key={ix}
                    className="mb-3 rounded-lg border border-line2 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <b className="text-[12px] text-dim">Goal {ix + 1}</b>
                      <button
                        type="button"
                        className="text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:underline"
                        onClick={() =>
                          cfgEdit((o) => {
                            (o.goals || []).splice(ix, 1);
                          })
                        }
                      >
                        ✕ Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label>Title</label>
                        <input
                          value={g.title || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.goals = o.goals || [];
                              o.goals[ix] = {
                                ...(o.goals[ix] || {}),
                                title: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Desc</label>
                        <input
                          value={g.desc || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.goals[ix] = {
                                ...(o.goals[ix] || {}),
                                desc: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label>Products (slugs)</label>
                      <SlugChips
                        value={g.products || []}
                        suggestions={slugs}
                        placeholder="product-slug"
                        onChange={(v) =>
                          cfgEdit((o) => {
                            o.goals[ix] = {
                              ...(o.goals[ix] || {}),
                              products: v,
                            };
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className={GHOST_BTN}
                  onClick={() =>
                    cfgEdit((o) => {
                      o.goals = o.goals || [];
                      o.goals.push({ title: "", desc: "", products: [] });
                    })
                  }
                >
                  + Add Goal
                </button>
              </div>
            ) : null}

            {/* ---- html athletes/stories structured editors (write through to the same config JSON) ---- */}
            {isAthletes || isStories ? (
              <>
                <div>
                  <label>Eyebrow (config.eyebrow)</label>
                  <input
                    value={cfg.eyebrow || ""}
                    onChange={(e) =>
                      cfgEdit((o) => {
                        o.eyebrow = e.target.value;
                      })
                    }
                  />
                </div>
                <div>
                  <label>Heading (config.heading)</label>
                  <input
                    value={cfg.heading || ""}
                    onChange={(e) =>
                      cfgEdit((o) => {
                        o.heading = e.target.value;
                      })
                    }
                  />
                </div>
                <div className={FULL}>
                  <label>Desc (config.desc)</label>
                  <textarea
                    rows={2}
                    value={cfg.desc || ""}
                    onChange={(e) =>
                      cfgEdit((o) => {
                        o.desc = e.target.value;
                      })
                    }
                  />
                </div>
              </>
            ) : null}

            {isAthletes ? (
              <div className={FULL}>
                <label>Athlete cards (config.items)</label>
                {items.map((a, ix) => (
                  <div
                    key={ix}
                    className="mb-3 rounded-lg border border-line2 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <b className="text-[12px] text-dim">Athlete {ix + 1}</b>
                      <button
                        type="button"
                        className="text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:underline"
                        onClick={() =>
                          cfgEdit((o) => {
                            (o.items || []).splice(ix, 1);
                          })
                        }
                      >
                        ✕ Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label>Image URL</label>
                        <input
                          value={a.img || ""}
                          placeholder="/assets/athlete-1.png"
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                img: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Alt text</label>
                        <input
                          value={a.alt || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                alt: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Role</label>
                        <input
                          value={a.role || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                role: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Name</label>
                        <input
                          value={a.name || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                name: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label>Quote</label>
                        <textarea
                          rows={2}
                          value={a.quote || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                quote: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label>Wears (comma-separated → array)</label>
                        <ListText
                          value={a.wears}
                          placeholder="Uses: Phone Nova X5, UPS Titan"
                          onChange={(arr) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                wears: arr,
                              };
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className={GHOST_BTN}
                  onClick={() =>
                    cfgEdit((o) => {
                      o.items = o.items || [];
                      o.items.push({
                        img: "",
                        alt: "",
                        role: "",
                        name: "",
                        quote: "",
                        wears: [],
                      });
                    })
                  }
                >
                  + Add Athlete
                </button>
              </div>
            ) : null}

            {isAthletes ? (
              <div className={FULL}>
                <label>
                  Community strip (config.comm) — 4 rows "value|label"
                </label>
                <PairRows
                  value={cfg.comm}
                  rows={4}
                  hint="2,412|Happy customers served"
                  onChange={(pairs) =>
                    cfgEdit((o) => {
                      o.comm = pairs;
                    })
                  }
                />
              </div>
            ) : null}

            {isStories ? (
              <div className={FULL}>
                <label>Story cards (config.items)</label>
                {items.map((st, ix) => (
                  <div
                    key={ix}
                    className="mb-3 rounded-lg border border-line2 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <b className="text-[12px] text-dim">Story {ix + 1}</b>
                      <button
                        type="button"
                        className="text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:underline"
                        onClick={() =>
                          cfgEdit((o) => {
                            (o.items || []).splice(ix, 1);
                          })
                        }
                      >
                        ✕ Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label>Image URL</label>
                        <input
                          value={st.img || ""}
                          placeholder="/assets/story-1.png"
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                img: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Alt text</label>
                        <input
                          value={st.alt || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                alt: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Name</label>
                        <input
                          value={st.name || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                name: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Meta</label>
                        <input
                          value={st.meta || ""}
                          placeholder="Dhaka · Customer since 2024"
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                meta: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label>Quote</label>
                        <textarea
                          rows={2}
                          value={st.quote || ""}
                          onChange={(e) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                quote: e.target.value,
                              };
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label>Product slugs (comma-separated)</label>
                        <ListText
                          value={splitList(st.list)}
                          placeholder="keyboard, mouse, monitor"
                          onChange={(arr) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                list: arr.join(","),
                              };
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label>
                          Stats (config.items[i].stats) — 3 rows "value|label"
                        </label>
                        <PairRows
                          value={st.stats}
                          rows={3}
                          hint="4.9|Average rating"
                          onChange={(pairs) =>
                            cfgEdit((o) => {
                              o.items = o.items || [];
                              o.items[ix] = {
                                ...(o.items[ix] || {}),
                                stats: pairs,
                              };
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className={GHOST_BTN}
                  onClick={() =>
                    cfgEdit((o) => {
                      o.items = o.items || [];
                      o.items.push({
                        img: "",
                        alt: "",
                        name: "",
                        meta: "",
                        quote: "",
                        list: "",
                        stats: [],
                      });
                    })
                  }
                >
                  + Add Story
                </button>
              </div>
            ) : null}

            <div className={FULL}>
              {type === "combo-bundles" || isCommunity || isQuickServices ? (
                <p className="text-[11px] text-dim2">
                  {type === "combo-bundles" ? "Bundle content is managed only from the Combo Bundles page. This section has no content config." : isQuickServices ? "Quick Service cards are managed from the Quick Services admin page. This section stays synchronized automatically." : "Community content is generated automatically from approved reviews and delivered orders. This section has no content config."}
                </p>
              ) : (
                <>
                  <label>Config (JSON — products, goals, items…)</label>
                  <textarea
                    id="sfConfig"
                    rows={6}
                    className="font-mono text-[12px]"
                    value={cfgText}
                    onChange={(e) => setCfgText(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>
        </AccSection>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
        <button id="sfCancel" className={GHOST_BTN} onClick={closeModal}>
          Cancel
        </button>
        <button id="sfSave" className={ACC_BTN} disabled={busy} onClick={save}>
          Save
        </button>
      </div>
    </>
  );
}

/* ---------- sections list ---------- */
function HomepagePage() {
  const confirm = useConfirm(); // Step 2 audit fix — confirm() was declared in a sibling component; every delete click crashed
  const toast = useToast();
  const { openModal } = useModal();
  const [items, setItems] = useState(null); /* null = loading */
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, md] = await Promise.all([listSections(), getMetadata()]);
      setItems(d.items || []);
      setMetadata(md);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (id, patch) => {
    try {
      await updateSection(id, patch);
      toast("Saved", "ok");
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const move = async (s, dir) => {
    const ix = items.findIndex((x) => x._id === s._id);
    const other = items[ix + dir];
    if (!other) return;
    try {
      if (other.order === s.order) {
        await updateSection(s._id, { order: s.order + dir });
      } else {
        await updateSection(s._id, { order: other.order });
        await updateSection(other._id, { order: s.order });
      }
      toast("Order updated", "ok");
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const del = async (s) => {
    if (
      !(await confirm({
        title: "Delete section",
        body: "Delete this homepage section? The storefront slot goes empty until re-added.",
        danger: true,
        ok: "Delete",
      }))
    )
      return;
    try {
      await removeSection(s._id);
      toast("Section deleted", "ok");
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  if (error) {
    return (
      <div className={CARD}>
        <div className="text-[13px] text-red">
          Failed to load sections — {error}
        </div>
        <button className={GHOST_BTN + " mt-3"} onClick={load}>
          Retry
        </button>
      </div>
    );
  }
  if (!items) return <div className={CARD}>Loading…</div>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">
          Sections render top → bottom by order number
        </span>
        <div className="flex-1" />
        <button
          id="sNew"
          className={ACC_BTN}
          onClick={() => openModal(<SectionForm metadata={metadata} onDone={load} />)}
        >
          + New Section
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        {items.map((s) => (
          <div
            key={s._id}
            className="flex flex-wrap items-center gap-3.5 border-b border-line px-4 py-[13px] last:border-b-0 hover:bg-panel2 md:flex-nowrap md:gap-[14px] md:px-4"
          >
            <OrderInput
              value={s.order}
              onSave={(n) => save(s._id, { order: n })}
            />
            <button
              type="button"
              title="Move up"
              className={GHOST_BTN + " px-2 py-0.5"}
              onClick={() => move(s, -1)}
              disabled={items.indexOf(s) === 0}
            >
              ▲
            </button>
            <button
              type="button"
              title="Move down"
              className={GHOST_BTN + " px-2 py-0.5"}
              onClick={() => move(s, 1)}
              disabled={items.indexOf(s) === items.length - 1}
            >
              ▼
            </button>
            <div className="min-w-0 flex-1">
              <div className="min-w-[150px] font-bold">{s.title || s.key}</div>
              <div className="font-cond text-[11.5px] tracking-[.05em] text-dim2">
                {s.key}
              </div>
            </div>
            <span className={CHIP + " text-dim"}>{s.type}</span>
            <Toggle
              on={s.active}
              onClick={() => save(s._id, { active: !s.active })}
            />
            <button
              className={GHOST_BTN}
              onClick={() => openModal(<SectionForm s={s} metadata={metadata} onDone={load} />)}
            >
              Edit
            </button>
            <button
              className={RED_BTN}
              title="Delete section"
              onClick={() => del(s)}
            >
              ✕
            </button>
          </div>
        ))}
        {!items.length ? (
          <div className="py-10 text-center text-dim2">
            No homepage sections yet
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="homepage" title="Homepage Sections">
        <HomepagePage />
      </AdminShell>
    </OverlayProvider>
  );
}
