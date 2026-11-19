import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { listProducts } from "../services/products.js";
import { listCategories } from "../services/categories.js";
import { list as listBadges } from "../services/badges.js";

const API_ORIGIN =
  "";

const CAT_LABEL = {};
const CAT_LABEL_BN = {};
const capSlug = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const BADGE_LEGACY = {
  sale: { label: "SALE", color: "#2F81F7" },
  "best-seller": { label: "BEST SELLER", color: "#c9ced4" },
  best: { label: "BEST SELLER", color: "#c9ced4" },
  new: { label: "NEW", color: "#111114" },
};

function readCatalogCache(key, selectItems) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    const items = selectItems(cached);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function readCachedProducts() {
  const rawItems = readCatalogCache(
    "arixgear_catalog_raw",
    (cached) => cached && cached.items,
  );
  return rawItems.length
    ? rawItems
    : readCatalogCache(
        "arixgear_catalog",
        (cached) => cached && cached.products,
      );
}

export function priceFor(p, size) {
  if (!p) return 0;
  if (p.flash && +p.price > 0) return +p.price;
  if (size && Array.isArray(p.sizes)) {
    const hit = p.sizes.find((x) => x.s === size);
    if (hit && +hit.price > 0) return +hit.price;
  }
  return +p.price || 0;
}

