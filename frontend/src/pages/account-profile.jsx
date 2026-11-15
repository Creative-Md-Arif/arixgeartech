/* ArixGear page — /account/profile (Phase 6b).
   Identity + security: name/BD-phone edit, password change, loyalty card with
   referral code + point history (Task 56-a pack), logout. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile, changePassword, loyalty as loyaltyApi } from '../services/auth.js';
import { money } from '../lib/format.js';
import { useStore } from '../store/store.jsx';
import { useUI } from '../store/ui.jsx';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { AcctShell, Gate, ErrStrip, OkStrip, inputCls, btnPrimary, labelCls, miniBtn, dFmt } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('account-profile', { title: 'Profile — arixgear.tech', robots: 'noindex,follow' });
  const { t } = useLang();
  const { session, setSession, logout } = useStore();
  const { toast } = useUI();
  const nav = useNavigate();
  const user = (session && session.user) || {};

  /* profile form */
  const [pf, setPf] = useState({ name: '', phone: '' });
  const [pfErr, setPfErr] = useState('');
  const [pfOk, setPfOk] = useState('');
  const [pfBusy, setPfBusy] = useState(false);

  /* password form */
  const [pw, setPw] = useState({ cur: '', next: '', rep: '' });
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  /* loyalty */
  const [loyal, setLoyal] = useState(null);

  useEffect(() => {
    setPf({ name: user.name || '', phone: user.phone || '' });
  }, [user.name, user.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session?.token) return;
    let dead = false;
    loyaltyApi()
      .then((d) => { if (!dead) setLoyal(d); })
      .catch(() => { if (!dead) setLoyal(null); });
    return () => { dead = true; };
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = (e) => {
    e.preventDefault();
    setPfErr(''); setPfOk('');
    setPfBusy(true);
    updateProfile({ name: pf.name.trim(), phone: pf.phone.trim() })
      .then((d) => {
        setSession({ token: session.token, user: d.user });
        setPfOk(t('Profile saved.'));
        toast(t('Profile saved'), t('Your receipts and delivery calls use this identity.'));
      })
      .catch((e2) => setPfErr(e2.message || t('Could not save — try again.')))
      .finally(() => setPfBusy(false));
  };

  const savePassword = (e) => {
    e.preventDefault();
    setPwErr(''); setPwOk('');
    if (pw.next.length < 6) { setPwErr(t('New password needs 6+ characters.')); return; }
    if (pw.next !== pw.rep) { setPwErr(t('The two new passwords do not match.')); return; }
    setPwBusy(true);
    changePassword(pw.cur, pw.next)
      .then(() => {
        setPwOk(t('Password changed.'));
        setPw({ cur: '', next: '', rep: '' });
        toast(t('Password changed'), t('Use the new one on the next login.'));
      })
      .catch((e2) => setPwErr(e2.message || t('Could not change — check the current password.')))
      .finally(() => setPwBusy(false));
  };

  const doLogout = () => {
    logout();
    nav('/');
  };

  return (
    <Gate title="Profile">
      <AcctShell active="/account/profile" title={t('Profile')} lede={t('The identity your orders, warranties and support calls carry. Keep the phone live — delivery coordination runs on it.')}>
        {/* identity card */}
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 border border-line bg-panel px-5 py-4">
          <div>
            <p className="font-disp text-[1.15rem] text-txt">{user.name || '—'}</p>
            <p className="mt-0.5 text-[.82rem] text-muted">{user.email || '—'}{user.phone ? <> · {user.phone}</> : null}</p>
          </div>
          <span className={'ml-auto border px-2.5 py-1 font-cond font-bold text-[.72rem] uppercase tracking-[.22em] ' + (user.emailVerified ? 'text-ok border-ok/40' : 'text-amber border-amber/40')}>
            {user.emailVerified ? t('Email verified') : t('Email unverified')}
          </span>
          {loyal && loyal.referralCode ? (
            <span className="border border-line2 px-2.5 py-1 font-disp text-[.8rem] tracking-[.12em] text-acc">
              {t('Referral')} · {loyal.referralCode}
            </span>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* profile form */}
          <form id="pfForm" noValidate onSubmit={saveProfile} className="border border-line bg-panel p-6">
            <p className="mb-5 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Identity')}</p>
            <ErrStrip>{pfErr}</ErrStrip>
            <OkStrip>{pfOk}</OkStrip>
            <div className="mb-4">
              <label className={labelCls} htmlFor="pfName">{t('FULL NAME')}</label>
              <input id="pfName" type="text" className={inputCls} value={pf.name} onChange={(e) => setPf((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="mb-6">
              <label className={labelCls} htmlFor="pfPhone">{t('PHONE')}</label>
              <input id="pfPhone" type="tel" placeholder="01712-345678" className={inputCls} value={pf.phone} onChange={(e) => setPf((f) => ({ ...f, phone: e.target.value }))} />
              <p className="mt-1.5 text-[.75rem] text-dim">{t('BD mobile format — normalized server-side and uniqueness-checked.')}</p>
            </div>
            <button id="pfSave" type="submit" disabled={pfBusy} className={btnPrimary}>{pfBusy ? t('Saving…') : t('Save profile')}</button>
          </form>

          {/* password form */}
          <form id="pwForm" noValidate onSubmit={savePassword} className="border border-line bg-panel p-6">
            <p className="mb-5 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Password')}</p>
            <ErrStrip>{pwErr}</ErrStrip>
            <OkStrip>{pwOk}</OkStrip>
            <div className="mb-4">
              <label className={labelCls} htmlFor="pwCur">{t('CURRENT PASSWORD')}</label>
              <input id="pwCur" type="password" autoComplete="current-password" className={inputCls} value={pw.cur} onChange={(e) => setPw((f) => ({ ...f, cur: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className={labelCls} htmlFor="pwNext">{t('NEW PASSWORD')}</label>
              <input id="pwNext" type="password" autoComplete="new-password" className={inputCls} value={pw.next} onChange={(e) => setPw((f) => ({ ...f, next: e.target.value }))} />
            </div>
            <div className="mb-6">
              <label className={labelCls} htmlFor="pwRep">{t('REPEAT NEW PASSWORD')}</label>
              <input id="pwRep" type="password" autoComplete="new-password" className={inputCls} value={pw.rep} onChange={(e) => setPw((f) => ({ ...f, rep: e.target.value }))} />
            </div>
            <button id="pwSave" type="submit" disabled={pwBusy} className={btnPrimary}>{pwBusy ? t('Changing…') : t('Change password')}</button>
          </form>
        </div>

        {/* loyalty card */}
        {loyal ? (
          <div className="mt-6 border border-line bg-panel p-6" id="loyalCard">
            <div className="flex flex-wrap items-center gap-4">
              <p className="font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Loyalty')}</p>
              <span className="ml-auto font-disp text-[1.6rem] text-txt">{loyal.points} <span className="text-[.9rem] text-muted">{t('pts')}</span></span>
            </div>
            {loyal.rules && loyal.rules.enabled ? (
              <p className="mt-2 text-[.82rem] text-muted">
                {t('Points spend like cash at checkout — {min} minimum, up to {pct}% of the order. 1 point = ৳{val}.', {
                  min: loyal.rules.minRedeem, pct: loyal.rules.maxRedeemPct, val: loyal.rules.pointValue,
                })}
              </p>
            ) : null}
            {loyal.history && loyal.history.length ? (
              <div className="mt-4 border-t border-line pt-3">
                {loyal.history.slice(0, 6).map((h) => (
                  <div key={h.id} className="flex items-center gap-3 py-1.5 text-[.82rem] text-muted">
                    <span className={'font-disp ' + (h.points >= 0 ? 'text-ok' : 'text-red')}>{h.points >= 0 ? '+' : ''}{h.points}</span>
                    <span className="min-w-0 flex-1 truncate">{h.note || h.type}</span>
                    <span className="text-dim">{dFmt(h.at)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8">
          <button id="logoutBtn" onClick={doLogout} className={miniBtn}>{t('Log Out')}</button>
        </div>
      </AcctShell>
    </Gate>
  );
}
