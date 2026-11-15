/* ArixGear ADMIN page — customers (React port of customers.html)
   + ERP-assisted password reset: issue a single-use reset link and hand it to
   the customer via WhatsApp / Messenger / SMS — works with zero email setup.  */
import { useEffect, useState } from 'react';
import { money, day } from '../lib/admin.js';
import { list as listCustomers, resetPasswordLink, saveTags } from '../services/customers.js';
import AdminShell from '../components/AdminShell.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { OverlayProvider, useModal, useToast } from '../components/Overlays.jsx';
import { tr, useLang } from '../lib/i18n.jsx';

const TH = 'px-3 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.14em] text-dim border-b border-line2 whitespace-nowrap';
const ACT = 'rounded-md border border-line2 px-2 py-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-dim transition hover:border-acc hover:text-acc';

/* Task 57 — private CRM tags + note editor (admin-eyes only, never on the storefront) */
const QUICK_TAGS = ['vip', 'fraud-risk', 'wholesale', 'b2b', 'high-returner', 'cod-preferred'];
const TAG_STYLES = {
  vip: 'border-yellow/50 bg-yellow/10 text-yellow',
  'fraud-risk': 'border-red/50 bg-red/10 text-red',
  wholesale: 'border-blue/50 bg-blue/10 text-blue',
  b2b: 'border-blue/50 bg-blue/10 text-blue',
  'high-returner': 'border-orange/50 bg-orange/10 text-orange',
  'cod-preferred': 'border-green/50 bg-green/10 text-green',
};
const tagChip = (tag) => 'inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + (TAG_STYLES[tag] || 'border-line2 text-dim');

function TagsModal({ u, onClose, onSaved }) {
  const toast = useToast();
  const [tags, setTags] = useState(u.adminTags || []);
  const [note, setNote] = useState(u.adminNote || '');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (t) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length >= 8 ? s : [...s, t]));
  const addCustom = () => {
    const v = custom.trim().toLowerCase().slice(0, 24);
    if (!v || tags.includes(v) || tags.length >= 8) return;
    setTags([...tags, v]); setCustom('');
  };
  const save = async () => {
    setBusy(true);
    try {
      await saveTags(u.id, tags, note);
      toast(tr('Saved for {n}', { n: u.name }), 'ok');
      onSaved(); onClose();
    } catch (e) { toast(e.message || 'Save failed', 'err'); setBusy(false); }
  };
  return (
    <div data-testid="tagsModal">
      <h3 className="text-[16px]">{tr('Tags & Notes — {n}', { n: u.name })}</h3>
      <p className="mt-1 text-[12px] text-dim2">{tr('Private CRM data — visible to staff only, never shown to the customer.')}</p>
      <div className="mt-4 flex flex-wrap gap-1.5" id="tagQuick">
        {QUICK_TAGS.map((qt) => (
          <button key={qt} type="button" onClick={() => toggle(qt)}
            className={'rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ' + (tags.includes(qt) ? (TAG_STYLES[qt] || 'border-acc text-acc') : 'border-line2 text-dim hover:border-acc hover:text-acc')}>
            {tags.includes(qt) ? '✓ ' : ''}{qt}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input id="tagCustom" value={custom} onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder={tr('Custom tag — type and press Enter')}
          className="flex-1 rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc" maxLength={24} />
        <button type="button" className={ACT} onClick={addCustom}>{tr('Add')}</button>
      </div>
      <textarea id="tagNote" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000}
        placeholder={tr('Private note — e.g. “delivers to Mirpur only after 6pm”, dispute history, wholesale pricing…')}
        className="mt-3 w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc" />
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg border border-line2 px-3.5 py-2 text-[12px] font-bold uppercase tracking-[.06em] text-dim2 hover:text-txt" onClick={onClose}>{tr('Cancel')}</button>
        <button id="tagSave" disabled={busy} onClick={save}
          className="rounded-lg bg-acc px-3.5 py-2 text-[12px] font-bold uppercase tracking-[.06em] text-white transition hover:bg-acc-hi disabled:opacity-50">{tr('Save')}</button>
      </div>
    </div>
  );
}

function ResetLinkModal({ link, onClose }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.resetUrl); toast(tr('Reset link copied')); }
    catch (_) { toast(tr('Copy failed — select the link manually'), 'err'); }
  };
  const waText = encodeURIComponent(
    `Hi ${link.customer.name}, here is your ArixGear password reset link (valid 15 minutes, works once):\n${link.resetUrl}`
  );
  const waPhone = (link.customer.phone || '').replace(/\D/g, '').replace(/^880/, '88').replace(/^0/, '880');
  return (
    <div>
      <h3 className="text-[16px]">{tr('Password Reset Link')}</h3>
      <p className="mt-1 text-[12px] text-dim2">
        For <b className="text-txt">{link.customer.name}</b>{link.customer.email ? <> · {link.customer.email}</> : null}
        {' '}— {tr('— valid {n} minutes, works exactly once.', { n: link.expiresIn })}
      </p>
      <div className="mt-4 rounded-lg border border-line2 bg-bg p-3">
        <code id="rpLink" className="block break-all text-[12px] leading-relaxed text-acc">{link.resetUrl}</code>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-dim2">
        {tr('Send this link to the customer over WhatsApp / Messenger / SMS. They open it and set a new password — no email configuration needed.')}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-lg bg-acc px-3.5 py-2 text-[12px] font-bold uppercase tracking-[.06em] text-white transition hover:bg-acc-hi" onClick={copy}>{tr('Copy Link')}</button>
        {waPhone.length >= 11 && (
          <a className="rounded-lg border border-green/50 px-3.5 py-2 text-[12px] font-bold uppercase tracking-[.06em] text-green transition hover:bg-green/10"
             href={`https://wa.me/${waPhone}?text=${waText}`} target="_blank" rel="noreferrer">{tr('Send via WhatsApp')}</a>
        )}
        <button className="rounded-lg border border-line2 px-3.5 py-2 text-[12px] text-dim2 transition hover:text-txt" onClick={onClose}>{tr('Close')}</button>
      </div>
    </div>
  );
}

