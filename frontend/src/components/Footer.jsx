/* ArixGear component — newsletter strip + footer (content admin-driven) */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../store/content.jsx';
import { useUI } from '../store/ui.jsx';
import { go } from '../lib/go.js';
import { subscribe } from '../services/messages.js';
import { useLang } from '../lib/i18n.jsx';

export function Newsletter() {
  const { content } = useContent();
  const { toast } = useUI();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState(null);
  const [copied, setCopied] = useState(false);
  const nl = content.newsletter || {};
  const submit = async (e) => {
    e.preventDefault();
    if (!/\S+@\S+\.\S+$/.test(email)) { toast(t('Check the email'), t('That address does not look right.')); return; }
    setBusy(true);
    try {
      const r = await subscribe(email.trim());
      if (r && r.coupon && r.coupon.code) {
        setCoupon(r.coupon);
        setCopied(false);
        toast(t('Welcome to the Forge'), r.alreadySubscribed ? t('Already on the list — your 10% code works at checkout.') : t('Subscribed — your 10% code is ready.'));
      } else {
        toast(t('Welcome to the Forge'), nl.note || '');
      }
      setEmail('');
    } catch (err) {
      if (err && err.offline) { toast(t('Welcome to the Forge'), nl.note || ''); setEmail(''); }
      else toast(t('Not sent'), (err && err.message) || t('Something went wrong — try again.'));
    } finally { setBusy(false); }
  };
  const copyCode = async () => {
    if (!coupon) return;
    try { await navigator.clipboard.writeText(coupon.code); setCopied(true); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = coupon.code; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); setCopied(true); } catch {} ta.remove();
    }
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="newsletter metal border-y border-line">
      <div className="container nl-grid mx-auto grid w-[92%] items-center gap-8 py-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h3 className="nl-title font-disp text-4xl uppercase leading-none md:text-5xl">
            {(() => {
              const w = String(nl.title || '').trim().split(' ').filter(Boolean);
              if (!w.length) return null;
              const last = w.pop();
              return <>{w.join(' ')}{w.length ? ' ' : ''}<span className="text-outline">{last}</span></>;
            })()}
          </h3>
          <p className="nl-sub mt-3 max-w-md text-[.95rem] text-muted">{nl.sub}</p>
        </div>
        <div className="min-w-0">
          <form className="nl-form flex" id="nlForm" onSubmit={submit}>
            <input type="email" id="nlEmail" placeholder="YOUR EMAIL" aria-label="Email for newsletter" value={email} onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 border border-line2 bg-bg2 px-4 py-4 font-cond tracking-[.12em] text-txt placeholder:text-dim focus:border-acc focus:outline-none" />
            <button className="btn-primary shrink-0 bg-acc px-8 py-4 font-head text-[.8rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2" type="submit" disabled={busy}>{t('Sign Up')}</button>
          </form>
          <p className="nl-note mt-3 font-cond text-[.82rem] tracking-[.06em] text-dim">{nl.note}</p>
          {coupon && (
            <div id="nlCouponCard" className="mt-4 flex w-full max-w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-3 border border-acc/50 bg-acc/10 px-5 py-4">
              <div className="min-w-0 max-w-full">
                <div className="font-cond text-[.7rem] uppercase tracking-[.18em] text-dim">{t('Your 10% welcome code')}</div>
                <div id="nlCouponCode" className="font-disp text-2xl tracking-wide text-acc md:text-3xl">{coupon.code}</div>
              </div>
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                <button type="button" id="nlCopyBtn" onClick={copyCode}
                  className="border border-acc px-4 py-2 font-cond text-[.75rem] font-semibold uppercase tracking-[.14em] text-acc transition hover:bg-acc hover:text-black">
                  {copied ? t('Copied!') : t('Copy Code')}
                </button>
                <Link to="/checkout" id="nlUseBtn"
                  className="bg-acc px-4 py-2 font-cond text-[.75rem] font-extrabold uppercase tracking-[.14em] text-black transition hover:bg-acc2">
                  {t('Use at Checkout')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PAY_METHODS = ['bkash', 'nagad', 'rocket', 'cod'];

export default function Footer() {
  const { content, payInfo } = useContent();
  const { t } = useLang();
  const site = content.site || {};
  const socials = Array.isArray(site.socials) ? site.socials : [];
  return (
    <footer className="carbon border-t border-line">
      <div className="container mx-auto w-[92%]">
        <div className="foot-grid grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="foot-brand">
            <a className="logo font-disp text-3xl" href="#hero" onClick={(e) => { e.preventDefault(); go('#hero'); }}>arixgear<b className="text-acc">.tech</b></a>
            <p className="mt-4 max-w-sm text-[.9rem] leading-relaxed text-muted">{t('Genuine tech, priced in BDT, proven by the ledger. Laptops, desktops, monitors, components and accessories — warranty-backed and delivered nationwide.')}</p>
            <div className="socials mt-5 flex gap-2">
              {(socials.length ? socials : [{ n: 'Instagram' }, { n: 'YouTube' }, { n: 'X' }]).map((s, i) => (
                <a key={i} className="soc grid h-10 w-10 place-items-center border border-line2 text-muted transition-colors hover:border-acc hover:text-acc" href={s.url || '#'} aria-label={s.n || 'Social'} target="_blank" rel="noreferrer">
                  {(s.n || '').toLowerCase().includes('insta') ? <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-[18px] w-[18px]" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2m0 3.1a6.7 6.7 0 1 0 0 13.4 6.7 6.7 0 0 0 0-13.4m0 11a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6m6.9-11.2a1.6 1.6 0 1 1-3.1 0 1.6 1.6 0 0 1 3.1 0z" /></svg>
                    : (s.n || '').toLowerCase().includes('you') ? <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M23 12s0-3.9-.5-5.6c-.3-1-1.1-1.8-2.1-2.1C18.6 3.8 12 3.8 12 3.8s-6.6 0-8.4.5c-1 .3-1.8 1.1-2.1 2.1C1 8.1 1 12 1 12s0 3.9.5 5.6c.3 1 1.1 1.8 2.1 2.1 1.8.5 8.4.5 8.4.5s6.6 0 8.4-.5c1-.3 1.8-1.1 2.1-2.1.5-1.7.5-5.6.5-5.6zM9.8 15.6V8.4l6.2 3.6-6.2 3.6z" /></svg>
                      : <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor"><path d="M17.7 3H21l-7.2 8.2L22.2 21h-6.6l-5.2-6.1L4.5 21H1.2l7.7-8.8L1.5 3h6.8l4.7 5.5L17.7 3z" /></svg>}
                </a>
              ))}
            </div>
          </div>
          <div className="foot-col">
            <h4 className="font-head text-[.8rem] font-extrabold uppercase tracking-[.25em] text-txt">{t('Shop')}</h4>
            <div className="mt-4 flex flex-col gap-2.5 text-[.88rem] text-muted">
              <Link to="/flash-sale" className="font-semibold text-acc hover:text-acc2" id="footFlash">⚡ {t('Flash Sale')}</Link>
              <Link to="/shop" className="hover:text-acc">{t('All Gear')}</Link>
              <Link to="/category/laptops" className="hover:text-acc">{t('Laptops')}</Link>
              <Link to="/category/desktops" className="hover:text-acc">{t('Desktops')}</Link>
              <Link to="/category/monitors" className="hover:text-acc">{t('Monitors')}</Link>
              <Link to="/category/components" className="hover:text-acc">{t('Components')}</Link>
              <Link to="/brands" className="hover:text-acc">{t('Brand Directory')}</Link>
            </div>
          </div>
          <div className="foot-col">
            <h4 className="font-head text-[.8rem] font-extrabold uppercase tracking-[.25em] text-txt">{t('Support')}</h4>
            <div className="mt-4 flex flex-col gap-2.5 text-[.88rem] text-muted">
              <Link to="/track-order" className="hover:text-acc" id="footTrack">{t('Track Order')}</Link>
              <Link to="/help" className="hover:text-acc">{t('Help Center')}</Link>
              <Link to="/faq" className="hover:text-acc">{t('FAQ')}</Link>
              <Link to="/policies/shipping" className="hover:text-acc">{t('Shipping Policy')}</Link>
              <Link to="/policies/returns" className="hover:text-acc">{t('Returns & Refunds')}</Link>
              <Link to="/policies/warranty" className="hover:text-acc">{t('Warranty Policy')}</Link>
              <Link to="/service-center" className="hover:text-acc">{t('Service Centers')}</Link>
              <Link to="/contact" className="hover:text-acc">{t('Contact')}</Link>
            </div>
          </div>
          <div className="foot-col">
            <h4 className="font-head text-[.8rem] font-extrabold uppercase tracking-[.25em] text-txt">{t('Company')}</h4>
            <div className="mt-4 flex flex-col gap-2.5 text-[.88rem] text-muted">
              <Link to="/about" className="hover:text-acc">{t('About ArixGear')}</Link>
              <Link to="/guides" className="hover:text-acc">{t('Buying Guides')}</Link>
              <Link to="/blog" className="hover:text-acc" id="footBlog">{t('The Journal')}</Link>
              <Link to="/new-arrivals" className="hover:text-acc">{t('New Arrivals')}</Link>
              <Link to="/best-sellers" className="hover:text-acc">{t('Best Sellers')}</Link>
              <Link to="/product-registration" className="hover:text-acc">{t('Product Registration')}</Link>
              <Link to="/account" className="hover:text-acc">{t('My Account')}</Link>
            </div>
          </div>
        </div>
        <div className="foot-bottom flex flex-col items-center justify-between gap-4 border-t border-line py-6 md:flex-row">
          <p className="font-cond text-[.8rem] uppercase tracking-[.15em] text-dim">{site.copyright || '© 2026 ArixGear Technologies Ltd. Dhaka, Bangladesh.'}</p>
          <div className="pay-marks flex flex-wrap justify-center gap-2">
            {PAY_METHODS.map((m) => (
              <span key={m} className="border border-line2 px-2.5 py-1 font-cond text-[.72rem] font-semibold uppercase tracking-[.12em] text-silver2">
                {m === 'cod' ? t('Cash on Delivery') : ((payInfo[m] || {}).label) || m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
