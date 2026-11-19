import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  useCatalog,
  firstStock,
  priceFor,
  adaptOne,
} from "../store/catalog.jsx";
import { useStore } from "../store/store.jsx";
import { useContent } from "../store/content.jsx";
import { money } from "../lib/format.js";
import { fbTrack } from "../lib/pixel.js";
import { usePdpSEO } from "../lib/seo.jsx";
import Stars from "./Stars.jsx";
import {
  listByProduct as listReviews,
  create as createReview,
  createWithPhotos,
  updateMine as updateMyReview,
  removeMine as removeMyReview,
  voteHelpful,
} from "../services/reviews.js";
import {
  listByProduct as listQuestions,
  create as createQuestion,
  voteHelpful as voteQaHelpful,
} from "../services/questions.js";
import { getProduct, getStock } from "../services/products.js";
import { getSizeGuide } from "../services/settings.js";
import { useLang } from "../lib/i18n.jsx";
import ProductCard, { badgeText, badgeChipStyle } from "./ProductCard.jsx";

const revDate = (s) => {
  try {
    return new Date(s).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return "";
  }
};

/* Size Guide — admin-managed (Admin → Settings → Size Guide).
   Fetched once per session and cached at module level; every PDP open reuses it.
   no hardcoded fitness default — when nothing is configured the
   accordion simply hides (see guideInfo fallback). GUIDE_DEFAULT survives only
   as a render-safety net for the transient pre-fetch tick. */
const GUIDE_DEFAULT = {
  enabled: true,
  title: "Size Guide",
  note: "",
  headers: [],
  rows: [],
};
let _sizeGuideP = null;
const sizeGuideOnce = () => {
  if (!_sizeGuideP) {
    _sizeGuideP = getSizeGuide()
      .then((d) => ({
        global: d && d.sizeGuide ? d.sizeGuide : null,
        cats: d && Array.isArray(d.categoryGuides) ? d.categoryGuides : [],
      }))
      .catch(() => ({ global: null, cats: [] }));
  }
  return _sizeGuideP;
};

/* shared spec-value formatter (English/number/boolean/array → display
   string). Used by the grouped spec table AND the gallery badge overlay so
   both render a value identically (number fields append their unit). */
const fmtSpecVal = (v, f, t) => {
  if (Array.isArray(v))
    return v
      .map((x) => fmtSpecVal(x, f, t))
      .filter(Boolean)
      .join(", ");
  if (typeof v === "boolean")
    return v ? (t ? t("Yes") : "Yes") : t ? t("No") : "No";
  let s = String(v == null ? "" : v).trim();
  if (f && f.type === "number" && s !== "" && f.unit) s += " " + f.unit;
  return s;
};

