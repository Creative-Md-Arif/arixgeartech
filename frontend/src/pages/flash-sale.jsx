import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adaptOne } from '../store/catalog.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useSEO } from '../lib/seo.jsx';
import { useLang } from '../lib/i18n.jsx';
import { api } from '../services/http.js';

const GridSkeleton = () => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="animate-pulse border border-line bg-panel">
        <div className="aspect-square bg-bg2" />
        <div className="space-y-2 p-4">
          <div className="h-3 w-1/3 bg-bg2" />
          <div className="h-4 w-3/4 bg-bg2" />
          <div className="h-4 w-1/4 bg-bg2" />
        </div>
      </div>
    ))}
  </div>
);

/*ticking countdown text — re-renders once per second*/
function useCountdown(target) {
  const [txt, setTxt] = useState('');
  useEffect(() => {
    if (!target) { setTxt(''); return undefined; }
    const tick = () => {
      const ms = +new Date(target) - Date.now();
      if (ms <= 0) { setTxt('00:00:00'); return; }
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      const pad = (n) => String(n).padStart(2, '0');
      setTxt((d > 0 ? d + 'd ' : '') + pad(Math.floor((s % 86400) / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  return txt;
}

export default function FlashSalePage() {
  useSEO('flash-sale', { title: 'Flash Sale — ArixGear', robots: 'index,follow' });
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [dead, setDead] = useState(null);
  const countdown = useCountdown(dead);

  const load = useCallback(async () => {
    try {
      const d = await api('/products/flash');
      const list = (d.items || []).map((p) => adaptOne({ ...p, images: p.images, sizeStocks: p.sizeStocks, sizePrices: p.sizePrices, colors: p.colors })).filter(Boolean);
      setItems(list);
      setDead(list.length ? Math.min(...list.map((p) => +new Date(p.flash.endsAt))) : null);
    } catch { setItems([]); setDead(null); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);  // sales start/end by themselves — poll keeps the grid honest
    return () => clearInterval(t);
  }, [load]);

  return (
    <section id="page-flash" className="page py-16 lg:py-24" data-testid="flashPage">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
            <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
            {t('Limited Time')}
          </p>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('FLASH')} <span className="text-outline">{t('SALE')}</span>
          </h2>
          {items && items.length > 0 && (
            <div className="mt-5 inline-flex items-center gap-3 border border-acc/60 bg-acc/10 px-5 py-3" id="flashCountdownBox">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-acc" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
              <span className="font-cond text-[.8rem] font-semibold uppercase tracking-[.2em] text-muted">{t('Ends in')}</span>
              <b className="font-disp text-2xl tracking-wide text-acc tabular-nums" id="flashCountdown">{countdown}</b>
            </div>
          )}
        </div>

        {items === null ? <GridSkeleton /> : items.length === 0 ? (
          <div className="mt-10 border border-dashed border-line2 px-8 py-16 text-center text-muted" id="flashEmpty">
            <h3 className="mb-2 font-disp text-[1.8rem] uppercase text-txt">{t('No flash sale is live right now')}</h3>
            <p className="mx-auto max-w-[440px] leading-[1.7]">{t('New drops ignite without warning — watch this page or subscribe below to catch the next one.')}</p>
            <Link to="/shop" className="mt-6 inline-block bg-acc px-6 py-3 font-head text-[.8rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2" id="flashShopBtn">
              {t('Shop All Gear')}
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" id="flashGrid">
            {items.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </section>
  );
}
