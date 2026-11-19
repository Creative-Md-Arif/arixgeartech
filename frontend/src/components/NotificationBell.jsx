/* Customer notifications through the SSE stream and account history. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { list, markAllRead, markRead, streamUrl } from '../services/notifications.js';
import { useUI } from '../store/ui.jsx';
import { tr } from '../lib/i18n.jsx';
import { soundOn, setSound, playBell } from '../lib/sound.js';
import { pushState, requestPush, showPush } from '../lib/push.js';

const ICONS = { order: '🛒', payment: '💳', status: '🚚', cancel: '↩', return: '📦', message: '💬', compose: '📨', system: '⚙' };
const rel = (s) => {
  const d = Date.now() - new Date(s).getTime();
  if (d < 60e3) return tr('just now');
  if (d < 3600e3) return Math.floor(d / 60e3) + tr(' min ago');
  if (d < 86400e3) return Math.floor(d / 3600e3) + tr(' hr ago');
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export default function NotificationBell({ session }) {
  const { toast } = useUI();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [snd, setSnd] = useState(() => soundOn('user'));
  const [pushPerm, setPushPerm] = useState(() => pushState());
  const boxRef = useRef(null);

  const load = () => list().then((d) => { setItems(d.items || []); setUnread(d.unread || 0); }).catch(() => {});

  useEffect(() => {
    if (!session?.token) return; // guests have no bell
    load();
    /* streamUrl is async now (single-use ticket mint first) */
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
        if (soundOn('user')) playBell();          /* ding-dong */
        showPush(n.title, n.body || '', n.link);   /* OS push when hidden */
      } catch (_) {}
      });
      es.onerror = () => {};
    }).catch(() => {/*notification streaming is optional; keep the app usable*/});
    return () => { cancelled = true; if (es) es.close(); };
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  /* push click → focus tab + navigate */
  useEffect(() => { window.__pushNav = (link) => link && nav(link || '/account'); }, []);

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!session?.token) return null;

  const clickItem = async (n) => {
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markRead(n._id).catch(() => {});
    }
    setOpen(false);
    nav(n.link || '/account');
  };

  return (
    <div className="relative" ref={boxRef} id="userBell">
      <button aria-label="Notifications" id="userBellBtn"
        className="icon-btn relative grid h-10 w-10 place-items-center text-muted transition-colors hover:text-acc"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        🔔
        {unread > 0 ? (
          <span id="userBellBadge" className="absolute right-0.5 top-0.5 grid min-w-[16px] place-items-center rounded-full bg-acc px-1 text-[9.5px] font-extrabold leading-[15px] text-black">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div id="userBellPanel" className="fixed left-2 right-2 top-[68px] z-[1200] max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[340px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <b className="text-[12px] uppercase tracking-[.1em]">{tr('Notifications')}</b>
            <span className="flex items-center gap-2">
              {pushState() === 'default' ? (
                <button id="userBellPush" className="rounded-full border border-acc/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-acc hover:bg-acc/10"
                  onClick={async () => setPushPerm(await requestPush())}>
                  {tr('Enable desktop alerts')}
                </button>
              ) : null}
              <button id="userBellSound" title={snd ? 'Sound on' : 'Sound muted'}
                className={'text-[13px] leading-none ' + (snd ? 'text-acc' : 'text-dim2')}
                onClick={() => { const v = !snd; setSnd(v); setSound(v, 'user'); if (v) playBell(); }}>
                {snd ? '🔊' : '🔇'}
              </button>
              <button className="text-[11px] font-bold uppercase tracking-wide text-dim2 hover:text-acc" id="userBellReadAll"
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
