/* ArixGear ADMIN page — Team (sub-admin management, Task 39, owner-only).
   Create staff logins, grant sidebar modules, disable/reset/remove accounts.
   Sub-admins see only the modules granted here — enforced server-side by
   requirePermission() on every /api/admin route group.                       */
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider, useToast, useModal } from '../components/Overlays.jsx';
import { useConfirm } from '../components/ui.jsx';
import { list, create, update, remove } from '../services/team.js';
import { dt } from '../lib/admin.js';

const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
const ACC_BTN = 'rounded-lg bg-acc px-3.5 py-2 text-[11.5px] font-bold uppercase tracking-[.06em] text-white transition hover:bg-acc-hi disabled:opacity-50';
const INPUT = 'w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13px] outline-none focus:border-acc';
const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide';
const CARD = 'rounded-xl border border-line bg-panel p-5';

/* human names for the module keys used in the sidebar */
const MODULE_LABELS = {
  dashboard: 'Dashboard', orders: 'Orders', returns: 'Returns / RMA', reports: 'Sales Report',
  products: 'Products', catalog: 'Categories & Badges', reviews: 'Reviews', questions: 'Questions',
  banners: 'Banners', homepage: 'Homepage', coupons: 'Coupons', customers: 'Customers',
  brands: 'Brands', messages: 'Messages', content: 'Content', seo: 'SEO', settings: 'Settings',
};

function SubadminModal({ initial, modules, onDone, close }) {
  const toast = useToast();

  const confirm = useConfirm();  const modal = useModal();
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState(initial?.permissions || []);
  const [busy, setBusy] = useState(false);

  const toggle = (m) => setPerms((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        const body = { name, permissions: perms };
        if (password) body.password = password;
        const d = await update(initial.id, body);
        toast('Staff account updated', 'ok');
        onDone(d.subadmin);
      } else {
        const d = await create({ name, email, password, permissions: perms });
        toast('Staff account created', 'ok');
        onDone(d.subadmin);
      }
      modal.close?.();
      close();
    } catch (err) {
      toast(err.message || 'Could not save', 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form onSubmit={submit} className="max-h-[90vh] w-[560px] max-w-full overflow-y-auto rounded-2xl border border-line bg-panel p-6" id="subadminModal">
        <div className="mb-1 font-disp text-[22px]">{editing ? 'EDIT STAFF ACCOUNT' : 'NEW STAFF ACCOUNT'}</div>
        <p className="mb-5 text-[11.5px] text-dim2">Sub-admins sign in at this console but only reach the modules ticked below. {editing ? '' : 'They can change their password later via forgot-password.'}</p>

        <div className="mb-3.5">
          <label>Full name</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rakib — Order Desk" required />
        </div>
        <div className="mb-3.5">
          <label>Email (login)</label>
          <input className={INPUT} type="email" value={email} disabled={editing} onChange={(e) => setEmail(e.target.value)} placeholder="staff@arixgear.tech" required />
          {editing ? <p className="mt-1 text-[10.5px] text-dim2">Login email cannot be changed — delete and recreate instead.</p> : null}
        </div>
        <div className="mb-4">
          <label>{editing ? 'New password (leave blank to keep)' : 'Password'}</label>
          <input className={INPUT} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="min 6 characters" required={!editing} />
        </div>

        <div className="mb-5">
          <label className="mb-2 block">Module access <span className="text-dim2">({perms.length} granted)</span></label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {modules.map((m) => (
              <label key={m} className={'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] font-semibold transition ' + (perms.includes(m) ? 'border-acc bg-acc/10 text-acc' : 'border-line2 text-dim hover:text-txt')}>
                <input type="checkbox" className="accent-[var(--acc,#2F81F7)]" checked={perms.includes(m)} onChange={() => toggle(m)} />
                {MODULE_LABELS[m] || m}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" className={GHOST_BTN} onClick={close}>Cancel</button>
          <button className={ACC_BTN} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </div>
  );
}

function TeamInner() {
  const confirm = useConfirm(); // Step 2 audit fix — confirm() was declared in a sibling component; every delete click crashed
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | subadmin

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await list();
      setRows(d.items || []);
      setModules(d.modules || []);
    } catch (e) { toast(e.message || 'Load failed', 'err'); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const del = async (s) => {
    if (!(await confirm({ title: 'Remove staff account', body: `Remove ${s.name} (${s.email})? Their login stops working immediately.`, danger: true, ok: 'Remove' }))) return;
    try { await remove(s.id); toast('Staff account removed', 'ok'); load(); }
    catch (e) { toast(e.message || 'Delete failed', 'err'); }
  };

  const toggleActive = async (s) => {
    try { await update(s.id, { active: !s.active }); toast(s.active ? 'Account disabled — login blocked instantly' : 'Account re-enabled', 'ok'); load(); }
    catch (e) { toast(e.message || 'Update failed', 'err'); }
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] text-dim">Team accounts are sub-admins: they get their own login but see only the modules you grant. Every action they take lands in <b className="text-txt">Audit Log</b>.</p>
        <button className={ACC_BTN} onClick={() => setEditing({})} id="newStaffBtn">+ New staff account</button>
      </div>

      <div className={CARD + ' overflow-x-auto p-0'}>
        {loading ? (
          <div className="p-8 text-center text-[12.5px] text-dim">Loading…</div>
        ) : !rows.length ? (
          <div className="p-8 text-center text-[12.5px] text-dim">No staff accounts yet — create the first one.</div>
        ) : (
          <table className="w-full text-left text-[12.5px]" id="teamTable">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-[.12em] text-dim2">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Module access</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line/60 last:border-0 hover:bg-panel2/40" id={'staff-' + (s.email || '').split('@')[0]}>
                  <td className="px-4 py-3">
                    <div className="font-bold text-txt">{s.name}</div>
                    <div className="text-[11px] text-dim2">{s.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[320px] flex-wrap gap-1">
                      {(s.permissions || []).map((m) => (
                        <span key={m} className={CHIP + ' border-acc/40 bg-acc/10 text-acc'}>{MODULE_LABELS[m] || m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={CHIP + ' ' + (s.active ? 'border-green/40 bg-green/10 text-green' : 'border-red/40 bg-red/10 text-red')}>{s.active ? 'Active' : 'Disabled'}</span>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-dim">{dt(s.createdAt || s.at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button className={GHOST_BTN} onClick={() => setEditing(s)}>Edit</button>
                      <button className={GHOST_BTN} onClick={() => toggleActive(s)} id={'toggle-' + (s.email || '').split('@')[0]}>{s.active ? 'Disable' : 'Enable'}</button>
                      <button className={GHOST_BTN + ' hover:!border-red hover:!text-red'} onClick={() => del(s)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null ? (
        <SubadminModal
          initial={editing.id ? editing : null}
          modules={modules}
          close={() => setEditing(null)}
          onDone={() => load()}
        />
      ) : null}
    </>
  );
}

export default function TeamPage() {
  return (
    <OverlayProvider>
      <AdminShell active="team" title="Team — Staff Accounts">
        <TeamInner />
      </AdminShell>
    </OverlayProvider>
  );
}