function adaptProduct(p) {
  if (!p || !p.slug) return null;

  if (!p.images && p.img) {
    const bmap = window.__ArixGear_BADGES__ || {};
    const key = p.badgeKey || (p.badge && p.badge !== "none" ? p.badge : null);
    const legacy = key
      ? BADGE_LEGACY[key] || { label: key, color: "#2F81F7" }
      : null;
    return {
      ...p,
      badgeKey: key || null,
      badgeLabel: key ? bmap[key]?.label || p.badgeLabel || legacy.label : null,
      badgeLabelBn: key
        ? bmap[key]?.labelBn || p.badgeLabelBn || legacy.labelBn || ""
        : null,
      badgeColor: key ? bmap[key]?.color || p.badgeColor || legacy.color : null,
      colors: (p.colors || []).map((c) => ({
        n: c.n || c.name || "Default",
        nBn: c.nBn || c.nameBn || "",
        h: c.h || c.hex || "#0d0d0f",
        img: c.img || null,
      })),
      sizes: p.sizes
        ? p.sizes.map((x) =>
            typeof x === "string"
              ? { s: x, stock: 5, price: +p.price || 0 }
              : {
                  s: x.s,
                  stock: x.stock ?? 5,
                  price: +x.price > 0 ? +x.price : +p.price || 0,
                },
          )
        : null,
    };
  }

  const fix = (u) =>
    !u
      ? ""
      : /^https?:/.test(u) || API_ORIGIN
        ? u
        : u.startsWith("/")
          ? u
          : "/" + u;
  const imgs = (p.images || []).map((i) => fix(i.url || i));

  const thumbs = (p.images || []).map((i) => fix(i.thumb || i.url || i));
  const price = +p.price || 0,
    compare = p.comparePrice ? +p.comparePrice : null;

  const badgeKey = p.badge && p.badge !== "none" ? p.badge : null;
  const legacy = badgeKey
    ? BADGE_LEGACY[badgeKey] || { label: badgeKey, color: "#2F81F7" }
    : null;
  const badge = badgeKey
    ? {
        key: badgeKey,
        label:
          (window.__ArixGear_BADGES__ || {})[badgeKey]?.label || legacy.label,
        labelBn:
          (window.__ArixGear_BADGES__ || {})[badgeKey]?.labelBn ||
          legacy.labelBn ||
          "",
        color:
          (window.__ArixGear_BADGES__ || {})[badgeKey]?.color || legacy.color,
      }
    : null;

  let sizes = null;
  if (p.sizeStocks && p.sizeStocks.length) {
    sizes = p.sizeStocks.map((x) => ({
      s: x.s,
      stock: Math.max(0, +x.stock || 0),
      price: 0,
    }));
  } else if (p.sizes && p.sizes.length) {
    sizes = p.sizes.map((s) => ({ s, stock: +p.stock > 0 ? 5 : 0, price: 0 }));
  }
  if (sizes) {
    const pm = {};
    (p.sizePrices || []).forEach((x) => {
      if (x && x.s) pm[x.s] = +x.price || 0;
    });
    sizes.forEach((x) => {
      x.price = pm[x.s] > 0 ? pm[x.s] : price;
    });
  }

  return {
    id: p.slug,
    name: p.name,
    nameBn: p.nameBn || "" ,
    cat: CAT_LABEL[p.category] || (p.category ? capSlug(p.category) : "Gear"),
    catBn: CAT_LABEL_BN[p.category] || "",
    catSlug: p.category || "" ,
    price,
    compare,

    stock: Math.max(0, +p.stock || 0),
    badgeKey: badge ? badge.key : null,
    badgeLabel: badge ? badge.label : null,
    badgeLabelBn: badge ? badge.labelBn || "" : null,
    badgeColor: badge ? badge.color : null,
    rating: +p.rating > 0 ? +p.rating : 4.8,
    reviews: +p.reviews > 0 ? Math.round(+p.reviews) : 0,
    sold: +p.sold || 0 ,
    views: +p.views || 0 ,
    images: imgs,
    img: thumbs[0] || imgs[0] || "",
    alt: imgs[1] || null,
    imgFull: imgs[0] || "" ,

    specBadges: (p.specBadges || []).map((b) => ({
      k: b.k,
      label: b.label,
      labelBn: b.labelBn || "",
      icon: b.icon || "",
      v: b.v,
    })),
    colors: (p.colors || []).map((c) => ({
      n: c.name || c.n || "Default",
      nBn: c.nameBn || c.nBn || "",
      h: c.hex || c.h || "#0d0d0f",
      img: fix(c.image || "") || null,
    })),
    sizes,
    desc: p.description || p.shortDesc || "",
    descBn: p.descriptionBn || p.shortDescBn || "",
    shortDescBn: p.shortDescBn || "",
    specs: (p.specs || []).map((x) => (Array.isArray(x) ? x : [x.k, x.v])),
    specsBn: (p.specsBn || []).map((x) => (Array.isArray(x) ? x : [x.k, x.v])),

    specValues: (p.specValues || []).map((s) => ({
      g: s.g || "general",
      k: s.k,
      v: s.v,
    })),
    features: (p.features || []).map(String),
    featuresBn: (p.featuresBn || []).map(String),
    hideEmptySpecs: p.hideEmptySpecs !== false,

    brand: p.brand
      ? {
          name: p.brand.name || "",
          slug: p.brand.slug || "",
          logo: p.brand.logo || "",
        }
      : null,
    warranty: p.warranty
      ? {
          months: +p.warranty.months || 0,
          type: p.warranty.type || "none",
          note: p.warranty.note || "",
        }
      : null,
    variantLabel: p.variantLabel || "",
    variantLabelBn: p.variantLabelBn || "",
    sku: p.sku || "",
    createdAt: p.createdAt || "" ,

    seo: p.seo || null,

    sizeGuide: p.sizeGuide || null,

    flash:
      p.flashLive && p.flashEnds
        ? {
            endsAt: p.flashEnds,
            off: compare ? Math.round((1 - price / compare) * 100) : 0,
          }
        : null,

    deal: p.dealLive
      ? {
          badge: p.dealBadge || "",
          slug: p.dealSlug || "",
          name: p.dealName || "",
          type: p.dealType || "",
          endsAt: p.dealEnds || null,
          off: compare ? Math.round((1 - price / compare) * 100) : 0,
        }
      : null,
    dealBogo: p.dealBogo
      ? {
          buyQty: +p.dealBogo.buyQty || 2,
          getQty: +p.dealBogo.getQty || 1,
          badge: p.dealBogo.badge || "BOGO",
        }
      : null,
  };
}

export function firstStock(p) {
  if (!p) return null;
  if (p.sizes) {
    const f = p.sizes.find((x) => x.stock > 0);
    return f ? f.s : p.sizes[0].s;
  }
  return null;
}

export function stockFor(p, size) {
  if (!p) return null;
  if (p.sizes && p.sizes.length) {
    if (!size) return p.sizes.reduce((a, x) => a + x.stock, 0);
    const hit = p.sizes.find(
      (x) => String(x.s).toLowerCase() === String(size).toLowerCase(),
    );
    return hit ? Math.max(0, +hit.stock || 0) : null;
  }
  return Math.max(0, +p.stock || 0);
}

export const adaptOne = adaptProduct;

const Ctx = createContext(null);

