import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/auth.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AuthShell, ErrStrip, OkStrip, inputCls, btnPrimary, labelCls } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('forgot-password', { title: 'Forgot Password — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null); /*response {message, delivery, resetUrl?}*/
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr(t('A valid email is required.')); return; }
    setBusy(true);
    forgotPassword(email.trim())
      .then((d) => setSent(d || { message: t('If an account exists for this email, a password reset link has been sent.') }))
      .catch((e2) => setErr(e2.message || t('Something went wrong — try again.')))
      .finally(() => setBusy(false));
  };

  return (
    <AuthShell
      title={t('Forgot Password')}
      sub={t('Enter the account email — a single-use reset link valid for 15 minutes goes out by mail.')}
      foot={(
        <>
          {t('Remembered it?')}{' '}
          <Link to="/login" className="font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
            {t('Log In')}
          </Link>
        </>
      )}
    >
      {sent ? (
        <div id="fpSent">
          <OkStrip>{sent.message || t('Reset link sent.')}</OkStrip>
          <p className="text-[.85rem] leading-relaxed text-muted">{t('The link expires in 15 minutes and works once. Check spam too — support can resend from the contact desk if it never lands.')}</p>
          {sent.resetUrl ? (
            <div className="mt-5 border border-line2 bg-bg2 p-4">
              <p className="font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">{t('DEV MIRROR — RESEND NOT CONFIGURED')}</p>
              <a id="fpDevLink" href={sent.resetUrl} className="mt-2 block break-all text-[.8rem] text-acc hover:text-acc2">{sent.resetUrl}</a>
            </div>
          ) : null}
          <button onClick={() => { setSent(null); setEmail(''); }} className={`${btnPrimary} mt-6 w-full`}>{t('Use a different email')}</button>
        </div>
      ) : (
        <form id="fpForm" noValidate onSubmit={submit}>
          <ErrStrip>{err}</ErrStrip>
          <div className="mb-6">
            <label className={labelCls} htmlFor="fpEmail">{t('EMAIL')}</label>
            <input id="fpEmail" type="email" autoComplete="email" placeholder="you@arix.tech"
              className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button id="fpBtn" type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
            {busy ? t('Sending…') : t('Send reset link')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
