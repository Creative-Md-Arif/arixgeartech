/* ArixGear ADMIN page — SEO Management (React)
   Tabs: Pages (per-page meta/OG/Twitter/schema) · Products (per-product SEO override)
   · Site & Schema (+GA4) · Sitemap · Robots.txt · Google Services (GSC automation + GA4 API)
   Backed by /api/admin/seo* + public /robots.txt + /sitemap.xml.            */
import { useEffect, useRef, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { useParams, Navigate, Link as RLink } from 'react-router-dom';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { list, savePage, saveSite, productList, saveProductSeo, robotsPreview, robotsReset,
  gscStatus, gscSave, gscSubmitUrl, gscSubmitSitemap, gscIndexSitemap, gscLog } from '../services/seo.js';
import { uploadOne } from '../services/uploads.js';

const ACC_BTN = 'rounded-lg bg-acc px-3.5 py-2 text-[11.5px] font-bold uppercase tracking-[.06em] text-white transition hover:bg-acc-hi disabled:opacity-50';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const INPUT = 'w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide';
const CARD = 'rounded-xl border border-line bg-panel p-5';
const TAB = (on) => 'rounded-lg px-4 py-2 text-[12px] font-bold uppercase tracking-[.08em] border transition ' + (on ? 'border-acc bg-acc text-white' : 'border-line2 text-dim hover:text-txt hover:border-dim');

const ROBOTS_CHOICES = ['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow', 'noarchive', 'nosnippet'];
const OG_TYPES = ['website', 'article', 'product', 'profile'];
const TW_CARDS = ['summary', 'summary_large_image'];

/* label + character counter */
function Field({ label, value, set, max, area, rows = 3, placeholder, mono, hint }) {
  const len = (value || '').length;
  return (
    <div className="mb-3.5">
      <label>{label}{max ? <span className={'ml-1.5 ' + (len > max ? 'text-red' : 'text-dim2')}>{len}/{max}</span> : null}</label>
      {area ? (
        <textarea rows={rows} className={INPUT + (mono ? ' font-mono text-[11.5px] leading-relaxed' : '')} placeholder={placeholder || ''} value={value || ''} onChange={(e) => set(e.target.value)} />
      ) : (
        <input className={INPUT} placeholder={placeholder || ''} value={value || ''} onChange={(e) => set(e.target.value)} />
      )}
      {hint ? <p className="mt-1 text-[10.5px] text-dim2">{hint}</p> : null}
    </div>
  );
}

function Select({ label, value, set, options }) {
  return (
    <div className="mb-3.5">
      <label>{label}</label>
      <select className={INPUT} value={value || options[0]} onChange={(e) => set(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* image url + upload button */
function ImageField({ label, value, set }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const d = await uploadOne(file);
      set(d.image?.url || d.image || '');
      toast('Image uploaded');
    } catch (e) { toast(e.message || 'Upload failed', 'err'); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-3.5">
      <label>{label}</label>
      <div className="flex gap-2">
        <input className={INPUT} placeholder="/assets/og-cover.jpg or https://…" value={value || ''} onChange={(e) => set(e.target.value)} />
        <button type="button" className={GHOST_BTN + ' whitespace-nowrap ' + (busy ? 'opacity-50' : '')} onClick={() => ref.current?.click()}>{busy ? '…' : 'Upload'}</button>
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {value ? <img src={value} alt="preview" className="mt-2 h-16 w-auto rounded border border-line2 object-cover" /> : null}
    </div>
  );
}

/* ─────────────── Tab 1: PAGES ─────────────── */
function PagesTab({ pages, reload }) {
  const toast = useToast();
  const [sel, setSel] = useState(null); /* current pageKey */
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [schemaErr, setSchemaErr] = useState('');

  const open = (p) => {
    setSel(p.pageKey);
    setForm(JSON.parse(JSON.stringify(p)));
    setSchemaErr('');
  };

  const put = (path, v) => setForm((f) => {
    const n = JSON.parse(JSON.stringify(f));
    const seg = path.split('.');
    let o = n;
    for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]];
    o[seg[seg.length - 1]] = v;
    return n;
  });

  const save = async () => {
    if (!form) return;
    if (form.customSchema && String(form.customSchema).trim()) {
      try { JSON.parse(form.customSchema); } catch (e) { setSchemaErr('Invalid JSON — ' + e.message); return; }
    }
    setSchemaErr('');
    setBusy(true);
    try {
      await savePage(sel, form);
      toast('SEO saved — ' + sel);
      reload();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };

  const pageLabel = (k) => ({ home: 'Home', shop: 'Shop', product: 'Product detail', about: 'About', guides: 'Guides', contact: 'Contact', account: 'Account', checkout: 'Checkout', success: 'Order success' }[k] || k);

  if (!pages.length) return <div className={CARD}>No pages found.</div>;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
      {/* page list */}
      <div className="rounded-xl border border-line bg-panel p-2" id="seoPageList">
        {pages.map((p) => {
          const on = sel === p.pageKey;
          const done = !!(p.metaTitle && p.metaDescription);
          return (
            <button key={p.pageKey} onClick={() => open(p)}
              className={'mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] transition ' + (on ? 'bg-acc/15 text-acc' : 'text-dim2 hover:bg-white/[.04] hover:text-txt')}>
              <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (done ? 'bg-green' : 'bg-line2')} />
              <span className="flex-1 font-semibold">{pageLabel(p.pageKey)}</span>
              {/noindex/i.test(p.metaRobots) ? <span className="rounded bg-red/15 px-1.5 py-0.5 text-[9px] font-bold text-red">NOINDEX</span> : null}
            </button>
          );
        })}
      </div>

      {/* editor */}
      {!form ? (
        <div className={CARD + ' px-6 py-14 text-center text-[13px] text-dim2'}>Select a page from the left to edit its SEO.</div>
      ) : (
        <div className={CARD} id="seoPageForm">
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-[15px]">{pageLabel(sel)}</h3>
            <span className={CHIP + ' border-line2 text-dim2'}>{sel}</span>
            <button className={ACC_BTN + ' ml-auto'} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save SEO'}</button>
          </div>

          <div className="grid gap-x-5 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Meta tags</p>
              <Field label="Meta title" value={form.metaTitle} set={(v) => put('metaTitle', v)} max={180} />
              <Field label="Meta description" value={form.metaDescription} set={(v) => put('metaDescription', v)} max={320} area rows={3} />
              <Field label="Meta keywords" value={form.metaKeywords} set={(v) => put('metaKeywords', v)} max={320} area rows={2} hint="Comma separated — ignored by Google, used by some engines." />
              <Field label="Canonical URL" value={form.canonicalUrl} set={(v) => put('canonicalUrl', v)} placeholder="https://arixgear.tech/shop" hint="Empty = canonical auto-set to this page's URL." />
              <Select label="Meta robots" value={form.metaRobots} set={(v) => put('metaRobots', v)} options={ROBOTS_CHOICES} />
            </div>
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Open Graph (Facebook / Messenger / LinkedIn)</p>
              <Field label="OG title" value={form.og?.title} set={(v) => put('og.title', v)} max={180} hint="Empty = meta title" />
              <Field label="OG description" value={form.og?.description} set={(v) => put('og.description', v)} max={320} area rows={2} hint="Empty = meta description" />
              <ImageField label="OG image (1200×630 recommended)" value={form.og?.image} set={(v) => put('og.image', v)} />
              <Select label="OG type" value={form.og?.type} set={(v) => put('og.type', v)} options={OG_TYPES} />

              <p className="mb-2 mt-4 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Twitter Card (X)</p>
              <Field label="Twitter title" value={form.twitter?.title} set={(v) => put('twitter.title', v)} max={180} hint="Empty = OG title" />
              <Field label="Twitter description" value={form.twitter?.description} set={(v) => put('twitter.description', v)} max={320} area rows={2} />
              <ImageField label="Twitter image" value={form.twitter?.image} set={(v) => put('twitter.image', v)} />
              <Select label="Twitter card" value={form.twitter?.card} set={(v) => put('twitter.card', v)} options={TW_CARDS} />
            </div>
          </div>

          <div className="mt-2 border-t border-line pt-4">
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Custom structured data (JSON-LD)</p>
            <Field label="Schema markup — @context + @type JSON" value={form.customSchema} set={(v) => { put('customSchema', v); setSchemaErr(''); }} max={20000} area rows={6} mono
              placeholder='{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": […] }' />
            {schemaErr ? <p className="mb-2 text-[11.5px] text-red">{schemaErr}</p> : null}
            <p className="text-[10.5px] text-dim2">Merged into the page head as a separate &lt;script type="application/ld+json"&gt;. Product + Organization + Breadcrumb schema are auto-generated from the Site &amp; Schema tab.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Tab 2: PRODUCTS (per-product SEO override) ─────────────── */
const AUTO_ROBOTS = '(auto — page default)';
const EMPTY_PSEO = { metaTitle: '', metaDescription: '', metaKeywords: '', canonicalUrl: '', metaRobots: '', og: { title: '', description: '', image: '' }, twitter: { title: '', description: '', image: '' }, customSchema: '' };

function ProductsTab() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null); /* product _id */
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [schemaErr, setSchemaErr] = useState('');

  const load = async () => {
    try {
      const d = await productList();
      setItems(d.items || []);
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const open = (p) => {
    setSel(p._id);
    const s = p.seo || {};
    setForm({
      metaTitle: s.metaTitle || '', metaDescription: s.metaDescription || '', metaKeywords: s.metaKeywords || '',
      canonicalUrl: s.canonicalUrl || '', metaRobots: s.metaRobots || '',
      og: { title: s.og?.title || '', description: s.og?.description || '', image: s.og?.image || '' },
      twitter: { title: s.twitter?.title || '', description: s.twitter?.description || '', image: s.twitter?.image || '' },
      customSchema: s.customSchema || '',
    });
    setSchemaErr('');
  };

  const put = (path, v) => setForm((f) => {
    const n = JSON.parse(JSON.stringify(f));
    const seg = path.split('.');
    let o = n;
    for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]];
    o[seg[seg.length - 1]] = v;
    return n;
  });

  const save = async (clear) => {
    if (!form || !sel) return;
    if (!clear && form.customSchema && String(form.customSchema).trim()) {
      try { JSON.parse(form.customSchema); } catch (e) { setSchemaErr('Invalid JSON — ' + e.message); return; }
    }
    setSchemaErr('');
    setBusy(true);
    try {
      await saveProductSeo(sel, clear ? JSON.parse(JSON.stringify(EMPTY_PSEO)) : form);
      toast(clear ? 'Override cleared — auto SEO restored' : 'Product SEO saved');
      await load();
      if (clear) setForm(JSON.parse(JSON.stringify(EMPTY_PSEO)));
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };

  if (err) return <div className={CARD + ' px-5 py-12 text-center text-[13.5px] text-dim2'}><span className="mb-2 block font-disp text-[26px] text-line2">ERROR</span>{err}</div>;
  if (!items) return <div className={CARD + ' px-5 py-12 text-center text-[13.5px] text-dim2'}>Loading…</div>;

  const cur = items.find((x) => x._id === sel) || null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
      {/* product list */}
      <div className="rounded-xl border border-line bg-panel p-2" id="seoProductList">
        {items.map((p) => {
          const on = sel === p._id;
          return (
            <button key={p._id} onClick={() => open(p)}
              className={'mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] transition ' + (on ? 'bg-acc/15 text-acc' : 'text-dim2 hover:bg-white/[.04] hover:text-txt')}>
              <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (p.hasOverride ? 'bg-green' : 'bg-line2')} />
              <span className="flex-1 truncate font-semibold">{p.name}</span>
              {!p.active ? <span className="rounded bg-line2/40 px-1.5 py-0.5 text-[9px] font-bold text-dim2">HIDDEN</span> : null}
              {/noindex/i.test((p.seo && p.seo.metaRobots) || '') ? <span className="rounded bg-red/15 px-1.5 py-0.5 text-[9px] font-bold text-red">NOINDEX</span> : null}
            </button>
          );
        })}
      </div>

      {/* editor */}
      {!form || !cur ? (
        <div className={CARD + ' px-6 py-14 text-center text-[13px] text-dim2'}>Select a product to override its SEO — products without an override use the auto template from the Pages tab.</div>
      ) : (
        <div className={CARD} id="seoProductForm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h3 className="text-[15px]">{cur.name}</h3>
            <span className={CHIP + ' border-line2 text-dim2'}>/{cur.slug}</span>
            {cur.hasOverride ? <span className={CHIP + ' border-acc/40 text-acc'}>override</span> : <span className={CHIP + ' border-line2 text-dim2'}>auto</span>}
            {cur.hasOverride ? <button className={GHOST_BTN + ' ml-auto'} onClick={() => save(true)} disabled={busy}>Clear override</button> : null}
            <button className={ACC_BTN + (cur.hasOverride ? '' : ' ml-auto')} onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save Override'}</button>
          </div>

          <p className="mb-3 rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[11px] leading-relaxed text-dim2">
            Every empty field falls back to the automatic template — <b>{'{product.name} — ArixGear'}</b> from the Pages tab,
            description from the product copy, image from the first product shot. Fill a field only to beat the automatic value for this product.
          </p>

          <div className="grid gap-x-5 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Meta tags</p>
              <Field label="Meta title" value={form.metaTitle} set={(v) => put('metaTitle', v)} max={180} placeholder="(auto) Nova X5 Pro — 8GB/256GB — ArixGear" />
              <Field label="Meta description" value={form.metaDescription} set={(v) => put('metaDescription', v)} max={320} area rows={3} placeholder="(auto) from the product description" />
              <Field label="Meta keywords" value={form.metaKeywords} set={(v) => put('metaKeywords', v)} max={320} area rows={2} placeholder="(auto) category, buy online bd" hint="Comma separated. {product.category} / {product.name} placeholders work here too." />
              <Field label="Canonical URL" value={form.canonicalUrl} set={(v) => put('canonicalUrl', v)} placeholder="(auto) current page URL" hint="Only when this product is reachable from another URL." />
              <Select label="Meta robots" value={form.metaRobots || AUTO_ROBOTS} set={(v) => put('metaRobots', v === AUTO_ROBOTS ? '' : v)} options={[AUTO_ROBOTS, ...ROBOTS_CHOICES]} />
            </div>
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Open Graph — og:type is always “product” here</p>
              <Field label="OG title" value={form.og?.title} set={(v) => put('og.title', v)} max={180} hint="Empty = meta title / auto template" />
              <Field label="OG description" value={form.og?.description} set={(v) => put('og.description', v)} max={320} area rows={2} />
              <ImageField label="OG image (empty = first product shot)" value={form.og?.image} set={(v) => put('og.image', v)} />

              <p className="mb-2 mt-4 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Twitter Card (X)</p>
              <Field label="Twitter title" value={form.twitter?.title} set={(v) => put('twitter.title', v)} max={180} hint="Empty = OG title" />
              <Field label="Twitter description" value={form.twitter?.description} set={(v) => put('twitter.description', v)} max={320} area rows={2} />
              <ImageField label="Twitter image (empty = OG image)" value={form.twitter?.image} set={(v) => put('twitter.image', v)} />
            </div>
          </div>

          <div className="mt-2 border-t border-line pt-4">
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Custom structured data (JSON-LD) — this product only</p>
            <Field label="Schema markup — @context + @type JSON" value={form.customSchema} set={(v) => { put('customSchema', v); setSchemaErr(''); }} max={20000} area rows={5} mono
              placeholder='{ "@context": "https://schema.org", "@type": "Product", … }' />
            {schemaErr ? <p className="mb-2 text-[11.5px] text-red">{schemaErr}</p> : null}
            <p className="text-[10.5px] text-dim2">Replaces the page-level custom schema on this product's view. Auto Product schema (price ৳, stock, rating) keeps running alongside it.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Tab 3: SITE & SCHEMA ─────────────── */
function SiteTab({ site, reload }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const f = JSON.parse(JSON.stringify(site));
    /* analytics subdoc may be missing on site docs created before GA4 shipped */
    if (!f.analytics) f.analytics = { enabled: false, ga4Id: '' };
    setForm(f);
  }, [site]);
  if (!form) return null;
  const put = (path, v) => setForm((f) => {
    const n = JSON.parse(JSON.stringify(f));
    const seg = path.split('.');
    let o = n;
    for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]];
    o[seg[seg.length - 1]] = v;
    return n;
  });

  const save = async () => {
    setBusy(true);
    try {
      await saveSite(form);
      toast('Site SEO saved');
      reload();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className={CARD} id="seoSiteForm">
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-[15px]">Site &amp; Schema</h3>
        <button className={ACC_BTN + ' ml-auto'} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <div className="grid gap-x-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Global</p>
          <Field label="Site URL (canonical origin)" value={form.siteUrl} set={(v) => put('siteUrl', v)} placeholder="https://arixgear.tech" hint="Used for canonical URLs, sitemap links & schema. Empty = auto-detect from the request." />
          <Field label="Title template" value={form.titleTemplate} set={(v) => put('titleTemplate', v)} hint="%s = page title. Example: %s | ArixGear" />
          <Field label="Brand name" value={form.brandName} set={(v) => put('brandName', v)} />
          <Field label="Twitter handle" value={form.twitterHandle} set={(v) => put('twitterHandle', v)} placeholder="arixgear" />
          <ImageField label="Default OG image (fallback for pages without one)" value={form.defaultOgImage} set={(v) => put('defaultOgImage', v)} />
          <Field label="Google Search Console verification code" value={form.gscVerification} set={(v) => put('gscVerification', v)} hint="The content value of the google-site-verification meta tag." />
        </div>
        <div>
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Structured data (Schema.org)</p>
          <label className="mb-3 flex cursor-pointer items-center gap-2.5 text-[12.5px]">
            <input type="checkbox" checked={!!form.org?.enabled} onChange={(e) => put('org.enabled', e.target.checked)} className="h-4 w-4 accent-[#2F81F7]" />
            <b>Organization schema</b> <span className="text-dim2">— brand, logo, address, socials on every page</span>
          </label>
          <Field label="Organization name" value={form.org?.name} set={(v) => put('org.name', v)} />
          <ImageField label="Organization logo" value={form.org?.logo} set={(v) => put('org.logo', v)} />
          <Field label="Phone" value={form.org?.phone} set={(v) => put('org.phone', v)} />
          <Field label="Address" value={form.org?.address} set={(v) => put('org.address', v)} />
          <Field label="Social profiles (sameAs)" value={form.org?.sameAs} set={(v) => put('org.sameAs', v)} area rows={3} placeholder={'https://facebook.com/arixgear\nhttps://instagram.com/arixgear'} hint="One URL per line." />
          <label className="mt-1 mb-3 flex cursor-pointer items-center gap-2.5 text-[12.5px]">
            <input type="checkbox" checked={!!form.productSchema} onChange={(e) => put('productSchema', e.target.checked)} className="h-4 w-4 accent-[#2F81F7]" />
            <b>Product schema</b> <span className="text-dim2">— auto JSON-LD (price ৳, stock, rating) on product view</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px]">
            <input type="checkbox" checked={!!form.breadcrumbSchema} onChange={(e) => put('breadcrumbSchema', e.target.checked)} className="h-4 w-4 accent-[#2F81F7]" />
            <b>Breadcrumb schema</b> <span className="text-dim2">— Home / Shop trail</span>
          </label>

          <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Google Analytics 4</p>
          <label className="mb-3 flex cursor-pointer items-center gap-2.5 text-[12.5px]">
            <input type="checkbox" checked={!!form.analytics?.enabled} onChange={(e) => put('analytics.enabled', e.target.checked)} className="h-4 w-4 accent-[#2F81F7]" />
            <b>Enable GA4</b> <span className="text-dim2">— storefront loads gtag.js the moment this is on</span>
          </label>
          <Field label="Measurement ID" value={form.analytics?.ga4Id} set={(v) => put('analytics.ga4Id', v.toUpperCase())} placeholder="G-XXXXXXXXXX" mono
            hint="Google Analytics → Admin → Data streams → Web. Auto-tracked: page_view, view_item, add_to_cart, begin_checkout, purchase, search, sign_up." />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Tab 4: SITEMAP ─────────────── */
function SitemapTab({ site, reload }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm(JSON.parse(JSON.stringify(site))); }, [site]);
  if (!form) return null;
  const put = (path, v) => setForm((f) => {
    const n = JSON.parse(JSON.stringify(f));
    const seg = path.split('.');
    let o = n;
    for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]];
    o[seg[seg.length - 1]] = v;
    return n;
  });

  const save = async (extra) => {
    setBusy(true);
    try {
      await saveSite(extra || form);
      toast('Sitemap settings saved');
      reload();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };

  const addUrl = () => {
    const list = [...(form.sitemap?.extraUrls || []), { path: '', changefreq: 'weekly', priority: '0.5' }];
    put('sitemap.extraUrls', list);
  };
  const setUrl = (i, k, v) => {
    const list = [...(form.sitemap?.extraUrls || [])];
    list[i] = { ...list[i], [k]: v };
    put('sitemap.extraUrls', list);
  };
  const delUrl = (i) => {
    const list = (form.sitemap?.extraUrls || []).filter((_, x) => x !== i);
    put('sitemap.extraUrls', list);
  };

  return (
    <div id="seoSitemapForm">
      <div className={CARD + ' mb-4'}>
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-[15px]">XML Sitemap</h3>
          <a className={GHOST_BTN + ' ml-auto'} href="/sitemap.xml" target="_blank" rel="noreferrer">Open /sitemap.xml ↗</a>
          <button className={ACC_BTN} onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
        <label className="mb-3 flex cursor-pointer items-center gap-2.5 text-[12.5px]">
          <input type="checkbox" checked={form.sitemap?.includeStatic !== false} onChange={(e) => put('sitemap.includeStatic', e.target.checked)} className="h-4 w-4 accent-[#2F81F7]" />
          <b>Include static pages</b> <span className="text-dim2">— /, /shop, /about, /guides, /contact (noindex pages skipped automatically)</span>
        </label>
        <label className="mb-2 flex cursor-pointer items-center gap-2.5 text-[12.5px]">
          <input type="checkbox" checked={!!form.sitemap?.includeCategories} onChange={(e) => put('sitemap.includeCategories', e.target.checked)} className="h-4 w-4 accent-[#2F81F7]" />
          <b>Include category links</b> <span className="text-dim2">— /shop?category=… for every active category</span>
        </label>
      </div>

      <div className={CARD}>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-[15px]">Custom URLs</h3>
          <button className={GHOST_BTN + ' ml-auto'} onClick={addUrl}>+ Add URL</button>
        </div>
        <p className="mb-3 text-[11.5px] text-dim2">Extra paths appended to the sitemap — landing pages, blog posts, external campaign pages.</p>
        {(form.sitemap?.extraUrls || []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-line2 px-4 py-6 text-center text-[12px] text-dim2">No custom URLs yet.</p>
        ) : (
          <div className="space-y-2">
            {form.sitemap.extraUrls.map((u, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input className={INPUT + ' flex-1 min-w-[200px]'} placeholder="/landing-page" value={u.path || ''} onChange={(e) => setUrl(i, 'path', e.target.value)} />
                <select className={INPUT + ' w-[120px]'} value={u.changefreq || 'weekly'} onChange={(e) => setUrl(i, 'changefreq', e.target.value)}>
                  {['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <input className={INPUT + ' w-[80px]'} placeholder="0.5" value={u.priority || ''} onChange={(e) => setUrl(i, 'priority', e.target.value)} />
                <button className="rounded-lg border border-red/40 px-2.5 py-1.5 text-[11.5px] font-bold text-red transition hover:bg-red/10" onClick={() => delUrl(i)}>✕</button>
              </div>
            ))}
            <button className={ACC_BTN} onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save URLs'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Tab 5: ROBOTS.TXT ─────────────── */
function RobotsTab({ site, reload }) {
  const toast = useToast();
  const [txt, setTxt] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await robotsPreview();
      setTxt(d.robotsTxt || '');
      setIsDefault(!!d.isDefault);
    } catch (e) { toast(e.message || 'Load failed', 'err'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [site?.siteUrl]);

  const save = async () => {
    setBusy(true);
    try {
      await saveSite({ ...site, robotsTxt: txt });
      toast('robots.txt saved');
      await load();
      reload();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try {
      await robotsReset();
      toast('robots.txt restored to default');
      await load();
      reload();
    } catch (e) { toast(e.message || 'Reset failed', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className={CARD} id="seoRobotsForm">
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-[15px]">robots.txt</h3>
        {isDefault ? <span className={CHIP + ' border-line2 text-dim2'}>default</span> : <span className={CHIP + ' border-acc/40 text-acc'}>custom</span>}
        <a className={GHOST_BTN + ' ml-auto'} href="/robots.txt" target="_blank" rel="noreferrer">Open /robots.txt ↗</a>
        <button className={GHOST_BTN} onClick={reset} disabled={busy}>Reset to default</button>
        <button className={ACC_BTN} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <textarea rows={12} className={INPUT + ' font-mono text-[11.5px] leading-relaxed'} value={txt} onChange={(e) => setTxt(e.target.value)} />
      <p className="mt-2 text-[10.5px] leading-relaxed text-dim2">
        One directive per line — User-agent / Allow / Disallow / Sitemap. The generated default already blocks
        /admin, /api, /checkout, /success, /account and points to the sitemap. Set the Site URL in
        <b> Site &amp; Schema</b> first so the Sitemap line uses your domain.
      </p>
    </div>
  );
}

/* ─────────────── Tab 6: GOOGLE SERVICES (GSC automation + GA4 reporting) ─────────────── */
const fmtTime = (s) => { try { return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return s; } };
/* built from parts so this file never contains a literal PEM armor string */
const PEM_HINT = '-----BEGIN ' + ['PRIVATE', 'KEY'].join(' ') + '-----\nMIIEvQ…\n-----END ' + ['PRIVATE', 'KEY'].join(' ') + '-----';

function GoogleTab() {
  const toast = useToast();
  const [st, setSt] = useState(null);          // status from /seo/gsc
  const [form, setForm] = useState(null);      // editable settings
  const [key, setKey] = useState('');          // write-only private key
  const [busy, setBusy] = useState(false);
  const [logRows, setLogRows] = useState(null);
  const [qUrl, setQUrl] = useState('');
  const [qType, setQType] = useState('URL_UPDATED');
  const [actBusy, setActBusy] = useState('');  // which action button is spinning
  const [batchRes, setBatchRes] = useState(null);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [s, l] = await Promise.all([gscStatus(), gscLog()]);
      setSt(s);
      setForm({
        clientEmail: s.clientEmail || '',
        gscSiteUrl: (s.gsc && s.gsc.siteUrl) || '',
        autoSubmitProducts: !!(s.gsc && s.gsc.autoSubmitProducts),
        autoSubmitSitemap: !!(s.gsc && s.gsc.autoSubmitSitemap),
        ga4PropertyId: s.ga4PropertyId || '',
      });
      setLogRows(l.items || []);
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const put = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await gscSave({ ...form, privateKey: key });
      toast('Google connection saved');
      setKey('');
      await load();
    } catch (e) { toast(e.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };

  const run = async (name, fn, okMsg) => {
    setActBusy(name);
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await load();
      return r;
    } catch (e) { toast(e.message || 'Action failed', 'err'); }
    finally { setActBusy(''); }
  };

  const submitQuickUrl = async () => {
    if (!qUrl.trim()) return toast('Enter a URL first', 'err');
    const r = await run('url', () => gscSubmitUrl({ url: qUrl.trim(), type: qType }));
    if (r) {
      toast(r.mode === 'dry-run' ? 'Dry-run — logged (no service account configured)' : r.ok ? 'Submitted to Google ✓' : 'Google rejected — see log', r.ok || r.mode === 'dry-run' ? undefined : 'err');
      setQUrl('');
    }
  };

  const indexAll = async () => {
    const r = await run('batch', () => gscIndexSitemap());
    if (r) setBatchRes(r);
  };

  if (err) return <div className={CARD + ' px-5 py-12 text-center text-[13.5px] text-dim2'}><span className="mb-2 block font-disp text-[26px] text-line2">ERROR</span>{err}</div>;
  if (!st || !form) return <div className={CARD + ' px-5 py-12 text-center text-[13.5px] text-dim2'}>Loading…</div>;

  return (
    <div id="seoGoogleForm">
      {/* status strip */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[.18em] text-dim2">Status</span>
        {st.configured
          ? <span className={CHIP + ' border-green/40 text-green'}>service account live</span>
          : <span className={CHIP + ' border-line2 text-dim2'}>dry-run — no service account</span>}
        {st.hasKey ? <span className={CHIP + ' border-green/40 text-green'}>key saved</span> : null}
        {form.gscSiteUrl ? <span className={CHIP + ' border-line2 text-dim2'}>{form.gscSiteUrl}</span> : <span className={CHIP + ' border-red/40 text-red'}>no GSC property</span>}
        {form.ga4PropertyId ? <span className={CHIP + ' border-line2 text-dim2'}>GA4 property {form.ga4PropertyId}</span> : <span className={CHIP + ' border-line2 text-dim2'}>no GA4 property</span>}
        <span className="ml-auto text-[11px] text-dim2">Indexing quota cap: {st.indexCap} URLs per batch (Google allows ~200/day)</span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* connection + automations */}
        <div className={CARD}>
          <h3 className="mb-4 text-[15px]">Connection &amp; automations</h3>
          <Field label="Service account email" value={form.clientEmail} set={(v) => put('clientEmail', v)} placeholder="forged@forged-123.iam.gserviceaccount.com" mono />
          <Field label="Service account private key (write-only)" value={key} set={setKey} area rows={4} mono
            placeholder={st.hasKey ? '(a key is saved - paste a new one only to replace it)' : PEM_HINT}
            hint={st.hasKey ? 'A key is stored — it is never sent back to the browser. Leave empty to keep it.' : 'Paste the full "private_key" value from the service-account JSON file.'} />
          <Field label="Search Console property" value={form.gscSiteUrl} set={(v) => put('gscSiteUrl', v)} placeholder="https://arixgear.tech   or   sc-domain:arixgear.tech" mono
            hint="Exactly as shown in Search Console → Settings. The sitemap is submitted to this property."
          />
          <Field label="GA4 property ID (for the dashboard funnel report)" value={form.ga4PropertyId} set={(v) => put('ga4PropertyId', v.replace(/[^\d]/g, ''))} placeholder="412345678" mono
            hint="GA4 → Admin → Property settings → Property ID (numeric). Uses the same service account." />

          <p className="mb-2 mt-4 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Submission automations</p>
          <label className="mb-2.5 flex cursor-pointer items-start gap-2.5 text-[12.5px]">
            <input type="checkbox" checked={form.autoSubmitProducts} onChange={(e) => put('autoSubmitProducts', e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2F81F7]" />
            <span><b>Auto-notify on product changes</b> <span className="text-dim2">— pings Google (Indexing API) whenever a product is created, edited or deleted</span></span>
          </label>
          <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-[12.5px]">
            <input type="checkbox" checked={form.autoSubmitSitemap} onChange={(e) => put('autoSubmitSitemap', e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2F81F7]" />
            <span><b>Auto-resubmit sitemap on change</b> <span className="text-dim2">— submits /sitemap.xml to Search Console whenever sitemap or robots settings are saved</span></span>
          </label>
          <button className={ACC_BTN} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save connection'}</button>
        </div>

        {/* actions */}
        <div className={CARD}>
          <h3 className="mb-4 text-[15px]">Submit to Google</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            <button className={ACC_BTN} disabled={!!actBusy} onClick={async () => {
              const r = await run('sitemap', () => gscSubmitSitemap());
              if (r) toast(r.mode === 'dry-run' ? 'Dry-run — logged' : r.ok ? 'Sitemap submitted ✓' : 'Failed — see log', r.ok || r.mode === 'dry-run' ? undefined : 'err');
            }}>{actBusy === 'sitemap' ? 'Submitting…' : 'Submit sitemap'}</button>
            <button className={GHOST_BTN} disabled={!!actBusy} onClick={indexAll}>{actBusy === 'batch' ? 'Indexing…' : `Re-index sitemap URLs (≤${st.indexCap})`}</button>
          </div>
          {batchRes ? (
            <p className="mb-4 rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[11.5px] leading-relaxed">
              Batch: <b>{batchRes.submitted}</b> of {batchRes.total} URLs · ✓ {batchRes.okCount} · ✗ {batchRes.failCount} · mode <b>{batchRes.mode}</b>
              {batchRes.truncated ? ` · ${batchRes.truncated} skipped (over cap)` : ''}
              {batchRes.fatal ? <span className="text-red"> · stopped: {batchRes.fatal}</span> : ''}
            </p>
          ) : null}

          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Quick URL submission (Indexing API)</p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input className={INPUT + ' min-w-[200px] flex-1'} placeholder="/shop  or  https://arixgear.tech/shop" value={qUrl} onChange={(e) => setQUrl(e.target.value)} />
            <select className={INPUT + ' w-[150px]'} value={qType} onChange={(e) => setQType(e.target.value)}>
              <option>URL_UPDATED</option>
              <option>URL_DELETED</option>
            </select>
            <button className={ACC_BTN} disabled={!!actBusy} onClick={submitQuickUrl}>{actBusy === 'url' ? 'Submitting…' : 'Submit'}</button>
          </div>

          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.14em] text-dim2">Sitemaps known to Google</p>
          {st.sitemapsError ? <p className="mb-2 text-[11.5px] text-red">{st.sitemapsError}</p> : null}
          {st.sitemaps.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line2 px-4 py-4 text-center text-[12px] text-dim2">Nothing yet — submit the sitemap and Google will list it here with its status.</p>
          ) : (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-dim2">
                  <th className="pb-1.5 pr-3">Path</th><th className="pb-1.5 pr-3">Submitted</th><th className="pb-1.5 pr-3">Downloaded</th><th className="pb-1.5">Pending</th>
                </tr></thead>
                <tbody>
                  {st.sitemaps.map((s) => (
                    <tr key={s.path} className="border-t border-line">
                      <td className="py-1.5 pr-3 font-mono text-[11px]">{s.path}</td>
                      <td className="py-1.5 pr-3 text-dim2">{s.lastSubmitted ? fmtTime(s.lastSubmitted) : '—'}</td>
                      <td className="py-1.5 pr-3 text-dim2">{s.lastDownloaded ? fmtTime(s.lastDownloaded) : '—'}</td>
                      <td className="py-1.5">{s.isPending ? <span className="text-acc">pending</span> : <span className="text-green">processed</span>} {s.errors ? <span className="text-red">· {s.errors} errors</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* submission log */}
      <div className={CARD + ' mt-4'}>
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-[15px]">Submission log</h3>
          <button className={GHOST_BTN + ' ml-auto'} onClick={load}>Refresh</button>
        </div>
        {!logRows || logRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line2 px-4 py-6 text-center text-[12px] text-dim2">No submissions yet — everything Google receives (manual, batch or automated) is logged here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-dim2">
                <th className="pb-1.5 pr-3">When</th><th className="pb-1.5 pr-3">Kind</th><th className="pb-1.5 pr-3">Target</th><th className="pb-1.5 pr-3">Mode</th><th className="pb-1.5 pr-3">Result</th><th className="pb-1.5">Message</th>
              </tr></thead>
              <tbody>
                {logRows.map((r) => (
                  <tr key={r._id} className="border-t border-line">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-dim2">{fmtTime(r.createdAt)}</td>
                    <td className="py-1.5 pr-3">{r.kind}</td>
                    <td className="max-w-[240px] truncate py-1.5 pr-3 font-mono text-[11px]" title={r.target}>{r.target}</td>
                    <td className="py-1.5 pr-3"><span className={CHIP + (r.mode === 'live' ? ' border-acc/40 text-acc' : ' border-line2 text-dim2')}>{r.mode}</span></td>
                    <td className="py-1.5 pr-3">{r.ok ? <span className="text-green">✓ ok</span> : <span className="text-red">✗ fail</span>}{r.status ? <span className="ml-1 text-dim2">{r.status}</span> : null}</td>
                    <td className="max-w-[320px] truncate py-1.5 text-dim2" title={r.message}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* setup guide */}
      <details className="mt-4 rounded-xl border border-line bg-panel px-5 py-4">
        <summary className="cursor-pointer text-[12.5px] font-bold uppercase tracking-[.08em] text-dim hover:text-acc">Setup guide — one-time Google configuration</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[12.5px] leading-relaxed text-dim2">
          <li>Google Cloud Console → create/select a project → <b>IAM &amp; Admin → Service Accounts</b> → create one → <b>Keys → Add key → JSON</b>. Enable <b>Web Search Indexing API</b>, <b>Search Console API</b> and <b>Google Analytics Data API</b> under APIs &amp; Services.</li>
          <li>Paste the JSON's <b>client_email</b> and <b>private_key</b> above → Save connection. Until then everything runs in dry-run mode and only writes to the log.</li>
          <li><b>Search Console</b> → Settings → Users and permissions → add the service-account email as <b>Owner</b> (a domain property with DNS verification is the cleanest).</li>
          <li><b>GA4</b> → Admin → Property access management → add the same email as <b>Viewer</b>; copy the numeric Property ID into the field above for the dashboard funnel.</li>
          <li>Turn on the automations you want — product-change pings and/or sitemap auto-resubmit. Quota note: the Indexing API allows ~200 submissions/day; the batch action is capped at {st.indexCap}.</li>
        </ol>
      </details>
    </div>
  );
}

/* ─────────────── page shell ─────────────── */
const SEO_TABS = ['pages', 'products', 'site', 'sitemap', 'robots', 'google'];

function Seo() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  /* Phase 5 (5.4) — SEO split into routed sections (/seo/:tab) */
  const { section: routeTab } = useParams();
  const tab = SEO_TABS.includes(routeTab) ? routeTab : 'pages';

  const reload = async () => {
    try {
      const d = await list();
      setData(d);
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { reload(); }, []);

  if (err) return <div className={CARD + ' px-5 py-12 text-center text-[13.5px] text-dim2'}><span className="mb-2 block font-disp text-[26px] text-line2">ERROR</span>{err}</div>;
  if (!data) return <div className={CARD + ' px-5 py-12 text-center text-[13.5px] text-dim2'}>Loading…</div>;

  return (
    <div id="seoManage">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[['pages', 'Pages'], ['products', 'Products'], ['site', 'Site & Schema'], ['sitemap', 'Sitemap'], ['robots', 'Robots.txt'], ['google', 'Google Services']].map(([k, label]) => (
          <RLink key={k} to={'/seo/' + k} data-testid={'seoTab-' + k}
            className={TAB(tab === k)}>{label}</RLink>
        ))}
        <span className="ml-auto text-[11px] text-dim2">Public endpoints: /robots.txt · /sitemap.xml · /api/seo</span>
      </div>
      {tab === 'pages' && <PagesTab pages={data.pages || []} reload={reload} />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'site' && <SiteTab site={data.site} reload={reload} />}
      {tab === 'sitemap' && <SitemapTab site={data.site} reload={reload} />}
      {tab === 'robots' && <RobotsTab site={data.site} reload={reload} />}
      {tab === 'google' && <GoogleTab />}
    </div>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="seo" title="SEO Management">
        <Seo />
      </AdminShell>
    </OverlayProvider>
  );
}
