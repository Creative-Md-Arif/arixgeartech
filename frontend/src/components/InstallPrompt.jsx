/* Install prompt for eligible visitors who have not dismissed it. */
import { useEffect, useState } from 'react';
import { useUI } from '../store/ui.jsx';

const KEY = 'arixgear_pwa_dismissed';

export default function InstallPrompt() {
  const { toast } = useUI();
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let standalone = false;
    try {
      standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch (_) {}
    if (standalone) return undefined; /* already installed — never nag */

    let t = null;
    const onBip = (e) => {
      e.preventDefault(); /* keep OUR button as the install entry */
      setDeferred(e);
      try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}
      t = setTimeout(() => {/*re-check at fire time — a dismissal that happened while the timer
           was pending (Chrome can fire the REAL event before the visitor
           dismisses anything) must never pop the card */
        try { if (localStorage.getItem(KEY) === '1') return; } catch (_) {}
        setShow(true);
      }, 3500);
    };
    const onInstalled = () => {
      setDeferred(null); setShow(false);
      try { localStorage.setItem(KEY, '1'); } catch (_) {}
      toast('ArixGear app installed — find it on your home screen', 'ok');
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, [toast]);

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') toast('Installing ArixGear…', 'ok');
      setDeferred(null); setShow(false);
    } catch (_) { /* engine refused — stay silent*/}
    setBusy(false);
  };

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
  };

  if (!show || !deferred) return null;

  return (
    <div id="pwaInstall" className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-panel/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,.55)] backdrop-blur md:inset-x-auto md:right-5 md:bottom-5">
      <img src="/pwa-icon-192.png" alt="ArixGear" className="h-11 w-11 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="font-head text-[.8rem] font-extrabold uppercase tracking-[.14em] text-txt">Install the ArixGear app</div>
        <div className="truncate text-[.72rem] text-muted">Full-screen shopping, faster loads, offline shell.</div>
      </div>
      <button onClick={install} disabled={busy} id="pwaInstallBtn"
        className="shrink-0 rounded-lg bg-acc px-3.5 py-2 font-cond text-[.7rem] font-bold uppercase tracking-[.14em] text-black transition hover:bg-acc2 disabled:opacity-50">
        {busy ? '…' : 'Install'}
      </button>
      <button onClick={dismiss} aria-label="Dismiss install prompt" id="pwaDismissBtn"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line2 text-muted transition hover:text-txt">✕</button>
    </div>
  );
}