function Customers() {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const { openModal, closeModal } = useModal();
  const toast = useToast();

  const load = async () => {
    try {
      const d = await listCustomers();
      setItems(d.items || []);
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { load(); }, []);

  const issueLink = async (u) => {
    setBusyId(u.id);
    try {
      const link = await resetPasswordLink(u.id);
      openModal(<ResetLinkModal link={link} onClose={closeModal} />);
    } catch (e) {
      toast(e.message || tr('Could not create reset link'), 'err');
    } finally { setBusyId(null); }
  };

  const openTags = (u) => openModal(<TagsModal u={u} onClose={closeModal} onSaved={load} />);

  if (err) {
    return (
      <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-[13.5px] text-dim2">
        <span className="mb-2 block font-disp text-[26px] tracking-[.04em] text-line2">{tr('ERROR')}</span>
        {err}
      </div>
    );
  }
  if (!items) {
    return <div className="rounded-xl border border-line bg-panel"><TableSkeleton rows={7} cols={5} /></div>;
  }

  return (
    <div className="tbl-wrap overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>{tr('Customer')}</th>
            <th className={TH}>{tr('Email')}</th>
            <th className={TH}>{tr('Phone')}</th>
            <th className={TH}>{tr('Email Verified')}</th>
            <th className={TH}>{tr('Orders')}</th>
            <th className={TH}>{tr('Lifetime Spend (৳)')}</th>
            <th className={TH}>{tr('Joined')}</th>
            <th className={TH}>{tr('Password')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id || u.email} className="border-b border-line transition-colors last:border-b-0 hover:bg-panel2">
              <td className="px-3 py-2.5 align-middle">
                <b>{u.name}</b>
                {(u.adminTags || []).length || u.adminNote ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1" data-tags={u.id}>
                    {(u.adminTags || []).map((tg) => <span key={tg} className={tagChip(tg)}>{tg}</span>)}
                    {u.adminNote ? <span title={u.adminNote} className="text-[11px] text-dim2">📝</span> : null}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2.5 align-middle">{u.email}</td>
              <td className="px-3 py-2.5 align-middle">{u.phone || '—'}</td>
              <td className="px-3 py-2.5 align-middle">
                {u.emailVerified
                  ? <span className="border border-green/40 bg-green/10 px-2 py-0.5 font-cond text-[.68rem] font-bold uppercase tracking-[.18em] text-green">{tr('Verified')}</span>
                  : <span className="border border-yellow/40 bg-yellow/10 px-2 py-0.5 font-cond text-[.68rem] font-bold uppercase tracking-[.18em] text-yellow">{tr('Pending')}</span>}
              </td>
              <td className="px-3 py-2.5 align-middle">{u.orders}</td>
              <td className="px-3 py-2.5 align-middle font-cond text-[15.5px] font-bold tracking-[.03em]">{money(u.spent)}</td>
              <td className="px-3 py-2.5 align-middle">{day(u.createdAt)}</td>
              <td className="px-3 py-2.5 align-middle">
                <div className="flex items-center gap-1.5">
                  <button id={'tg-' + (u.id || u.email)} className={ACT} title={tr('Private tags & note — staff only')} onClick={() => openTags(u)}>{tr('🏷 Tags')}</button>
                  <button id={'rp-' + (u.id || u.email)} className={ACT + ' ' + (busyId === u.id ? 'pointer-events-none opacity-50' : '')}
                          title={tr('Issue a single-use reset link to send the customer')} onClick={() => issueLink(u)}>
                    {busyId === u.id ? '…' : tr('Reset')}
                  </button>
                </div>
              </td>
            </tr>
          )) || null}
          {!items.length ? (
            <tr>
              <td colSpan="7" className="px-3 py-10 text-center text-[13.5px] text-dim2">{tr('No customers yet — guests checkout without accounts.')}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="customers" title={tr('Customers')}>
        <Customers />
      </AdminShell>
    </OverlayProvider>
  );
}
