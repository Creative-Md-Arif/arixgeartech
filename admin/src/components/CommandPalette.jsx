/* ArixGear ADMIN — ⌘K command palette (Task 57).
   Ctrl/Cmd+K anywhere in the admin: type 2+ chars, jump straight to an
   order detail / products / customers. One backend call, three domains,
   debounced 250ms, arrow keys + Enter, Esc closes. */
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/http.js';
import { money } from '../lib/admin.js';
import { navTo } from '../lib/nav.js';
import { tr } from '../lib/i18n.jsx';

const GROUPS = [
  { key: 'orders', label: 'Orders', icon: '📦' },
  { key: 'products', label: 'Products', icon: '🏷' },
  { key: 'customers', label: 'Customers', icon: '👤' },
];

function rowFor(group, r) {
  if (group === 'orders') return {
    id: 'o:' + r._id,
    title: r.orderNumber,
    sub: (r.customer && (r.customer.name || r.customer.phone)) || '—',
    right: money(r.totals ? r.totals.grandTotal : 0),
    go: () => navTo('/orders/' + encodeURIComponent(r._id)),
  };
  if (group === 'products') return {
    id: 'p:' + r._id,
    title: r.name,
    sub: r.slug + ' · ' + (r.active ? tr('active') : tr('inactive')),
    right: money(r.price) + ' · ' + tr('{n} in stock', { n: r.stock }),
    go: () => navTo('/products'),
  };
  return {
    id: 'c:' + r._id,
    title: r.name,
    sub: [r.email, r.phone].filter(Boolean).join(' · ') || '—',
    right: (r.adminTags || []).join(', '),
    go: () => navTo('/customers'),
  };
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const seq = useRef(0);

  /* global hotkey */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /* focus input on open */
  useEffect(() => {
    if (open) { setQ(''); setData(null); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  /* debounced search */
  useEffect(() => {
    const s = q.trim();
    if (!open || s.length < 2) { setData(null); return undefined; }
    const my = ++seq.current;
    const t = setTimeout(() => {
      api('/admin/search?q=' + encodeURIComponent(s))
        .then((d) => { if (seq.current === my) { setData(d); setActive(0); } })
        .catch(() => { if (seq.current === my) setData({ orders: [], products: [], customers: [] }); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) {
    return (
      <button
        id="cmdkBtn"
        onClick={() => setOpen(true)}
        title="Command palette (Ctrl/Cmd+K)"
        className="hidden items-center gap-2 rounded-lg border border-line2 px-2.5 py-1.5 text-[11px] font-bold text-dim transition-colors hover:border-acc hover:text-acc lg:flex"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        ⌘K
      </button>
    );
  }

  const rows = [];
  GROUPS.forEach((g) => (data && data[g.key] || []).forEach((r) => rows.push({ ...rowFor(g.key, r), group: g })));

  const onInputKey = (e) => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % rows.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + rows.length) % rows.length); }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); setOpen(false); rows[active].go(); }
  };

  let idx = -1;
  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" id="cmdkOverlay"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line2 bg-panel shadow-2xl" data-testid="commandPalette">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-[18px] w-[18px] text-dim" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            id="cmdkInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={tr('Search orders, products, customers…')}
            className="flex-1 bg-transparent text-[14px] text-txt outline-none placeholder:text-dim"
            autoComplete="off" spellCheck="false"
          />
          <kbd className="rounded border border-line2 px-1.5 py-0.5 text-[10px] font-bold text-dim">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2" id="cmdkResults">
          {!data && q.trim().length >= 2 ? <div className="px-3 py-6 text-center text-[12.5px] text-dim2">{tr('Searching…')}</div> : null}
          {data && !rows.length && q.trim().length >= 2 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-dim2">{tr('No matches for “{q}”', { q: q.trim() })}</div>
          ) : null}
          {q.trim().length < 2 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-dim2">{tr('Type at least 2 characters — order number, phone, product or customer name…')}</div>
          ) : GROUPS.map((g) => {
            const list = (data && data[g.key]) || [];
            if (!list.length) return null;
            return (
              <div key={g.key} className="mb-1.5">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-dim2">{g.icon} {g.label}</div>
                {list.map((r) => {
                  idx += 1;
                  const row = rowFor(g.key, r);
                  const a = idx;
                  return (
                    <button
                      key={row.id}
                      id={'cmdk-' + a}
                      onClick={() => { setOpen(false); row.go(); }}
                      onMouseEnter={() => setActive(a)}
                      className={'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ' + (active === a ? 'bg-acc/10 text-acc' : 'text-txt hover:bg-white/[.04]')}
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px]">{row.title}</b>
                        <span className="block truncate text-[11.5px] text-dim2">{row.sub}</span>
                      </span>
                      {row.right ? <span className="shrink-0 font-cond text-[12px] font-bold text-dim">{row.right}</span> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10.5px] text-dim2">
          <span>↑↓ {tr('navigate')}</span><span>⏎ {tr('open')}</span><span>ESC {tr('close')}</span>
        </div>
      </div>
    </div>
  );
}
