/* ArixGear ADMIN — /admin/reset-password?token=… : finish a password reset from
   the emailed or admin-issued single-use link. Public route (no guard). */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyResetToken, resetPassword } from '../services/auth.js';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';

function ResetCard() {
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  /* verify | form | invalid | done */
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
    if (pw.length < 6) { toast('Password must be at least 6 characters', 'err'); return; }
    if (pw !== pw2) { toast('Passwords do not match', 'err'); return; }
    setBusy(true);
    try {
      const d = await resetPassword(token, pw);
      setState('done');
      toast(d.message || 'Password updated');
    } catch (err) {
      toast(err.message || 'Reset failed — link may have expired', 'err');
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(1000px_500px_at_70%_-10%,rgba(255,90,0,.12),transparent_60%)] bg-bg" id="resetView">
      <div className="login-card w-[400px] max-w-[92vw] rounded-2xl border border-line bg-panel px-9 py-10">
        <div className="login-logo font-disp text-[42px] leading-none">ArixGear<b className="text-acc">.</b></div>
        <div className="login-sub mb-6 mt-1 text-[11px] tracking-[.28em] text-dim2">SET NEW PASSWORD</div>

        {state === 'verify' && <p className="text-[12.5px] text-dim2">Validating your reset link…</p>}

        {state === 'invalid' && (
          <div id="rpInvalid">
            <p className="rounded-lg border border-red/40 bg-red/10 p-3 text-[12px] leading-relaxed text-red">
              This reset link is invalid or has expired. Links last 15 minutes and work exactly once.
            </p>
            <Link to="/login" className="btn-acc mt-4 block w-full rounded-lg bg-acc py-2.5 text-center text-[12.5px] font-bold uppercase tracking-[.08em] text-white">Back to Sign In</Link>
          </div>
        )}

        {state === 'form' && (
          <form id="rpForm" onSubmit={submit}>
            <p className="mb-4 text-[12px] leading-relaxed text-dim2">
              Setting a new password for <b className="text-txt">{maskedEmail}</b>.
            </p>
            <div className="mb-3.5">
              <label>New password</label>
              <input id="rpPass" type="password" placeholder="••••••••••" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="mb-5">
              <label>Confirm password</label>
              <input id="rpPass2" type="password" placeholder="••••••••••" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            <button className="btn-acc w-full rounded-lg bg-acc py-2.5 text-[12.5px] font-bold uppercase tracking-[.08em] text-white transition hover:bg-acc-hi disabled:opacity-50" type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

        {state === 'done' && (
          <div id="rpDone">
            <p className="rounded-lg border border-green/40 bg-green/10 p-3 text-[12px] leading-relaxed text-green">
              Password updated. Sign in with your new password now.
            </p>
            <button onClick={() => nav('/login')} className="btn-acc mt-4 w-full rounded-lg bg-acc py-2.5 text-[12.5px] font-bold uppercase tracking-[.08em] text-white transition hover:bg-acc-hi">
              Go to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <ResetCard />
    </OverlayProvider>
  );
}
