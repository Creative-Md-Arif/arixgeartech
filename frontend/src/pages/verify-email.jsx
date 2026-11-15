/* ArixGear page — /verify-email (Phase 6b).
   6-box OTP twin of the account hub verifier: paste support, auto-advance,
   60s resend cooldown, dev-code hint when the backend mirrors the OTP. */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail, resendVerification } from '../services/auth.js';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AuthShell, ErrStrip, OkStrip, btnPrimary } from '../components/accountKit.jsx';

const SIX = [0, 1, 2, 3, 4, 5];

export default function Page() {
  useSEO('verify-email', { title: 'Verify Email — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { setSession } = useStore();
  const { toast } = useUI();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();

  /* email comes from ?email=… (login redirect) or router state (register handoff) */
  const st = (loc && loc.state) || {};
  const [email, setEmail] = useState(st.email || params.get('email') || '');
  const devOtp = st.devOtp || '';

  const [boxes, setBoxes] = useState(Array(6).fill(''));
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [rsLeft, setRsLeft] = useState(0);
  const refs = useRef([]);

  /* resend cooldown ticker */
  useEffect(() => {
    if (rsLeft <= 0) return undefined;
    const id = setInterval(() => setRsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [rsLeft]);

  const setDigit = (ix, ch) => {
    const v = ch.replace(/\D/g, '').slice(-1);
    setBoxes((cur) => {
      const nx = [...cur];
      nx[ix] = v;
      if (v && ix < 5) refs.current[ix + 1] && refs.current[ix + 1].focus();
      return nx;
    });
  };

  const onPaste = (e) => {
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setBoxes(Array.from({ length: 6 }, (_, i) => digits[i] || ''));
    refs.current[Math.min(digits.length, 5)] && refs.current[Math.min(digits.length, 5)].focus();
  };

  const submit = (e) => {
    e && e.preventDefault();
    const code = boxes.join('');
    setErr('');
    if (!email) { setErr(t('Enter the account email first.')); return; }
    if (code.length !== 6) { setErr(t('Enter all 6 digits of the code.')); return; }
    setBusy(true);
    verifyEmail(email, code)
      .then((d) => {
        setSession({ token: d.token, user: d.user });
        setOk(t('Email verified — you are logged in.'));
        toast(t('Welcome, {name}', { name: (d.user && d.user.name) || 'friend' }), t('Referral credits, guest orders and loyalty are now yours.'));
        setTimeout(() => nav('/account', { replace: true }), 900);
      })
      .catch((e2) => setErr(e2.message || t('Verification failed — try again.')))
      .finally(() => setBusy(false));
  };

  const resend = () => {
    setErr(''); setOk('');
    resendVerification(email)
      .then(() => { setOk(t('A fresh code is on its way.')); setRsLeft(60); })
      .catch((e2) => setErr(e2.message || t('Could not resend — wait a minute and retry.')));
  };

  return (
    <AuthShell
      title={t('Verify Email')}
      sub={email
        ? t('Six digits went to {email}. The code lives for 10 minutes.', { email })
        : t('Six digits went to your inbox. The code lives for 10 minutes.')}
      foot={(
        <>
          {t('Wrong address?')}{' '}
          <Link to="/register" className="font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc">
            {t('Register again')}
          </Link>
        </>
      )}
    >
      <form id="vtForm" noValidate onSubmit={submit}>
        <ErrStrip>{err}</ErrStrip>
        <OkStrip>{ok}</OkStrip>
        {!email ? (
          <input id="vtEmail" type="email" placeholder="you@arix.tech" aria-label="Account email"
            className="mb-5 w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none placeholder:text-dim focus:border-acc"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        ) : null}
        <div id="vtBoxes" data-testid="vtBoxes" className="mb-5 flex justify-center gap-2">
          {SIX.map((i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              aria-label={'Digit ' + (i + 1)}
              className="h-13 w-11 border border-line2 bg-bg2 py-3 text-center font-disp text-[1.3rem] text-txt outline-none transition-colors focus:border-acc"
              value={boxes[i]}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !boxes[i] && i > 0) refs.current[i - 1].focus(); }}
              onPaste={onPaste}
            />
          ))}
        </div>
        {devOtp ? (
          <div id="vtDevBox" className="mb-5 border border-line2 bg-bg2 p-4 text-center">
            <p className="font-cond text-[.72rem] uppercase tracking-[.2em] text-dim">{t('DEV MIRROR — RESEND NOT CONFIGURED')}</p>
            <button type="button" onClick={() => setBoxes(devOtp.split(''))} className="mt-1.5 font-disp text-[1.4rem] tracking-[.35em] text-acc hover:text-acc2">
              {devOtp}
            </button>
          </div>
        ) : null}
        <button id="vtBtn" type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? t('Verifying…') : t('Verify & log in')}
        </button>
        <button id="vtResend" type="button" onClick={resend} disabled={rsLeft > 0 || busy}
          className="mt-4 w-full font-cond text-[.78rem] font-semibold uppercase tracking-[.2em] text-silver2 transition-colors hover:text-acc disabled:cursor-not-allowed disabled:opacity-40">
          {rsLeft > 0 ? t('Resend available in {s}s', { s: rsLeft }) : t('Resend the code')}
        </button>
      </form>
    </AuthShell>
  );
}
