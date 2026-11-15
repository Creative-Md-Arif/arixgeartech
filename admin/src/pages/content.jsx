/* ArixGear ADMIN page — Site Content (1:1 schema, ZERO JSON editing)
   GET /admin/settings (content merged over contentDefaults) · PUT /admin/settings { content }
   Every block is a plain text field. FAQs are Question+Answer input pairs —
   add/remove rows, type text, save. Journal posts are cards with labeled fields.
   No JSON syntax anywhere — an admin never needs to know what JSON is. */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { AccSection, AccChip, useAccordion, AccBulkButtons } from '../components/Accordion.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { get as getSettings, update as updateSettings } from '../services/settings.js';

const CARD = 'rounded-xl border border-line bg-panel p-5';
const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4';
const FULL = 'md:col-span-2 lg:col-span-4';
const POST_IMGK = ['laptop', 'phone', 'audio', 'gaming']; // Step 2 audit fix — gym-era image keys referenced assets that no longer exist

/* ---------- editable field schema → generated form ---------- */
const F = (path, label, type) => ({ path, label, type: type || 'text' });
const SCHEMA = [
  { id: 'hero', block: 'Hero (fallback copy)', fields: [
    F('hero.eyebrow', 'Eyebrow'),
    F('hero.title', 'Title'),
    F('hero.titleAccent', 'Title accent (outlined word)'),
    F('hero.subtitle', 'Subtitle', 'ta'),
    F('hero.ctaText', 'CTA text'),
    F('hero.link', 'CTA link (e.g. #new or /shop)'),
  ]},
  { id: 'footer', block: 'Site & Footer', fields: [
    F('site.tagline', 'Footer tagline', 'ta'),
    F('site.copyright', 'Copyright line'),
    F('site.instagram', 'Instagram URL'),
    F('site.youtube', 'YouTube URL'),
    F('site.x', 'X (Twitter) URL'),
  ]},
  { id: 'newsletter', block: 'Newsletter (all pages)', fields: [
    F('newsletter.title', 'Title (last word gets the orange outline)'),
    F('newsletter.sub', 'Subtitle', 'ta'),
    F('newsletter.note', 'Promo note'),
  ]},
  { id: 'about', block: 'About page', fields: [
    F('about.eyebrow', 'Hero eyebrow'),
    F('about.title', 'Hero title (\\n = line break, last word outlined)', 'ta1'),
    F('about.prose.0', 'Story paragraph 1 (HTML ok)', 'ta'),
    F('about.prose.1', 'Story paragraph 2 (HTML ok)', 'ta'),
    F('about.prose.2', 'Story paragraph 3 (HTML ok)', 'ta'),
    F('about.stats.0.value', 'Stat 1 · value'), F('about.stats.0.label', 'Stat 1 · label'),
    F('about.stats.1.value', 'Stat 2 · value'), F('about.stats.1.label', 'Stat 2 · label'),
    F('about.stats.2.value', 'Stat 2 value'), F('about.stats.2.label', 'Stat 2 label'),
    F('about.stats.3.value', 'Stat 4 · value'), F('about.stats.3.label', 'Stat 4 · label'),
    F('about.timelineEyebrow', 'Timeline eyebrow'),
    F('about.timelineTitle', 'Timeline heading (last word outlined)'),
    F('about.timeline.0.year', 'Timeline 1 · year'), F('about.timeline.0.title', 'Timeline 1 · title'), F('about.timeline.0.text', 'Timeline 1 · text', 'ta'),
    F('about.timeline.1.year', 'Timeline 2 · year'), F('about.timeline.1.title', 'Timeline 2 · title'), F('about.timeline.1.text', 'Timeline 2 · text', 'ta'),
    F('about.timeline.2.year', 'Timeline 3 · year'), F('about.timeline.2.title', 'Timeline 3 · title'), F('about.timeline.2.text', 'Timeline 3 · text', 'ta'),
    F('about.timeline.3.year', 'Timeline 4 · year'), F('about.timeline.3.title', 'Timeline 4 · title'), F('about.timeline.3.text', 'Timeline 4 · text', 'ta'),
    F('about.quality.eyebrow', 'Quality · eyebrow'),
    F('about.quality.title', 'Quality · title (\\n = line break)', 'ta1'),
    F('about.quality.prose.0', 'Quality · paragraph 1 (HTML ok)', 'ta'),
    F('about.quality.prose.1', 'Quality · paragraph 2 (HTML ok)', 'ta'),
    F('about.quality.qc.0.h', 'QC 1 · heading'), F('about.quality.qc.0.p', 'QC 1 · text'),
    F('about.quality.qc.1.h', 'QC 2 · heading'), F('about.quality.qc.1.p', 'QC 2 · text'),
    F('about.quality.qc.2.h', 'QC 3 · heading'), F('about.quality.qc.2.p', 'QC 3 · text'),
  ]},
  { id: 'contact', block: 'Contact page', fields: [
    F('contact.eyebrow', 'Eyebrow'),
    F('contact.heading', 'Heading'),
    F('contact.faqEyebrow', 'FAQ eyebrow'),
    F('contact.faqHeading', 'FAQ heading (last word outlined)'),
    F('contact.emails', 'Emails (one per line)', 'ta1'),
    F('contact.responseTime', 'Response time (one per line)', 'ta1'),
    F('contact.hours', 'Hours (one per line)', 'ta1'),
    F('contact.address', 'Address (one per line)', 'ta1'),
  ]},
  { id: 'journal', block: 'Guides page header', fields: [
    F('guides.eyebrow', 'Eyebrow'),
    F('guides.heading', 'Heading'),
  ]},
];

