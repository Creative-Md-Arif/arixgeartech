import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { register } from '../services/auth.js';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { fbTrack } from '../lib/pixel.js';
import { AuthShell, ErrStrip, inputCls, btnPrimary, labelCls } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('register', { title: 'Create Account — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { session } = useStore();
  const { toast } = useUI();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/account';

  const [form, setForm] = useState({ name: '', email: '', phone: '', pass: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (session && session.token) return <Navigate to={next} replace />;

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim() || !form.email.trim() || !form.pass) { setErr(t('Name, email and password are required.')); return; }
    if (form.pass.length < 6) { setErr(t('Password needs at least 6 characters.')); return; }
    setBusy(true);
    register(form.name.trim(), form.email.trim(), form.pass, form.phone.trim())
      .then((d) => {
        try { fbTrack('CompleteRegistration', {}); } catch (_e) {}
        toast(t('Account created'), t('We emailed you a 6-digit verification code.'));
        nav('/verify-email', { state: { email: d.email || form.email.trim(), devOtp: d.devOtp || '' }, replace: true });
      })
      .catch((e2) => setErr(e2.message || t('Registration failed — try again.')))
      .finally(() => setBusy(false));
  };

  return (
    <AuthShell
      title={t('Create Account')}
      sub={t('One account for orders, warranty registrations, loyalty points and reviews.')}
      foot={(
        <>
          {t('Already registered?')}{' '}
          <Link to={'/login' + (next !== '/account' ? '?next=' + encodeURIComponent(next) : '')} className="font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
            {t('Log In')}
          </Link>
        </>
      )}
    >
      <form id="regForm" noValidate onSubmit={submit}>
        <ErrStrip>{err}</ErrStrip>
        <div className="mb-4">
          <label className={labelCls} htmlFor="rgName">{t('FULL NAME')}</label>
          <input id="rgName" type="text" autoComplete="name" placeholder="Rahim Ahmed"
            className={inputCls} value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="mb-4">
          <label className={labelCls} htmlFor="rgEmail">{t('EMAIL')}</label>
          <input id="rgEmail" type="email" autoComplete="email" placeholder="you@arix.tech"
            className={inputCls} value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="mb-4">
          <label className={labelCls} htmlFor="rgPhone">{t('PHONE — OPTIONAL')}</label>
          <input id="rgPhone" type="tel" autoComplete="tel" placeholder="01712-345678"
            className={inputCls} value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <p className="mt-1.5 text-[.75rem] text-dim">{t('BD mobile format — guest orders placed with this phone are claimed by the account after verification.')}</p>
        </div>
        <div className="mb-6">
          <label className={labelCls} htmlFor="rgPass">{t('PASSWORD')}</label>
          <input id="rgPass" type="password" autoComplete="new-password" placeholder="••••••••"
            className={inputCls} value={form.pass}
            onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))} />
        </div>
        <button id="regBtn" type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? t('Creating…') : t('Create Account')}
        </button>
      </form>
    </AuthShell>
  );
}
