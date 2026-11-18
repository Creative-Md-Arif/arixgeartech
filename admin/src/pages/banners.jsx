/* ArixGear ADMIN page — Banners (Task 38: IMAGE / 🎬 VIDEO media tabs).
   Video banners: MP4/WEBM/MOV ≤40MB + optional poster frame, inline preview,
   grid hover-play with a ▶ badge. Accordion form (Task 34) with validation
   auto-open; reorder / duplicate / click analytics from Task 30. */
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { list as listBanners, create as createBanner, update as updateBanner, patch as patchBanner, remove as removeBanner, reorder as reorderBanners, duplicate as duplicateBanner } from '../services/banners.js';
import { AccSection, AccChip, useAccordion, AccBulkButtons } from '../components/Accordion.jsx';

const POSITIONS = ['hero', 'promo', 'side'];
const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4';
const FULL = 'md:col-span-2 lg:col-span-4';

function Toggle({ on, onClick }) {
  return (
    <button type="button" aria-pressed={on} title={on ? 'Banner active' : 'Banner hidden'} onClick={onClick}
      className={'relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors ' + (on ? 'bg-acc' : 'bg-line2')}>
      <span className={'absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all ' + (on ? 'left-[20px] bg-white' : 'left-[3px] bg-dim')} />
    </button>
  );
}

