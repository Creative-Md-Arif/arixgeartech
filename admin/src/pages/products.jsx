/* ArixGear ADMIN page — Products (React port of legacy products.html)
   GET /admin/products · POST /admin/products (multipart images[]) · PUT /admin/products/:id (multipart newImages[])
   inline price/stock save per row · active toggle · New/Edit drawer · delete with confirm.
   Form is fully admin-driven: categories + badges load live from the Catalog
   (new ones created in Admin → Catalog appear here instantly);
   sizes carry per-size price + stock rows; colors carry a per-color image. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal, useDrawer } from '../components/Overlays.jsx';
import { useConfirm, usePrompt } from '../components/ui.jsx';
import { money, pickImages } from '../lib/admin.js';
import { list as listProducts, create as createProduct, update as updateProduct, patch as patchProduct, remove as removeProduct, bulk as bulkProducts, duplicate as duplicateProduct, exportCsvPath, importCsv } from '../services/products.js';
import { download } from '../services/http.js';
import { list as listCategories } from '../services/categories.js';
import { list as listBrands } from '../services/brands.js';
import { list as listBadges } from '../services/badges.js';
import { uploadOne } from '../services/uploads.js';
import { getPublicSizeGuide } from '../services/settings.js';
import GuideEditor from '../components/GuideEditor.jsx';
import SpecValuesEditor from '../components/SpecValuesEditor.jsx';
import { useDragState, makeDragHandlers } from '../components/dnd.jsx';
import { AccSection, AccChip, useAccordion, AccBulkButtons } from '../components/Accordion.jsx';
import { tr } from '../lib/i18n.jsx';

const SORTS = [
  ['newest', 'Newest first'], ['oldest', 'Oldest first'],
  ['name-asc', 'Name A→Z'], ['name-desc', 'Name Z→A'],
  ['price-asc', 'Price low→high'], ['price-desc', 'Price high→low'],
  ['stock-asc', 'Stock low→high'], ['stock-desc', 'Stock high→low'],
];

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4';
const FULL = 'md:col-span-2 lg:col-span-4';
const SKEL_BAR = 'animate-pulse rounded bg-line/60';

/* Keep the loading shell dimensionally identical to the products view.  The
   row count follows the selected page size so changing "Per page" never makes
   the loading state jump between unrelated heights. */
function ProductListSkeleton({ rows = 20 }) {
  const safeRows = Math.max(1, Math.min(100, Number(rows) || 20));
  const cell = (className = '') => <span className={SKEL_BAR + ' inline-block ' + className} />;
  return (
    <div data-testid="productsSkeleton" aria-busy="true" aria-label="Loading products">
      <div className="mb-4 flex min-h-[34px] flex-wrap items-center gap-3">
        {cell('h-3 w-[74px]')}
        <div className="flex-1" />
        {cell('h-8 w-[92px]')}
        {cell('h-8 w-[92px]')}
        {cell('h-8 w-[126px]')}
      </div>

      <div className="mb-3 flex min-h-[53px] flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3">
        {cell('h-8 w-[240px]')}
        {cell('h-8 w-[118px]')}
        {cell('h-8 w-[105px]')}
        {cell('h-8 w-[104px]')}
        {cell('h-8 w-[128px]')}
        <div className="ml-auto" />
        {cell('h-8 w-[78px]')}
        {cell('h-3 w-[188px]')}
      </div>

      <div className="tbl-wrap overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full text-[13px]" aria-hidden="true">
          <thead>
            <tr className="h-[42px] text-left">
              {Array.from({ length: 11 }, (_, i) => i).map((i) => (
                <th key={i} className="px-3 py-2.5">
                  {cell('h-2.5')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: safeRows }, (_, row) => (
              <tr key={row} className="h-[76px] border-b border-line last:border-b-0">
                <td className="px-3 py-2.5">{cell('h-4 w-4')}</td>
                <td className="px-3 py-2.5">{cell('h-11 w-11 rounded-[7px]')}</td>
                <td className="px-3 py-2.5">
                  {cell('h-3 w-[76%]')}
                  {cell('mt-2 block h-2.5 w-[54%] opacity-70')}
                  {cell('mt-2 block h-4 w-[66px] opacity-60')}
                </td>
                <td className="px-3 py-2.5">{cell('h-5 w-[78px] rounded-full')}</td>
                <td className="px-3 py-2.5">
                  {cell('h-8 w-[96px] rounded-md')}
                  {cell('mt-1 block h-2.5 w-[64px] opacity-60')}
                </td>
                <td className="px-3 py-2.5">{cell('h-8 w-[76px] rounded-md')}</td>
                <td className="px-3 py-2.5">{cell('h-3 w-6')}</td>
                <td className="px-3 py-2.5">{cell('h-3 w-6')}</td>
                <td className="px-3 py-2.5">{cell('h-5 w-[62px] rounded-full')}</td>
                <td className="px-3 py-2.5">{cell('h-[21px] w-[38px] rounded-full')}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {cell('h-7 w-[44px] rounded-lg')}
                    {cell('h-7 w-[66px] rounded-lg')}
                    {cell('h-7 w-[78px] rounded-lg')}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button type="button" aria-pressed={on} title={on ? 'Active' : 'Hidden'} onClick={onClick}
      className={'relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors ' + (on ? 'bg-acc' : 'bg-line2')}>
      <span className={'absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all ' + (on ? 'left-[20px] bg-white' : 'left-[3px] bg-[#888]')} />
    </button>
  );
}

/* live catalog options — categories + badges come from the API (admin-managed) */
function useCatalogOptions() {
  const [cats, setCats] = useState([]); /* tree-labeled: parent → child */
  const [catDocs, setCatDocs] = useState([]); /* Step 5 — full docs (specGroups + hideEmptyFields ride along) */
  const [brands, setBrands] = useState([{ id: '', name: '— no brand —' }]);
  const [badgeOpts, setBadgeOpts] = useState([{ key: 'none', label: '— none —' }, { key: 'new', label: 'new' }, { key: 'sale', label: 'sale' }, { key: 'best-seller', label: 'best-seller' }]);
  useEffect(() => {
    /* Phase 5 — tree-labeled category options (parent → child) so the form
       cannot accidentally file a sub-category at root level */
    listCategories().then((d) => {
      const flat = (d.items || []).filter((c) => c.slug);
      if (flat.length) {
        setCatDocs(flat);
        const byId = Object.fromEntries(flat.map((c) => [c._id, c]));
        setCats(flat.map((c) => ({
          slug: c.slug,
          label: (c.path && c.path.length > 1)
            ? (byId[c.parent]?.name || c.path[0]) + ' → ' + c.name
            : c.name,
        })));
      }
    }).catch(() => {});
    listBrands().then((d) => {
      const items = (d.items || []).map((b) => ({ id: b.slug || b._id, name: b.name }));
      if (items.length) setBrands([{ id: '', name: '— no brand —' }, ...items]);
    }).catch(() => {});
    listBadges().then((d) => {
      const items = (d.items || []).map((b) => ({ key: b.key, label: b.label + ' (' + b.key + ')' }));
      if (items.length) setBadgeOpts([{ key: 'none', label: '— none —' }, ...items]);
    }).catch(() => {});
  }, []);
  return { cats, catDocs, badgeOpts, brands };
}

/* Step 5 — normalize a raw key (same doctrine as the backend slugify) */
const keyOf = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Step 5 — map legacy label-keyed rows onto the category schema fields where
   a match exists (auto-migration on edit); everything else stays an orphan
   and is preserved verbatim. */
function remapLegacyRows(rows, schema) {
  if (!schema || !schema.length) return rows;
  const byKey = new Map(schema.flatMap((g) => (g.fields || []).map((f) => [f.key, { g: g.key, k: f.key }])));
  const byLabel = new Map(schema.flatMap((g) => (g.fields || []).map((f) => [String(f.label).toLowerCase(), { g: g.key, k: f.key }])));
  const seen = new Set();
  return rows.map((r) => {
    const hit = byKey.get(r.k) || byLabel.get(String(r.k).toLowerCase());
    if (hit) { seen.add(hit.g + '|' + hit.k); return { g: hit.g, k: hit.k, v: r.v }; }
    return r;
  });
}

/* ---------- size rows editor: size | price (optional) | stock (optional) ---------- */
function SizeRows({ rows, setRows }) {
  const set = (i, f, v) => setRows((r) => r.map((x, ix) => (ix === i ? { ...x, [f]: v } : x)));
  return (
    <div className={FULL}>
      <label>Sizes — price (৳) and stock per size (empty = base price / general stock)</label>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2" data-sizerow={i}>
            <input className="w-[110px]" placeholder="e.g. XL" value={r.s} onChange={(e) => set(i, 's', e.target.value)} aria-label="Size label" />
            <input className="w-[120px]" type="number" min="0" placeholder="price ৳" value={r.price} onChange={(e) => set(i, 'price', e.target.value)} aria-label="Size price" />
            <input className="w-[100px]" type="number" min="0" placeholder="stock" value={r.stock} onChange={(e) => set(i, 'stock', e.target.value)} aria-label="Size stock" />
            <button type="button" className={GHOST_BTN} onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))}>✕</button>
          </div>
        ))}
        {!rows.length ? <p className="text-[12px] text-dim2">No sizes — one-size product.</p> : null}
      </div>
      <button type="button" className={GHOST_BTN + ' mt-2'} onClick={() => setRows((r) => [...r, { s: '', price: '', stock: '' }])}>+ Add size</button>
    </div>
  );
}

