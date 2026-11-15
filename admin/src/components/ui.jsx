/* ArixGear ADMIN — shared UI kit (Phase 5, 5.1).
   ONE source for the style constants that used to be copy-pasted into ~15
   page files, the Toggle that existed ×5, and modal-based confirm/prompt
   that replace every window.confirm / window.prompt (they render inside the
   page's OverlayProvider — theme-aware, ESC-closable, focus-managed). */
import { useState } from 'react';
import { useModal } from './Overlays.jsx';

/* ---------- style constants (single source) ---------- */
export const CARD = 'rounded-xl border border-line bg-panel p-5';
export const ACC_BTN = 'bg-acc text-white hover:bg-acc-hi rounded-lg px-4 py-2 text-[12.5px] font-bold uppercase tracking-[.08em]';
export const GHOST_BTN = 'rounded-lg border border-line2 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] hover:border-acc hover:text-acc';
export const RED_BTN = 'rounded-lg border border-red/40 bg-red/10 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-red hover:bg-red/20';
export const CHIP = 'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide';
export const FRM = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4';
export const FULL = 'md:col-span-2 lg:col-span-4';
export const INP = 'rounded-lg border border-line2 bg-bg px-3 py-2 text-[12.5px] outline-none focus:border-acc';
export const LBL = 'mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-dim';

/* ---------- Toggle (consolidated ×5 copies) ---------- */
export function Toggle({ on, onClick, label, disabled }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label || (on ? 'Active' : 'Hidden')} title={on ? 'Active' : 'Hidden'} onClick={onClick} disabled={disabled}
      className={'relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40 ' + (on ? 'bg-acc' : 'bg-line2')}>
      <span className={'absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all ' + (on ? 'left-[20px] bg-white' : 'left-[3px] bg-[#888]')} />
    </button>
  );
}

/* ---------- confirm dialog component ---------- */
function ConfirmDialog({ opts, resolve, close }) {
  const { title = 'Are you sure?', body = '', ok = 'Confirm', danger = false } = opts;
  return (
    <div data-testid="confirmModal">
      <h2 className="text-[17px]">{title}</h2>
      {body ? <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-dim">{body}</p> : null}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} data-testid="confirmCancel" onClick={() => { close(); resolve(false); }}>Cancel</button>
        <button className={danger ? RED_BTN : ACC_BTN} data-testid="confirmOk" autoFocus onClick={() => { close(); resolve(true); }}>{ok}</button>
      </div>
    </div>
  );
}

/* ---------- prompt dialog component ---------- */
function PromptDialog({ opts, resolve, close }) {
  const {
    title = 'Input', label = '', placeholder = '', initial = '',
    ok = 'Confirm', multiline = false, required = false, cancel = 'Cancel',
  } = opts;
  const [v, setV] = useState(initial);
  const [err, setErr] = useState('');
  const submit = () => {
    if (required && !String(v).trim()) { setErr('This field is required'); return; }
    close(); resolve(v);
  };
  return (
    <div data-testid="promptModal">
      <h2 className="text-[17px]">{title}</h2>
      {label ? <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-dim">{label}</p> : null}
      <div className="mt-3">
        {multiline ? (
          <textarea rows={3} autoFocus data-testid="promptInput" placeholder={placeholder} value={v}
            onChange={(e) => { setV(e.target.value); setErr(''); }} />
        ) : (
          <input autoFocus data-testid="promptInput" placeholder={placeholder} value={v}
            onChange={(e) => { setV(e.target.value); setErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        )}
        {err ? <p className="mt-1.5 text-[11.5px] text-red">{err}</p> : null}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button className={GHOST_BTN} data-testid="promptCancel" onClick={() => { close(); resolve(null); }}>{cancel}</button>
        <button className={ACC_BTN} data-testid="promptOk" onClick={submit}>{ok}</button>
      </div>
    </div>
  );
}

/* ---------- hooks (usable anywhere inside a page's OverlayProvider) ----------
   const confirm = useConfirm();
   if (!(await confirm({ title, body, danger: true, ok: 'Delete' }))) return;
   const ask = usePrompt();
   const reason = await ask({ title, label, initial, required: true }); */
export function useConfirm() {
  const { openModal, closeModal } = useModal();
  return (opts = {}) => new Promise((resolve) => {
    openModal(<ConfirmDialog opts={opts} resolve={resolve} close={closeModal} />);
  });
}

export function usePrompt() {
  const { openModal, closeModal } = useModal();
  return (opts = {}) => new Promise((resolve) => {
    openModal(<PromptDialog opts={opts} resolve={resolve} close={closeModal} />);
  });
}

/* ---------- page header helper (title + actions row) ---------- */
export function PageBar({ children }) {
  return <div className="mb-5 flex flex-wrap items-center gap-2">{children}</div>;
}

/* ---------- empty state ---------- */
export function Empty({ icon = '∅', title, sub }) {
  return (
    <div className="rounded-xl border border-dashed border-line2 bg-panel/60 p-10 text-center" data-testid="emptyState">
      <div className="text-[26px] text-dim2">{icon}</div>
      <p className="mt-2 font-disp text-[15px] text-txt">{title}</p>
      {sub ? <p className="mt-1 text-[12px] text-dim2">{sub}</p> : null}
    </div>
  );
}
