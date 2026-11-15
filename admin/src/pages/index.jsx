/* ArixGear ADMIN — login page (React port of admin index.html) */
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { auth } from '../lib/admin.js';
import { navTo } from '../lib/nav.js';
import { login, forgotPassword } from '../services/auth.js';
import { tr } from '../lib/i18n.jsx';
import { OverlayProvider, useToast } from '../components/Overlays.jsx';

function LoginCard() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  /* forgot-password panel */
  const [view, setView] = useState('login'); /* login | forgot */
  const [fpEmail, setFpEmail] = useState('');
  const [fpBusy, setFpBusy] = useState(false);
  const [fpSent, setFpSent] = useState(null);

  if (auth.token) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await login(email.trim(), pass);
      auth.set(d.token, d.user);
      navTo('/dashboard');
    } catch (err) {
      toast(err.message || tr('Login failed'), 'err');
    } finally { setBusy(false); }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setFpBusy(true);
    try {
      const d = await forgotPassword(fpEmail.trim().toLowerCase());
      setFpSent({ ...d, email: fpEmail.trim().toLowerCase() });
    } catch (err) {
      toast(err.message || tr('Could not send reset link'), 'err');
    } finally { setFpBusy(false); }
  };

  /* reset link points at the ADMIN console (role-aware API builds /admin/reset-password) */
  const adminResetUrl = fpSent && fpSent.resetUrl;

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(1000px_500px_at_70%_-10%,rgba(255,90,0,.12),transparent_60%)] bg-bg" id="loginView">
      {view === 'login' ? (
        <form className="login-card w-[400px] max-w-[92vw] rounded-2xl border border-line bg-panel px-9 py-10" onSubmit={submit}>
          <div className="login-logo font-disp text-[42px] leading-none">arixgear<b className="text-acc">.tech</b></div>
          <div className="login-sub mb-7 mt-1 text-[11px] tracking-[.28em] text-dim2">{tr('ADMIN CONSOLE')}</div>
          <div className="mb-3.5">
            <label>{tr('Email')}</label>
            <input id="liEmail" type="email" placeholder="admin@arixgear.tech" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mb-5">
            <label>{tr('Password')}</label>
            <input id="liPass" type="password" placeholder="••••••••••" autoComplete="current-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <button className="btn-acc w-full rounded-lg bg-acc py-2.5 text-[12.5px] font-bold uppercase tracking-[.08em] text-white transition hover:bg-acc-hi disabled:opacity-50" type="submit" disabled={busy}>
            {busy ? tr('Signing In…') : tr('Sign In')}
          </button>
          <button id="forgotLink" type="button" onClick={() => { setView('forgot'); setFpSent(null); }} className="mt-3.5 w-full text-center text-[11.5px] font-semibold uppercase tracking-[.18em] text-dim2 transition hover:text-acc">
            {tr('Forgot password?')}
          </button>
          {/* Task 57 (security audit) — dev builds only. Production bundles
             (import.meta.env.DEV === false) must never advertise credentials. */}
          {import.meta.env.DEV && (
          <div className="login-hint mt-4 border-t border-dashed border-line2 pt-3.5 text-[11.5px] leading-relaxed text-dim2">
            Seeded admin: <b className="text-dim">admin@arixgear.tech</b> / <b className="text-dim">ArixAdmin2026</b><br />
            Forgot it? Use the link above — reset links also work without email (copy from the response).
          </div>
          )}
        </form>
      ) : (
        <div className="login-card w-[400px] max-w-[92vw] rounded-2xl border border-line bg-panel px-9 py-10" id="fpCard">
          <div className="login-logo font-disp text-[42px] leading-none">arixgear<b className="text-acc">.tech</b></div>
          <div className="login-sub mb-6 mt-1 text-[11px] tracking-[.28em] text-dim2">RESET ADMIN PASSWORD</div>
          {!fpSent ? (
            <form id="fpForm" onSubmit={submitForgot}>
              <div className="mb-4">
                <label>Admin email</label>
                <input id="fpEmail" type="email" placeholder="admin@arixgear.tech" autoComplete="email" required value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} />
              </div>
              <button className="btn-acc w-full rounded-lg bg-acc py-2.5 text-[12.5px] font-bold uppercase tracking-[.08em] text-white transition hover:bg-acc-hi disabled:opacity-50" type="submit" disabled={fpBusy}>
                {fpBusy ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <div id="fpSent">
              <p className="mb-3 rounded-lg border border-line2 bg-white/[.03] p-3 text-[12px] leading-relaxed text-txt">{fpSent.message}</p>
              {adminResetUrl && (
                <div className="rounded-lg border border-acc/40 bg-acc/10 p-3">
                  <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.16em] text-acc">Dry-run mode — open your reset link</p>
                  <a href={adminResetUrl} className="block break-all text-[11.5px] leading-relaxed text-acc underline">{adminResetUrl}</a>
                  <p className="mt-1.5 text-[10.5px] text-dim2">Valid {fpSent.expiresIn || 15} min · single use.</p>
                </div>
              )}
            </div>
          )}
          <Link to="/login" onClick={() => setView('login')} className="mt-5 block text-center text-[11.5px] font-semibold uppercase tracking-[.18em] text-dim2 transition hover:text-acc">← Back to sign in</Link>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <OverlayProvider>
      <LoginCard />
    </OverlayProvider>
  );
}
