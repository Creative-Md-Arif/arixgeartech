/* Desktop and mobile theme toggles share state. */
import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n.jsx';

const KEY = 'arixgear_theme';

/* --- tiny shared theme store (module singleton) --- */
const listeners = new Set();
const readStored = () => {
  try { return localStorage.getItem(KEY) === 'light'; } catch (e) { return false; }
};
let light = readStored();

function applyTheme(v) {
  light = v;
  document.documentElement.classList.toggle('light', v);
  try { localStorage.setItem(KEY, v ? 'light' : 'dark'); } catch (e) {}
  listeners.forEach((fn) => fn(v));
}

const MoonIcon = () => (
  /* moon */
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6z" />
  </svg>
);
const SunIcon = ({ cls = 'h-[18px] w-[18px]' }) => (
  /* sun */
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
  </svg>
);

export default function ThemeToggle({ variant = 'icon' }) {
  const [isLight, setIsLight] = useState(light);
  const { t } = useLang();

  useEffect(() => {
    const fn = (v) => setIsLight(v);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  /* label + icon show the TARGET theme (same semantics as the lang pill):
     dark mode → sun "Light Mode", light mode → moon "Dark Mode" */
  if (variant === 'pill') {
    return (
      <button
        id="mobileThemeToggle"
        className="flex items-center gap-1.5 border border-line2 bg-panel px-3 py-2 font-cond text-xs font-semibold uppercase tracking-[.15em] text-txt transition-colors hover:border-acc hover:text-acc"
        aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
        onClick={() => applyTheme(!isLight)}
      >
        {isLight ? <MoonIcon /> : <SunIcon cls="h-4 w-4" />}
        {t(isLight ? 'Dark Mode' : 'Light Mode')}
      </button>
    );
  }

  return (
    <button
      id="themeToggle"
      className="icon-btn relative grid h-10 w-10 place-items-center text-muted transition-colors hover:text-acc"
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      onClick={() => applyTheme(!isLight)}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