export function CatalogProvider({ children }) {
  const [raw, setRaw] = useState(readCachedProducts);
  const [src, setSrc] = useState(() => {
    const cached = readCatalogCache(
      "arixgear_catalog_raw",
      (value) => value && value.items,
    );
    const adapted = readCatalogCache(
      "arixgear_catalog",
      (value) => value && value.products,
    );
    return cached.length || adapted.length ? "cache" : "api";
  });
  const [ready, setReady] =
    useState(false);
  const [catsReady, setCatsReady] = useState(false);
  const [cats, setCats] = useState(() =>
    readCatalogCache("arixgear_categories", (cached) => cached && cached.items)
      .map((category) => category.name)
      .filter(Boolean),
  );
  const [catObjs, setCatObjs] = useState(() =>
    readCatalogCache(
      "arixgear_categories",
      (cached) => cached && cached.items,
    ).map((category) => ({
      slug: category.slug,
      name: category.name,
      nameBn: category.nameBn || "",
      image: category.image?.url || category.image || "",
      parent: category.parent || null,
      productCount: +category.productCount || 0,
    })),
  );
  const [badges, setBadges] = useState(
    {},
  );

  const load = useCallback(async () => {
    try {
      const ctrl =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const tm = ctrl ? setTimeout(() => ctrl.abort(), 2500) : null;
      const d = await listProducts({
        limit: "60",
        sort: "featured",
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (tm) clearTimeout(tm);
      const items = (d.items || []).filter(Boolean);
      if (items.length) {
        setRaw(items);
        setSrc("api");
        try {
          localStorage.setItem(
            "arixgear_catalog_raw",
            JSON.stringify({ at: Date.now(), items }),
          );
        } catch (e) {}
      }
    } catch (e) {

      try {
        const cached = JSON.parse(
          localStorage.getItem("arixgear_catalog_raw") ||
            localStorage.getItem("arixgear_catalog") ||
            "null",
        );
        const items = cached && (cached.items || cached.products);
        if (Array.isArray(items) && items.length) {
          setRaw(items);
          setSrc("cache");
        }
      } catch (err) {

      }
    }
  }, []);

  const loadCats = useCallback(async () => {
    try {
      const d = await listCategories();
      const items = (d && Array.isArray(d.items) ? d.items : []).filter(
        (c) => c && c.name,
      );
      if (items.length) {
        items.forEach((c) => {
          if (c.slug) {
            CAT_LABEL[c.slug] = c.name;
            CAT_LABEL_BN[c.slug] = c.nameBn || "";
          }
        });
        setCatObjs(
          items.map((c) => ({
            slug: c.slug,
            name: c.name,
            nameBn: c.nameBn || "",
            image: c.image?.url || c.image || "",
            parent: c.parent || null,
            productCount: +c.productCount || 0,
          })),
        );
        setCats(items.map((c) => c.name));
        try {
          localStorage.setItem(
            "arixgear_categories",
            JSON.stringify({ items }),
          );
        } catch {}
      }
    } catch (e) {

    }
  }, []);

  const loadBadges = useCallback(async () => {
    try {
      const d = await listBadges();
      const map = {};
      (d && Array.isArray(d.items) ? d.items : []).forEach((b) => {
        if (b && b.key)
          map[b.key] = {
            label: b.label,
            labelBn: b.labelBn || "",
            color: b.color,
          };
      });
      if (Object.keys(map).length) setBadges(map);
    } catch (e) {

    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setReady(true);
    })();
    loadCats().finally(() => setCatsReady(true));
    loadBadges();
  }, [load, loadCats, loadBadges]);

  if (typeof window !== "undefined") window.__ArixGear_BADGES__ = badges;

  const products = useMemo(() => {
    const items = raw.map(adaptProduct).filter(Boolean);
    if (items.length && src === "api") {
      try {
        localStorage.setItem(
          "arixgear_catalog",
          JSON.stringify({ at: Date.now(), products: items }),
        );
      } catch (e) {}
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, cats, badges, src]);

  const derivedCats = cats.length
    ? cats
    : Array.from(new Set(products.map((p) => p.cat).filter(Boolean)));

  const value = {
    PRODUCTS: products,
    BY_ID: Object.fromEntries(products.map((p) => [p.id, p])),
    CATS: derivedCats,
    CAT_OBJS: catObjs ,
    CATALOG_SRC: src,
    READY: ready,
    CAT_READY: catsReady,
  };

  if (typeof window !== "undefined") {
    window.CATALOG_SRC = src;
    window.PRODUCTS = products;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCatalog = () => useContext(Ctx);
