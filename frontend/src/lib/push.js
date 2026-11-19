/* Send native notifications while the storefront tab is hidden. */
export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const pushState = () => (pushSupported() ? Notification.permission : 'unsupported');

export async function requestPush() {
  if (!pushSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch (e) { return 'denied'; }
}

/* show + auto-wire the click → focus + navigate */
export function showPush(title, body, link) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  if (!document.hidden) return; // visible tab already has the in-app bell + toast
  try {
    const n = new Notification(title, { body, tag: 'arix-' + Date.now(), icon: '/arix-bell.png', badge: '/arix-bell.png' });
    n.onclick = () => {
      try { window.focus(); } catch (e) {}
      if (link) window.location.hash = '';
      if (link) window.__pushNav && window.__pushNav(link);
      n.close();
    };
  } catch (e) {}
}
