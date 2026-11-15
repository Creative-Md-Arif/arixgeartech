/* ArixGear ADMIN page — contact messages inbox (React port of messages.html)
   Endpoints mirror legacy exactly: GET /admin/messages?filter=all|unread|read ·
   PATCH /admin/messages/:id {read:boolean} · DELETE /admin/messages/:id */
import { useCallback, useEffect, useState } from 'react';
import { list as listMessages, setRead, remove as removeMessage, compose as composeMessage } from '../services/messages.js';
import { list as listCustomers } from '../services/customers.js';
import { useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';
import { tr } from '../lib/i18n.jsx';
import { CHIP } from '../components/OrdersTable.jsx';

const BTN_GHOST_SM = 'rounded-lg border border-line2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-txt transition-colors hover:border-acc hover:text-acc';

/* Task 49 — tabs now include a Newsletter chip with its own counter (counts.newsletter) */
const TABS = (counts) => {
  const c = counts || {};
  return [
    ['all', 'All'],
    ['unread', 'Unread' + (c.unread ? ' (' + c.unread + ')' : '')],
    ['newsletter', 'Newsletter' + (c.newsletter ? ' (' + c.newsletter + ')' : '')],
    ['read', 'Read'],
  ].map(([k, label]) => [k, tr(label)]);
};

/* Task 37 — compose modal: searchable customer picker + subject + body */
function ComposeForm({ replyTo, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { closeModal } = useModal();
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(replyTo ? { _id: replyTo.user || '', label: replyTo.name + ' · ' + (replyTo.email || '') } : null);
  const [subject, setSubject] = useState(replyTo ? 'Re: your message' : '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCustomers().then((d) => setCustomers((d.items || []).map((u) => ({ _id: u.id || u._id, label: (u.name || 'Customer') + ' · ' + (u.email || u.phone || '') })))).catch(() => {});
  }, []);

  const send = async () => {
    if (!pick) return toast('Pick a customer first', 'err');
    if (body.trim().length < 2) return toast('Write the message first', 'err');
    setBusy(true);
    try {
      await composeMessage({ userId: pick._id, subject, body });
      toast('Sent — customer notified instantly', 'ok');
      closeModal(); onDone();
    } catch (e) { toast(e.message || String(e), 'err'); } finally { setBusy(false); }
  };

  const shown = customers.filter((c) => !q.trim() || c.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  return (
    <>
      <h2 className="mb-4 text-[17px]">New message → customer</h2>
      <label>Customer *</label>
      {!pick ? (
        <>
          <input id="cmpSearch" placeholder="Search by name / email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 max-h-[220px] overflow-y-auto rounded-lg border border-line" id="cmpPicker">
            {shown.map((c) => (
              <button key={c._id} type="button" className="block w-full border-b border-line px-3.5 py-2 text-left text-[13px] last:border-b-0 hover:bg-panel2"
                onClick={() => setPick(c)}>{c.label}</button>
            ))}
            {!shown.length ? <div className="px-3.5 py-3 text-[12px] text-dim2">{customers.length ? 'No customer matches' : 'Loading customers…'}</div> : null}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-acc/40 bg-acc-dim px-3 py-2 text-[13px]">
          <b>{pick.label}</b>
          <button type="button" className="ml-auto text-[11px] font-bold uppercase text-dim2 hover:text-acc" onClick={() => setPick(null)}>change</button>
        </div>
      )}
      <div className="mt-3"><label>Subject (optional)</label><input id="cmpSubject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your return is approved ✓" /></div>
      <div className="mt-3"><label>Message *</label><textarea id="cmpBody" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write it the way you'd tell the customer…" /></div>
      <p className="mt-2 text-[11.5px] text-dim2">Lands in the customer's bell + Account → Messages From ArixGear instantly — no email needed.</p>
      <div className="mt-4 flex justify-end gap-2.5">
        <button className={BTN_GHOST_SM} onClick={closeModal}>Cancel</button>
        <button className="rounded-lg bg-acc px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-white hover:bg-acc-hi disabled:opacity-50" id="cmpSend" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
      </div>
    </>
  );
}

function Messages() {
  const confirm = useConfirm(); // Step 2 audit fix — confirm() was declared in a sibling component; every delete click crashed
  const toast = useToast();
  const { openModal } = useModal();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      /* Task 49 — newsletter tab queries by topic; other tabs keep the legacy filter param */
      const d = await listMessages(filter === 'all' ? {} : filter === 'newsletter' ? { topic: 'newsletter' } : { filter });
      setItems(d.items || []);
      setCounts(d.counts || null);
      setErr('');
    } catch (e) { setErr(e.message || String(e)); setItems([]); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggleRead = async (m) => {
    try {
      await setRead(m._id, { read: !m.read });
      toast(m.read ? 'Marked unread' : 'Marked read', 'ok');
      load();
    } catch (e) { toast(e.message || String(e), 'err'); }
  };

  const del = async (m) => {
    if (!(await confirm({ title: 'Delete message', body: 'Delete this message permanently?', danger: true, ok: 'Delete' }))) return;
    try {
      await removeMessage(m._id);
      toast('Deleted — message removed from the inbox.', 'ok');
      load();
    } catch (e) { toast(e.message || String(e), 'err'); }
  };

  return (
    <>
      {/* filter tabs + meta */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1 rounded-lg border border-line bg-panel p-1">
          {TABS(counts).map(([k, t]) => (
            <button
              key={k}
              data-mf={k}
              id={'msgTab-' + k}
              onClick={() => setFilter(k)}
              className={'rounded-md px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] transition-colors ' + (filter === k ? 'bg-acc-dim text-acc' : 'text-dim hover:text-txt')}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-dim2">{(items || []).length} message(s) · unread pill updates in the sidebar automatically</span>
        <button id="msgCompose" className="rounded-lg bg-acc px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em] text-white hover:bg-acc-hi"
          onClick={() => openModal(<ComposeForm onDone={load} />)}>+ New message</button>
      </div>

      {err && !items ? (
        <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
          <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">ERROR</span>
          Failed to load messages — {err}
        </div>
      ) : !items ? (
        <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">Loading…</div>
      ) : !items.length ? (
        <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">No messages in this view.</div>
      ) : (
        items.map((m) => (
          <div
            key={m._id}
            data-id={m._id}
            data-direction={m.direction || 'in'}
            className={'mb-3.5 rounded-xl border bg-panel p-5 ' + ((m.direction === 'out') ? 'border-acc/40 bg-acc/[.04]' : 'border-line' + (m.read ? '' : ' border-l-[3px] border-l-acc'))}
          >
            <div className="flex flex-wrap items-baseline gap-3">
              {m.direction === 'out' ? <span className={CHIP + ' border-acc/40 text-acc'}>↗ SENT BY YOU</span> : null}
              <b>{m.name}</b>
              {m.direction !== 'out' && m.email ? <a href={`mailto:${m.email}`} className="text-[13px] text-acc">{m.email}</a> : null}
              {m.subject ? <span className="text-[13px] font-bold text-txt">“{m.subject}”</span> : null}
              {m.orderNo ? <span className={CHIP + ' text-dim border-line2'}>order {m.orderNo}</span> : null}
              <span className={CHIP + ' text-dim border-line2'}>{m.topic || 'general'}</span>
              {m.read || m.direction === 'out' ? null : <span className={CHIP + ' border-acc text-acc'}>NEW</span>}
              <span className="ml-auto text-[12px] text-dim2">{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="mb-0 mt-2.5 whitespace-pre-wrap leading-[1.55]">{m.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {m.direction !== 'out' ? (
                <>
                  <button className={BTN_GHOST_SM + ' !border-acc/40 !text-acc'} id={'msgReply-' + m._id}
                    onClick={() => openModal(<ComposeForm replyTo={m} onDone={load} />)}>↩ Reply in app</button>
                  {m.email ? <a className={BTN_GHOST_SM + ' inline-flex items-center'} href={`mailto:${m.email}?subject=Re: your ArixGear message`}>Reply by email</a> : null}
                </>
              ) : null}
              <button className={BTN_GHOST_SM} onClick={() => toggleRead(m)}>{m.read ? 'Mark unread' : 'Mark read'}</button>
              <button className={BTN_GHOST_SM + ' !border-red/40 !text-red hover:!border-red'} onClick={() => del(m)}>Delete</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <AdminShell active="messages" title="Contact Messages">
        <Messages />
      </AdminShell>
    </OverlayProvider>
  );
}
