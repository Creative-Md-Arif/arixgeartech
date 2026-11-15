/* ArixGear page — /compare (conversion pack 3a · Step 6 upgrade).
   2–4 picked products side by side: price, rating, stock, sizes and the UNION
   of their spec keys. Step 6 — when the compared products share a category
   schema, spec rows render GROUPED by that schema (group header strips,
   per-field icons, Bengali labels) matching the PDP; keys the schema doesn't
   know land in "Other specifications". No schema → the legacy flat table. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/store.jsx';
import { useCatalog, firstStock, priceFor } from '../store/catalog.jsx';
import { getFilters } from '../services/products.js';
import { money } from '../lib/format.js';
import SmartImage from '../components/SmartImage.jsx';
import Stars from '../components/Stars.jsx';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';

export default function ComparePage() {
  useSEO('compare', { title: 'Compare Gear — ArixGear', robots: 'noindex,follow' });
  const { compare, toggleCompare, addToCart } = useStore();
  const { BY_ID, PRODUCTS } = useCatalog();
  const { t, isBn } = useLang();

  const items = [...compare].map((id) => BY_ID[id] || PRODUCTS.find((p) => p.id === id)).filter(Boolean);

  /* union of spec keys across the compared products (order-stable) */
  const specKeys = [];
  const seen = new Set();
  items.forEach((p) => (p.specs || []).forEach(([k]) => {
    if (k && !seen.has(k)) { seen.add(k); specKeys.push(k); }
  }));

  /* Step 6 — the union branch's spec schema (merged server-side across the
     compared categories). Carries group order, labelBn twins and field icons. */
  const [specSchema, setSpecSchema] = useState(null);
  const catUnion = [...new Set(items.map((p) => p.catSlug).filter(Boolean))].join(',');
  useEffect(() => {
    if (!catUnion || items.length < 2) { setSpecSchema(null); return; }
    let on = true;
    getFilters(catUnion).then((d) => { if (on) setSpecSchema(Array.isArray(d.specSchema) && d.specSchema.length ? d.specSchema : null); }).catch(() => {});
    return () => { on = false; };
  }, [catUnion]); // eslint-disable-line react-hooks/exhaustive-deps

  /* grouped row model: schema groups first (schema order), orphans last.
     Each row = { k(label), icon, cells: [value|'—' per product] } so the
     table renders one <tr> per row across all grouped sections. */
  const groups = useMemo(() => {
    if (items.length < 2) return [];
    const cellOf = (p, k) => {
      const hit = (p.specs || []).find(([kk]) => kk === k);
      return hit ? (hit[1] || '—') : '—';
    };
    const makeRow = (k, icon) => ({ k, icon: icon || '', cells: items.map((p) => cellOf(p, k)), isGroup: false });
    if (specSchema) {
      const lowerKey = new Map(specKeys.map((k) => [k.toLowerCase(), k]));
      const out = [];
      const used = new Set();
      for (const g of [...specSchema].sort((a, b) => (a.order || 0) - (b.order || 0))) {
        const rows = [];
        for (const f of [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
          if (f.showInDetails === false) continue;
          const match = lowerKey.get(String(f.label).toLowerCase());
          if (!match) continue; // no compared product carries this field's flat row
          used.add(match);
          rows.push(makeRow(isBn && f.labelBn ? f.labelBn : f.label, f.icon));
        }
        if (rows.length) out.push({ key: g.key, label: isBn && g.labelBn ? g.labelBn : g.label, rows, isGroup: true });
      }
      const orphanRows = specKeys.filter((k) => !used.has(k)).map((k) => makeRow(k));
      if (orphanRows.length) out.push({ key: '__other', label: t('Other specifications'), rows: orphanRows, isGroup: true });
      if (out.length) return out;
    }
    /* legacy flat union — one unnamed section (old behaviour, kept as fallback) */
    return [{ key: '__flat', label: '', rows: specKeys.map((k) => makeRow(k)), isGroup: true }];
  }, [items, specKeys, specSchema, isBn]); // eslint-disable-line react-hooks/exhaustive-deps

  const stockOf = (p) => {
    if (!p.sizes) return p.sold > 0 || true ? 'In stock' : 'In stock';
    const on = p.sizes.filter((s) => s.stock > 0).map((s) => s.s);
    return on.length ? on.join(', ') : 'Sold out';
  };

  return (
    <section id="page-compare" className="page py-16 lg:py-24" data-testid="comparePage">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('Side by Side')}
          </p>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('COMPARE')} <span className="text-outline">{t('GEAR')}</span>
          </h2>
        </div>

        {items.length < 2 ? (
          <div className="mt-10 border border-dashed border-line2 px-8 py-16 text-center text-muted" id="compareEmpty">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{items.length === 0 ? t('Comparison Tray Is Empty') : t('Pick One More')}</h3>
            <p className="mx-auto max-w-[440px] leading-[1.7]">
              {t('Tap the ⚖ icon on any product card to add 2–4 products — price, rating, size and specs in one table.')}
            </p>
            <Link to="/shop" className="mt-7 inline-block border border-acc bg-acc px-8 py-3.5 font-cond text-[.9rem] font-bold uppercase tracking-[.24em] text-black transition hover:bg-acc2">
              {t('Browse the Shop')}
            </Link>
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto border border-line bg-panel" id="compareTable">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr>
                  <th className="w-[120px] border-b border-line p-3 align-bottom font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">Product</th>
                  {items.map((p) => (
                    <td key={p.id} className="border-b border-l border-line p-3 align-top">
                      <div className="relative">
                        <button
                          onClick={() => toggleCompare(p.id)}
                          aria-label={'Remove ' + p.name}
                          className="absolute -right-1 -top-1 z-10 grid h-6 w-6 place-items-center rounded-full bg-red text-[11px] font-bold text-white"
                        >✕</button>
                        <Link to="/shop" onClick={(e) => e.preventDefault()} className="block">
                          <div className="aspect-square w-full max-w-[150px] overflow-hidden bg-bg2">
                            <SmartImage src={p.img} alt={p.name} w={300} className="h-full w-full object-cover" />
                          </div>
                          <p className="mt-2.5 font-semibold leading-snug text-txt">{p.name}</p>
                        </Link>
                      </div>
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="p-3 font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">Price</th>
                  {items.map((p) => {
                    const size = firstStock(p);
                    return (
                      <td key={p.id} className="border-l border-line p-3">
                        <b className="font-disp text-[1.15rem] text-acc">{money(priceFor(p, size))}</b>
                        {p.compare > p.price ? <span className="ml-2 text-[12px] text-dim line-through">{money(p.compare)}</span> : null}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th className="border-t border-line p-3 font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">Rating</th>
                  {items.map((p) => (
                    <td key={p.id} className="border-t border-l border-line p-3">
                      <div className="flex items-center gap-2">
                        <Stars rating={p.rating} />
                        <span className="text-[12.5px] text-dim">{(+p.rating || 0).toFixed(1)} ({p.reviews || 0})</span>
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="border-t border-line p-3 font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">Category</th>
                  {items.map((p) => <td key={p.id} className="border-t border-l border-line p-3 text-muted">{p.cat}</td>)}
                </tr>
                <tr>
                  <th className="border-t border-line p-3 font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">Availability</th>
                  {items.map((p) => (
                    <td key={p.id} className="border-t border-l border-line p-3 text-muted">{stockOf(p)}</td>
                  ))}
                </tr>
                {(items.some((p) => p.sizes && p.sizes.length)) && (
                  <tr>
                    <th className="border-t border-line p-3 font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">Sizes</th>
                    {items.map((p) => (
                      <td key={p.id} className="border-t border-l border-line p-3 text-muted">{p.sizes ? p.sizes.map((s) => s.s).join(' · ') : '—'}</td>
                    ))}
                  </tr>
                )}
                {/* Step 6 — GROUPED spec sections from the category schema
                    (group header strips · per-field icons · bn labels);
                    no schema → the flat union fallback. */}
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    {g.label ? (
                      <tr className="bg-panel2" data-comparegroup={g.key}>
                        <th colSpan={items.length + 1} className="border-t border-line p-3 text-left font-head text-[.72rem] font-bold uppercase tracking-[.2em] text-acc">{g.label}</th>
                      </tr>
                    ) : null}
                    {g.rows.map((r, ri) => (
                      <tr key={g.key + '-' + ri}>
                        <th className="border-t border-line p-3 font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">{r.icon ? <span aria-hidden="true" className="mr-1.5">{r.icon}</span> : null}{r.k}</th>
                        {r.cells.map((v, ci) => (
                          <td key={items[ci].id} className="border-t border-l border-line p-3 text-muted">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr>
                  <th className="border-t border-line p-3" />
                  {items.map((p) => {
                    const size = firstStock(p);
                    const inStock = !p.sizes || p.sizes.some((s) => s.stock > 0);
                    return (
                      <td key={p.id} className="border-t border-l border-line p-3">
                        <button
                          disabled={!inStock}
                          onClick={() => addToCart(p.id, size, undefined, 1)}
                          className="w-full border border-acc bg-acc px-3 py-2.5 font-cond text-[.8rem] font-bold uppercase tracking-[.16em] text-black transition hover:bg-acc2 disabled:cursor-not-allowed disabled:border-line2 disabled:bg-panel disabled:text-dim"
                        >
                          {inStock ? t('Add to Cart') : t('Sold Out')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
