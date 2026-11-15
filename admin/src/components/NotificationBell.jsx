/* ArixGear ADMIN component — live notification bell (Task 36).
   SSE stream (1s delivery), unread badge, dropdown list, mark-all-read,
   click-through navigation, Bengali toast on every new event. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { list, markAllRead, markRead, streamUrl } from '../services/notifications.js';
import { useToast } from './Overlays.jsx';
import { soundOn, setSound, playBell } from '../lib/sound.js';
import { pushState, requestPush, showPush } from '../lib/push.js';
import { tr, useLang } from '../lib/i18n.jsx';

const ICONS = { order: '🛒', payment: '💳', status: '🚚', cancel: '↩', return: '📦', message: '💬', compose: '📨', system: '⚙' };
const rel = (s) => {
  const d = Date.now() - new Date(s).getTime();
  if (d < 60e3) return 'এইমাত্র';
  if (d < 3600e3) return Math.floor(d / 60e3) + ' মিনিট আগে';
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' ঘণ্টা আগে';
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export default function NotificationBell() {
  const { t } = useLang();   /* subscribe → re-render on BN/EN toggle */
  const toast = useToast();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [snd, setSnd] = useState(() => soundOn('admin'));
  const [pushPerm, setPushPerm] = useState(() => pushState());
  const boxRef = useRef(null);

  const load = () => list().then((d) => { setItems(d.items || []); setUnread(d.unread || 0); }).catch(() => {});
  useEffect(() => { load(); }, []);

  /* live stream — every event bumps the badge + fires a toast.
     Step 6 — streamUrl is async now (single-use ticket mint first). */
  useEffect(() => {
    let es = null;
    let cancelled = false;
    streamUrl().then((url) => {
      if (cancelled) return;
      es = new EventSource(url);
      es.addEventListener('notification', (e) => {
      try {
        const n = JSON.parse(e.data);
        setItems((xs) => [n, ...xs].slice(0, 30));
        setUnread((u) => u + 1);
        toast(n.title, 'ok');
        if (soundOn('admin')) playBell();          /* Task 37 — ding-dong */
        showPush(n.title, n.body || '', n.link);   /* Task 37 — OS push when hidden */
      } catch (_) {}
    });
    es.onerror = () => { /* EventSource auto-reconnects */ };
    });
    return () => { cancelled = true; if (es) es.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Task 37 — push click → focus tab + navigate */
  useEffect(() => { window.__pushNav = (link) => link && nav(link); }, []);

  /* close on outside click */
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const clickItem = async (n) => {
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markRead(n._id).catch(() => {});
    }
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div className="relative" ref={boxRef} id="adminBell">
      <button aria-label="Notifications" id="adminBellBtn"
        className="btn-ghost relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-line2 text-[15px] hover:border-acc hover:text-acc"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        🔔
        {unread > 0 ? (
          <span id="adminBellBadge" className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-red px-1 text-[9.5px] font-extrabold leading-[15px] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id="adminBellPanel" className="fixed left-2 right-2 top-[64px] z-[1200] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <b className="text-[12px] uppercase tracking-[.1em]">{tr('Notifications')}</b>
            <span className="flex items-center gap-2">
              {pushState() === 'default' ? (
                <button id="adminBellPush" className="rounded-full border border-acc/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-acc hover:bg-acc-dim"
                  onClick={async () => setPushPerm(await requestPush())}>
                  {tr('Enable desktop alerts')}
                </button>
              ) : null}
              <button id="adminBellSound" title={snd ? 'Sound on' : 'Sound muted'}
                className={'text-[13px] leading-none ' + (snd ? 'text-acc' : 'text-dim2')}
                onClick={() => { const v = !snd; setSnd(v); setSound(v, 'admin'); if (v) playBell(); }}>
                {snd ? '🔊' : '🔇'}
              </button>
              <button className="text-[11px] font-bold uppercase tracking-wide text-dim2 hover:text-acc" id="adminBellReadAll"
                onClick={() => markAllRead().then(load).catch(() => {})}>{tr('Mark all read')}</button>
            </span>
          </div>
          {items.length ? items.map((n) => (
            <button key={n._id || Math.random()} className={'flex w-full items-start gap-2.5 border-b border-line px-4 py-2.5 text-left last:border-b-0 hover:bg-panel2 ' + (n.read ? 'opacity-60' : '')}
              onClick={() => clickItem(n)}>
              <span className="mt-px text-[15px]">{ICONS[n.type] || '🔔'}</span>
              <span className="min-w-0 flex-1">
                <span className={'block truncate text-[12.5px] ' + (n.read ? 'text-dim' : 'font-bold text-txt')}>{n.title}</span>
                {n.body ? <span className="mt-0.5 block line-clamp-2 text-[11.5px] text-dim2">{n.body}</span> : null}
                <span className="mt-0.5 block text-[10.5px] text-dim2">{rel(n.createdAt)}</span>
              </span>
              {!n.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-acc" /> : null}
            </button>
          )) : <div className="px-4 py-8 text-center text-[12.5px] text-dim2">{tr('No notifications yet')}</div>}
        </div>
      ) : null}
    </div>
  );
}
