/* ArixGear section — arsenal grid with filter tabs (#gear / #gearGrid).
   Head copy from the admin home-section row; no row / no products → render null. */
import { useMemo, useState } from 'react';
import { useCatalog } from '../../store/catalog.jsx';
import { useContent } from '../../store/content.jsx';
import ProductCard from '../../components/ProductCard.jsx';
import { pick, useLang } from '../../lib/i18n.jsx';
import { SectionHead, OutlineTitle } from './Head.jsx';

export default function Arsenal() {
  useLang(); // Task 58 — subscribe so BN toggles re-render pick() labels
  const { sectionCfg, sectionVisible, homeSections } = useContent();
  const { PRODUCTS, BY_ID, CATS } = useCatalog();
  const [f, setF] = useState('All');

  const visible = sectionVisible('arsenal');
  const sec = homeSections.find((s) => s && s.key === 'arsenal');
  const arsenalCfg = sectionCfg('arsenal') || {};
  const tabs = ['All'].concat(CATS);

  const list = useMemo(() => {
    if (f !== 'All') return PRODUCTS.filter((p) => p.cat === f);
    /* admin-curated order on All (renderGear parity) */
    const slugs = arsenalCfg.products;
    if (Array.isArray(slugs) && slugs.length) {
      const l = slugs.map((s) => BY_ID[s]).filter(Boolean);
      if (l.length) return l;
    }
    return PRODUCTS.slice();
  }, [f, PRODUCTS, BY_ID, arsenalCfg]);

  if (!visible || !sec || !list.length) return null;

  return (
    <section id="gear" className="hsec pb-16 pt-8">
      <div className="container mx-auto w-[92%]">
        <SectionHead
          eyebrow={pick(sec, 'subtitle')}
          title={sec.title ? <OutlineTitle text={pick(sec, 'title')} /> : null} // Task 58
          right={
            <div id="ftabs" className="ftabs flex flex-wrap gap-[.5rem]">
              {tabs.map((t) => (
                <button
                  key={t}
                  data-f={t}
                  className={'ftab border px-[1.15rem] py-[.6rem] font-cond text-[.9rem] font-semibold uppercase tracking-[.24em] transition duration-200 ' + (f === t ? 'active border-acc bg-acc text-black' : 'border-line text-muted hover:border-line2 hover:text-txt')}
                  onClick={() => setF(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        />
        <div id="gearGrid" className="gear-grid grid grid-cols-2 gap-[.7rem] md:grid-cols-3 lg:gap-[1.15rem] xl:grid-cols-4">
          {list.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </div>
    </section>
  );
}