/* path helpers — numeric segments address array items */
const getP = (obj, path) => {
  const v = path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj || {});
  return String(v == null ? '' : v);
};
const setP = (obj, keys, val) => {
  if (!keys.length) return val;
  const [k, ...rest] = keys;
  const base = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  base[k] = rest.length
    ? setP(base[k] != null && typeof base[k] === 'object' ? base[k] : (/^\d+$/.test(rest[0]) ? [] : {}), rest, val)
    : val;
  return base;
};
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function ContentPage() {
  const toast = useToast();
  const [draft, setDraft] = useState(null);          /* editable copy of content — null = loading */
  const [faqs, setFaqs] = useState([{ q: '', a: '' }]);       /* plain-text Q&A pairs */
  const [posts, setPosts] = useState([]);            /* journal post cards */
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getSettings();   /* /admin/settings — .content merged over contentDefaults server-side */
      const content = (d.setting && d.setting.content) || {};
      setDraft(JSON.parse(JSON.stringify(content)));
      const f = Array.isArray(content.faqs) ? content.faqs.map((x) => ({ q: String(x.q || ''), a: String(x.a || '') })) : [];
      setFaqs(f.length ? f : [{ q: '', a: '' }]);
      const ps = Array.isArray(content.posts)
        ? content.posts.map((x) => ({ id: String(x.id || ''), tag: String(x.tag || ''), time: String(x.time || ''), imgk: String(x.imgk || 'laptop'), title: String(x.title || ''), ex: String(x.ex || ''), kit: (x.kit || []).join(', '), body: String(x.body || '') }))
        : [];
      setPosts(ps);
      setError('');
    } catch (e) { setError(e.message || String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setField = (path, val) => setDraft((d0) => setP(d0 || {}, path.split('.'), val));

  /* ---------- FAQ editor (plain text rows) ---------- */
  const setFaq = (i, f, v) => setFaqs((list) => list.map((x, ix) => (ix === i ? { ...x, [f]: v } : x)));
  const addFaq = () => setFaqs((list) => [...list, { q: '', a: '' }]);
  const delFaq = (i) => setFaqs((list) => (list.length > 1 ? list.filter((_, ix) => ix !== i) : [{ q: '', a: '' }]));

  /* ---------- posts editor (cards) ---------- */
  const setPost = (i, f, v) => setPosts((list) => list.map((x, ix) => (ix === i ? { ...x, [f]: v } : x)));
  const addPost = () => setPosts((list) => [...list, { id: '', tag: 'Reviews', time: '4 min read', imgk: 'laptop', title: '', ex: '', kit: '', body: '' }]);
  const delPost = (i) => setPosts((list) => list.filter((_, ix) => ix !== i));

  const collect = () => {
    let out = {};
    SCHEMA.forEach((sec) => sec.fields.forEach((f) => { out = setP(out, f.path.split('.'), getP(draft, f.path)); }));
    /* FAQs — plain text rows → structured (admin never writes JSON) */
    out.faqs = faqs
      .map((f) => ({ q: String(f.q || '').trim(), a: String(f.a || '').trim() }))
      .filter((f) => f.q || f.a);
    /* posts — card fields → structured */
    out.posts = posts
      .filter((p) => p.title.trim())
      .map((p, i) => ({
        id: slugify(p.id || p.title) || 'post-' + (i + 1),
        tag: p.tag.trim() || 'Reviews',
        time: p.time.trim() || '4 min read',
        imgk: POST_IMGK.includes(p.imgk) ? p.imgk : 'laptop',
        title: p.title.trim(),
        ex: p.ex.trim(),
        kit: p.kit.split(',').map((s) => s.trim()).filter(Boolean),
        body: p.body,
      }));
    return out;
  };

  const save = async () => {
    const content = collect();
    setBusy(true);
    try {
      await updateSettings({ content });
      toast('Saved ✓ — Storefront picks it up on the next page load — refresh the site to see it.', 'ok');
    } catch (e) { toast('Save failed — ' + e.message, 'err'); } finally { setBusy(false); }
  };

  /* Task 34 — every content block is an accordion section (hook ABOVE any early return) */
  const acc = useAccordion([SCHEMA[0] ? SCHEMA[0].id : 'hero']);

  if (error) {
    return (
      <div className={CARD}>
        <div className="text-[13px] text-red">Failed to load content — {error}</div>
        <button className={GHOST_BTN} onClick={load}>Retry</button>
      </div>
    );
  }
  if (!draft) return <div className={CARD}>Loading…</div>;

  return (
    <>
      <div className="mb-[14px] flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-dim2">{SCHEMA.length + 2} content blocks — every block is its own accordion section</span>
        <div className="flex items-center gap-2">
          <AccBulkButtons ids={[...SCHEMA.map((s) => s.id), 'faqs', 'posts']} acc={acc} prefix="cs" />
          <button id="saveAll" className={ACC_BTN} disabled={busy} onClick={save}>Save All Content</button>
        </div>
      </div>

      {SCHEMA.map((sec) => {
        const filled = sec.fields.filter((f) => String(getP(draft, f.path) || '').trim()).length;
        return (
          <div className="mb-2.5" key={sec.block}>
            <AccSection id={sec.id} icon="✏" title={sec.block} open={acc.isOpen(sec.id)} onToggle={() => acc.toggle(sec.id)}
              chips={<AccChip text={filled + '/' + sec.fields.length + ' FILLED'} tone={filled ? 'green' : 'dim'} />}>
              <div className={FRM}>
                {sec.fields.map((f) => {
                  const val = getP(draft, f.path);
                  const set = (e) => setField(f.path, e.target.value);
                  if (f.type === 'ta') return <div key={f.path} className={FULL}><label>{f.label}</label><textarea id={'cs-' + f.path.replace(/\./g, '-')} rows={3} value={val} onChange={set} /></div>;
                  if (f.type === 'ta1') return <div key={f.path} className={FULL}><label>{f.label}</label><textarea id={'cs-' + f.path.replace(/\./g, '-')} rows={2} value={val} onChange={set} /></div>;
                  return <div key={f.path}><label>{f.label}</label><input id={'cs-' + f.path.replace(/\./g, '-')} value={val} onChange={set} /></div>;
                })}
              </div>
            </AccSection>
          </div>
        );
      })}

      {/* FAQs — plain text question/answer pairs, no JSON */}
      <div className="mb-2.5" id="cs-faqs-wrap">
        <AccSection id="faqs" icon="❓" title="FAQs (contact page)" open={acc.isOpen('faqs')} onToggle={() => acc.toggle('faqs')}
          chips={<AccChip text={faqs.filter((f) => f.q.trim() || f.a.trim()).length + ' FAQS'} tone={faqs.length ? 'green' : 'dim'} />}>
          <p className="mb-4 text-[12px] text-dim2">Just type — each FAQ is a question box + an answer box. Blank rows are ignored on save.</p>
          <div className="space-y-3" id="faqRows">
            {faqs.map((f, i) => (
              <div key={i} className="rounded-xl border border-line2 p-3.5" data-faqrow={i}>
                <input placeholder="Question — e.g. How long does delivery take?" value={f.q} onChange={(e) => setFaq(i, 'q', e.target.value)} aria-label={'FAQ ' + (i + 1) + ' question'} />
                <textarea rows={2} className="mt-2" placeholder="Answer — write it the way you'd tell a customer" value={f.a} onChange={(e) => setFaq(i, 'a', e.target.value)} aria-label={'FAQ ' + (i + 1) + ' answer'} />
                <div className="mt-2 flex justify-end">
                  <button type="button" className={RED_BTN} onClick={() => delFaq(i)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" id="faqAdd" className={GHOST_BTN + ' mt-3'} onClick={addFaq}>+ Add Question</button>
        </AccSection>
      </div>

      {/* Journal posts — cards with labeled fields, no JSON */}
      <div className="mb-2.5" id="cs-posts-wrap">
        <AccSection id="posts" icon="📰" title="Journal Posts (guides page)" open={acc.isOpen('posts')} onToggle={() => acc.toggle('posts')}
          chips={<AccChip text={posts.filter((p) => p.title.trim()).length + ' POSTS'} tone={posts.length ? 'green' : 'dim'} />}>
          <p className="mb-4 text-[12px] text-dim2">Each post is a card below. Body field accepts simple HTML (&lt;p&gt;, &lt;b&gt;, &lt;h3&gt;) — or plain text works too.</p>
          <div className="space-y-4" id="postRows">
            {posts.map((p, i) => (
              <div key={i} className="rounded-xl border border-line2 p-4" data-postrow={i}>
                <div className="mb-3 flex items-center justify-between">
                  <b className="text-[13px] text-acc">Post {i + 1}{p.title ? ' — ' + p.title : ''}</b>
                  <button type="button" className={RED_BTN} onClick={() => delPost(i)}>Remove</button>
                </div>
                <div className={FRM}>
                  <div className={FULL}><label>Title *</label><input value={p.title} onChange={(e) => setPost(i, 'title', e.target.value)} placeholder="e.g. The 5×5 Protocol — Strength You Can Measure" /></div>
                  <div><label>Tag</label><input value={p.tag} onChange={(e) => setPost(i, 'tag', e.target.value)} placeholder="Training / Nutrition / Mindset / Recovery" /></div>
                  <div><label>Read time</label><input value={p.time} onChange={(e) => setPost(i, 'time', e.target.value)} placeholder="5 min read" /></div>
                  <div>
                    <label>Cover image</label>
                    <select value={p.imgk} onChange={(e) => setPost(i, 'imgk', e.target.value)}>
                      {POST_IMGK.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div><label>URL slug (optional — auto from title)</label><input value={p.id} onChange={(e) => setPost(i, 'id', e.target.value)} placeholder="auto" /></div>
                  <div className={FULL}><label>Excerpt (card summary)</label><textarea rows={2} value={p.ex} onChange={(e) => setPost(i, 'ex', e.target.value)} /></div>
                  <div className={FULL}><label>Product kit — comma-separated slugs (e.g. phone-nova-x5, audio)</label><input value={p.kit} onChange={(e) => setPost(i, 'kit', e.target.value)} /></div>
                  <div className={FULL}><label>Body (article — plain text or simple HTML)</label><textarea rows={6} value={p.body} onChange={(e) => setPost(i, 'body', e.target.value)} /></div>
                </div>
              </div>
            ))}
            {!posts.length ? <p className="text-[12px] text-dim2">No posts — the guides page shows nothing until you add one.</p> : null}
          </div>
          <button type="button" id="postAdd" className={GHOST_BTN + ' mt-3'} onClick={addPost}>+ Add Post</button>
        </AccSection>
      </div>

      <div className="flex justify-end">
        <button id="saveAll2" className={ACC_BTN} disabled={busy} onClick={save}>Save All Content</button>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="content" title="Site Content">
        <ContentPage />
      </AdminShell>
    </OverlayProvider>
  );
}