/* ---------- New / Edit banner modal (multipart) ---------- */
function BannerForm({ b, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !b;
  const [title, setTitle] = useState(b?.title || '');
  const [subtitle, setSubtitle] = useState(b?.subtitle || '');
  const [ctaText, setCtaText] = useState(b?.ctaText || 'SHOP NOW');
  /* Task 58 — Bengali twins */
  const [titleBn, setTitleBn] = useState(b?.titleBn || '');
  const [subtitleBn, setSubtitleBn] = useState(b?.subtitleBn || '');
  const [ctaTextBn, setCtaTextBn] = useState(b?.ctaTextBn || '');
  const [link, setLink] = useState(b?.link || '/shop');
  const [position, setPosition] = useState(b?.position || POSITIONS[0]);
  const [order, setOrder] = useState(b?.order ?? 1);
  const [active, setActive] = useState(!b || b.active);
  const [startsAt, setStartsAt] = useState(b?.startsAt ? String(b.startsAt).slice(0, 16) : '');
  const [endsAt, setEndsAt] = useState(b?.endsAt ? String(b.endsAt).slice(0, 16) : '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(b?.image?.url || null);
  /* Task 38 — video media: type tabs + clip + optional poster frame */
  const [mediaType, setMediaType] = useState(b?.mediaType === 'video' ? 'video' : 'image');
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(b?.video?.url || null);
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState(b?.poster?.url || null);
  const [posterRemoved, setPosterRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  useEffect(() => () => { const u = previewRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); }, []);
  const videoRef = useRef(null);
  videoRef.current = videoPreview;
  useEffect(() => () => { const u = videoRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); }, []);
  const posterRef = useRef(null);
  posterRef.current = posterPreview;
  useEffect(() => () => { const u = posterRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); }, []);

  /* Task 34 — 3 accordion sections + validation auto-open */
  const BF_SECTIONS = ['media', 'copy', 'placement'];
  const acc = useAccordion(['copy']);

  /* pick helpers — image vs video vs poster (40MB video / 5MB image) */
  const pickMedia = (kind) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const cap = kind === 'video' ? 40 * 1024 * 1024 : 5 * 1024 * 1024;
      if (f.size > cap) { toast(kind === 'video' ? 'Video must be ≤ 40MB' : 'Image must be ≤ 5MB', 'err'); return; }
      if (kind === 'video') {
        const u = videoRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
        setVideoFile(f); setVideoPreview(URL.createObjectURL(f));
        setMediaType('video');
      } else if (kind === 'poster') {
        const u = posterRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
        setPosterFile(f); setPosterPreview(URL.createObjectURL(f));
        setPosterRemoved(false);
      } else {
        const u = previewRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
        setFile(f); setPreview(URL.createObjectURL(f));
      }
    };
    input.click();
  };
  const clearPoster = () => {
    const u = posterRef.current; if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
    setPosterFile(null); setPosterPreview(null);
    setPosterRemoved(true);
  };

  const save = async () => {
    if (!title.trim()) { acc.openOnly(['copy']); return toast('Title required', 'err'); }
    if (mediaType === 'video' && !videoFile && !b?.video?.url) { acc.openOnly(['media']); return toast('Upload a video for a video banner', 'err'); }
    if (mediaType === 'image' && !file && !b?.image?.url) { acc.openOnly(['media']); return toast('Banner image required', 'err'); }
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('subtitle', subtitle);
    fd.append('ctaText', ctaText);
    fd.append('titleBn', titleBn.trim()); // Task 58
    fd.append('subtitleBn', subtitleBn.trim());
    fd.append('ctaTextBn', ctaTextBn.trim());
    fd.append('link', link);
    fd.append('position', position);
    fd.append('order', order === '' || order == null ? '0' : String(order));
    fd.append('active', String(active));
    if (startsAt) fd.append('startsAt', new Date(startsAt).toISOString()); else fd.append('startsAt', '');
    if (endsAt) fd.append('endsAt', new Date(endsAt).toISOString()); else fd.append('endsAt', '');
    fd.append('mediaType', mediaType);
    if (mediaType === 'image' && file) fd.append('image', file);
    if (mediaType === 'video' && videoFile) fd.append('video', videoFile);
    if (mediaType === 'video' && posterFile) fd.append('poster', posterFile);
    if (mediaType === 'video' && posterRemoved) fd.append('removePoster', 'true');
    setBusy(true);
    try {
      if (isNew) await createBanner(fd);
      else await updateBanner(b._id, fd);
      toast('Banner saved', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px]">{isNew ? 'New Banner' : 'Edit Banner'}</h2>
        <AccBulkButtons ids={BF_SECTIONS} acc={acc} prefix="bf" />
      </div>
      <div className="space-y-2.5">
        <AccSection id="media" icon="🖼" title="Media" open={acc.isOpen('media')} onToggle={() => acc.toggle('media')}
          chips={<>
            <AccChip text={mediaType.toUpperCase()} tone="acc" />
            {mediaType === 'video'
              ? <AccChip text={videoPreview ? 'VIDEO ✓' : 'NO VIDEO'} tone={videoPreview ? 'green' : 'red'} />
              : <AccChip text={preview ? 'IMAGE ✓' : 'NO IMAGE'} tone={preview ? 'green' : 'red'} />}
            {mediaType === 'video' && posterPreview ? <AccChip text="POSTER ✓" tone="dim" /> : null}
          </>}>
          <div className={FULL}>
            <div className="mb-3 flex gap-1 rounded-lg border border-line bg-panel p-1" id="bfMediaTabs">
              {[['image', '🖼 IMAGE'], ['video', '🎬 VIDEO']].map(([k, t]) => (
                <button key={k} type="button" id={'bfTab-' + k} onClick={() => setMediaType(k)}
                  className={'rounded-md px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] transition-colors ' + (mediaType === k ? 'bg-acc-dim text-acc' : 'text-dim hover:text-txt')}>
                  {t}
                </button>
              ))}
            </div>

            {mediaType === 'image' ? (
              <>
                <label>Image {isNew ? '*' : ''} (click to upload)</label>
                <button type="button" id="bfDrop" className="w-full rounded-[10px] border-2 border-dashed border-line2 px-[18px] py-[18px] text-center text-[12.5px] text-dim2 hover:border-acc hover:bg-acc-dim hover:text-acc"
                  onClick={() => pickMedia('image')}>
                  {b?.image || preview ? 'Replace image' : 'Click to upload banner image'}
                </button>
                <div className="mt-3 flex flex-wrap gap-2.5" id="bfImgs">
                  {preview ? (
                    <div className="relative h-[74px] w-[130px] overflow-hidden rounded-lg border border-line2">
                      <img src={preview} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : <div className="text-[12px] text-dim2">No image yet</div>}
                </div>
              </>
            ) : (
              <>
                <label>Video {isNew ? '*' : ''} — MP4 / WEBM / MOV · max 40MB (click to upload)</label>
                <button type="button" id="bfVideoDrop" className="w-full rounded-[10px] border-2 border-dashed border-line2 px-[18px] py-[18px] text-center text-[12.5px] text-dim2 hover:border-acc hover:bg-acc-dim hover:text-acc"
                  onClick={() => pickMedia('video')}>
                  {b?.video?.url || videoPreview ? 'Replace video' : 'Click to upload banner video'}
                </button>
                {videoPreview ? (
                  <video src={videoPreview} controls muted playsInline className="mt-3 max-h-[240px] w-full max-w-[420px] rounded-lg border border-line2 bg-black" id="bfVideoPreview" />
                ) : <div className="mt-3 text-[12px] text-dim2">No video yet — the hero plays it muted and auto-advances when it ends.</div>}

                <div className="mt-4">
                  <label>Poster frame (optional — shown while the video loads)</label>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button type="button" id="bfPosterPick" className={GHOST_BTN} onClick={() => pickMedia('poster')}>{posterPreview ? 'Change poster' : 'Upload poster'}</button>
                    {posterPreview ? <button type="button" id="bfPosterClear" className={GHOST_BTN + ' hover:!border-red hover:!text-red'} onClick={clearPoster}>Remove poster</button> : null}
                    {posterPreview ? <img src={posterPreview} alt="" className="h-[52px] w-[92px] rounded-md border border-line2 object-cover" /> : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </AccSection>

        <AccSection id="copy" icon="✍" title="Copy & CTA" open={acc.isOpen('copy')} onToggle={() => acc.toggle('copy')}
          chips={<>
            <AccChip text={title.trim() ? '✓ ' + title.trim().slice(0, 14) : '— title'} tone={title.trim() ? 'green' : 'red'} />
            {ctaText.trim() ? <AccChip text={ctaText.trim().toUpperCase().slice(0, 12)} tone="acc" /> : null}
          </>}>
          <div className={FRM}>
            <div className={FULL}><label>Title *</label><input id="bfTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="APEX DROP 04" /></div>
            <div className={FULL}><label>টাইটেল (বাংলা)</label><input id="bfTitleBn" value={titleBn} onChange={(e) => setTitleBn(e.target.value)} placeholder="অ্যাপেক্স ড্রপ ০৪" /></div>
            <div className={FULL}><label>Subtitle</label><input id="bfSub" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></div>
            <div className={FULL}><label>সাবটাইটেল (বাংলা)</label><input id="bfSubBn" value={subtitleBn} onChange={(e) => setSubtitleBn(e.target.value)} /></div>
            <div><label>CTA text</label><input id="bfCta" value={ctaText} onChange={(e) => setCtaText(e.target.value)} /></div>
            <div><label>CTA (বাংলা)</label><input id="bfCtaBn" value={ctaTextBn} onChange={(e) => setCtaTextBn(e.target.value)} placeholder="এখনই দেখুন" /></div>
            <div><label>Link</label><input id="bfLink" value={link} onChange={(e) => setLink(e.target.value)} /></div>
          </div>
        </AccSection>

        <AccSection id="placement" icon="⚙" title="Placement & Schedule" open={acc.isOpen('placement')} onToggle={() => acc.toggle('placement')}
          chips={<>
            <AccChip text={position.toUpperCase()} tone="acc" />
            <AccChip text={'#' + (order || 0)} tone="dim" />
            {startsAt || endsAt ? <AccChip text="SCHEDULED" tone="green" /> : null}
            <AccChip text={active ? 'ACTIVE' : 'HIDDEN'} tone={active ? 'green' : 'red'} />
          </>}>
          <div className={FRM}>
            <div>
              <label>Position</label>
              <select id="bfPos" value={position} onChange={(e) => setPosition(e.target.value)}>
                {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
              </select>
            </div>
            <div><label>Order</label><input id="bfOrder" type="number" value={order} onChange={(e) => setOrder(e.target.value)} /></div>
            <div><label>Schedule — show from</label><input id="bfStarts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div><label>Schedule — hide after</label><input id="bfEnds" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
            <div className={FULL}><p className="text-[11.5px] normal-case tracking-normal text-dim2">Leave both schedule fields empty for an always-live banner. Outside the window the banner hides from the storefront automatically.</p></div>
            <label className={FULL + ' flex items-center gap-2 text-[13px] normal-case tracking-normal'}>
              <input id="bfActive" type="checkbox" className="w-auto" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
          </div>
        </AccSection>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
        <button id="bfCancel" className={GHOST_BTN} onClick={closeModal}>Cancel</button>
        <button id="bfSave" className={ACC_BTN} disabled={busy} onClick={save}>{isNew ? 'Create Banner' : 'Save'}</button>
      </div>
    </>
  );
}

/* ---------- reorder modal (bulk order save) ---------- */
function ReorderForm({ items, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const [rows, setRows] = useState(items.map((b) => ({ id: b._id, title: b.title, position: b.position, order: b.order })));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await reorderBanners(rows.map((r) => ({ id: r.id, order: Number(r.order) || 0 })));
      toast('Order saved ✓', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <>
      <h2 className="mb-4 text-[17px]">Reorder banners</h2>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {rows.map((r, ix) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line2 px-3 py-2">
            <span className={CHIP + ' text-dim'}>{r.position}</span>
            <span className="flex-1 truncate text-[13px]">{r.title}</span>
            <input type="number" className="w-20" value={r.order}
              onChange={(e) => setRows((rs) => rs.map((x, i2) => (i2 === ix ? { ...x, order: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button className={GHOST_BTN} onClick={closeModal}>Cancel</button>
        <button className={ACC_BTN} disabled={busy} onClick={save} id="bfReorderSave">{busy ? 'Saving…' : 'Save order'}</button>
      </div>
    </>
  );
}

/* ---------- banners grid (filtered by position) ---------- */
function BannersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const d = await listBanners();
      setItems(d.items || []);
      setCounts(d.counts || null);
      setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (b) => {
    try {
      await patchBanner(b._id, { active: !b.active });
      setItems((list) => list.map((x) => (x._id === b._id ? { ...x, active: !b.active } : x)));
      toast(!b.active ? 'Banner active' : 'Banner hidden', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  const dup = async (b) => {
    try {
      await duplicateBanner(b._id);
      toast('Banner duplicated (inactive) — edit and go live', 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const del = async (b) => {
    if (!(await confirm({ title: 'Delete banner', body: 'Delete this banner? Its slot rotates to the next one.', danger: true, ok: 'Delete' }))) return;
    try {
      await removeBanner(b._id);
      toast('Banner deleted', 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  if (error) {
    return (
      <div className={CARD}>
        <div className="text-[13px] text-red">Failed to load banners — {error}</div>
        <button className={GHOST_BTN + ' mt-3'} onClick={load}>Retry</button>
      </div>
    );
  }
  if (!items) return <div className={CARD}>Loading…</div>;

  const shown = filter === 'all' ? items : items.filter((x) => x.position === filter);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">{items.length} banners · {counts ? counts.active + ' active · ' + counts.clicks + ' clicks' : ''}</span>
        <div className="flex flex-wrap gap-1.5">
          {['all', ...POSITIONS].map((pos) => (
            <button key={pos} type="button" onClick={() => setFilter(pos)}
              className={CHIP + ' ' + (filter === pos ? 'border-acc bg-acc-dim text-acc' : 'border-line2 text-dim2 hover:border-acc hover:text-acc')}>
              {pos}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button className={GHOST_BTN} onClick={() => openModal(<ReorderForm items={items} onDone={load} />)} id="bReorder">⇅ Reorder</button>
        <button id="bNew" className={ACC_BTN} onClick={() => openModal(<BannerForm onDone={load} />)}>+ New Banner</button>
      </div>
      <div className="w-full overflow-x-auto rounded-xl border border-line bg-panel" data-testid="bannerTableWrap">
        <table className="w-full min-w-[1120px] border-collapse text-left text-[12.5px]" data-testid="bannerTable">
          <thead className="bg-panel2 text-[10.5px] uppercase tracking-[.12em] text-dim2">
            <tr>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Preview</th>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Banner content</th>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Placement</th>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Schedule</th>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 font-bold">Clicks</th>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 text-center font-bold">Active</th>
              <th className="whitespace-nowrap border-b border-line px-4 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b._id} className="border-b border-line/70 align-middle transition-colors last:border-b-0 hover:bg-panel2/60" data-testid="bannerRow">
                <td className="px-4 py-3">
                  {b.mediaType === 'video' && b.video?.url ? <video src={b.video.url} poster={(b.poster && b.poster.url) || (b.image && b.image.url) || undefined} muted loop playsInline className="h-14 w-24 rounded-md bg-panel2 object-cover" /> : <img src={b.image?.url || ''} alt="" className="h-14 w-24 rounded-md bg-panel2 object-cover" onError={(e) => { e.currentTarget.style.background = '#222'; }} />}
                </td>
                <td className="min-w-[260px] px-4 py-3"><div className="flex flex-wrap items-center gap-2"><b className="text-[14px] text-txt">{b.title}</b>{b.mediaType === 'video' ? <span className={CHIP + ' border-purple/40 text-purple'}>video</span> : null}</div><p className="mt-1 max-w-[360px] text-[11.5px] leading-relaxed text-dim2">{b.subtitle || '—'}</p></td>
                <td className="whitespace-nowrap px-4 py-3"><span className={CHIP + ' text-acc'}>{b.position}</span><div className="mt-1 text-[11px] text-dim2">Order #{b.order}</div></td>
                <td className="whitespace-nowrap px-4 py-3">{b.startsAt || b.endsAt ? <span className={CHIP + ' border-blue/40 text-blue'}>scheduled</span> : <span className="text-dim2">Always on</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-dim"><b className="text-txt">{b.clicks || 0}</b> clicks</td>
                <td className="px-4 py-3 text-center"><Toggle on={b.active} onClick={() => toggle(b)} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-right"><div className="inline-flex gap-2"><button className={GHOST_BTN} onClick={() => openModal(<BannerForm b={b} onDone={load} />)}>Edit</button><button className={GHOST_BTN} onClick={() => dup(b)}>Duplicate</button><button className={RED_BTN} onClick={() => del(b)}>Delete</button></div></td>
              </tr>
            ))}
            {!shown.length ? <tr><td colSpan="7" className="py-10 text-center text-dim2">No banners yet</td></tr> : null}
          </tbody>
        </table>
      </div>
      {false && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((b) => (
          <div key={b._id} className="overflow-hidden rounded-[10px] border border-line bg-panel" id="banner-card"
            onMouseEnter={(e) => { const v = e.currentTarget.querySelector('video'); if (v) v.play().catch(() => {}); }}
            onMouseLeave={(e) => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }}>
            {b.mediaType === 'video' && b.video?.url ? (
              <div className="relative">
                <video src={b.video.url} poster={(b.poster && b.poster.url) || (b.image && b.image.url) || undefined} muted loop playsInline
                  className="h-[130px] w-full bg-panel2 object-cover" />
                <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">▶ video</span>
              </div>
            ) : (
              <img src={b.image?.url || ''} alt="" className="h-[130px] w-full bg-panel2 object-cover"
                onError={(e) => { e.currentTarget.style.background = '#222'; }} />
            )}
            <div className="p-[13px] px-[15px]" id="bc-body">
              <div className="mb-2 flex items-center gap-1.5">
                <span className={CHIP + ' text-acc'}>{b.position}</span>
                <span className="text-[11px] text-dim2">#{b.order}</span>
                {b.startsAt || b.endsAt ? <span className={CHIP + ' border-blue/40 text-blue'}>scheduled</span> : null}
                {b.mediaType === 'video' ? <span className={CHIP + ' border-purple/40 text-purple'}>video</span> : null}
                <span className="ml-auto text-[11px] text-dim2" title="CTA clicks">👁 {b.clicks || 0}</span>
                <Toggle on={b.active} onClick={() => toggle(b)} />
              </div>
              <div className="text-[14px] font-extrabold">{b.title}</div>
              <div className="mt-[3px] min-h-[28px] text-[12px] text-dim2">{b.subtitle || ''}</div>
              <div className="mt-2.5 flex gap-2">
                <button className={GHOST_BTN} onClick={() => openModal(<BannerForm b={b} onDone={load} />)}>Edit</button>
                <button className={GHOST_BTN} onClick={() => dup(b)}>Duplicate</button>
                <button className={RED_BTN} onClick={() => del(b)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!shown.length ? <div className="empty col-span-full rounded-xl border border-line bg-panel py-10 text-center text-dim2">No banners yet</div> : null}
      </div>}
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="banners" title="Banner Management">
        <BannersPage />
      </AdminShell>
    </OverlayProvider>
  );
}