/* ---------- color rows editor: name | hex | per-color image ---------- */
function ColorRows({ rows, setRows, toast }) {
  const set = (i, f, v) => setRows((r) => r.map((x, ix) => (ix === i ? { ...x, [f]: v } : x)));
  const pickFor = (i) => pickImages(async (files) => {
    try {
      const d = await uploadOne(files[0]);
      set(i, 'image', d.image.url);
      toast('Color image uploaded ✓', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }, false);
  return (
    <div className={FULL}>
      <label>Colors — selecting a color on the PDP switches to this photo (optional)</label>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2" data-colorrow={i}>
            <input className="w-[130px]" placeholder="e.g. Blackout" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} aria-label="Color name" />
            <input className="w-[130px]" placeholder="রঙের নাম (বাংলা)" value={r.nameBn || ''} onChange={(e) => set(i, 'nameBn', e.target.value)} aria-label="Color name Bangla" />
            <input type="color" className="h-[34px] w-[52px] cursor-pointer" value={/^#[0-9a-fA-F]{6}$/.test(r.hex) ? r.hex : '#111114'} onChange={(e) => set(i, 'hex', e.target.value)} aria-label="Color swatch" />
            {r.image ? <img src={r.image} alt="" className="h-9 w-9 rounded-md border border-line2 object-cover" /> : null}
            <button type="button" className={GHOST_BTN} onClick={() => pickFor(i)}>{r.image ? 'Change photo' : 'Upload photo'}</button>
            <button type="button" className={GHOST_BTN} onClick={() => set(i, 'image', '')}>Clear</button>
            <button type="button" className={GHOST_BTN} onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))}>✕</button>
          </div>
        ))}
        {!rows.length ? <p className="text-[12px] text-dim2">No colors yet.</p> : null}
      </div>
      <button type="button" className={GHOST_BTN + ' mt-2'} onClick={() => setRows((r) => [...r, { name: '', hex: '#111114', image: '' }])}>+ Add color</button>
    </div>
  );
}

/* ---------- New / Edit product modal (multipart exactly like legacy) ---------- */
/* ---------- Task 57 — Flash Sale scheduler modal ---------- */
const dtLocal = (d) => {
  if (!d) return '';
  const x = new Date(d), pad = (n) => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) + 'T' + pad(x.getHours()) + ':' + pad(x.getMinutes());
};
const flashState = (p) => {
  const f = p && p.flash;
  if (!f || !+f.price || !f.startsAt || !f.endsAt) return null;
  const now = Date.now();
  if (now < +new Date(f.startsAt)) return { live: false, label: '⏰ starts ' + new Date(f.startsAt).toLocaleDateString() };
  if (now > +new Date(f.endsAt)) return { live: false, label: 'expired' };
  return { live: true, label: '⚡ ' + money(f.price) + ' · ends ' + new Date(f.endsAt).toLocaleDateString() };
};

