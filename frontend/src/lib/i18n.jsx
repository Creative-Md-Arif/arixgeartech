/* UI translations and bilingual API field helpers. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BN } from './bn.js';

const KEY = 'arixgear_lang';
const Ctx = createContext(null);

/* module-level current lang — non-React code (stores/toasts) calls tr() */
let CUR = 'en';

/* bilingual DB content picker. Backend documents carry BOTH
   languages (`name` + `nameBn`, …). pick() returns the Bengali field when
   lang=bn AND the Bengali value is non-empty; anything else falls back to
   the English source of truth. Non-React code (stores) may call this too —
   it reads the module-level CUR that LangProvider keeps in sync. */
export function pick(obj, field) {
  if (!obj) return '';
  const bn = obj[field + 'Bn'];
  return (CUR === 'bn' && bn) ? bn : (obj[field] ?? '');
}

/* array twin — features, spec rows, ticker items … */
export function pickArr(obj, field) {
  if (!obj) return [];
  const bn = obj[field + 'Bn'];
  const arr = (CUR === 'bn' && Array.isArray(bn) && bn.length) ? bn : (obj[field] || []);
  return Array.isArray(arr) ? arr : [];
}

export function tr(str, vars) {
  let s = str == null ? '' : String(str);
  if (CUR === 'bn' && BN[s]) s = BN[s];
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k] == null ? '' : vars[k]));
  return s;
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(KEY) === 'bn' ? 'bn' : 'en'; } catch (e) { return 'en'; }
  });
  /* sync the module-level CUR during render (idempotent) — effect alone ran
     AFTER the re-render, leaving one stale-English paint after each toggle */
  CUR = lang;
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }, [lang]);
  const value = useMemo(() => ({
    lang,
    isBn: lang === 'bn',
    setLang,
    t: tr,
    toggle: () => setLang((l) => (l === 'en' ? 'bn' : 'en')),
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx) || { lang: 'en', isBn: false, setLang: () => {}, t: tr, toggle: () => {} };
}

/* header pill — globe icon + EN/বাং label, sits beside the theme toggle */
export function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      id="langToggle"
      className="icon-btn relative grid h-10 w-10 place-items-center text-muted transition-colors hover:text-acc"
      aria-label={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}
      title={lang === 'en' ? 'বাংলায় দেখুন' : 'View in English'}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
      </svg>
      <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center bg-acc px-0.5 font-head text-[.5rem] font-extrabold uppercase leading-none text-black">
        {lang === 'en' ? 'বাং' : 'EN'}
      </span>
    </button>
  );
}