export default function PDP() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { BY_ID, PRODUCTS } = useCatalog();
  const { addToCart, wish, toggleWish } = useStore();
  const { FREE_SHIP } = useContent();

  /* routed PDP: products beyond the home feed (deep links, search
     suggestions) are fetched by slug and run through the SAME adapter
     pipeline; the API's related payload feeds the "Complete the kit" row.
     the detail fetch ALWAYS runs (even for feed-cached products):
     the response carries the category's resolved specSchema which the list
     projection can't include. */
  const [remote, setRemote] = useState(null);
  const [remoteRelated, setRemoteRelated] = useState([]);
  const [missed, setMissed] = useState(false);
  const [specSchema, setSpecSchema] = useState(null);
  useEffect(() => {
    setMissed(false);
    let dead = false;
    setRemote(null);
    setRemoteRelated([]);
    setSpecSchema(null);
    getProduct(slug)
      .then((d) => {
        if (dead) return;
        setRemote(d.product ? adaptOne(d.product) : null);
        setRemoteRelated((d.related || []).map(adaptOne).filter(Boolean));
        setSpecSchema(
          Array.isArray(d.specSchema) && d.specSchema.length
            ? d.specSchema
            : null,
        );
        if (!d.product) setMissed(true);
      })
      .catch(() => {
        if (!dead) setMissed(true);
      });
    return () => {
      dead = true;
    };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  /* live stock re-check: the mirror snapshot can go stale while the
     shopper reads the page; /stock gives the honest per-size availability */
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!slug) {
      setLive(null);
      return;
    }
    let dead = false;
    getStock(slug)
      .then((d) => {
        if (!dead) setLive(d);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [slug]);

  const p = slug ? remote || BY_ID[slug] : null;
  usePdpSEO(p, !!slug);
  const { t, isBn } = useLang();

  /* bilingual display helpers (bn value when present, else English) */
  const pName = p ? (isBn && p.nameBn ? p.nameBn : p.name) : "";
  const pDesc = p ? (isBn && p.descBn ? p.descBn : p.desc) : "";
  const pCat = p ? (isBn && p.catBn ? p.catBn : t(p.cat)) : "";
  const specRows =
    p && isBn && Array.isArray(p.specsBn) && p.specsBn.length
      ? p.specsBn
      : p
        ? p.specs
        : [];

  /* GROUPED SPECS from the category's live schema + the product's
     canonical specValues. Falls back to the legacy flat table when either the
     schema or the values are missing (old docs, schema-less categories).
     hideEmptySpecs drops rows whose value is empty; showInDetails=false and
     empty values never render. Orphan values land in an "Other" group. */
  const specGroups = useMemo(() => {
    if (!p) return [];
    const isEmpty = (v) =>
      v === undefined ||
      v === null ||
      (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
    const fmt = (v, f) => fmtSpecVal(v, f, t);
    if (specSchema && Array.isArray(p.specValues) && p.specValues.length) {
      const byKey = new Map(p.specValues.map((s) => [s.k, s]));
      const used = new Set();
      const groups = [];
      for (const g of [...specSchema].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      )) {
        const rows = [];
        for (const f of [...(g.fields || [])].sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        )) {
          if (f.showInDetails === false) continue;
          const hit = byKey.get(f.key);
          if (!hit || isEmpty(hit.v)) continue; // hide-empty doctrine: empty rows never render
          used.add(f.key);
          rows.push({
            k: isBn && f.labelBn ? f.labelBn : f.label,
            v: fmt(hit.v, f),
            icon: f.icon || "",
          });
        }
        if (rows.length)
          groups.push({
            key: g.key,
            label: isBn && g.labelBn ? g.labelBn : g.label,
            rows,
            collapsed: !!g.collapsed,
          });
      }
      const orphans = p.specValues.filter(
        (s) => !used.has(s.k) && !isEmpty(s.v),
      );
      if (orphans.length)
        groups.push({
          key: "__other",
          label: t("Other specifications"),
          rows: orphans.map((s) => ({ k: s.k, v: fmt(s.v) })),
          collapsed: false,
        });
      return groups;
    }
    /* legacy fallback: single ungrouped section from the flat tuples */
    return specRows.length
      ? [
          {
            key: "__flat",
            label: "",
            rows: specRows.map((r) => ({ k: r[0], v: r[1] })),
            collapsed: false,
          },
        ]
      : [];
  }, [p, specSchema, specRows, isBn]); // eslint-disable-line react-hooks/exhaustive-deps

  /* key features checklist (bn twins preferred in bn mode) */
  const featureList = useMemo(() => {
    if (!p) return [];
    const en = (p.features || []).filter(Boolean);
    if (isBn && Array.isArray(p.featuresBn) && p.featuresBn.length)
      return p.featuresBn.filter(Boolean);
    return en;
  }, [p, isBn]);

  /* GALLERY SPEC BADGES (#9): the schema's showOnCard chips surface
     as overlay captions on the main product image. Server-decorated payloads
     win (decorateCards); otherwise the chips are computed from the live
     schema + specValues — the PDP always carries both. Same 3-chip cap and
     schema order as ProductCard, so the shop grid and the PDP never disagree. */
  const galleryBadges = useMemo(() => {
    if (!p) return [];
    if (Array.isArray(p.specBadges) && p.specBadges.length)
      return p.specBadges.slice(0, 3);
    if (!specSchema || !Array.isArray(p.specValues)) return [];
    const isEmpty = (v) =>
      v === undefined ||
      v === null ||
      (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
    const out = [];
    for (const g of [...specSchema].sort(
      (a, b) => (a.order || 0) - (b.order || 0),
    )) {
      for (const f of [...(g.fields || [])].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      )) {
        if (!f.showOnCard || out.length >= 3) continue;
        const hit = (p.specValues || []).find((s) => s.k === f.key);
        if (!hit || isEmpty(hit.v)) continue;
        const v = fmtSpecVal(hit.v, f, t);
        if (!v) continue;
        out.push({
          k: f.key,
          label: f.label,
          labelBn: f.labelBn || "",
          icon: f.icon || "",
          v: String(v).slice(0, 60),
        });
      }
    }
    return out;
  }, [p, specSchema]); // eslint-disable-line react-hooks/exhaustive-deps

  /* DENSE SPEC-SHEET LAYOUT (#8): when a product carries MORE THAN 20
     visible spec rows, the classic thin table rows become a wall of lines;
     large schemas switch to a two-column grid where each cell stacks label
     over value (the dense spec-sheet look). Small schemas keep the classic
     table. data-specdense marks the mode for QA. */
  const specDense = useMemo(
    () => specGroups.reduce((a, g) => a + g.rows.length, 0) > 20,
    [specGroups],
  );

  const colorLabel = (n) => {
    if (!p || !n) return n || t("Any");
    const c = p.colors.find((x) => x.n === n);
    return isBn && c && c.nBn ? c.nBn : n || t("Any");
  };

  const [qty, setQty] = useState(1);
  const [size, setSize] = useState(null);
  const [color, setColor] = useState(null);
  const [thumb, setThumb] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("center");
  const scrollRef = useRef(null);

  /* live reviews + Q&A for this product */
  const [revs, setRevs] = useState([]);
  const [revSummary, setRevSummary] =
    useState(null); /* { avg, total, dist:{1..5} } — */
  const [revSort, setRevSort] = useState("new");
  const [revPage, setRevPage] = useState(1);
  const [revPages, setRevPages] = useState(0);
  const [revPhotos, setRevPhotos] = useState(
    [],
  ); /* File[] ≤3 attached to the form */
  const [editRev, setEditRev] =
    useState(null); /* inline owner-edit { _id, name, rating, text } */
  const [votedRevs, setVotedRevs] = useState(
    {},
  ); /* { revId: votedBool } local marker */
  const [qas, setQas] = useState([]);
  const [qaSort, setQaSort] = useState("new");
  const [qaPage, setQaPage] = useState(1);
  const [qaPages, setQaPages] = useState(0);
  const [qaVoted, setQaVoted] = useState(
    {},
  ); /* { questionId: votedBool } local marker */
  const [revForm, setRevForm] = useState({ name: "", rating: 5, text: "" });
  const [qaForm, setQaForm] = useState({ name: "", text: "" });
  const [revMsg, setRevMsg] = useState(null); /* { ok, text } */
  const [qaMsg, setQaMsg] = useState(null);
  const [revBusy, setRevBusy] = useState(false);
  const [qaBusy, setQaBusy] = useState(false);

  /* admin-managed size guide (module-cached fetch, one request per session) */
  const [sgAll, setSgAll] = useState(null);
  useEffect(() => {
    let dead = false;
    sizeGuideOnce().then((v) => {
      if (!dead) setSgAll(v);
    });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!p) return;
    setQty(1);
    setSize(firstStock(p));
    setColor(p.colors[0]?.n ?? null);
    setThumb(0);
    setZoomed(false);
    setRevs([]);
    setQas([]);
    setRevMsg(null);
    setQaMsg(null);
    setRevForm({ name: "", rating: 5, text: "" });
    setQaForm({ name: "", text: "" });
    setRevSummary(null);
    setRevPage(1);
    setRevPages(0);
    setRevPhotos([]);
    setEditRev(null);
    setVotedRevs({});
    setRevSort("new");
    setQaPage(1);
    setQaPages(0);
    setQaVoted({});
    setQaSort("new");
    /* Meta Pixel: ViewContent — product detail opened */
    fbTrack("ViewContent", {
      content_name: p.name,
      content_ids: [p.id],
      content_type: "product",
      content_category: p.cat,
      value: priceFor(p, firstStock(p)),
      currency: "BDT",
    });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug) return;
    let dead = false;
    const loadRevs = (sort, page) =>
      listReviews(slug, { sort, page })
        .then((d) => {
          if (!dead) {
            setRevs(d.items || []);
            setRevSummary(d.summary || null);
            setRevPages(d.pagination?.pages || 0);
          }
        })
        .catch(() => {
          if (!dead) {
            setRevs([]);
            setRevSummary(null);
          }
        });
    loadRevs(revSort, revPage);
    listQuestions(slug, { sort: qaSort, page: qaPage })
      .then((d) => {
        if (!dead) {
          setQas(d.items || []);
          setQaPages(d.pagination?.pages || 0);
        }
      })
      .catch(() => {
        if (!dead) setQas([]);
      });
    return () => {
      dead = true;
    };
  }, [slug, revSort, revPage, qaSort, qaPage]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [slug]);

  /* gallery — product shots first, then any per-color images (deduped) */
  const imgs = useMemo(() => {
    if (!p) return [];
    const list = (Array.isArray(p.images) ? p.images : [p.img, p.alt]).filter(Boolean);
    (p.colors || []).forEach((c) => {
      if (c.img && !list.includes(c.img)) list.push(c.img);
    });
    return list;
  }, [p]);

  const colorImg = useMemo(
    () => (p && color ? (p.colors.find((c) => c.n === color) || {}).img : null),
    [p, color],
  );
  const sz = p && p.sizes ? p.sizes.find((x) => x.s === size) : null;
  const bt = p ? badgeText(p) : null;
  const unit = p ? priceFor(p, size || firstStock(p)) : 0;
  /* related products — the API's branch-aware payload wins; catalog filter is
     the offline fallback (hook stays above the early return) */
  const related = useMemo(() => {
    if (remoteRelated.length) return remoteRelated;
    return p
      ? PRODUCTS.filter((x) => x.cat === p.cat && x.id !== p.id).slice(0, 4)
      : [];
  }, [p, PRODUCTS, remoteRelated]); // eslint-disable-line react-hooks/exhaustive-deps

  /* THREE-TIER resolution (hooks stay ABOVE the early return):
       1. product custom table  (mode=custom; enabled=false → guide hidden)
       2. category table        (matches p.catSlug; enabled=false → hidden)
       3. global table          (Settings → Size Guide)
       4. legacy default        (API down / unset)
     data-source lands on the details element for QA assertions. */
  const guideInfo = useMemo(() => {
    const norm = (g) => {
      const w = g.headers.length;
      return {
        title: g.title || "Size Guide",
        titleBn: g.titleBn || "",
        note: g.note || "",
        noteBn: g.noteBn || "",
        headers: g.headers,
        rows: g.rows.map((r) => (Array.isArray(r) ? r : [r]).slice(0, w)),
      };
    };
    const valid = (g) =>
      g &&
      Array.isArray(g.headers) &&
      g.headers.length > 0 &&
      Array.isArray(g.rows) &&
      g.rows.length > 0;
    const pg = p && p.sizeGuide;
    if (pg && pg.mode === "custom") {
      if (pg.enabled === false || !valid(pg))
        return { on: false, source: "product-off", guide: null };
      return { on: true, source: "product", guide: norm(pg) };
    }
    const cg =
      sgAll && p
        ? (sgAll.cats || []).find((x) => x.category === p.catSlug)
        : null;
    if (cg) {
      if (cg.enabled === false || !valid(cg))
        return { on: false, source: "category-off", guide: null };
      return { on: true, source: "category", guide: norm(cg) };
    }
    const gl = sgAll ? sgAll.global : null;
    if (gl && gl.enabled === false)
      return { on: false, source: "global-off", guide: null };
    if (valid(gl)) return { on: true, source: "global", guide: norm(gl) };
    /* reset — no fitness default table: tech products show the guide
       accordion only when admin configured one (product → category → global) */
    return { on: false, source: "none", guide: null };
  }, [p, sgAll]);
  const guideOn = guideInfo.on;
  const guide = guideInfo.guide || GUIDE_DEFAULT;
  /* product not in the cached catalog (direct link / fresh seed):
     pulse a PDP-shaped skeleton while the remote fetch lands instead of a
     dead overlay. */
  if (!p) {
    if (missed) {
      return (
        <div
          className="container mx-auto w-[92%] py-24 text-center"
          id="pdpMiss"
          data-testid="pdpNotFound"
        >
          <p className="font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            404
          </p>
          <h1 className="mt-3 font-disp text-[clamp(2rem,5vw,3rem)] uppercase text-txt">
            Product Not Found
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[.95rem] text-muted">
            This item may have sold out or moved. The full catalog is one click
            away.
          </p>
          <button
            onClick={() => navigate("/shop")}
            className="mt-8 w-full max-w-sm bg-acc px-6 py-3 font-head text-[.78rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2 sm:w-auto"
          >
            Shop all products
          </button>
        </div>
      );
    }
    if (!slug) return null;
    return (
      <div
        className="fixed inset-0 z-[1200] overflow-y-auto bg-bg"
        data-testid="pdpSkeleton"
        aria-hidden="true"
      >
        <div className="container mx-auto w-[92%] py-8">
          <div className="h-3 w-28 animate-pulse bg-line/60" />
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
            <div className="aspect-square w-full animate-pulse bg-line/50" />
            <div>
              <div className="h-3 w-24 animate-pulse bg-line/60" />
              <div className="mt-4 h-9 w-3/4 animate-pulse bg-line/70" />
              <div className="mt-3 h-6 w-32 animate-pulse bg-line/60" />
              <div className="mt-7 h-3 w-full animate-pulse bg-line/50" />
              <div className="mt-2 h-3 w-4/5 animate-pulse bg-line/50" />
              <div className="mt-8 h-12 w-full animate-pulse bg-line/60" />
              <div className="mt-3 h-12 w-full animate-pulse bg-line/60" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* live stock wins over the mirror snapshot when the size is known */
  const stockOf = (x) => {
    if (live && live.sizeStocks && live.sizeStocks.length) {
      const hit = live.sizeStocks.find((y) => y.s === x.s);
      if (hit) return hit.stock;
    }
    return x.stock;
  };
  const szLive = sz ? { ...sz, stock: stockOf(sz) } : null;
  const outOfStock = sz ? szLive.stock === 0 : false;

  const onColor = (n) => {
    setColor(n);
    const img = (p.colors.find((c) => c.n === n) || {}).img;
    if (img && imgs.includes(img))
      setThumb(imgs.indexOf(img)); /* color → image switch */
  };

  const refreshRevs = () =>
    listReviews(slug, { sort: revSort, page: revPage })
      .then((d) => {
        setRevs(d.items || []);
        setRevSummary(d.summary || null);
        setRevPages(d.pagination?.pages || 0);
      })
      .catch(() => {});

  const submitReview = async (e) => {
    e.preventDefault();
    if (revBusy) return;
    setRevMsg(null);
    if (!revForm.name.trim() || !revForm.text.trim()) {
      setRevMsg({ ok: false, text: "Name and review text are required." });
      return;
    }
    setRevBusy(true);
    try {
      let d;
      if (revPhotos.length) {
        const fd = new FormData();
        fd.append("name", revForm.name.trim());
        fd.append("rating", String(revForm.rating));
        fd.append("comment", revForm.text.trim());
        revPhotos.slice(0, 3).forEach((f) => fd.append("images", f));
        d = await createWithPhotos(p.id, fd);
      } else {
        d = await createReview(p.id, {
          name: revForm.name.trim(),
          rating: revForm.rating,
          comment: revForm.text.trim(),
        });
      }
      setRevMsg({
        ok: true,
        text:
          d.message ||
          "Review received — it goes live once our team verifies it.",
      });
      setRevForm({ name: "", rating: 5, text: "" });
      setRevPhotos([]);
    } catch (err) {
      setRevMsg({ ok: false, text: err.message });
    } finally {
      setRevBusy(false);
    }
  };

  /* owner edit (back to pending) / delete / helpful vote */
  const saveEdit = async () => {
    if (!editRev || revBusy) return;
    setRevBusy(true);
    setRevMsg(null);
    try {
      const d = await updateMyReview(p.id, editRev._id, {
        name: editRev.name,
        rating: editRev.rating,
        comment: editRev.text,
      });
      setRevMsg({
        ok: true,
        text: d.message || "Review updated — pending re-approval.",
      });
      setEditRev(null);
      refreshRevs();
    } catch (err) {
      setRevMsg({ ok: false, text: err.message });
    } finally {
      setRevBusy(false);
    }
  };
  const delMine = async (revId) => {
    if (!window.confirm("Delete your review? This cannot be undone.")) return;
    setRevMsg(null);
    try {
      await removeMyReview(p.id, revId);
      setEditRev(null);
      refreshRevs();
    } catch (err) {
      setRevMsg({ ok: false, text: err.message });
    }
  };
  const vote = async (revId) => {
    const n = votedRevs[revId] ? -1 : 1; // toggle
    try {
      const d = await voteHelpful(revId, n);
      setRevs((rs) =>
        rs.map((r) =>
          r._id === revId ? { ...r, helpfulCount: d.helpfulCount } : r,
        ),
      );
      setVotedRevs((v) => ({ ...v, [revId]: d.voted }));
    } catch (err) {}
  };

  const submitQuestion = async (e) => {
    e.preventDefault();
    if (qaBusy) return;
    setQaMsg(null);
    if (!qaForm.text.trim()) {
      setQaMsg({ ok: false, text: "Type your question first." });
      return;
    }
    setQaBusy(true);
    try {
      const d = await createQuestion(p.id, {
        name: qaForm.name.trim(),
        question: qaForm.text.trim(),
      });
      setQaMsg({
        ok: true,
        text:
          d.message ||
          "Question received — our team answers within one working day.",
      });
      setQaForm({ name: "", text: "" });
      /* refresh so logged-in askers immediately see their question as "pending" */
      listQuestions(slug, { sort: qaSort, page: qaPage })
        .then((dd) => {
          setQas(dd.items || []);
          setQaPages(dd.pagination?.pages || 0);
        })
        .catch(() => {});
    } catch (err) {
      setQaMsg({ ok: false, text: err.message });
    } finally {
      setQaBusy(false);
    }
  };

  const voteQa = async (qaId) => {
    const n = qaVoted[qaId] ? -1 : 1; // toggle
    try {
      const d = await voteQaHelpful(qaId, n);
      setQas((qs) =>
        qs.map((q) =>
          q.id === qaId ? { ...q, helpfulCount: d.helpfulCount } : q,
        ),
      );
      setQaVoted((v) => ({ ...v, [qaId]: d.voted }));
    } catch (_e) {/*silent — vote is cosmetic*/}
  };

  /* Size Guide table rows only — title/note/enabled resolved above (hook order safe) */
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/shop");
  };
  return (
    <div
      className="pdp min-h-screen bg-bg pb-28"
      id="pdp"
      data-slug={slug}
      ref={scrollRef}
    >
      <div className="pdp-topbar sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          className="back-btn flex shrink-0 items-center gap-2 whitespace-nowrap font-cond text-[.85rem] uppercase tracking-[.2em] text-muted transition-colors hover:text-acc"
          id="pdpBack"
          onClick={goBack}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Back to Shop
        </button>
        <div className="pdp-crumb hidden min-w-0 flex-1 truncate text-right font-cond text-[.8rem] uppercase tracking-[.12em] text-dim sm:block">
          Home / <span id="pdpCrumbCat">{pCat}</span> /{" "}
          <b className="text-txt" id="pdpCrumbName">
            {pName}
          </b>
        </div>
      </div>

      <div
        className="pdp-grid container mx-auto grid w-[92%] min-w-0 gap-6 py-6 sm:gap-8 sm:py-8 lg:grid-cols-2 lg:gap-10"
        id="pdpGrid"
      >

        <div className="pdp-gallery min-w-0">
          <div
            className={
              "pdp-main relative cursor-zoom-in overflow-hidden border border-line bg-panel2 " +
              (zoomed ? "cursor-zoom-out" : "")
            }
            id="pdpMain"
            onClick={() => setZoomed((z) => !z)}
            onMouseMove={(e) => {
              if (!zoomed) return;
              const r = e.currentTarget.getBoundingClientRect();
              setOrigin(
                ((e.clientX - r.left) / r.width) * 100 +
                  "% " +
                  ((e.clientY - r.top) / r.height) * 100 +
                  "%",
              );
            }}
          >
            {bt && (
              <div className="pdp-flag absolute left-4 top-4 z-10" id="pdpFlag">
                <span
                  className="px-2.5 py-1 font-cond text-[.74rem] font-bold uppercase tracking-[.22em]"
                  style={badgeChipStyle(p)}
                >
                  {bt}
                </span>
              </div>
            )}
            <img
              id="pdpMainImg"
              src={colorImg || imgs[thumb] || p.img}
              alt={pName}
              className="aspect-square w-full object-cover transition-transform duration-200"
              style={{
                transform: zoomed ? "scale(1.9)" : "none",
                transformOrigin: origin,
              }}
            />
            {/*showOnCard chips as overlay captions on the hero image (#9)*/}
            {galleryBadges.length ? (
              <div
                className="absolute bottom-4 left-4 z-10 flex max-w-[85%] flex-wrap gap-1.5"
                id="pdpSpecBadgesOverlay"
                data-badges={galleryBadges.length}
              >
                {galleryBadges.map((b) => (
                  <span
                    key={b.k}
                    className="inline-flex max-w-[150px] items-center gap-1 rounded border border-line2 bg-bg/85 px-2 py-1 text-[11px] font-semibold text-txt backdrop-blur-sm"
                    title={
                      (isBn && b.labelBn ? b.labelBn : b.label) + ": " + b.v
                    }
                  >
                    {b.icon ? <span aria-hidden="true">{b.icon}</span> : null}
                    <span className="truncate">{b.v}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="pdp-thumbs mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" id="pdpThumbs">
            {imgs.map((src, i) => (
              <button
                key={i}
                className={
                  "pdp-thumb h-20 w-20 flex-none border transition-all " +
                  (!colorImg && i === thumb
                    ? "border-acc"
                    : colorImg
                      ? "border-line"
                      : "border-line hover:border-line2")
                }
                data-thumb={i}
                aria-label={"View " + (i + 1)}
                onClick={() => {
                  setThumb(i);
                  setColor(null);
                  setZoomed(false);
                }}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <div className="pdp-info min-w-0">
          <p
            className="pdp-cat font-cond text-[.8rem] uppercase tracking-[.3em] text-acc"
            id="pdpCat"
          >
            {pCat}
            {p.brand && p.brand.name ? " · " + p.brand.name : ""} ·{" "}
            {t("ArixGear verified")}
          </p>
          <h2
            className="pdp-name mt-2 break-words font-disp text-3xl uppercase leading-[.98] tracking-wide sm:text-4xl md:text-5xl"
            id="pdpName"
          >
            {pName}
          </h2>
          <div className="pdp-rating mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[.85rem]">
            <Stars rating={p.rating} />
            <b className="text-txt" id="pdpRate">
              {p.rating.toFixed(1)}
            </b>
            <a
              href="#pdpReviews"
              id="pdpRevLink"
              className="text-dim underline-offset-4 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("pdpReviews")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {p.reviews} {t("verified reviews")}
            </a>
          </div>
          <div className="pdp-price mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="now whitespace-nowrap font-head text-3xl font-extrabold text-acc"
              id="pdpPrice"
            >
              {money(unit)}
            </span>
            {p.compare ? (
              <s className="text-lg text-dim" id="pdpCompare">
                {money(p.compare)}
              </s>
            ) : null}
            {p.compare ? (
              <span
                className="save bg-ok/15 px-2 py-0.5 font-cond text-[.78rem] font-bold uppercase tracking-[.15em] text-ok"
                id="pdpSave"
              >
                SAVE {Math.round((1 - unit / p.compare) * 100)}%
              </span>
            ) : null}
            {p.sizes &&
            p.sizes.some((x) => x.price !== (p.sizes[0] || {}).price) ? (
              <span className="font-cond text-[.78rem] uppercase tracking-[.15em] text-dim">
                {p.variantLabel
                  ? t("price by {v}", { v: p.variantLabel.toLowerCase() })
                  : t("price by size")}
              </span>
            ) : null}
          </div>
          {featureList.length ? (
            <div className="mt-5 border border-line bg-panel" id="pdpFeatures">
              <div className="border-b border-line px-5 py-3 font-head text-[.8rem] font-bold uppercase tracking-[.18em]">
                {t("Key Features")}
              </div>
              <ul
                className="grid grid-cols-1 gap-x-6 px-5 py-4 md:grid-cols-2"
                data-featurelist="1"
              >
                {featureList.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 py-1 text-[.88rem] text-txt"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="mt-[3px] h-4 w-4 shrink-0 text-acc"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/*colors — selecting a color switches the main image when that color carries its own shot*/}
          {p.colors?.length ? <>
          <div className="pdp-optlabel mt-6 flex flex-wrap justify-between gap-x-4 gap-y-1 font-cond text-[.8rem] uppercase tracking-[.2em] text-muted">
            <span>
              Color —{" "}
              <b className="text-txt" id="pdpColorName">
                {colorLabel(color)}
              </b>
            </span>
            {colorImg ? (
              <span className="text-dim">photo updates with the color</span>
            ) : null}
          </div>
          <div className="color-row mt-2 flex flex-wrap gap-2" id="pdpColors">
            {p.colors.map((c) => (
              <button
                key={c.n}
                className={
                  "color-dot h-9 w-9 rounded-full border-2 transition-all " +
                  (color === c.n
                    ? "border-acc scale-110"
                    : "border-line2 hover:border-silver")
                }
                data-c={c.n}
                style={{ background: c.h }}
                aria-label={colorLabel(c.n)}
                title={colorLabel(c.n)}
                onClick={() => onColor(c.n)}
              />
            ))}
          </div>
          </> : null}

          {/*sizes — price updates with the selected size*/}
          {p.sizes?.length ? <>
          <div className="pdp-optlabel mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-cond text-[.8rem] uppercase tracking-[.2em] text-muted">
            <span id="pdpSizeLabel">
              {t("Select {v}", {
                v:
                  isBn && p.variantLabelBn
                    ? p.variantLabelBn
                    : p.variantLabel || t("Size"),
              })}
            </span>
            {guideOn ? (
              <a
                id="pdpSizeGuide"
                className="cursor-pointer text-silver2 underline-offset-4 hover:text-acc hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  const w = document.getElementById("pdpGuideWrap");
                  if (w) {
                    w.open = true;
                    w.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
              >
                Size guide
              </a>
            ) : null}
          </div>
          <div className="size-row mt-2 flex flex-wrap gap-2" id="pdpSizes">
            {(p.sizes || []).map((x) => {
              const st = stockOf(x);
              const cls = st === 0 ? "out" : st <= 3 ? "low" : "";
              return (
                <button
                  key={x.s}
                  disabled={st === 0}
                  className={
                    "size-chip relative min-w-14 border px-4 py-2.5 font-head text-[.85rem] font-bold transition-all " +
                    (st === 0
                      ? "cursor-not-allowed border-line text-line2 line-through"
                      : size === x.s
                        ? "border-acc bg-acc/10 text-acc"
                        : "border-line2 text-txt hover:border-silver") +
                    (cls === "low" ? " pr-8" : "")
                  }
                  data-s={x.s}
                  onClick={() => {
                    setSize(x.s);
                  }}
                >
                  {x.s}
                  {cls === "low" && (
                    <span className="stk absolute bottom-1 right-1.5 font-cond text-[.6rem] font-semibold text-acc">
                      {st} left
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </> : null}
          <p
            className="low-urgency mt-3 min-h-5 font-cond text-[.85rem] tracking-[.05em] text-acc"
            id="pdpUrgency"
          >
            {szLive && szLive.stock > 0 && szLive.stock <= 3 ? (
              <>
                🔥 Urgency: only {szLive.stock} left in {szLive.s} — restock in
                6 weeks
              </>
            ) : null}
            {szLive && szLive.stock === 0 ? (
              <>
                🔥 {szLive.s} {t("is sold out — pick another size")}
              </>
            ) : null}
          </p>

          <div className="pdp-buyrow mt-6 grid grid-cols-2 gap-3 xl:flex xl:items-stretch">
            <div className="col-span-2 grid grid-cols-2 items-stretch gap-3 xl:contents">
            <div className="qty w-fit flex flex-none items-center border border-line2">
              <button
                className="px-4 py-4 text-muted hover:text-acc"
                id="qtyMinus"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <b className="w-8 text-center" id="qtyVal">
                {qty}
              </b>
              <button
                className="px-4 py-4 text-muted hover:text-acc"
                id="qtyPlus"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => Math.min(9, q + 1))}
              >
                +
              </button>
            </div>
            <button
              className={
                "btn-primary col-span-2 w-full min-w-0 whitespace-normal bg-acc px-4 py-4 text-center font-head text-[.8rem] font-extrabold uppercase leading-snug tracking-[.2em] text-black transition hover:bg-acc2 xl:w-auto xl:flex-1 " +
                (outOfStock
                  ? "animate-none cursor-not-allowed opacity-50"
                  : "animate-pulse")
              }
              id="pdpAdd"
              disabled={outOfStock}
              onClick={() => addToCart(p.id, size, color, qty, true)}
            >
              {outOfStock ? (
                t("Sold Out — pick another size")
              ) : (
                <>
                  {t("Add to Cart")}

                </>
              )}
            </button>
            <button
              type="button"
              className={
                "col-span-2 w-full min-w-0 whitespace-normal border border-acc px-4 py-4 text-center font-head text-[.8rem] font-extrabold uppercase leading-snug tracking-[.2em] text-acc transition hover:bg-acc hover:text-black xl:w-auto xl:flex-1 " +
                (outOfStock ? "cursor-not-allowed opacity-50" : "")
              }
              id="pdpBuyNow"
              disabled={outOfStock}
              onClick={() => {
                addToCart(p.id, size, color, qty, false);
                navigate("/checkout");
              }}
            >
              {t("Buy Now")}
            </button>
            <button
              className={
                "wish-big col-start-2 row-start-1 ml-auto grid h-14 w-14 flex-none place-items-center border transition-all xl:col-auto xl:row-auto xl:ml-0 " +
                (wish.has(p.id)
                  ? "border-acc text-acc"
                  : "border-line2 text-muted hover:text-txt")
              }
              id="pdpWish"
              aria-label="Toggle wishlist"
              onClick={() => toggleWish(p.id)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill={wish.has(p.id) ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 21s-7.5-4.9-9.8-9.2C.7 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.1 2.3h4c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.2 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" />
              </svg>
            </button>
            </div>
          </div>

          <div className="perks mt-6 space-y-2.5 border-y border-line py-5">
            {FREE_SHIP > 0 ? <div className="perk flex items-center gap-3 text-[.85rem] text-muted">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-silver2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7z" />
                <circle cx="6" cy="19" r="1.6" />
                <circle cx="17" cy="19" r="1.6" />
              </svg>{" "}
              {t("Free shipping on orders over")} {money(FREE_SHIP)}
            </div> : null}
            {p.warranty &&
            p.warranty.months > 0 &&
            p.warranty.type !== "none" ? (
              <div
                className="perk flex items-center gap-3 text-[.85rem] text-muted"
                id="pdpWarranty"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 text-acc"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>{" "}
                <span>
                  {p.warranty.months}-month{" "}
                  {p.warranty.type === "seller"
                    ? "seller"
                    : p.warranty.type === "service"
                      ? "service"
                      : "official"}{" "}
                  warranty{p.warranty.note ? " · " + p.warranty.note : ""}
                </span>
              </div>
            ) : null}
          </div>

        </div>
      </div>
      <div className="pdp-content container mx-auto w-[92%] max-w-5xl space-y-8 py-8" id="pdpContent">

          {/*specs + guide — GROUPED sections from the category schema.
              (#8): >20 visible rows switch to the dense two-column
              spec-sheet grid (label stacked over value per cell).*/}
          {pDesc ? <details className="specs mt-5 border border-line" id="pdpDescWrap">
            <summary className="cursor-pointer bg-panel px-5 py-3.5 font-head text-[.8rem] font-bold uppercase tracking-[.18em]">
              {t("Description")}
            </summary>
            <div className="whitespace-pre-line break-words px-5 py-4 text-[.9rem] leading-relaxed text-muted" id="pdpDesc">
              {pDesc}
            </div>
          </details> : null}
          <details
            className="specs mt-5 border border-line"
            id="pdpSpecsWrap"
            data-specdense={specDense ? "1" : "0"}
          >
            <summary className="cursor-pointer bg-panel px-5 py-3.5 font-head text-[.8rem] font-bold uppercase tracking-[.18em]">
              Specifications
            </summary>
            {specGroups.map((g) => (
              <div key={g.key} data-specgroup={g.key}>
                {g.label ? (
                  <div className="border-t border-line bg-panel2 px-5 py-2 font-head text-[.72rem] font-bold uppercase tracking-[.2em] text-acc">
                    {g.label}
                  </div>
                ) : null}
                {specDense ? (
                  <div
                    className="grid grid-cols-1 gap-x-10 px-5 py-2 md:grid-cols-2"
                    data-densegroup={g.key}
                  >
                    {g.rows.map((r, i) => (
                      <div
                        key={i}
                        className="border-b border-line/60 py-2"
                        data-specrow={r.k}
                      >
                        <p className="text-[.72rem] uppercase tracking-[.14em] text-dim">
                          {r.icon ? (
                            <span aria-hidden="true" className="mr-1.5">
                              {r.icon}
                            </span>
                          ) : null}
                          {r.k}
                        </p>
                        <p className="mt-0.5 break-words text-[.88rem] text-txt">{r.v}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table
                    className="spec-table w-full table-fixed text-[.85rem]"
                    id={g.key === "__flat" ? "pdpSpecs" : undefined}
                  >
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="w-[38%] break-words px-3 py-2.5 text-dim sm:w-40 sm:px-5">
                            {r.icon ? (
                              <span aria-hidden="true" className="mr-1.5">
                                {r.icon}
                              </span>
                            ) : null}
                            {r.k}
                          </td>
                          <td className="break-words px-3 py-2.5 text-txt sm:px-5">{r.v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
            {!specGroups.length ? (
              <p className="px-5 py-4 text-[.85rem] text-dim">
                {t("No specifications listed for this product yet.")}
              </p>
            ) : null}
          </details>
          {guideOn ? (
            <details
              className="specs spec-guide mt-3 border border-line"
              id="pdpGuideWrap"
              data-guide-source={guideInfo.source}
            >
              <summary className="cursor-pointer bg-panel px-5 py-3.5 font-head text-[.8rem] font-bold uppercase tracking-[.18em]">
                {isBn && guide.titleBn ? guide.titleBn : guide.title}
              </summary>
              <div className="max-w-full overflow-x-auto">
                <table className="spec-table w-full min-w-max text-[.85rem]">
                  <tbody id="pdpGuide">
                    {guide.rows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        {r.map((c, j) => (
                          <td
                            key={j}
                            className={
                              "px-3 py-2.5 sm:px-5 " +
                              (i === 0
                                ? "font-bold text-txt"
                                : j === 0
                                  ? "text-dim"
                                  : "text-txt")
                            }
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isBn && guide.noteBn ? (
                <p
                  className="px-5 pb-4 pt-1 text-[.78rem] leading-relaxed text-dim"
                  id="pdpGuideNote"
                >
                  {guide.noteBn}
                </p>
              ) : guide.note ? (
                <p
                  className="px-5 pb-4 pt-1 text-[.78rem] leading-relaxed text-dim"
                  id="pdpGuideNote"
                >
                  {guide.note}
                </p>
              ) : null}
            </details>
          ) : null}


          <div className="reviews mt-8" id="pdpReviews">
            <div className="rev-head flex flex-wrap items-center justify-between gap-6">
              <div>
                <div
                  className="rev-score font-disp text-6xl text-acc"
                  id="revScore"
                >
                  {(revSummary && revSummary.total
                    ? revSummary.avg
                    : p.rating
                  ).toFixed(1)}
                </div>
                <p
                  className="rev-sub font-cond text-[.8rem] uppercase tracking-[.15em] text-dim"
                  id="revSub"
                >
                  Based on {revSummary ? revSummary.total : p.reviews} verified
                  lifts
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <Stars
                  rating={
                    revSummary && revSummary.total ? revSummary.avg : p.rating
                  }
                />
                {revSummary && revSummary.total ? (
                  <div className="rev-dist grid gap-1" id="revDist">
                    {[5, 4, 3, 2, 1].map((n) => {
                      const c = revSummary.dist[n] || 0;
                      const pct = Math.round((c / revSummary.total) * 100);
                      return (
                        <div
                          key={n}
                          className="flex items-center gap-2 text-[.7rem] text-dim"
                        >
                          <span className="w-6 text-right font-head">{n}★</span>
                          <span className="h-1.5 w-28 bg-line">
                            <span
                              className="block h-full bg-acc"
                              style={{ width: pct + "%" }}
                            />
                          </span>
                          <span className="w-6">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-cond text-[.7rem] uppercase tracking-[.12em] text-dim">
                Sort
              </span>
              {[
                ["new", "Newest"],
                ["helpful", "Most helpful"],
              ].map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  data-sort={k}
                  onClick={() => { setRevPage(1); setRevSort(k); }}
                  className={
                    "px-2.5 py-1 font-cond text-[.7rem] uppercase tracking-[.1em] border transition-colors " +
                    (revSort === k
                      ? "border-acc text-acc"
                      : "border-line2 text-dim hover:text-txt")
                  }
                >
                  {t}
                </button>
              ))}
            </div>

            <div id="revList" className="mt-4 space-y-4">
              {revs.map((r) => (
                <div className="rev-item border border-line p-4" key={r._id}>
                  <div className="rev-top flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rev-name font-head text-[.85rem] font-bold">
                      {r.name}
                    </span>
                    <span className="stars">
                      <Stars rating={r.rating} />
                    </span>
                    {r.verified ? (
                      <span className="rev-verified font-cond text-[.72rem] uppercase tracking-[.1em] text-ok">
                        ✓ {t("Verified buyer")}
                      </span>
                    ) : null}
                    {r.mine ? (
                      <span className="font-cond text-[.72rem] uppercase tracking-[.1em] text-acc">
                        {t("Your review")}
                      </span>
                    ) : null}
                    <span className="rev-date ml-auto font-cond text-[.72rem] tracking-[.1em] text-dim">
                      {revDate(r.createdAt)}
                    </span>
                  </div>

                  {editRev && editRev._id === r._id ? (
                    <div
                      className="mt-2 border border-line2 bg-bg p-3"
                      id="revEditBox"
                    >
                      <input
                        value={editRev.name}
                        onChange={(e) =>
                          setEditRev((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full border border-line2 bg-panel px-3 py-2 text-[.85rem] text-txt outline-none focus:border-acc"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            type="button"
                            key={n}
                            onClick={() =>
                              setEditRev((f) => ({ ...f, rating: n }))
                            }
                            className={
                              "grid h-8 w-8 place-items-center border font-head text-[.85rem] font-bold " +
                              (editRev.rating >= n
                                ? "border-acc bg-acc/10 text-acc"
                                : "border-line2 text-dim")
                            }
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={3}
                        value={editRev.text}
                        onChange={(e) =>
                          setEditRev((f) => ({ ...f, text: e.target.value }))
                        }
                        className="mt-2 w-full border border-line2 bg-panel px-3 py-2 text-[.85rem] text-txt outline-none focus:border-acc"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={revBusy}
                          className="min-w-[7rem] flex-1 bg-acc px-4 py-2 text-center font-head text-[.7rem] font-extrabold uppercase tracking-[.14em] text-black disabled:opacity-60 sm:flex-none"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditRev(null)}
                          className="min-w-[7rem] flex-1 border border-line2 px-4 py-2 text-center font-head text-[.7rem] uppercase tracking-[.14em] text-dim hover:text-txt sm:flex-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="rev-text mt-2 break-words text-[.88rem] leading-relaxed text-muted">
                        {r.comment}
                      </p>
                      {(r.images || []).length ? (
                        <div className="mt-2 flex flex-wrap gap-2" data-rev-photos>
                          {r.images.map((im, ix) => (
                            <img
                              key={ix}
                              src={im.url}
                              alt=""
                              className="h-16 w-16 border border-line2 object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                      {r.reply ? (
                        <div
                          className="mt-2 border-l-2 border-acc bg-panel px-3 py-2"
                          data-rev-reply
                        >
                          <p className="font-cond text-[.7rem] uppercase tracking-[.12em] text-acc">
                            ArixGear replied
                            {r.reply.by ? " · " + r.reply.by : ""}
                          </p>
                          <p className="mt-1 text-[.84rem] leading-relaxed text-muted">
                            {r.reply.text}
                          </p>
                        </div>
                      ) : null}
                      <div className="mt-2.5 flex flex-wrap items-center gap-4">
                        <button
                          type="button"
                          onClick={() => vote(r._id)}
                          data-helpful={r._id}
                          className={
                            "font-cond text-[.72rem] uppercase tracking-[.1em] transition-colors " +
                            (votedRevs[r._id]
                              ? "text-acc"
                              : "text-dim hover:text-txt")
                          }
                        >
                          ▲ {t("Helpful")} ({r.helpfulCount || 0})
                        </button>
                        {r.mine ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setEditRev({
                                  _id: r._id,
                                  name: r.name,
                                  rating: r.rating,
                                  text: r.comment,
                                })
                              }
                              className="font-cond text-[.72rem] uppercase tracking-[.1em] text-dim underline-offset-4 hover:text-txt hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => delMine(r._id)}
                              className="font-cond text-[.72rem] uppercase tracking-[.1em] text-dim underline-offset-4 hover:text-red hover:underline"
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!revs.length ? (
                <p className="border border-dashed border-line2 px-4 py-6 text-center text-[.85rem] text-dim">
                  {t(
                    "No verified reviews yet — be the first to lift and report.",
                  )}
                </p>
              ) : null}
            </div>
            {revPages > 1 ? (
              <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Review pages">
                <button type="button" disabled={revPage <= 1} onClick={() => setRevPage((n) => Math.max(1, n - 1))} className="border border-line2 px-3 py-2 text-sm text-txt disabled:cursor-not-allowed disabled:opacity-40">
                  {t("Previous")}
                </button>
                <span className="text-sm text-dim">{t("Page {page} of {pages}", { page: revPage, pages: revPages })}</span>
                <button type="button" disabled={revPage >= revPages} onClick={() => setRevPage((n) => Math.min(revPages, n + 1))} className="border border-line2 px-3 py-2 text-sm text-txt disabled:cursor-not-allowed disabled:opacity-40">
                  {t("Next")}
                </button>
              </nav>
            ) : null}

            <form
              className="rev-form mt-6 border border-line bg-panel p-5"
              id="revForm"
              onSubmit={submitReview}
            >
              <h4 className="font-head text-[.95rem] font-bold uppercase tracking-[.15em] text-txt">
                {t("Write a review")}
              </h4>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="font-cond text-[.75rem] uppercase tracking-[.15em] text-dim"
                    htmlFor="revName"
                  >
                    Your name
                  </label>
                  <input
                    id="revName"
                    value={revForm.name}
                    onChange={(e) =>
                      setRevForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="mt-1.5 w-full border border-line2 bg-bg px-3.5 py-2.5 text-[.9rem] text-txt outline-none focus:border-acc"
                    placeholder="e.g. Tanvir H."
                  />
                </div>
                <div>
                  <span className="font-cond text-[.75rem] uppercase tracking-[.15em] text-dim">
                    Your rating
                  </span>
                  <div className="mt-1.5 flex gap-1.5" id="revStars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        data-star={n}
                        aria-label={n + " star" + (n > 1 ? "s" : "")}
                        onClick={() => setRevForm((f) => ({ ...f, rating: n }))}
                        className={
                          "grid h-9 w-9 place-items-center border font-head text-[.9rem] font-bold transition-all " +
                          (revForm.rating >= n
                            ? "border-acc bg-acc/10 text-acc"
                            : "border-line2 text-dim hover:border-silver")
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label
                  className="font-cond text-[.75rem] uppercase tracking-[.15em] text-dim"
                  htmlFor="revText"
                >
                  {t("Your review")}
                </label>
                <textarea
                  id="revText"
                  rows={3}
                  value={revForm.text}
                  onChange={(e) =>
                    setRevForm((f) => ({ ...f, text: e.target.value }))
                  }
                  className="mt-1.5 w-full border border-line2 bg-bg px-3.5 py-2.5 text-[.9rem] text-txt outline-none focus:border-acc"
                  placeholder="How did it hold up under the bar?"
                />
              </div>
              <div className="mt-4">
                <label
                  className="font-cond text-[.75rem] uppercase tracking-[.15em] text-dim"
                  htmlFor="revPhotos"
                >
                  Photos (optional, up to 3 — JPG/PNG/WEBP)
                </label>
                <input
                  id="revPhotos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) =>
                    setRevPhotos(Array.from(e.target.files || []).slice(0, 3))
                  }
                  className="mt-1.5 block w-full text-[.8rem] text-dim file:mr-3 file:cursor-pointer file:border file:border-line2 file:bg-bg file:px-3 file:py-2 file:font-cond file:text-[.72rem] file:uppercase file:tracking-[.12em] file:text-txt"
                />
                {revPhotos.length ? (
                  <p className="mt-1 text-[.72rem] text-dim">
                    {revPhotos.length} photo(s) attached — they go live after
                    approval.
                  </p>
                ) : null}
              </div>
              {revMsg ? (
                <p
                  id="revMsg"
                  className={
                    "mt-3 text-[.85rem] " + (revMsg.ok ? "text-ok" : "text-red")
                  }
                >
                  {revMsg.text}
                </p>
              ) : null}
              <button
                type="submit"
                id="revSubmit"
                disabled={revBusy}
                className="mt-4 w-full bg-acc px-6 py-3 text-center font-head text-[.75rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2 disabled:opacity-60 sm:w-auto"
              >
                {revBusy ? t("Sending…") : t("Submit review")}
              </button>
            </form>
          </div>

          {/*Q&A — answered questions live from the API + visitor ask*/}
          <div className="pdp-qa mt-8" id="pdpQA">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-disp text-2xl uppercase tracking-wide text-txt">
                {t("Questions & Answers")}
              </h3>
              <div className="flex flex-wrap gap-1.5" id="qaSortPills">
                {[
                  ["new", "Newest"],
                  ["helpful", "Most helpful"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setQaPage(1); setQaSort(k); }}
                    className={
                      "border px-3 py-1 font-cond text-[.7rem] uppercase tracking-[.14em] transition-colors " +
                      (qaSort === k
                        ? "border-acc bg-acc/10 text-acc"
                        : "border-line2 text-dim hover:text-txt")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 space-y-4" id="qaList">
              {qas.map((qa) => (
                <div className="qa-item border border-line p-4" key={qa.id}>
                  <p className="qa-q break-words text-[.9rem] font-semibold text-txt">
                    <span className="mr-2 font-cond text-[.72rem] uppercase tracking-[.15em] text-acc">
                      Q
                    </span>
                    {qa.question}
                  </p>
                  <p className="qa-a mt-2 break-words text-[.88rem] leading-relaxed text-muted">
                    <span className="mr-2 font-cond text-[.72rem] uppercase tracking-[.15em] text-ok">
                      A
                    </span>
                    {qa.answer}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <p className="font-cond text-[.72rem] uppercase tracking-[.1em] text-dim">
                      Asked by {qa.name} · {revDate(qa.createdAt)}
                    </p>
                    {qa.mine ? (
                      <span
                        className="border border-acc/50 bg-acc/10 px-2 py-0.5 font-cond text-[.62rem] font-bold uppercase tracking-[.14em] text-acc"
                        data-qa-mine
                      >
                        Your question
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => voteQa(qa.id)}
                      data-qa-helpful={qa.id}
                      className={
                        "ml-auto max-w-full whitespace-normal text-right font-cond text-[.72rem] uppercase tracking-[.1em] transition-colors " +
                        (qaVoted[qa.id] || qa.myVote
                          ? "text-acc"
                          : "text-dim hover:text-txt")
                      }
                    >
                      ▲ {t("Helpful")} ({qa.helpfulCount || 0})
                    </button>
                  </div>
                </div>
              ))}
              {!qas.length ? (
                <p className="border border-dashed border-line2 px-4 py-6 text-center text-[.85rem] text-dim">
                  {t("No answered questions yet — ask the first one below.")}
                </p>
              ) : null}
            </div>
            {qaPages > 1 ? (
              <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Question pages">
                <button type="button" disabled={qaPage <= 1} onClick={() => setQaPage((n) => Math.max(1, n - 1))} className="border border-line2 px-3 py-2 text-sm text-txt disabled:cursor-not-allowed disabled:opacity-40">
                  {t("Previous")}
                </button>
                <span className="text-sm text-dim">{t("Page {page} of {pages}", { page: qaPage, pages: qaPages })}</span>
                <button type="button" disabled={qaPage >= qaPages} onClick={() => setQaPage((n) => Math.min(qaPages, n + 1))} className="border border-line2 px-3 py-2 text-sm text-txt disabled:cursor-not-allowed disabled:opacity-40">
                  {t("Next")}
                </button>
              </nav>
            ) : null}

            <form
              className="qa-form mt-6 border border-line bg-panel p-5"
              id="qaForm"
              onSubmit={submitQuestion}
            >
              <h4 className="font-head text-[.95rem] font-bold uppercase tracking-[.15em] text-txt">
                {t("Ask a question")}
              </h4>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="font-cond text-[.75rem] uppercase tracking-[.15em] text-dim"
                    htmlFor="qaName"
                  >
                    Your name
                  </label>
                  <input
                    id="qaName"
                    value={qaForm.name}
                    onChange={(e) =>
                      setQaForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="mt-1.5 w-full border border-line2 bg-bg px-3.5 py-2.5 text-[.9rem] text-txt outline-none focus:border-acc"
                    placeholder="e.g. Rafi"
                  />
                </div>
                <div>
                  <label
                    className="font-cond text-[.75rem] uppercase tracking-[.15em] text-dim"
                    htmlFor="qaText"
                  >
                    Your question
                  </label>
                  <input
                    id="qaText"
                    value={qaForm.text}
                    onChange={(e) =>
                      setQaForm((f) => ({ ...f, text: e.target.value }))
                    }
                    className="mt-1.5 w-full border border-line2 bg-bg px-3.5 py-2.5 text-[.9rem] text-txt outline-none focus:border-acc"
                    placeholder={t("e.g. Is the belt good for deadlifts?")}
                  />
                </div>
              </div>
              {qaMsg ? (
                <p
                  id="qaMsg"
                  className={
                    "mt-3 text-[.85rem] " + (qaMsg.ok ? "text-ok" : "text-red")
                  }
                >
                  {qaMsg.text}
                </p>
              ) : null}
              <button
                type="submit"
                id="qaSubmit"
                disabled={qaBusy}
                className="mt-4 w-full bg-acc px-6 py-3 text-center font-head text-[.75rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2 disabled:opacity-60 sm:w-auto"
              >
                {qaBusy ? t("Sending…") : t("Submit question")}
              </button>
            </form>
          </div>
      </div>


      {related.length ? (
        <div
          className="pdp-related container mx-auto w-[92%] border-t border-line py-10"
          id="pdpRelated"
        >
          <div className="mb-6 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-cond text-[.8rem] font-semibold uppercase tracking-[.35em] text-acc">
                Complete the kit
              </p>
              <h3 className="mt-2 font-disp text-2xl uppercase tracking-wide text-txt md:text-3xl">
                {t("Related Products")}
              </h3>
            </div>
            <button
              className="self-start whitespace-normal text-left font-cond text-[.8rem] uppercase tracking-[.2em] text-dim transition-colors hover:text-acc sm:self-auto"
              id="pdpRelatedBack"
              onClick={goBack}
            >
              {t("Back to shop ↩")}
            </button>
          </div>
          <div
            className="grid grid-cols-2 gap-[.7rem] md:grid-cols-4 lg:gap-[1.15rem]"
            id="relatedGrid"
          >
            {related.map((r) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="pdp-sticky fixed inset-x-0 bottom-0 z-30 hidden items-center gap-4 border-t border-line bg-panel/95 px-5 py-3 backdrop-blur transition-transform duration-300 md:flex"
        id="pdpSticky"
      >
        <img
          id="psImg"
          src={colorImg || p.img}
          alt=""
          className="h-12 w-12 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p
            className="ps-name truncate font-head text-[.9rem] font-bold"
            id="psName"
          >
            {pName}
          </p>
          <p
            className="ps-meta font-cond text-[.75rem] uppercase tracking-[.1em] text-dim"
            id="psMeta"
          >
            {pCat}
            {p.sizes ? " · size " + size : ""} · qty {qty}
          </p>
        </div>
        <span
          className="ps-price font-head text-lg font-extrabold text-acc"
          id="psPrice"
        >
          {money(unit)}
        </span>
        <button
          className="btn-primary shrink-0 whitespace-nowrap bg-acc px-6 py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.18em] text-black hover:bg-acc2"
          id="psAdd"
          onClick={() => addToCart(p.id, size, color, qty, true)}
        >
          {t("Add to Cart")}
        </button>
      </div>
    </div>
  );
}
