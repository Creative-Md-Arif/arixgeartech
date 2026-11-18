/* ArixGear section — hero side promos (Phase 3, #4 of 13: "hero + 2 side promos").
   Reads Banners position=side (max 2) from the content store. Desktop (xl+):
   two-card column beside the hero. Below xl: a 2-col grid right
   under the hero. No side banners → renders nothing. */
import { useContent } from '../../store/content.jsx';
import { go } from '../../lib/go.js';
import { bannerClick } from '../../services/banners.js';
import { pick, useLang } from '../../lib/i18n.jsx';
import { safeHref } from '../../lib/sanitize.js'; /* Step 3 audit — banner links are admin-authored; refuse javascript:/data: schemes */

const fixUrl = (u) => (!u ? '' : (/^https?:/.test(u) ? u : (u.startsWith('/') ? u : '/' + u)));

function PromoCard({ bn }) {
  const { t } = useLang();
  const img = fixUrl((bn.poster && bn.poster.url) || (bn.image && bn.image.url) || bn.image || '');
  const id = bn.id || bn._id;
  const link = safeHref(bn.link, '/shop');
  const onGo = (e) => {
    e.preventDefault();
    if (id) bannerClick(id);
    if (String(link).startsWith('#')) go(link);
    else window.location.href = link;
  };
  return (
    <a
      href={link}
      onClick={onGo}
      aria-label={pick(bn, 'title') || t('Promotional offer')}
      className="promo-card group relative block h-[168px] min-h-0 overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-acc xl:h-full"
      data-promo={bn.title}
    >
      {img ? (
        <>
          <img src={img} alt={pick(bn, 'title') || 'Promo'} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
          <div className="pointer-events-none absolute inset-0 bg-black/5 transition-colors group-hover:bg-black/15" />
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-br from-panel2 to-panel p-4">
          <p className="font-disp text-[1.05rem] uppercase leading-tight">{pick(bn, 'title')}</p>
          <p className="mt-1 line-clamp-2 text-[.78rem] leading-snug text-muted">{pick(bn, 'subtitle')}</p>
          <span className="mt-2.5 inline-flex items-center gap-1.5 font-cond text-[.72rem] font-bold uppercase tracking-[.2em] text-acc">
            {pick(bn, 'ctaText') || t('Shop now')} <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[2.5]"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </div>
      )}
    </a>
  );
}

export default function HeroPromos() {
  const { sideBanners } = useContent();
  const items = (sideBanners || []).filter((b) => b && (b.image || b.title));
  if (!items.length) return null;

  return (
    <>
      {/* Desktop promo column beside the featured hero card */}
      <aside className={'hero-promos-rail hidden min-w-0 grid-cols-1 gap-4 xl:grid xl:grid-rows-2' + (items.length === 1 ? ' single-promo' : '')} id="heroPromos" data-testid="heroPromos">
        {items.slice(0, 2).map((bn, i) => <PromoCard key={bn.id || bn._id || i} bn={bn} />)}
      </aside>
      {/* below-xl — same promos as a grid right under the hero */}
      <div className="hero-promos-mobile grid grid-cols-2 gap-3 pb-2 pt-4 xl:hidden sm:gap-4">
        {items.slice(0, 2).map((bn, i) => <PromoCard key={'m' + (bn.id || bn._id || i)} bn={bn} />)}
      </div>
    </>
  );
}
