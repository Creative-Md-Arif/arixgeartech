import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { money } from '../lib/format.js';
import { useLang, pick, tr } from '../lib/i18n.jsx';
import Stars from './Stars.jsx';

/* badge text — label from the admin-managed Badge collection; the seeded
   SALE badge keeps its live discount percentage when a compare price exists.
   bn mode prefers badgeLabelBn, sale wording goes through tr. */
export function badgeText(p) {
  const { isBn, t } = useLangSafe();
  if (!p.badgeKey && !p.badgeLabel && !p.badgeLabelBn) return null;
  if (p.badgeKey === 'sale' && p.compare) return t('SALE') + ' −' + Math.round((1 - p.price / p.compare) * 100) + '%';
  const bn = p.badgeLabelBn;
  return (isBn && bn) ? bn : (p.badgeLabel || 'NEW');
}

/* badgeText runs from plain modules too (compare page) — lang comes from the
   module-level state, so a non-hook twin keeps it safe outside components */
function useLangSafe() {
  try { return useLang(); } catch (e) { return { isBn: false, t: tr }; }
}

/* chip palette — admin color, with black/white text picked by background luminance */
function chipText(bg) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(bg || ''));
  if (!m) return '#000';
  const n = parseInt(m[1], 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#000000' : '#ffffff';
}

export function badgeChipStyle(p) {
  const bg = p.badgeColor || (p.badgeKey === 'sale' ? '#2F81F7' : p.badgeKey === 'best' || p.badgeKey === 'best-seller' ? '#c9ced4' : '#111114');
  return { background: bg, color: chipText(bg) };
}

export default function ProductCard({ p }) {
  const { wish, addToCart, compare, toggleCompare } = useStore();
  const { openPDP, toggleWish } = { ...useUI(), toggleWish: useStore().toggleWish };
  const { t, isBn } = useLang();
  const bt = badgeText(p);
  const pName = pick(p, 'name');
  const pCat = isBn && p.catBn ? p.catBn : t(p.cat);
  return (
    <article className="card group relative bg-panel border border-line transition-colors duration-300 hover:border-line2" data-id={p.id}>
      <div className="card-media relative cursor-pointer overflow-hidden" data-open={p.id} onClick={() => openPDP(p.id)}>
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1">{bt && <span className="badge font-cond font-bold text-[.74rem] tracking-[.22em] uppercase px-2.5 py-1 w-max" style={badgeChipStyle(p)}>{bt}</span>}
          {p.flash && <span className="flash-chip inline-flex items-center gap-1 bg-acc px-2.5 py-1 font-cond font-bold text-[.74rem] uppercase tracking-[.18em] text-black w-max" data-flash={p.id}>⚡ Flash −{p.flash.off}%</span>}
          {p.deal && <span className="deal-chip inline-flex items-center gap-1 border border-acc/60 bg-black/70 px-2.5 py-1 font-cond font-bold text-[.74rem] uppercase tracking-[.18em] text-acc w-max" data-deal={p.id} title={p.deal.name}>🎯 {p.deal.badge || 'DEAL'} −{p.deal.off}%</span>}
          {p.dealBogo && !p.deal && <span className="deal-chip inline-flex items-center gap-1 border border-acc/60 bg-black/70 px-2.5 py-1 font-cond font-bold text-[.74rem] uppercase tracking-[.18em] text-acc w-max" data-deal={p.id} title="Buy X Get Y free at checkout">🎁 {p.dealBogo.badge} {p.dealBogo.buyQty}→{p.dealBogo.buyQty + p.dealBogo.getQty}</span>}
        </div>
        <button
          className={'wish-btn absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center bg-black/70 backdrop-blur transition-all ' + (wish.has(p.id) ? 'text-acc active' : 'text-white hover:text-acc')}
          data-wish={p.id} aria-label={'Wishlist ' + pName}
          onClick={(e) => { e.stopPropagation(); toggleWish(p.id); }}
        >
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-[18px] w-[18px]" fill={wish.has(p.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7.5-4.9-9.8-9.2C.7 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.1 2.3h4c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.2 3.6 3.7 6.8C19.5 16.1 12 21 12 21z" /></svg>
        </button>
        <button
          className={'compare-btn absolute right-3 top-[52px] z-10 grid h-9 w-9 place-items-center bg-black/70 backdrop-blur transition-all ' + (compare && compare.has(p.id) ? 'text-acc active' : 'text-white hover:text-acc')}
          data-compare={p.id} aria-label={'Compare ' + pName} title="Compare"
          onClick={(e) => { e.stopPropagation(); toggleCompare(p.id); }}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 7l3-3M4 7l3 3M20 7l-3-3m3 3l-3 3M7 17h10M7 17l-3-3m3 3l-3 3m13-3l-3-3m3 3l-3 3" /></svg>
        </button>
        <div className="aspect-square overflow-hidden bg-bg2">
          <img className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" src={p.img} alt={pName} loading="lazy" />
        </div>
        {p.alt && <img className="hidden" src={p.alt} alt={pName + ' alternate view'} loading="lazy" />}
        <div className="quick-add absolute inset-x-0 bottom-0 translate-y-full p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <div className="mb-2 flex justify-center gap-1.5">
            {p.colors.map((c, i) => (
              <span key={c.n} className={'h-4 w-4 rounded-full border transition-transform ' + (i === 0 ? 'border-acc scale-110' : 'border-white/30')} style={{ background: c.h }} title={c.n} />
            ))}
          </div>
          <button
            className="qa-btn w-full bg-acc py-2.5 font-head text-[.72rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2"
            data-add={p.id}
            onClick={(e) => { e.stopPropagation(); addToCart(p.id, null, null, 1, true); }}
          >
            {t('Quick Add — {p}', { p: money(p.price) })}
          </button>
        </div>
      </div>
      <div className="flex h-[168px] flex-col p-4">
        <p className="font-cond text-[.78rem] uppercase tracking-[.25em] text-dim">{pCat}</p>
        <h3 className="mt-1 h-10 line-clamp-2 cursor-pointer font-head text-[.95rem] font-700 font-bold leading-5 text-txt transition-colors hover:text-acc" data-open={p.id} onClick={() => openPDP(p.id)}>{pName}</h3>
        {/*SHOW-ON-CARD spec chips (schema-driven: RAM/GPU/Storage…).
            The server computes them against the category schema; bn mode uses
            labelBn twins. Empty → the row simply doesn't render.*/}
        <div className="mt-2 flex h-6 flex-nowrap gap-1.5 overflow-hidden" data-specbadges={p.id}>
            {(p.specBadges || []).slice(0, 3).map((b) => (
              <span key={b.k} className="inline-flex max-w-[110px] items-center gap-1 rounded border border-line2 bg-bg2 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted" title={(isBn && b.labelBn ? b.labelBn : b.label) + ': ' + b.v}>
                {b.icon ? <span aria-hidden="true">{b.icon}</span> : null}
                <span className="truncate">{b.v}</span>
              </span>
            ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="font-head text-[.95rem] font-bold text-txt">
            {money(p.price)}
            {p.compare ? <> <s className="text-[.8rem] font-medium text-dim">{money(p.compare)}</s></> : null}
          </span>
          <span className="flex items-center gap-1.5 text-[.75rem] text-muted">
            <Stars rating={p.rating} />
            <b className="text-txt">{p.rating.toFixed(1)}</b>({p.reviews})
          </span>
        </div>
      </div>
    </article>
  );
}
