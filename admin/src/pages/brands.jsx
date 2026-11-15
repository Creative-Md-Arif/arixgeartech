/* ArixGear ADMIN page — Brands (Phase 5, 5.3 · C3 net-new module)
   /admin/brands · v2 catalog brand CRUD: name/slug/logo upload/featured/
   product counts. Deleting a brand detaches its products (backend contract). */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { CARD, ACC_BTN, GHOST_BTN, RED_BTN, CHIP, LBL, Toggle, Empty, useConfirm } from '../components/ui.jsx';
import { adminList, create, update, remove } from '../services/brands.js';
import { uploadOne } from '../services/uploads.js';

const BRAND_SKEL = 'animate-pulse rounded bg-line/60';
const BRAND_PAGE_SIZE = 9;

/* Mirrors the real brand cards: the same responsive grid, card padding,
   logo footprint, metadata line and stacked actions. */
function BrandGridSkeleton({ count = 6 }) {
  const safeCount = Math.max(1, Math.min(24, Number(count) || 6));
  return (
    <div data-testid="brandSkeleton" aria-busy="true" aria-label="Loading brands">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: safeCount }, (_, i) => (
          <div key={i} className={CARD + ' flex min-h-[108px] items-center gap-3'} aria-hidden="true">
            <span className={BRAND_SKEL + ' h-11 w-11 shrink-0 rounded-lg'} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={BRAND_SKEL + ' h-4 w-[62%]'} />
                {i % 3 === 0 ? <span className={BRAND_SKEL + ' h-4 w-[52px] rounded-full opacity-70'} /> : null}
              </div>
              <span className={BRAND_SKEL + ' mt-2 block h-3 w-[82%] opacity-70'} />
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <span className={BRAND_SKEL + ' h-7 w-[46px] rounded-lg'} />
              <span className={BRAND_SKEL + ' h-7 w-[58px] rounded-lg'} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandForm({ b, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !b;
  const [name, setName] = useState(b?.name || '');
  const [slug, setSlug] = useState(b?.slug || '');
  const [featured, setFeatured] = useState(!!b?.featured);
  const [logo, setLogo] = useState(b?.logo || '');
  const [busy, setBusy] = useState(false);

  const pickLogo = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      try { const d = await uploadOne(inp.files[0]); setLogo(d.image.url); toast('Logo uploaded ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    };
    inp.click();
  };

  const save = async () => {
    if (!name.trim()) return toast('Brand name is required', 'err');
    setBusy(true);
    try {
      const body = { name: name.trim(), slug: (slug.trim() || name.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), featured, logo };
      if (isNew) await create(body); else await update(b._id, body);
      toast(isNew ? 'Brand created ✓' : 'Brand saved ✓', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <div data-testid="brandForm">
      <h2 className="text-[17px]">{isNew ? '+ New Brand' : 'Edit Brand — ' + b.name}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block"><span className={LBL}>Name</span>
          <input data-testid="brandName" value={name} onChange={(e) => { setName(e.target.value); if (!b) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')); }} placeholder="e.g. ASUS" /></label>
        <label className="block"><span className={LBL}>Slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="asus" /></label>
        <div className="flex items-center gap-3"><Toggle on={featured} onClick={() => setFeatured((v) => !v)} /><span className="text-[12.5px] text-dim">Featured on the storefront brand strip</span></div>
        <div className="flex items-center gap-3">
          {logo ? <img src={logo} alt="" className="h-10 w-10 rounded-lg border border-line2 object-contain" /> : null}
          <button type="button" className={GHOST_BTN} onClick={pickLogo}>{logo ? 'Change logo' : 'Upload logo'}</button>
          {logo ? <button type="button" className={GHOST_BTN} onClick={() => setLogo('')}>Clear</button> : null}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} onClick={closeModal} disabled={busy}>Cancel</button>
        <button className={ACC_BTN} data-testid="brandSave" onClick={save} disabled={busy}>{isNew ? 'Create Brand' : 'Save'}</button>
      </div>
    </div>
  );
}

function BrandsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const load = useCallback(async () => {
    try {
      const adm = await adminList({ q: search, page, limit: BRAND_PAGE_SIZE });
      setItems(adm.items || []);
      setTotal(adm.total || 0);
      setPageCount(adm.pages || 1);
      setErr('');
    } catch (e) { setErr(e.message); setItems([]); }
  }, [page, search]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);
  const pageItems = items || [];

  const del = async (b) => {
    if (!(await confirm({ title: 'Delete brand', body: `Delete brand "${b.name}"? Its products are detached (they keep their data but lose the brand link).`, danger: true, ok: 'Delete' }))) return;
    try { await remove(b._id); toast('Brand deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="brands" title="Brands">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {items ? <span className="text-[12px] text-dim2">{((page - 1) * BRAND_PAGE_SIZE + items.length) + ' of ' + total + ' brands · facet counts live from the storefront'}</span>
          : <span className={BRAND_SKEL + ' h-3 w-[218px]'} aria-hidden="true" />}
        <div className="flex-1" />
        <button className={ACC_BTN} data-testid="brandNew" onClick={() => openModal(<BrandForm onDone={load} />)}>+ New Brand</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3" data-testid="brandToolbar">
        <div className="relative min-w-[240px] flex-1 sm:flex-none">
          <input data-testid="brandSearch" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand name or slug..." className="w-full rounded-lg border border-line2 bg-transparent px-3 py-2 pr-8 text-[12.5px] outline-none placeholder:text-dim2 focus:border-acc" />
          {search ? <button type="button" title="Clear search" onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-dim2 hover:text-acc">×</button> : null}
        </div>
        <span className="text-[12px] text-dim2">{items ? 'Page ' + page + ' of ' + pageCount : 'Loading...'}</span>
      </div>

      {err ? <div className={CARD + ' text-[13px] text-red'}>Failed to load brands — {err}</div> : null}
      {!items ? <BrandGridSkeleton count={BRAND_PAGE_SIZE} /> : null}

      {items && search && !items.length ? <div className={CARD + ' text-center text-[13px] text-dim2'}>No brands found. Try a different brand name or slug.</div> : null}

      {items && !items.length ? <Empty icon="🏷" title="No brands yet" sub="Create the first brand — products link to it by ref (Phase 2 catalog v2)." /> : null}

      {items && pageItems.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="brandGrid">
          {pageItems.map((b) => (
            <div key={b._id} className={CARD + ' flex min-h-[108px] items-center gap-3'} data-testid="brandCard">
              {b.logo ? <img src={b.logo} alt="" className="h-11 w-11 rounded-lg border border-line2 bg-panel2 object-contain p-1" />
                : <div className="grid h-11 w-11 place-items-center rounded-lg border border-line2 bg-panel2 text-[15px] text-dim2">🏷</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <b className="truncate text-[14px] text-txt">{b.name}</b>
                  {b.featured ? <span className={CHIP + ' border-acc/50 text-acc'}>featured</span> : null}
                </div>
                <div className="text-[11.5px] text-dim2">{b.slug} · {b.products} product{b.products === 1 ? '' : 's'}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button className={GHOST_BTN} onClick={() => openModal(<BrandForm b={b} onDone={load} />)}>Edit</button>
                <button className={RED_BTN} onClick={() => del(b)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {items && pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-2" data-testid="brandPagination">
          <button className={GHOST_BTN} disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>Previous</button>
          <span className="px-3 text-[12px] text-dim2">Page {page} of {pageCount}</span>
          <button className={GHOST_BTN} disabled={page >= pageCount} onClick={() => setPage((n) => Math.min(pageCount, n + 1))}>Next</button>
        </div>
      ) : null}
    </AdminShell>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <BrandsPage />
    </OverlayProvider>
  );
}
