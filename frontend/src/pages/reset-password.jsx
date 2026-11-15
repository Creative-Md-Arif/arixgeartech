/* ArixGear page — /reset-password?token=… : set a new password from the
   emailed (or admin-sent) single-use reset link. Public route. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyResetToken, resetPassword } from '../services/auth.js';
import { useUI } from '../store/ui.jsx';

const labelCls = 'mb-1.5 block font-cond font-semibold text-[.78rem] uppercase tracking-[.26em] text-silver2';
const inputCls = 'w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc';
const btnPrimary = 'inline-flex items-center justify-center gap-2.5 bg-acc px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-black transition-all duration-300 clip-notch hover:bg-acc2 hover:-translate-y-0.5';
const cardCls = 'border border-line bg-panel p-6 sm:p-8';

export default function Page() {
  const nav = useNavigate();
  const { toast } = useUI();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  /* verify | invalid | done */
  const [state, setState] = useState('verify');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!token) { if (!dead) setState('invalid'); return; }
      try {
        const d = await verifyResetToken(token);
        if (!dead) { setMaskedEmail(d.email || ''); setState('form'); }
      } catch (_) { if (!dead) setState('invalid'); }
    })();
    return () => { dead = true; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { toast('Too short', 'Password must be at least 6 characters.'); return; }
    if (pw !== pw2) { toast('Passwords differ', 'Both fields must match exactly.'); return; }
    setBusy(true);
    try {
      const d = await resetPassword(token, pw);
      setState('done');
      toast('Password forged anew', d.message || 'Log in with your new password.');
    } catch (err) {
      toast('Could not reset', err.message || 'The link may have expired — request a new one.');
    } finally { setBusy(false); }
  };

  return (
    <section id="page-reset" className="py-16 md:py-24">
      <div className="container mx-auto w-[92%]">
        <div className="mx-auto max-w-[460px]">
          <h2 className="mb-8 font-disp uppercase leading-[.96] text-4xl md:text-5xl">
            NEW <span className="text-outline">PASSWORD</span>
          </h2>

          <div className={cardCls}>
            {state === 'verify' && <p className="text-[.85rem] text-dim">Validating your reset link…</p>}

            {state === 'invalid' && (
              <>
                <div className="border-l-2 border-red py-1.5 pl-3.5">
                  <b className="block font-cond text-[.85rem] uppercase tracking-[.14em] text-red">Link expired or invalid</b>
                  <span className="mt-0.5 block text-[.85rem] text-muted">
                    Reset links last 15 minutes and work once. Request a fresh one from your account page.
                  </span>
                </div>
                <Link to="/account" className={`${btnPrimary} mt-6 w-full`}>Go to Log In</Link>
              </>
            )}

            {state === 'form' && (
              <form id="rpForm" noValidate onSubmit={submit}>
                <p className="mb-6 text-[.85rem] leading-relaxed text-dim">
                  Setting a new password for <b className="text-silver">{maskedEmail}</b>. Pick something you haven't used here before.
                </p>
                <div className="mb-4">
                  <label htmlFor="rpPass" className={labelCls}>New password <span className="text-dim">(6+ characters)</span></label>
                  <input id="rpPass" type="password" placeholder="••••••••" autoComplete="new-password" className={inputCls}
                    value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="rpPass2" className={labelCls}>Confirm new password</label>
                  <input id="rpPass2" type="password" placeholder="••••••••" autoComplete="new-password" className={inputCls}
                    value={pw2} onChange={(e) => setPw2(e.target.value)} />
                </div>
                <button type="submit" disabled={busy} className={`${btnPrimary} mt-6 w-full ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                  {busy ? 'Updating…' : 'Set New Password'}
                </button>
              </form>
            )}

            {state === 'done' && (
              <>
                <div className="border-l-2 border-ok py-1.5 pl-3.5">
                  <b className="block font-cond text-[.85rem] uppercase tracking-[.14em] text-ok">Password updated</b>
                  <span className="mt-0.5 block text-[.85rem] text-muted">You can log in with your new password now.</span>
                </div>
                <button onClick={() => nav('/account')} className={`${btnPrimary} mt-6 w-full`}>Go to Log In</button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