function FlashForm({ p, onDone }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [price, setPrice] = useState(p.flash && +p.flash.price ? p.flash.price : '');
  const [startsAt, setStartsAt] = useState(dtLocal(p.flash && p.flash.startsAt));
  const [endsAt, setEndsAt] = useState(dtLocal(p.flash && p.flash.endsAt));
  const [busy, setBusy] = useState(false);
  const base = p.price;

  const save = async (clear) => {
    setBusy(true);
    try {
      const body = clear
        ? { flash: JSON.stringify({ price: 0 }) }
        : { flash: JSON.stringify({ price: Number(price), startsAt: startsAt ? new Date(startsAt).toISOString() : '', endsAt: endsAt ? new Date(endsAt).toISOString() : '' }) };
      await patchProduct(p._id, body);
      toast(clear ? 'Flash sale cleared — ' + p.name : 'Flash sale saved — ' + p.name, 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <div className="w-[min(520px,92vw)]" data-testid="flashForm">
      <h2 className="text-[17px]">⚡ Flash Sale — {p.name}</h2>
      <p className="mt-1 text-[12px] text-dim2">Base price {money(base)}. While the window is live the storefront and every new order charge the flash price; it starts and ends by itself.</p>
      <div className="mt-4 space-y-3">
        <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim">Flash price (৳)</span>
          <input id="ffPrice" type="number" min="1" step="1" value={price} onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc" placeholder={'e.g. ' + Math.max(1, Math.round(base * 0.6))} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim">Starts</span>
            <input id="ffStart" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc" /></label>
          <label className="block"><span className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim">Ends</span>
            <input id="ffEnd" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc" /></label>
        </div>
        {price && base && +price >= base ? <p className="text-[11.5px] text-red" id="ffWarn">Flash price is not below the base price — customers will see no discount.</p> : null}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        {p.flash && +p.flash.price ? <button id="ffClear" className={RED_BTN} disabled={busy} onClick={() => save(true)}>Clear Sale</button> : null}
        <button id="ffCancel" className={GHOST_BTN} onClick={closeModal} disabled={busy}>Cancel</button>
        <button id="ffSave" className={ACC_BTN} disabled={busy || !price || !startsAt || !endsAt} onClick={() => save(false)}>Save Flash Sale</button>
      </div>
    </div>
  );
}

function ProductForm({ p, onDone }) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const toast = useToast();
  const { closeDrawer } = useDrawer();
  const { cats, catDocs, badgeOpts, brands } = useCatalogOptions();
  const isNew = !p;
  const [name, setName] = useState(p?.name || '');
  const [nameBn, setNameBn] = useState(p?.nameBn || ''); // Task 58 — Bengali display name
  const [category, setCategory] = useState(p?.category || '');
  const [badge, setBadge] = useState(p?.badge || 'none');
  const [price, setPrice] = useState(p?.price ?? '');
  const [comparePrice, setComparePrice] = useState(p?.comparePrice ?? '');
  const [stock, setStock] = useState(p?.stock ?? 25);
  const [shortDesc, setShortDesc] = useState(p?.shortDesc || '');
  const [shortDescBn, setShortDescBn] = useState(p?.shortDescBn || ''); // Task 58
  const [description, setDescription] = useState(p?.description || '');
  const [descriptionBn, setDescriptionBn] = useState(p?.descriptionBn || ''); // Task 58
  /* Step 5 — DYNAMIC SPEC STATE (canonical rows) + key features + hide-empty.
     Legacy label-keyed specs map onto schema fields as soon as the schema is
     known (remapLegacyRows); everything unknown survives as an orphan row. */
  const [specValues, setSpecValues] = useState(() => {
    if (Array.isArray(p?.specValues) && p.specValues.length) return p.specValues.map((s) => ({ g: s.g || 'general', k: s.k, v: s.v }));
    return (p?.specs || []).map((s) => ({ g: 'general', k: s.k, v: s.v }));
  });
  const [hideEmptySpecs, setHideEmptySpecs] = useState(p ? p.hideEmptySpecs !== false : true);
  const [features, setFeatures] = useState(() => (p?.features || []).map(String));
  const [featured, setFeatured] = useState(!!p?.featured);
  const [active, setActive] = useState(!p || p.active);

  /* Phase 5 (5.4) — v2 catalog tech fields + inline SEO */
  const [brand, setBrand] = useState(p?.brand?.slug || p?.brandSlug || '');
  const [sku, setSku] = useState(p?.sku || '');
  const [warranty, setWarranty] = useState({
    months: p?.warranty?.months ?? 0,
    type: p?.warranty?.type || 'manufacturer',
    note: p?.warranty?.note || '',
  });
  const [variantLabel, setVariantLabel] = useState(p?.variantLabel || '');
  const [variantLabelBn, setVariantLabelBn] = useState(p?.variantLabelBn || '');
  const [seo, setSeo] = useState({
    metaTitle: p?.seo?.metaTitle || '',
    metaDescription: p?.seo?.metaDescription || '',
    metaKeywords: p?.seo?.metaKeywords || '',
  });
  const setW = (k, v) => setWarranty((w) => ({ ...w, [k]: v }));
  const setS = (k, v) => setSeo((s) => ({ ...s, [k]: v }));

  /* sizes merged: sizes[] + sizeStocks + sizePrices → editable rows */
  const [sizeRows, setSizeRows] = useState(() => {
    const labels = (p?.sizes || []).slice();
    if (!labels.length && p?.sizeStocks?.length) p.sizeStocks.forEach((x) => { if (!labels.includes(x.s)) labels.push(x.s); });
    const sp = {}; (p?.sizePrices || []).forEach((x) => { sp[x.s] = x.price; });
    const st = {}; (p?.sizeStocks || []).forEach((x) => { st[x.s] = x.stock; });
    return labels.map((s) => ({ s, price: sp[s] ?? '', stock: st[s] ?? '' }));
  });
  const [colorRows, setColorRows] = useState(() => (p?.colors || []).map((c) => ({ name: c.name || '', nameBn: c.nameBn || '', hex: c.hex || '#111114', image: c.image || '' }))); // Task 58 — nameBn

  /* Task 32 — per-product size guide (inherit/custom) */
  const [sgMode, setSgMode] = useState(p?.sizeGuide?.mode === 'custom' ? 'custom' : 'inherit');
  const [sg, setSg] = useState(() => ({
    enabled: p?.sizeGuide ? p.sizeGuide.enabled !== false : true,
    title: (p?.sizeGuide && p.sizeGuide.title) || 'Size Guide',
    titleBn: (p?.sizeGuide && p.sizeGuide.titleBn) || '', // Task 58
    note: (p?.sizeGuide && p.sizeGuide.note) || '',
    noteBn: (p?.sizeGuide && p.sizeGuide.noteBn) || '', // Task 58
    headers: p?.sizeGuide?.headers?.length ? [...p.sizeGuide.headers] : ['Size', 'Chest (cm)', 'Waist (cm)'],
    rows: p?.sizeGuide?.rows?.length ? p.sizeGuide.rows.map((r) => [...r]) : [['S', '', ''], ['M', '', ''], ['L', '', '']],
  }));
  const [sgSrc, setSgSrc] = useState(null); /* global + category tables for the copy buttons */
  useEffect(() => { getPublicSizeGuide().then((d) => setSgSrc({ global: d?.sizeGuide || null, cats: d?.categoryGuides || [] })).catch(() => {}); }, []);

  /* Task 34 — 7 accordion sections + validation auto-open */
  const PF_SECTIONS = ['basic', 'tech', 'pricing', 'variants', 'images', 'desc', 'seo', 'sizeguide', 'visibility'];
  const acc = useAccordion(['basic']);

  /* Step 5 — the category's live spec schema (rides the public categories
     payload). A field added in Catalog → Specs shows up here instantly. */
  const specSchema = useMemo(() => {
    const doc = (catDocs || []).find((c) => c.slug === (category || ''));
    return (doc && Array.isArray(doc.specGroups) ? doc.specGroups : []).map((g) => ({
      ...g,
      fields: [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    })).sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [catDocs, category]);
  /* legacy → schema remap whenever the schema becomes available */
  useEffect(() => {
    if (!specSchema.length) return;
    setSpecValues((rows) => {
      const remapped = remapLegacyRows(rows, specSchema);
      const changed = JSON.stringify(remapped) !== JSON.stringify(rows);
      return changed ? remapped : rows;
    });
  }, [specSchema]);

  /* Step 5 — DnD IMAGE MANAGER state: one unified order of old + new tiles.
     tokens: {kind:'old', token: publicId||url} | {kind:'new', uid} — new:uid
     maps to 'new:<i>' (pending-array position) at save time. */
  const [images] = useState(p?.images || []); /* old images (immutable list; removals ride imageOrder absence) */
  const oldToken = (im) => im.publicId || im.url;
  const [pending, setPending] = useState([]); /* {uid, file, previewUrl, alt} */
  const [imgOrder, setImgOrder] = useState(() => (p?.images || []).map((im) => ({ kind: 'old', token: im.publicId || im.url })));
  const [alts, setAlts] = useState(() => Object.fromEntries((p?.images || []).map((im) => [oldToken(im), im.alt || ''])));
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((pf) => URL.revokeObjectURL(pf.previewUrl)), []);
  const addFiles = (files) => {
    const items = [...files].map((f) => ({ uid: 'u' + Date.now() + Math.random().toString(36).slice(2, 7), file: f, previewUrl: URL.createObjectURL(f), alt: '' }));
    setPending((list) => [...list, ...items]);
    setImgOrder((order) => [...order, ...items.map((it) => ({ kind: 'new', uid: it.uid }))]);
  };
  const dragRef = useDragState();
  const imgDrag = makeDragHandlers(dragRef, 'imgs', (from, to) => {
    setImgOrder((order) => { const n = [...order]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
  });
  const setMain = (ix) => setImgOrder((order) => { const n = [...order]; const [m] = n.splice(ix, 1); return [m, ...n]; });
  const removeTile = (ix) => {
    const tok = imgOrder[ix];
    if (tok.kind === 'new') {
      const pf = pending.find((x) => x.uid === tok.uid);
      if (pf) URL.revokeObjectURL(pf.previewUrl);
      setPending((list) => list.filter((x) => x.uid !== tok.uid));
    }
    setImgOrder((order) => order.filter((_, i) => i !== ix));
  };
  const editAlt = async (ix) => {
    const tok = imgOrder[ix];
    const cur = tok.kind === 'old' ? (alts[tok.token] || '') : (pending.find((x) => x.uid === tok.uid) || {}).alt || '';
    const v = await prompt({ title: tr('Image alt text'), body: tr('Describes the image for screen readers + SEO:'), placeholder: 'Front view of the gaming laptop', ok: 'Save alt' });
    if (v === null) return;
    if (tok.kind === 'old') setAlts((a) => ({ ...a, [tok.token]: v }));
    else setPending((list) => list.map((x) => (x.uid === tok.uid ? { ...x, alt: v } : x)));
  };
  const altOf = (tok) => (tok.kind === 'old' ? (alts[tok.token] || '') : (pending.find((x) => x.uid === tok.uid) || {}).alt || '');

  /* Task 32 — copy the global / category table into this product's custom draft */
  const copyGuide = (src, label) => {
    if (!src || !Array.isArray(src.headers) || !src.headers.length) { toast(label + ' has no table yet', 'err'); return; }
    setSgMode('custom');
    setSg((g) => ({
      ...g,
      title: src.title || g.title,
      note: src.note || '',
      headers: src.headers.map((h) => String(h)),
      rows: (src.rows || []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : [String(r)])),
    }));
    toast('Table copied from ' + label + ' — edit freely, then Save', 'ok');
  };

  const del = async () => {
    if (!(await confirm({ title: 'Delete product', body: 'Delete "' + p.name + '" permanently? Images are removed too.', danger: true, ok: 'Delete' }))) return;
    setBusy(true);
    try {
      await removeProduct(p._id);
      toast('Product deleted', 'ok');
      closeDrawer(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  /* publish = true (default) · draft = false — the list's status filter and
     the storefront hide drafts; duplicate-as-draft keeps the same flag. */
  const save = async (publishOverride) => {
    if (!name.trim() || price === '') {
      acc.openOnly([!name.trim() ? 'basic' : 'pricing']);
      return toast('Name and price are required', 'err');
    }
    const tileCount = imgOrder.length;
    if (isNew && tileCount === 0) { acc.openOnly(['images']); return toast('At least one image is required', 'err'); }
    if (!isNew && tileCount === 0) { acc.openOnly(['images']); return toast('Product must keep at least one image', 'err'); }
    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('nameBn', nameBn.trim()); // Task 58 — Bengali twins ride the same multipart
    fd.append('category', category || 'accessories');
    fd.append('badge', badge);
    fd.append('price', price);
    fd.append('stock', stock === '' || stock == null ? '0' : String(stock));
    fd.append('featured', String(featured));
    fd.append('active', String(publishOverride === undefined ? active : publishOverride));
    if (comparePrice !== '' && comparePrice != null) fd.append('comparePrice', comparePrice);
    if (shortDesc) fd.append('shortDesc', shortDesc);
    fd.append('shortDescBn', shortDescBn.trim()); // Task 58 (always sent: '' clears)
    if (description) fd.append('description', description);
    fd.append('descriptionBn', descriptionBn.trim());
    /* Step 5 — CANONICAL SPEC VALUES: coerced + validated server-side against
       the category schema; the flat legacy specs/specsBn regenerate there, so
       compare/CSV/RAG/PDP all stay in sync with ONE source of truth. */
    fd.append('specValues', JSON.stringify(specValues));
    fd.append('hideEmptySpecs', String(hideEmptySpecs));
    fd.append('features', JSON.stringify(features.map((f) => String(f).trim()).filter(Boolean)));

    /* Phase 5 — v2 catalog tech fields */
    fd.append('brandSlug', brand || 'none');
    if (sku.trim()) fd.append('sku', sku.trim().toUpperCase());
    else if (!isNew) fd.append('sku', '');
    fd.append('warranty', JSON.stringify({ months: Number(warranty.months) || 0, type: warranty.type, note: warranty.note }));
    fd.append('variantLabel', variantLabel.trim());
    fd.append('variantLabelBn', variantLabelBn.trim());
    fd.append('seo', JSON.stringify(seo));

    /* size rows → sizes + sizePrices + sizeStocks (size-based pricing) */
    const szRows = sizeRows.map((r) => ({ ...r, s: r.s.trim() })).filter((r) => r.s);
    if (szRows.length) {
      fd.append('sizes', JSON.stringify(szRows.map((r) => r.s)));
      fd.append('sizePrices', JSON.stringify(szRows.filter((r) => +r.price > 0).map((r) => ({ s: r.s, price: +r.price }))));
      const ss = szRows.filter((r) => r.stock !== '' && r.stock != null).map((r) => ({ s: r.s, stock: +r.stock }));
      if (ss.length) fd.append('sizeStocks', JSON.stringify(ss));
    } else {
      fd.append('sizes', '[]');
      fd.append('sizePrices', '[]');
    }

    /* color rows → colors with optional per-color image */
    const colors = colorRows.filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), nameBn: (r.nameBn || '').trim(), hex: r.hex, ...(r.image ? { image: r.image } : {}) })); // Task 58
    fd.append('colors', JSON.stringify(colors));

    /* Task 32 — size guide block (always sent: inherit resets a previous custom) */
    fd.append('sizeGuide', JSON.stringify(sgMode === 'custom' ? {
      mode: 'custom',
      enabled: sg.enabled,
      title: sg.title.trim() || 'Size Guide',
      titleBn: (sg.titleBn || '').trim(), // Task 58
      note: sg.note.trim(),
      noteBn: (sg.noteBn || '').trim(),
      headers: sg.headers.map((h, i) => (h.trim() || 'Column ' + (i + 1)).slice(0, 40)),
      rows: sg.rows.map((r) => r.map((c) => String(c ?? '').trim().slice(0, 40))),
    } : { mode: 'inherit' }));

    /* Step 5 — DnD IMAGE MANAGER payload: full desired order (old tokens +
       new:<i> slots) + alt texts. images[0] = main shot. Dropped old images
       ride removeImages (Cloudinary cleanup); uploads ride newImages[] in
       pending-array order — the order tokens decide where they land. */
    if (!isNew) {
      const keptOld = new Set(imgOrder.filter((t) => t.kind === 'old').map((t) => t.token));
      const removed = (p.images || [])
        .filter((im) => !keptOld.has(oldToken(im)))
        .map((im) => im.publicId)
        .filter(Boolean);
      if (removed.length) fd.append('removeImages', JSON.stringify(removed));
    }
    if (!isNew) fd.append('imageOrder', JSON.stringify(imgOrder.map((t) => (t.kind === 'old' ? t.token : 'new:' + pending.findIndex((x) => x.uid === t.uid)))));
    const altMap = {};
    imgOrder.forEach((t) => { const a = altOf(t); if (a) altMap[t.kind === 'old' ? t.token : 'new:' + pending.findIndex((x) => x.uid === t.uid)] = a; });
    if (Object.keys(altMap).length) fd.append('imageAlts', JSON.stringify(altMap));
    pending.forEach((pf) => fd.append(isNew ? 'images' : 'newImages', pf.file));
    setBusy(true);
    try {
      if (isNew) await createProduct(fd);
      else await updateProduct(p._id, fd);
      toast(isNew ? 'Product created' : 'Product saved', 'ok');
      closeDrawer(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <AccBulkButtons ids={PF_SECTIONS} acc={acc} prefix="pf" />
      </div>
      <div className="space-y-2.5">
        <AccSection id="basic" icon="🏷" title="Basic Info" open={acc.isOpen('basic')} onToggle={() => acc.toggle('basic')}
          chips={<>
            <AccChip text={name.trim() ? '✓ ' + name.trim().slice(0, 16) : '— name'} tone={name.trim() ? 'green' : 'red'} />
            <AccChip text={category || '— category'} tone={category ? 'acc' : 'dim'} />
          </>}>
          <div className={FRM}>
            <div className={FULL}><label>Name *</label><input id="pfName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Apex Training Tee" /></div>
            <div className={FULL}><label>নাম (বাংলা) — Bengali name</label><input id="pfNameBn" value={nameBn} onChange={(e) => setNameBn(e.target.value)} placeholder="অ্যাপেক্স ট্রেনিং টি" /></div>
            <div>
              <label>Category <Link to="/catalog" className="ml-1 text-acc hover:underline" title="Create new categories">+ new</Link></label>
              <select id="pfCat" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— pick category —</option>
                {cats.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label>Badge <Link to="/catalog" className="ml-1 text-acc hover:underline" title="Create new badges">+ new</Link></label>
              <select id="pfBadge" value={badge} onChange={(e) => setBadge(e.target.value)}>
                {badgeOpts.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
          </div>
        </AccSection>

        {/* Phase 5 (5.4) — v2 catalog tech section: brand / SKU / warranty / variant axis */}
        <AccSection id="tech" icon="🔌" title="Tech Catalog — Brand, SKU, Warranty, Variant Axis" open={acc.isOpen('tech')} onToggle={() => acc.toggle('tech')}
          chips={<>
            <AccChip text={brand ? brand.toUpperCase() : 'no brand'} tone={brand ? 'acc' : 'dim'} />
            <AccChip text={sku.trim() ? sku.trim() : 'auto SKU'} tone={sku.trim() ? 'acc' : 'dim'} />
            <AccChip text={warranty.months > 0 ? warranty.months + 'mo warranty' : 'no warranty'} tone={warranty.months > 0 ? 'green' : 'dim'} />
          </>}>
          <div className={FRM}>
            <div>
              <label>Brand <Link to="/brands" className="ml-1 text-acc hover:underline" title="Manage brands">+ manage</Link></label>
              <select id="pfBrand" value={brand} onChange={(e) => setBrand(e.target.value)}>
                {brands.map((b) => <option key={b.id || 'none'} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label>SKU (stock-keeping unit — blank = auto ARG-…)</label>
              <input id="pfSku" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} placeholder="ARG-LAP-001" />
            </div>
            <div>
              <label>Warranty — months</label>
              <input id="pfWarrantyMonths" type="number" min="0" max="240" value={warranty.months} onChange={(e) => setW('months', e.target.value)} />
            </div>
            <div>
              <label>Warranty — type</label>
              <select id="pfWarrantyType" value={warranty.type} onChange={(e) => setW('type', e.target.value)}>
                {['manufacturer', 'seller', 'service', 'none'].map((tp) => <option key={tp} value={tp}>{tp}</option>)}
              </select>
            </div>
            <div className={FULL}>
              <label>Warranty note (shown beside the warranty chip)</label>
              <input id="pfWarrantyNote" value={warranty.note} onChange={(e) => setW('note', e.target.value)} placeholder="Official Lenovo BD warranty — 24 months" />
            </div>
            <div>
              <label>Variant axis label (e.g. "Configuration", "Storage")</label>
              <input id="pfVariantLabel" value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} />
            </div>
            <div>
              <label>Variant axis label (বাংলা)</label>
              <input value={variantLabelBn} onChange={(e) => setVariantLabelBn(e.target.value)} />
            </div>
          </div>
        </AccSection>

        {/* Phase 5 (5.4) — inline SEO: PDP meta overrides (blank = smart defaults) */}
        <AccSection id="seo" icon="🔎" title="Inline SEO — PDP Meta Override" open={acc.isOpen('seo')} onToggle={() => acc.toggle('seo')}
          chips={<AccChip text={seo.metaTitle || seo.metaDescription ? 'override set' : 'smart defaults'} tone={seo.metaTitle || seo.metaDescription ? 'acc' : 'dim'} />}>
          <div className={FRM}>
            <div className={FULL}>
              <label>Meta title (≤ 60 chars recommended)</label>
              <input id="pfSeoTitle" value={seo.metaTitle} onChange={(e) => setS('metaTitle', e.target.value)} placeholder={'Buy ' + (name || 'product') + ' in Bangladesh — arixgear.tech'} />
            </div>
            <div className={FULL}>
              <label>Meta description (≤ 160 chars recommended)</label>
              <textarea rows={2} id="pfSeoDesc" value={seo.metaDescription} onChange={(e) => setS('metaDescription', e.target.value)} placeholder="Short selling pitch that shows under the search result title." />
            </div>
            <div className={FULL}>
              <label>Keywords (comma-separated, optional)</label>
              <input value={seo.metaKeywords} onChange={(e) => setS('metaKeywords', e.target.value)} placeholder="gaming laptop, rtx, bd price" />
            </div>
          </div>
        </AccSection>

        <AccSection id="pricing" icon="💰" title="Pricing & Stock" open={acc.isOpen('pricing')} onToggle={() => acc.toggle('pricing')}
          chips={<>
            <AccChip text={price !== '' ? '৳' + (+price).toLocaleString('en-IN') : '— price'} tone={price !== '' ? 'acc' : 'red'} />
            {comparePrice !== '' && comparePrice != null ? <AccChip text={'was ৳' + (+comparePrice).toLocaleString('en-IN')} tone="dim" /> : null}
            <AccChip text={stock !== '' && stock != null ? 'stock ' + stock : 'stock 0'} tone={+stock > 5 ? 'green' : 'red'} />
          </>}>
          <div className={FRM}>
            <div><label>Base price (৳ BDT) *</label><input id="pfPrice" type="number" step="1" min="0" value={price} onChange={(e) => setPrice(Math.max(0, e.target.value))} /></div>
            <div><label>Compare-at price (৳)</label><input id="pfCompare" type="number" step="1" min="0" value={comparePrice} onChange={(e) => setComparePrice(Math.max(0, e.target.value))} placeholder="crossed-out price" /></div>
            <div><label>Stock (general)</label><input id="pfStock" type="number" min="0" value={stock} onChange={(e) => setStock(Math.max(0, e.target.value))} /></div>
          </div>
        </AccSection>

        <AccSection id="variants" icon="🎨" title="Variants — Sizes & Colors" open={acc.isOpen('variants')} onToggle={() => acc.toggle('variants')}
          chips={<>
            <AccChip text={sizeRows.filter((r) => r.s.trim()).length + ' SIZES'} tone={sizeRows.length ? 'acc' : 'dim'} />
            <AccChip text={colorRows.filter((r) => r.name.trim()).length + ' COLORS'} tone={colorRows.length ? 'acc' : 'dim'} />
          </>}>
          <div className={FRM}>
            <SizeRows rows={sizeRows} setRows={setSizeRows} />
            <ColorRows rows={colorRows} setRows={setColorRows} toast={toast} />
          </div>
        </AccSection>

        <AccSection id="images" icon="🖼" title={tr('Images — drag & drop manager')} open={acc.isOpen('images')} onToggle={() => acc.toggle('images')}
          chips={<>
            <AccChip text={imgOrder.length + ' IMG'} tone={imgOrder.length ? 'green' : 'red'} />
            <AccChip text={imgOrder.length ? '1st = main' : '—'} tone="dim" />
          </>}>
          <div className={FULL}>
            <label>{tr('Images * (JPG/PNG/WEBP · max 5MB each) — drag tiles to reorder, first tile is the main shot')}</label>
            <button type="button" id="pfDrop"
              className="w-full rounded-[10px] border-2 border-dashed border-line2 px-[18px] py-[18px] text-center text-[12.5px] text-dim2 hover:border-acc hover:bg-acc-dim hover:text-acc"
              onClick={() => pickImages(addFiles, true)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
              {tr('Drop images here or click to browse — reorder by dragging, hover a tile for actions')}
            </button>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5" id="pfImgs">
              {imgOrder.map((tok, ix) => {
                const src = tok.kind === 'old' ? (images.find((im) => (im.publicId || im.url) === tok.token) || {}).url : (pending.find((x) => x.uid === tok.uid) || {}).previewUrl;
                const alt = altOf(tok);
                return (
                  <div key={tok.kind === 'old' ? 'o-' + tok.token : 'n-' + tok.uid}
                    draggable onDragStart={imgDrag.onDragStart(ix)} onDragOver={imgDrag.onDragOver(ix)} onDrop={imgDrag.onDrop(ix)} onDragEnd={imgDrag.onDragEnd}
                    className={'group relative rounded-lg border bg-panel2 transition-opacity ' + (ix === 0 ? 'border-acc' : 'border-line2')}
                    data-imgtile={ix} title={tr('Drag to reorder')}>
                    <img src={src} alt={alt || ''} className="h-[74px] w-full rounded-lg object-cover" />
                    {ix === 0 ? <span className="absolute left-[3px] top-[3px] rounded-full bg-acc px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">{tr('main')}</span> : null}
                    {alt ? <span className="absolute bottom-[3px] left-[3px] right-[3px] truncate rounded bg-black/60 px-1 text-[8.5px] text-white" title={alt}>{alt}</span> : null}
                    <div className="absolute inset-0 hidden items-center justify-center gap-1 rounded-lg bg-black/55 group-hover:flex">
                      <button type="button" className="rounded-full bg-white/90 px-1.5 py-0.5 text-[9.5px] font-bold text-black" onClick={() => setMain(ix)} disabled={ix === 0}>{tr('main')}</button>
                      <button type="button" className="rounded-full bg-white/90 px-1.5 py-0.5 text-[9.5px] font-bold text-black" title={tr('Edit alt text')} onClick={() => editAlt(ix)}>ALT</button>
                      <button type="button" className="grid h-[19px] w-[19px] place-items-center rounded-full bg-red text-[11px] text-white" title={tr('Remove image')} onClick={() => removeTile(ix)}>✕</button>
                    </div>
                    <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[18px] text-white/0 group-hover:text-white/80">⠿</span>
                  </div>
                );
              })}
              {!imgOrder.length ? <div className="text-[12px] text-dim2">{tr('No images yet')}</div> : null}
            </div>
            <p className="mt-2 text-[11px] text-dim2">{tr('Tip — MAIN badge marks the PDP hero shot. ALT opens a text prompt (screen readers + SEO). Drag & drop works from the desktop too.')}</p>
          </div>
        </AccSection>

        <AccSection id="desc" icon="✏️" title={tr('Description · Key Features · Specs')} open={acc.isOpen('desc')} onToggle={() => acc.toggle('desc')}
          chips={<>
            {shortDesc.trim() ? <AccChip text="✓ short" tone="green" /> : null}
            {description.trim() ? <AccChip text="✓ full" tone="green" /> : null}
            <AccChip text={features.filter((f) => String(f).trim()).length + ' ' + tr('FEATURES')} tone={features.length ? 'acc' : 'dim'} />
            <AccChip text={specValues.length + ' ' + tr('SPECS')} tone={specValues.length ? 'green' : 'dim'} />
          </>}>
          <div className={FRM}>
            <div className={FULL}><label>{tr('Short description')}</label><input id="pfShort" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} /></div>
            <div className={FULL}><label>সংক্ষিপ্ত বিবরণ (বাংলা)</label><input id="pfShortBn" value={shortDescBn} onChange={(e) => setShortDescBn(e.target.value)} /></div>
            <div className={FULL}><label>{tr('Full description')}</label><textarea id="pfDesc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className={FULL}><label>পূর্ণ বিবরণ (বাংলা)</label><textarea id="pfDescBn" rows={3} value={descriptionBn} onChange={(e) => setDescriptionBn(e.target.value)} /></div>

            {/* Step 5 — KEY FEATURES: add · edit · reorder · remove (PDP checklist card) */}
            <div className={FULL} id="pfFeaturesBlock">
              <label>{tr('Key Features — the PDP checklist card (✓ highlights)')}</label>
              <div className="space-y-1.5">
                {features.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2" data-featurerow={fi}>
                    <span className="text-acc">✓</span>
                    <input className="flex-1" value={f} placeholder={tr('e.g. 16-hour battery life')}
                      aria-label={tr('Key feature')}
                      onChange={(e) => setFeatures((list) => list.map((x, ix) => (ix === fi ? e.target.value : x)))} />
                    <button type="button" className="rounded-lg border border-line2 px-2 py-1 text-[11px] text-dim hover:border-acc hover:text-acc disabled:opacity-40" aria-label={tr('Move up')} disabled={fi === 0} onClick={() => setFeatures((list) => { const n = [...list]; [n[fi - 1], n[fi]] = [n[fi], n[fi - 1]]; return n; })}>↑</button>
                    <button type="button" className="rounded-lg border border-line2 px-2 py-1 text-[11px] text-dim hover:border-acc hover:text-acc disabled:opacity-40" aria-label={tr('Move down')} disabled={fi === features.length - 1} onClick={() => setFeatures((list) => { const n = [...list]; [n[fi + 1], n[fi]] = [n[fi], n[fi + 1]]; return n; })}>↓</button>
                    <button type="button" className="rounded-lg border border-red/40 bg-red/10 px-2 py-1 text-[11px] font-bold text-red" aria-label={tr('Remove feature')} onClick={() => setFeatures((list) => list.filter((_, ix) => ix !== fi))}>✕</button>
                  </div>
                ))}
                {!features.length ? <p className="text-[12px] text-dim2">{tr('No key features yet — 3 to 6 short highlight lines work best.')}</p> : null}
              </div>
              <button type="button" className="mt-2 rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc" onClick={() => setFeatures((list) => [...list, ''])}>+ {tr('Add feature')}</button>
            </div>

            {/* Step 5 — dynamic spec editor: schema-driven, Fill, hide-empty */}
            <SpecValuesEditor
              schema={specSchema}
              values={specValues}
              onChange={setSpecValues}
              hideEmpty={hideEmptySpecs}
              onHideEmpty={setHideEmptySpecs}
              toast={toast}
            />
          </div>
        </AccSection>

        <AccSection id="sizeguide" icon="📏" title="Size Guide" open={acc.isOpen('sizeguide')} onToggle={() => acc.toggle('sizeguide')}
          chips={<AccChip text={sgMode === 'custom' ? (sg.enabled ? 'CUSTOM TABLE' : 'CUSTOM HIDDEN') : 'INHERIT'} tone={sgMode === 'custom' ? 'acc' : 'dim'} />}>
          <div className={FULL} id="pfSgBlock">
            <label>Size Guide — this product's PDP table</label>
          <div className="flex flex-wrap items-center gap-2.5">
            <select id="pfSgMode" className="w-auto" value={sgMode} onChange={(e) => setSgMode(e.target.value)}>
              <option value="inherit">INHERIT — category table → global fallback</option>
              <option value="custom">CUSTOM — this product's own table</option>
            </select>
            <button type="button" id="pfSgCopyGlobal" className={GHOST_BTN} title="Start a custom table pre-filled from the global table"
              onClick={() => copyGuide(sgSrc && sgSrc.global, 'global table')}>Copy global table</button>
            <button type="button" id="pfSgCopyCat" className={GHOST_BTN} title="Start a custom table pre-filled from this product's category table"
              onClick={() => copyGuide(sgSrc && (sgSrc.cats || []).find((x) => x.category === (category || 'accessories')), 'category table')}>Copy category table</button>
          </div>
          {sgMode === 'custom' ? (
            <div className="mt-3 rounded-lg border border-line p-3">
              <div className={FRM + ' mb-3'}>
                <div>
                  <label>Visibility</label>
                  <select id="pfSgEnabled" value={sg.enabled ? 'on' : 'off'} onChange={(e) => setSg((g) => ({ ...g, enabled: e.target.value === 'on' }))}>
                    <option value="on">SHOWN on this PDP</option>
                    <option value="off">HIDDEN — no guide on this PDP</option>
                  </select>
                </div>
                <div><label>Accordion title</label><input id="pfSgTitle" value={sg.title} onChange={(e) => setSg((g) => ({ ...g, title: e.target.value }))} /></div>
                <div><label>টাইটেল (বাংলা)</label><input id="pfSgTitleBn" value={sg.titleBn || ''} onChange={(e) => setSg((g) => ({ ...g, titleBn: e.target.value }))} /></div>
                <div className="md:col-span-2"><label>Helper note</label><input id="pfSgNote" value={sg.note} onChange={(e) => setSg((g) => ({ ...g, note: e.target.value }))} /></div>
                <div className="md:col-span-2"><label>নোট (বাংলা)</label><input id="pfSgNoteBn" value={sg.noteBn || ''} onChange={(e) => setSg((g) => ({ ...g, noteBn: e.target.value }))} /></div>
              </div>
              <GuideEditor value={sg} onChange={(h) => setSg((g) => ({ ...g, headers: h.headers, rows: h.rows }))} prefix="pfSg" />
            </div>
          ) : null}
          </div>
        </AccSection>

        <AccSection id="visibility" icon="👁" title="Visibility" open={acc.isOpen('visibility')} onToggle={() => acc.toggle('visibility')}
          chips={<>
            <AccChip text={active ? 'ACTIVE' : 'HIDDEN'} tone={active ? 'green' : 'red'} />
            {featured ? <AccChip text="FEATURED" tone="acc" /> : null}
          </>}>
          <div className="flex flex-wrap items-center gap-5">
            <label className="m-0 flex items-center gap-2 text-[13px] normal-case tracking-normal">
              <input id="pfFeatured" type="checkbox" className="w-auto" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured (home carousel)
            </label>
            <label className="m-0 flex items-center gap-2 text-[13px] normal-case tracking-normal">
              <input id="pfActive" type="checkbox" className="w-auto" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
          </div>
        </AccSection>
      </div>
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-5 flex flex-wrap items-center gap-2.5 border-t border-line bg-panel p-4">
        {isNew ? null : <button id="pfDelete" className={RED_BTN + ' mr-auto'} disabled={busy} onClick={del}>{tr('Delete')}</button>}
        <button id="pfCancel" className={GHOST_BTN} onClick={closeDrawer}>{tr('Cancel')}</button>
        {/* Step 5 — Save Draft / Publish: active flag rides the same multipart;
            the storefront + the list's status filter hide drafts instantly */}
        <button id="pfDraft" className={GHOST_BTN} disabled={busy} title={tr('Hidden from the storefront until published')}
          onClick={() => save(false)}>{isNew ? tr('Create as Draft') : tr('Save as Draft')}</button>
        <button id="pfSave" className={ACC_BTN} disabled={busy}
          onClick={() => save(true)}>{isNew ? tr('Create & Publish') : tr('Save & Publish')}</button>
      </div>
    </>
  );
}

/* ---------- products list ---------- */
function ProductsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { openModal } = useModal();
  const { openDrawer } = useDrawer();
  const [items, setItems] = useState(null); /* null = loading */
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({}); /* per-row inline edits { [id]: { price, stock } } */
  /* Task 27 — checkbox multi-select + bulk bar + CSV round-trip */
  const [sel, setSel] = useState(() => new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const csvInput = useRef(null);

  /* Task 35 — server-driven search + filters + sort */
  const { cats } = useCatalogOptions();
  const [qLive, setQLive] = useState('');
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fStock, setFStock] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(null); /* unfiltered count for the X of Y counter */
  const filtered = Boolean(q.trim() || fCat || fStatus || fStock);
  useEffect(() => { const t = setTimeout(() => setQ(qLive), 300); return () => clearTimeout(t); }, [qLive]);
  useEffect(() => { setPage(1); }, [q, fCat, fStatus, fStock, sort, pageSize]);

  const toggleSel = (id) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSel = items && items.length ? items.every((p) => sel.has(p._id)) : false;
  /* Step 2 audit fix — membership check, not size equality: after a filter
     change a same-size stale selection cleared instead of selecting */
  const toggleAll = () => setSel((s) => (items && (items || []).every((p) => s.has(p._id)) && s.size ? new Set() : new Set((items || []).map((p) => p._id))));

  const runBulk = async (action, value) => {
    if (!sel.size) return;
    if (action === 'delete' && !(await confirm({ title: 'Bulk delete products', body: 'Delete ' + sel.size + ' selected product(s) PERMANENTLY? Images are removed too.', danger: true, ok: 'Delete all' }))) return;
    if ((action === 'price' || action === 'stock') && (value === '' || value == null)) { toast('Enter a value for the bulk ' + action + ' first', 'err'); return; }
    setBulkBusy(true);
    try {
      const r = await bulkProducts([...sel], action, action === 'price' || action === 'stock' ? Number(value) : undefined);
      toast(action === 'delete'
        ? 'Deleted ' + r.deleted + ' product(s)'
        : 'Bulk ' + action + ' — matched ' + r.matched + ', updated ' + r.modified, 'ok');
      setSel(new Set()); setBulkPrice(''); setBulkStock('');
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setBulkBusy(false); }
  };

  const doDuplicate = async (p) => {
    try {
      const d = await duplicateProduct(p._id);
      toast('Duplicated as inactive draft — ' + d.product.slug, 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const doExport = async () => {
    try {
      await download(exportCsvPath, 'arixgear-products.csv');
      toast('Catalog exported — forged-products.csv', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  const doImport = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return toast('Pick a .csv file', 'err');
    try {
      const r = await importCsv(file);
      toast('Import done — ' + r.created + ' created · ' + r.updated + ' updated' + (r.errors && r.errors.length ? ' · ' + r.errors.length + ' row errors' : ''), r.errors && r.errors.length ? 'err' : 'ok');
      load();
    } catch (err) { toast(err.message, 'err'); }
  };

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set('search', q.trim());
      if (fCat) p.set('category', fCat);
      if (fStatus) p.set('status', fStatus);
      if (fStock) p.set('stock', fStock);
      p.set('sort', sort);
      p.set('page', String(page));
      p.set('limit', String(pageSize));
      const d = await listProducts(Object.fromEntries(p.entries()));
      setItems(d.items || []);
      setTotal(d.total || 0);
      setPageCount(d.pages || 1);
      if (!filtered) setTotalAll(d.total || 0);
      setError('');
    } catch (e) { setError(e.message); }
  }, [q, fCat, fStatus, fStock, sort, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p) => {
    try {
      await patchProduct(p._id, { active: !p.active });
      toast(p.active ? 'Deactivated' : 'Activated', 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const setDraft = (id, field, val) => setDrafts((d0) => ({ ...d0, [id]: { ...(d0[id] || {}), [field]: val } }));
  const commitInline = async (p, field) => {
    const raw = (drafts[p._id] || {})[field];
    if (raw === undefined || raw === '') return;
    const n = +raw;
    const clear = () => setDrafts((d0) => ({ ...d0, [p._id]: { ...(d0[p._id] || {}), [field]: undefined } }));
    if (Number.isNaN(n) || n === p[field]) { clear(); return; }
    try {
      await patchProduct(p._id, { [field]: n });
      toast('Saved ✓', 'ok');
      clear(); load();
    } catch (e) { clear(); toast(e.message, 'err'); }
  };

  if (error) {
    return (
      <div className={CARD}>
        <div className="text-[13px] text-red">Failed to load products — {error}</div>
        <button className={GHOST_BTN + ' mt-3'} onClick={load}>Retry</button>
      </div>
    );
  }
  if (!items) return <ProductListSkeleton rows={pageSize} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">{total} products</span>
        <div className="flex-1" />
        <button id="pExport" className={GHOST_BTN} onClick={doExport} title="Download the full catalog as CSV (Excel-friendly)">Export CSV</button>
        <button id="pImport" className={GHOST_BTN} onClick={() => csvInput.current && csvInput.current.click()} title="Upsert by slug — existing slugs update, new rows create (rows without image get a ArixGear placeholder)">Import CSV</button>
        <input ref={csvInput} type="file" accept=".csv" className="hidden" onChange={doImport} />
        <button id="pNew" className={ACC_BTN} onClick={() => openDrawer('New Product', <ProductForm onDone={load} />, null, 'wide')}>+ New Product</button>
      </div>

      {/* Task 35 — search + filter + sort toolbar (server-driven) */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3" id="pToolbar">
        <div className="relative">
          <input id="pSearch" placeholder="Search name / slug / category…" value={qLive} onChange={(e) => setQLive(e.target.value)}
            className="w-[240px] rounded-lg border border-line2 bg-transparent px-3 py-1.5 pr-8 text-[12.5px] outline-none placeholder:text-dim2 focus:border-acc" />
          {qLive ? <button id="pSearchClear" title="Clear search" onClick={() => setQLive('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim2 hover:text-acc">✕</button> : null}
        </div>
        <select id="pFilterCat" value={fCat} onChange={(e) => setFCat(e.target.value)} className="w-auto rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
        <select id="pFilterStatus" value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="w-auto rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select id="pFilterStock" value={fStock} onChange={(e) => setFStock(e.target.value)} className="w-auto rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
          <option value="">Any stock</option>
          <option value="in">In stock (&gt;5)</option>
          <option value="low">Low (1–5)</option>
          <option value="out">Out (0)</option>
        </select>
        <select id="pSort" value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {filtered ? <button id="pReset" className={GHOST_BTN} onClick={() => { setQLive(''); setFCat(''); setFStatus(''); setFStock(''); }}>Reset</button> : null}
        <label className="ml-auto flex items-center gap-2 text-[12px] text-dim2">
          Per page
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-auto rounded-lg border border-line2 bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-acc">
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-[12px] text-dim2" id="pCount">Showing {items.length ? ((page - 1) * pageSize + 1) : 0}–{Math.min(page * pageSize, total)} of {filtered ? total : (totalAll != null ? totalAll : total)} products</span>
      </div>

      {/* Task 27 — bulk action bar (visible when rows are selected) */}
      {sel.size > 0 && (
        <div id="pBulkBar" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-acc/40 bg-acc/5 px-4 py-3">
          <b className="text-[12.5px] text-acc">{sel.size} selected</b>
          <button className={GHOST_BTN} disabled={bulkBusy} onClick={() => runBulk('active')}>Set Active</button>
          <button className={GHOST_BTN} disabled={bulkBusy} onClick={() => runBulk('inactive')}>Set Inactive</button>
          <input className="w-[110px]" type="number" min="0" placeholder="price ৳" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} aria-label="Bulk price" />
          <button className={GHOST_BTN} disabled={bulkBusy} onClick={() => runBulk('price', bulkPrice)}>Set Price</button>
          <input className="w-[100px]" type="number" min="0" placeholder="stock" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} aria-label="Bulk stock" />
          <button className={GHOST_BTN} disabled={bulkBusy} onClick={() => runBulk('stock', bulkStock)}>Set Stock</button>
          <button className={RED_BTN + ' ml-auto'} disabled={bulkBusy} onClick={() => runBulk('delete')}>Delete Selected</button>
        </div>
      )}

      <div className="tbl-wrap overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[.08em] text-dim2">
              <th className="px-3 py-2.5"><input type="checkbox" className="w-auto" checked={allSel} onChange={toggleAll} aria-label="Select all products" /></th>
              <th className="px-3 py-2.5"></th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Price (৳)</th>
              <th className="px-3 py-2.5">Stock</th>
              <th className="px-3 py-2.5">Sold</th>
              <th className="px-3 py-2.5">Views</th>
              <th className="px-3 py-2.5">Badge</th>
              <th className="px-3 py-2.5">Active</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p._id} className={'border-b border-line hover:bg-panel2 ' + (sel.has(p._id) ? 'bg-acc/5' : '')}>
                <td className="px-3 py-2.5"><input type="checkbox" className="w-auto" checked={sel.has(p._id)} onChange={() => toggleSel(p._id)} aria-label={'Select ' + p.name} /></td>
                <td className="px-3 py-2.5">
                  <img src={p.images?.[0]?.url || ''} alt="" className="h-11 w-11 rounded-[7px] bg-panel2 object-cover" />
                </td>
                <td className="px-3 py-2.5"><b>{p.name}</b><span className="block text-[11px] text-dim2">{p.slug}</span>
                  {p.sizeGuide && p.sizeGuide.mode === 'custom'
                    ? <span className="mt-1 inline-block" data-sg="custom"><span className={CHIP + ' text-acc'}>CUSTOM GUIDE</span></span>
                    : <span className="mt-1 inline-block" data-sg="inherit"><span className={CHIP + ' text-dim2'}>INHERIT</span></span>}
                </td>
                <td className="px-3 py-2.5"><span className={CHIP + ' text-dim'}>{p.category}</span></td>
                <td className="px-3 py-2.5">
                  <input type="number" min="0" step="1" title="Inline edit price — saves on blur"
                    className="w-[96px]" value={(drafts[p._id] || {}).price ?? p.price ?? ''}
                    onChange={(e) => setDraft(p._id, 'price', e.target.value)}
                    onBlur={() => commitInline(p, 'price')} />
                  {p.comparePrice ? <span className="block text-[11px] text-dim2 line-through">{money(p.comparePrice)}</span> : null}
                  {p.sizePrices?.length ? <span className="block text-[11px] text-dim2">by size: {p.sizePrices.map((x) => x.s + ' ' + money(x.price)).join(' · ')}</span> : null}
                  {(() => { const fs = flashState(p); return fs
                    ? <span className={CHIP + ' mt-1 ' + (fs.live ? 'border-acc/50 text-acc' : 'text-dim2')} data-flashchip={p._id}>{fs.label}</span>
                    : null; })()}
                </td>
                <td className="px-3 py-2.5">
                  <input type="number" min="0" step="1" title="Inline edit stock — saves on blur"
                    className={'w-[76px] ' + (p.stock <= 5 ? 'font-extrabold text-red' : '')}
                    value={(drafts[p._id] || {}).stock ?? p.stock ?? 0}
                    onChange={(e) => setDraft(p._id, 'stock', e.target.value)}
                    onBlur={() => commitInline(p, 'stock')} />
                </td>
                <td className="px-3 py-2.5">{p.sold}</td>
                <td className="px-3 py-2.5" title="PDP opens — powers Trending sort">{p.views ?? 0}</td>
                <td className="px-3 py-2.5">
                  {p.badge && p.badge !== 'none' ? <span className={CHIP + ' text-acc'}>{p.badge}</span> : '—'}
                </td>
                <td className="px-3 py-2.5"><Toggle on={p.active} onClick={() => toggle(p)} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <button className={GHOST_BTN} onClick={() => openDrawer('Edit — ' + (p.name || ''), <ProductForm p={p} onDone={load} />, null, 'wide')}>Edit</button>
                    <button className={GHOST_BTN + ' ' + (flashState(p)?.live ? 'border-acc/60 text-acc' : '')} title="Schedule a timed flash sale" onClick={() => openModal(<FlashForm p={p} onDone={load} />)}>⚡ Flash</button>
                    <button className={GHOST_BTN} title="Copy as an inactive draft" onClick={() => doDuplicate(p)}>Duplicate</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length ? <tr><td colSpan={11} className="px-3 py-6 text-center text-dim2">{filtered ? <>No products match the filters — <button className="text-acc underline" onClick={() => { setQLive(''); setFCat(''); setFStatus(''); setFStock(''); }}>reset filters</button></> : 'No products yet'}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button className={GHOST_BTN} disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>Previous</button>
          <span className="px-3 text-[12px] text-dim2">Page {page} of {pageCount}</span>
          <button className={GHOST_BTN} disabled={page >= pageCount} onClick={() => setPage((n) => Math.min(pageCount, n + 1))}>Next</button>
        </div>
      ) : null}
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="products" title="Products">
        <ProductsPage />
      </AdminShell>
    </OverlayProvider>
  );
}
