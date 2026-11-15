/* ArixGear ADMIN page — Notification Copy (Phase 5, 5.3 · C3 net-new)
   /admin/notification-templates · the editor backend for transactional copy:
   email/SMS/push templates with {{vars}}, live preview, test send, plus the
   customer broadcast (Socket.IO + FCM dry-run + admin web-push). */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { CARD, ACC_BTN, GHOST_BTN, RED_BTN, CHIP, LBL, Toggle, Empty, useConfirm } from '../components/ui.jsx';
import { list, catalog as templateCatalog, create, update, remove, preview, test, broadcast } from '../services/templates.js';

const CHANNEL_CHIP = { email: 'border-acc/50 text-acc', sms: 'border-green/40 text-green', push: 'border-purple/40 text-purple' };

function TemplateForm({ t, cat, onDone }) {
  const toast = useToast();
  const { closeModal } = useModal();
  const isNew = !t;
  const known = cat.find((c) => c.key === (t?.key || '')) || (t ? null : {});
  const [f, setF] = useState({
    key: t?.key || '', channel: t?.channel || 'email', label: t?.label || '',
    description: t?.description || '', subject: t?.subject || '', body: t?.body || '',
    active: t ? t.active : true,
  });
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const vars = known?.vars || [];

  const doPreview = async () => {
    try {
      const d = await preview(isNew ? undefined : t._id, { vars: Object.fromEntries(vars.map((v) => [v, '<' + v + '>'])) });
      setPv(d.preview);
    } catch (e) { toast(e.message, 'err'); }
  };
  const doTest = async () => {
    try {
      const d = await test(isNew ? undefined : t._id, { to: 'demo@arixgear.tech' });
      toast(d.message || 'Test sent', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  const save = async () => {
    if (!f.key.trim() || !f.body.trim()) return toast('Key and body are required', 'err');
    setBusy(true);
    try {
      if (isNew) await create(f); else await update(t._id, f);
      toast(isNew ? 'Template created ✓' : 'Template saved ✓', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <div data-testid="templateForm">
      <h2 className="text-[17px]">{isNew ? '+ New Template' : 'Edit — ' + (t.label || t.key)}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block"><span className={LBL}>Key (snake-case id)</span>
          <input value={f.key} onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} disabled={!isNew} placeholder="order-confirmation" /></label>
        <label className="block"><span className={LBL}>Channel</span>
          <select value={f.channel} onChange={(e) => set('channel', e.target.value)}>
            {['email', 'sms', 'push'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label className="block"><span className={LBL}>Label</span><input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="Order confirmation" /></label>
        <label className="block"><span className={LBL}>Description (admin note)</span><input value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="block md:col-span-2"><span className={LBL}>{f.channel === 'push' ? 'Push title' : f.channel === 'sms' ? 'Subject (unused for SMS)' : 'Subject'} — {{vars}} supported</span>
          <input value={f.subject} onChange={(e) => set('subject', e.target.value)} placeholder="ArixGear Order {{orderNumber}} — received" /></label>
        <label className="block md:col-span-2"><span className={LBL}>Body</span>
          <textarea rows={4} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="Hi {{name}}, your gear is locked in…" /></label>
      </div>
      {vars?.length ? (
        <p className="mt-2 text-[11.5px] text-dim2">Known vars: {vars.map((v) => <code key={v} className="rounded bg-panel2 px-1 py-0.5 text-acc">{`{{` + v + `}}`}</code>)}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className={GHOST_BTN} onClick={doPreview} disabled={isNew}>👁 Preview</button>
        <button className={GHOST_BTN} onClick={doTest} disabled={isNew}>✉ Test send</button>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-dim"><Toggle on={f.active} onClick={() => set('active', !f.active)} /> active</label>
        <button className={GHOST_BTN} onClick={closeModal} disabled={busy}>Cancel</button>
        <button className={ACC_BTN} data-testid="templateSave" onClick={save} disabled={busy}>{isNew ? 'Create' : 'Save'}</button>
      </div>
      {pv ? (
        <div className="mt-4 rounded-lg border border-line2 bg-panel2 p-3" data-testid="templatePreview">
          <div className="text-[11px] font-bold uppercase tracking-wider text-dim2">rendered preview</div>
          {pv.subject ? <div className="mt-1.5 text-[13px] font-bold text-txt">{pv.subject}</div> : null}
          <div className="mt-1 whitespace-pre-line text-[12.5px] text-dim">{pv.body || '(empty body)'}</div>
        </div>
      ) : null}
    </div>
  );
}

function BroadcastBox({ onSent }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', body: '', link: '' });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!f.title.trim()) return toast('A title is required', 'err');
    setBusy(true);
    try {
      const d = await broadcast({ title: f.title.trim(), body: f.body.trim(), link: f.link.trim() });
      toast(d.message, 'ok');
      setF({ title: '', body: '', link: '' });
      onSent && onSent();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className={CARD + ' mb-5'} data-testid="broadcastBox">
      <h2 className="text-[14px]">📣 Broadcast to customers</h2>
      <p className="mt-0.5 text-[12px] text-dim2">One call fans out to connected Socket.IO clients, every FCM device token (dry-run until keys — logged to logs/fcm.jsonl) and admin devices via web-push.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block w-[280px]"><span className={LBL}>Title</span>
          <input data-testid="broadcastTitle" value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder="⚡ Flash hour is live" /></label>
        <label className="block w-[320px]"><span className={LBL}>Body</span>
          <input value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} placeholder="Deal prices until 10 PM — bundles stack too." /></label>
        <label className="block w-[200px]"><span className={LBL}>Link (optional)</span>
          <input value={f.link} onChange={(e) => setF((s) => ({ ...s, link: e.target.value }))} placeholder="/flash-sale" /></label>
        <button className={ACC_BTN} data-testid="broadcastSend" onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  );
}

function TemplatesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const [items, setItems] = useState(null);
  const [cat, setCat] = useState([]);

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([list(), templateCatalog()]);
      setItems(d.items || []);
      setCat(c.catalog || []);
    } catch (e) { toast(e.message, 'err'); setItems([]); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const del = async (t) => {
    if (!(await confirm({ title: 'Delete template', body: `Delete "${t.key}"? The built-in default copy takes over again immediately.`, danger: true, ok: 'Delete' }))) return;
    try { await remove(t._id); toast('Template deleted — defaults restored', 'ok'); load(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <AdminShell active="templates" title="Notification Copy">
      <BroadcastBox onSent={load} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-dim2">{items ? items.length + ' templates · every {{var}} fills at send time — unknown vars resolve to empty, never leak' : 'Loading…'}</span>
        <div className="flex-1" />
        <button className={ACC_BTN} data-testid="templateNew" onClick={() => openModal(<TemplateForm cat={cat} onDone={load} />)}>+ New Template</button>
      </div>

      {!items ? <TableSkeleton rows={5} /> : null}
      {items && !items.length ? <Empty icon="✍️" title="No custom templates" sub="Built-in defaults are used until you create overrides here." /> : null}

      {items && items.length ? (
        <div className="space-y-2.5" data-testid="templateList">
          {items.map((t) => (
            <div key={t._id} className={CARD + ' flex flex-wrap items-center gap-3 py-3.5'} data-testid="templateRow">
              <div className="min-w-[260px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="font-mono text-[13px] text-txt">{t.key}</b>
                  <span className={CHIP + ' ' + (CHANNEL_CHIP[t.channel] || '')}>{t.channel}</span>
                  {!t.active ? <span className={CHIP + ' border-line2 text-dim2'}>inactive (defaults win)</span> : null}
                </div>
                <div className="mt-0.5 text-[12.5px] text-txt">{t.label || '—'}</div>
                {t.subject ? <div className="text-[11.5px] text-dim2">subject: {t.subject}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Toggle on={t.active} onClick={() => update(t._id, { active: !t.active }).then(load).catch((e) => toast(e.message, 'err'))} />
                <button className={GHOST_BTN} onClick={() => openModal(<TemplateForm t={t} cat={cat} onDone={load} />)}>Edit</button>
                <button className={RED_BTN} onClick={() => del(t)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </AdminShell>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <TemplatesPage />
    </OverlayProvider>
  );
}
