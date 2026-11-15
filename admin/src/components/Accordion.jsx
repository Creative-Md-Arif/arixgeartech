/* ArixGear ADMIN component — shared accordion kit (Task 33/34).
   AccSection: one collapsible section (header = icon + title + live chips +
   rotating ▾; body animates via grid-template-rows 0fr→1fr, 300ms).
   AccChip:   status chip with green/red/acc/dim tones.
   useAccordion: open-set state + toggle + bulk helpers + openOnly for
   validation auto-open. */
import { useState } from 'react';
import { tr, useLang } from '../lib/i18n.jsx';

export function AccSection({ id, icon, title, chips, open, onToggle, children }) {
  return (
    <section id={'sec-' + id} className="scroll-mt-24 rounded-xl border border-line bg-panel" data-section={id}>
      <button type="button" className="flex w-full flex-wrap items-center gap-2.5 px-5 py-4 text-left" onClick={onToggle} aria-expanded={open} id={'secBtn-' + id}>
        <span className="text-[16px] leading-none">{icon}</span>
        <h3 className="text-[15px] tracking-[.08em]">{title}</h3>
        <span className="flex flex-1 flex-wrap items-center justify-end gap-1.5">{chips}</span>
        <span className={'ml-1 text-dim2 transition-transform duration-300 ' + (open ? 'rotate-180' : '')}>▾</span>
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function AccChip({ text, tone = 'dim' }) {
  return (
    <span className={'inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ' + (tone === 'green' ? 'border-green/40 text-green' : tone === 'red' ? 'border-red/40 text-red' : tone === 'acc' ? 'border-acc/40 text-acc' : 'text-dim2')}>{text}</span>
  );
}

export function useAccordion(defaultOpen = []) {
  const [open, setOpen] = useState(() => new Set(defaultOpen));
  const toggle = (id) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const openSec = (id) => setOpen((o) => (o.has(id) ? o : new Set([...o, id])));
  const openOnly = (ids) => setOpen(new Set(ids));
  const openAll = (ids) => setOpen(new Set(ids));
  const collapseAll = () => setOpen(new Set());
  const isOpen = (id) => open.has(id);
  return { open, setOpen, toggle, openSec, openOnly, openAll, collapseAll, isOpen };
}

/* Expand/Collapse pair — drop next to a form's header row */
export function AccBulkButtons({ ids, acc, prefix = 'acc' }) {
  const { t } = useLang();   /* subscribe → re-render on BN/EN toggle */
  return (
    <span className="flex gap-1.5">
      <button type="button" id={prefix + 'ExpandAll'} className="rounded border border-line2 px-2 py-0.5 text-[10.5px] font-bold uppercase text-dim2 hover:border-acc hover:text-acc" onClick={() => acc.openAll(ids)}>{tr('Expand all')}</button>
      <button type="button" id={prefix + 'CollapseAll'} className="rounded border border-line2 px-2 py-0.5 text-[10.5px] font-bold uppercase text-dim2 hover:border-acc hover:text-acc" onClick={() => acc.collapseAll()}>{tr('Collapse')}</button>
    </span>
  );
}
