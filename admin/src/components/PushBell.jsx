/* ArixGear ADMIN — enable web-push on this device (Task 57).
   One click: Notification permission → SW PushManager.subscribe(VAPID key)
   → POST /api/n/push/subscribe. States cycle: OFF → ON; failures toast. */
import { useEffect, useState } from 'react';
import { api } from '../services/http.js';
import { useToast } from './Overlays.jsx';
import { tr } from '../lib/i18n.jsx';

const b64ToU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export default function PushBell() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    /* reflect current permission only — the definitive state lives server-side */
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') setOn(true);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        throw new Error(tr('This browser does not support web push'));
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(tr('Notification permission was denied'));
      const { publicKey } = await api('/notifications/push/key');
      /* Step 2 audit fix — navigator.serviceWorker.ready NEVER settles unless
         a service worker is already active; the admin SPA registers none, so
         the button froze on "…" forever. A scoped SW is registered here (a
         tiny inline file) and a 10s timeout fails loudly instead of hanging. */
      let reg;
      try {
        reg = await Promise.race([
          (async () => {
            const r0 = await navigator.serviceWorker.register('/admin/sw.js');
            await navigator.serviceWorker.ready;
            return r0;
          })(),
          new Promise((_, rej) => setTimeout(() => rej(new Error(tr('Push registration timed out — reload and try again'))), 10000)),
        ]);
      } catch (e) { throw e; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      const json = sub.toJSON();
      await api('/notifications/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys, agent: navigator.userAgent } });
      setOn(true);
      toast(tr('Push notifications enabled — this device will ring for new orders'), 'ok');
    } catch (e) {
      toast(e.message || tr('Could not enable push'), 'err');
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const d = await api('/notifications/push/test', { method: 'POST' });
      toast(d.message, 'ok');
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  if (on) {
    return (
      <button id="pushBell" onClick={test} disabled={busy} title={tr('Push is on — click to send a test to this device')}
        className="btn-ghost grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-green/40 text-[14px] text-green hover:border-green disabled:opacity-50">
        {busy ? '…' : '🔔'}
      </button>
    );
  }
  return (
    <button id="pushBell" onClick={enable} disabled={busy} title={tr('Enable push notifications for new orders')}
      className="btn-ghost grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-line2 text-[14px] text-dim hover:border-acc hover:text-acc disabled:opacity-50">
      {busy ? '…' : '🔕'}
    </button>
  );
}
