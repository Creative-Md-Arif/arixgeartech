import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CatalogBrowser from '../components/CatalogBrowser.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { adaptOne } from '../store/catalog.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn, btnPrimary } from '../components/accountKit.jsx';
import { api } from '../services/http.js';

/*ticking countdown — same math as /flash-sale*/
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
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return txt;
}

export default function Page() {
  useSEO('deals', {
    title: 'Offers & Deals — arixgear.tech',
    description: 'Live flash campaigns, the ARIX10 welcome code, combo bundles and every discounted product on arixgear.tech — one offers hub.',
  });
  const { t } = useLang();
  const [flash, setFlash] = useState(null);
  const [dead, setDead] = useState(null);
  const countdown = useCountdown(dead);
  const [campaigns, setCampaigns] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [campaignItems, setCampaignItems] = useState(null);

  const loadFlash = useCallback(async () => {
    try {
      const d = await api('/products/flash');
      const list = (d.items || []).map((p) => adaptOne({ ...p, images: p.images, sizeStocks: p.sizeStocks, sizePrices: p.sizePrices, colors: p.colors })).filter(Boolean);
      setFlash(list);
      const ends = list.map((p) => p.flash?.endsAt).filter(Boolean).map((date) => +new Date(date)).filter(Number.isFinite);
      setDead(ends.length ? Math.min(...ends) : null);
    } catch {
      setFlash([]);
      setDead(null);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const d = await api('/deals');
      setCampaigns(d.items || []);
      setCampaign((cur) => (d.items || []).find((x) => x.slug === (cur && cur.slug)) || null);
    } catch { setCampaigns([]); }
  }, []);

  const openCampaign = useCallback(async (slug) => {
    try {
      setCampaignItems(null);
      const d = await api('/deals/' + slug);
      setCampaign(d.deal);
      setCampaignItems((d.items || []).map((p) => adaptOne({ ...p, images: p.images, sizeStocks: p.sizeStocks, sizePrices: p.sizePrices, colors: p.colors })).filter(Boolean));
      const el = document.getElementById('dealsCampaign');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { setCampaignItems([]); }
  }, []);

  useEffect(() => {
    loadFlash();
    loadCampaigns();
    const id = setInterval(loadFlash, 30000);
    return () => clearInterval(id);
  }, [loadFlash, loadCampaigns]);

  return (
    <section id="page-deals" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="page-head">
          <Eyebrow>{t('OFFERS & DEALS')}</Eyebrow>
          <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
            {t('Deals')} <span className="text-outline">{t('Desk')}</span>
          </h2>
          <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
            {t('Every live offer on one desk — flash windows, the welcome code, bundles, and the discounted catalog below. The server decides what is actually on.')}
          </p>
        </div>

        {/*unified campaign rails (11.11 · 12.12 · mega · daily · seasonal · brand · bogo · combo · clearance)*/}
        {campaigns && campaigns.length > 0 ? (
          <div className="mt-10" id="dealsRails">
            <div className="flex flex-wrap gap-2">
              {campaigns.map((c) => (
                <button key={c.slug} onClick={() => openCampaign(c.slug)}
                  className={'group inline-flex items-center gap-2 border px-4 py-2.5 transition-colors ' + (campaign && campaign.slug === c.slug ? 'border-acc bg-acc/10' : 'border-line bg-panel hover:border-acc/60')}
                  style={{ boxShadow: campaign && campaign.slug === c.slug ? '0 0 0 1px var(--acc) inset' : undefined }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.accent || 'var(--acc)' }} />
                  <span className="text-left">
                    <b className="block font-head text-[.86rem] uppercase tracking-wide text-txt">{c.badge || c.name}</b>
                    <span className="block text-[.72rem] uppercase tracking-[.18em] text-dim">{c.type} · {c.discount.label}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5" id="dealsCampaign">
              {campaign ? (
                <div className="border border-line bg-panel p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <b className="font-disp text-[1.5rem] uppercase text-txt">{campaign.name}</b>
                    <span className="border border-acc/60 px-2.5 py-1 font-cond text-[.74rem] uppercase tracking-[.2em] text-acc">{campaign.discount.label}</span>
                    <span className="font-cond text-[.74rem] uppercase tracking-[.2em] text-muted">
                      {new Date(campaign.startsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → {new Date(campaign.endsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                    {campaign.bogo && campaign.bogo.buyQty ? <span className="border border-dashed border-acc px-2.5 py-1 text-[.74rem] tracking-wide text-acc">{campaign.bogo.label}</span> : null}
                  </div>
                  {campaign.description ? <p className="mt-2 max-w-2xl text-[.9rem] leading-relaxed text-muted">{campaign.description}</p> : null}
                  <div className="mt-5">
                    {!campaignItems ? <p className="text-[.85rem] text-dim">{t('Loading…')}</p> : campaignItems.length ? (
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        {campaignItems.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}
                      </div>
                    ) : <p className="text-[.85rem] text-dim">{t('No products in this slice right now.')}</p>}
                  </div>
                </div>
              ) : (
                <p className="border border-dashed border-line2 px-4 py-3 text-[.85rem] text-dim">{t('Tap a campaign chip to open its product grid — the server resolves scope, prices and badges live.')}</p>
              )}
            </div>
          </div>
        ) : null}

        {flash && flash.length > 0 ? (
          <div className="mt-10 border border-acc/50 bg-acc/[.06] p-5 sm:p-6" id="dealsFlash">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <p className="flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-acc" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L4.5 13.5H11L9.5 22 19.5 9.5H13l1-7.5z" /></svg>
                {t('Flash campaign live')}
              </p>
              <span className="inline-flex items-center gap-3 border border-acc/60 bg-acc/10 px-4 py-2">
                <span className="font-cond text-[.75rem] uppercase tracking-[.2em] text-muted">{t('Ends in')}</span>
                <b className="font-disp text-[1.3rem] tracking-wide text-acc tabular-nums">{countdown}</b>
              </span>
              <Link to="/flash-sale" className="ml-auto font-cond text-[.78rem] uppercase tracking-[.2em] text-acc transition-colors hover:text-acc2">{t('Full flash page')} →</Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {flash.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        ) : null}

        <div className="mt-8 grid gap-[.7rem] md:grid-cols-2" id="dealsCards">
          <div className="border border-line bg-panel p-6">
            <p className="font-cond text-[.78rem] uppercase tracking-[.26em] text-dim">{t('New here?')}</p>
            <p className="mt-2 font-disp text-[1.6rem] uppercase text-txt">{t('10% off your first order')}</p>
            <p className="mt-2 max-w-md text-[.88rem] leading-relaxed text-muted">
              {t('Subscribe with your email and the welcome code lands instantly — it applies to full-price items at checkout.')}
            </p>
            <p className="mt-4 inline-block border border-dashed border-acc px-4 py-2 font-disp text-[1.2rem] tracking-[.2em] text-acc">ARIX10</p>
          </div>
          <div className="border border-line bg-panel p-6">
            <p className="font-cond text-[.78rem] uppercase tracking-[.26em] text-dim">{t('Build cheaper together')}</p>
            <p className="mt-2 font-disp text-[1.6rem] uppercase text-txt">{t('Combo bundles')}</p>
            <p className="mt-2 max-w-md text-[.88rem] leading-relaxed text-muted">
              {t('Laptop + bag + mouse class bundles priced below the parts sum — the allocation math runs server-side at checkout.')}
            </p>
            <Link to="/shop" className={`${btnPrimary} mt-4`}>{t('Shop the Catalog')}</Link>
          </div>
        </div>

        <div className="mt-12">
          <h3 className="mb-6 flex items-center gap-3 font-disp text-[1.35rem] uppercase text-txt">
            <i className="not-italic inline-block h-0.5 w-8 bg-acc" />{t('On sale right now')}
          </h3>
          <CatalogBrowser
            id="dealsBrowser"
            initial={{ saleOnly: true }}
            emptyTitle="Nothing Discounted In This Slice"
            emptyBody="Loosen the filters — discounts move with stock and campaigns."
          />
        </div>
      </div>
    </section>
  );
}
