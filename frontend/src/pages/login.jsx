import { useState } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { login } from '../services/auth.js';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { fbTrack } from '../lib/pixel.js';
import { AuthShell, ErrStrip, inputCls, btnPrimary, labelCls } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('login', { title: 'Log In — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { session, setSession } = useStore();
  const { toast } = useUI();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/account';

  const [form, setForm] = useState({ id: params.get('email') || '', pass: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  /*already logged in? straight to the account hub (or the deep-linked page)*/
  if (session && session.token) return <Navigate to={next} replace />;

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    if (!form.id.trim() || !form.pass) { setErr(t('Enter your email/phone and password.')); return; }
    setBusy(true);
    login(form.id.trim(), form.pass)
      .then((d) => {
        setSession({ token: d.token, user: d.user });
        try { fbTrack('Login', { method: 'Email' }); } catch (_e) {}
        toast(t('Welcome back, {name}', { name: (d.user && d.user.name) || 'friend' }), t('The rack missed you.'));
        nav(next, { replace: true });
      })
      .catch((e2) => {
        if (e2.status === 403 && e2.data && e2.data.needsVerification) {
          nav('/verify-email?email=' + encodeURIComponent(e2.data.email || form.id.trim()));
          return;
        }
        setErr(e2.message || t('Login failed — check your credentials.'));
      })
      .finally(() => setBusy(false));
  };

  return (
    <AuthShell
      title={t('Log In')}
      sub={t('Order history, wishlist sync, faster checkout and loyalty points — all behind one login.')}
      foot={(
        <>
          <Link to="/forgot-password" className="font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
            {t('Forgot password?')}
          </Link>
          <span className="mx-3 text-dim">·</span>
          <Link to={'/register' + (next !== '/account' ? '?next=' + encodeURIComponent(next) : '')} className="font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
            {t('Create Account')}
          </Link>
        </>
      )}
    >
      <form id="loginForm" noValidate onSubmit={submit}>
        <ErrStrip>{err}</ErrStrip>
        <div className="mb-4">
          <label className={labelCls} htmlFor="lgId">{t('EMAIL OR PHONE')}</label>
          <input id="lgId" type="text" autoComplete="username" placeholder="you@arix.tech · 01712-345678"
            className={inputCls} value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} />
        </div>
        <div className="mb-6">
          <label className={labelCls} htmlFor="lgPass">{t('PASSWORD')}</label>
          <input id="lgPass" type="password" autoComplete="current-password" placeholder="••••••••"
            className={inputCls} value={form.pass}
            onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))} />
        </div>
        <button id="loginBtn" type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? t('Checking…') : t('Log In')}
        </button>
        <p className="mt-4 text-center text-[.78rem] text-dim">{t('New accounts must verify the emailed 6-digit code before the first login.')}</p>
      </form>
    </AuthShell>
  );
}
