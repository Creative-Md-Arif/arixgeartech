/* ArixGear ADMIN i18n — Task 48. BN/EN UI toggle (UI strings only; API data and
   all backend responses stay English). English source strings are the keys:
   tr(key) === key when lang=en (default), Bangla mapping when lang=bn. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BN } from './bn.js';

const KEY = 'forged_admin_lang';
const Ctx = createContext(null);
let CUR = 'en';

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
  /* sync the module-level CUR during render (idempotent) — keeps tr() fresh */
  CUR = lang;
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }, [lang]);
  const value = useMemo(() => ({ lang, isBn: lang === 'bn', setLang, t: tr, toggle: () => setLang((l) => (l === 'en' ? 'bn' : 'en')) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx) || { lang: 'en', isBn: false, setLang: () => {}, t: tr, toggle: () => {} };
}

export function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button id="adminLangToggle" onClick={toggle}
      aria-label={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}
      title={lang === 'en' ? 'বাংলায় দেখুন' : 'View in English'}
      className="btn-ghost shrink-0 rounded-lg border border-line2 px-2.5 py-1.5 text-[12px] font-bold hover:border-acc hover:text-acc">
      {lang === 'en' ? 'বাংলা' : 'EN'}
    </button>
  );
}
