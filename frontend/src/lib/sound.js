/* Task 37 — bell sound alert: a synthesized "ding-dong" via Web Audio.
   No audio files needed; works on both admin + storefront bells.
   Preference persists under a console-specific storage key. */

const KEYS = {
  admin: 'forged_user_sound',
  user: 'forged_user_sound',
};

export const soundOn = (which = 'admin') => {
  try { return localStorage.getItem(KEYS[which] || KEYS.admin) !== '0'; } catch (e) { return true; }
};

export const setSound = (on, which = 'admin') => {
  try { localStorage.setItem(KEYS[which] || KEYS.admin, on ? '1' : '0'); } catch (e) {}
};

let ctx = null;
const audio = () => {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

/* two-tone chime (E6 → C6) — warm, short, impossible to mistake for an OS sound */
export function playBell() {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
  gain.connect(c.destination);
  [[659.25, 0], [523.25, 0.18]].forEach(([f, dt]) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t0 + dt);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t0 + dt);
    g2.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.55);
    o.connect(g2); g2.connect(gain);
    o.start(t0 + dt); o.stop(t0 + dt + 0.6);
  });
}
