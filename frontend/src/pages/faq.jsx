import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, miniBtn } from '../components/accountKit.jsx';

const GROUPS = [
  {
    id: 'orders',
    title: 'Orders & Delivery',
    items: [
      ['How long does delivery take?', 'Orders are verified within 24 hours, then dispatched. Inside Dhaka usually lands in 1–2 working days; outside Dhaka 2–4 working days. The order page shows a 3-day ETA from placement — the courier call narrows it to a window.'],
      ['What does shipping cost?', 'Dhaka ৳60 · Chattogram, Rajshahi, Khulna ৳100 · Barishal, Sylhet, Rangpur, Mymensingh ৳120. Orders of ৳15,000 or more (after discounts) ship free nationwide.'],
      ['Can I order without an account?', 'Yes — guest checkout is phone-based and never blocked. The order appears in your history automatically if you later register with the same phone or email, or place orders from the account for guaranteed linking.'],
      ['Can I cancel an order?', 'Self-cancel works while the order is verifying, processing or packed — from the order page or the tracking panel. Once shipped, support handles it; stock and any redeemed loyalty points come back automatically.'],
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    items: [
      ['Which payment methods work?', 'bKash, Nagad and Rocket (send the amount, submit the transaction ID — we verify it), Cash on Delivery, and the SSLCOMMERZ card gateway when enabled. The checkout page always shows the live merchant number.'],
      ['How long does payment verification take?', 'Mobile-wallet payments are checked by the payments desk within a few working hours; you get a bell notification and an SMS the moment the order moves to processing. Keep the transaction screenshot until then.'],
      ['Is there a welcome discount?', 'Yes — subscribe to the newsletter with your email and the 10% welcome code ARIX10 arrives instantly. It applies at checkout to full-price items.'],
      ['Can I pay with loyalty points?', 'Points earned from orders and referrals spend like cash at checkout — the panel appears automatically for logged-in customers, with a minimum redeem and a cap per order set by the store.'],
    ],
  },
  {
    id: 'returns',
    title: 'Returns & Refunds',
    items: [
      ['What is the return window?', 'Delivered orders can be returned within 7 days of delivery. Open the request from the order page (or tracking panel) — one active request per order, pickup is arranged within 48 hours.'],
      ['What can be returned?', 'Damaged or defective units, wrong items, and products not as described. Items should come back complete — box, cables, accessories — for the refund to clear without deductions.'],
      ['How do refunds arrive?', 'After the parcel passes inspection, refunds go back to bKash / Nagad / your bank within 3–7 working days. The refund is also logged on the order for your records.'],
    ],
  },
  {
    id: 'warranty',
    title: 'Warranty & Service',
    items: [
      ['How long is the warranty?', 'Every product page prints its warranty months and type (official panel / shop service). Laptops typically carry 1–2 years; accessories vary by brand — the PDP line is the contract.'],
      ['How do I register a warranty?', 'Use Product Registration with your order number and checkout phone — the system issues an ARG-W number with the expiry date pre-calculated. Registration makes warranty claims dramatically faster.'],
      ['Where do I claim service?', 'Open a service ticket from the contact desk or walk into a listed service center. Tickets get an ARG-SRV number with a live timeline; diagnostics at partner centers are free during the warranty period.'],
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      ['Why must I verify my email?', 'Verification blocks fake-email spam farms from farming referral credits. Registration sends a 6-digit code (valid 10 minutes, single use); the referral bonus lands the moment you verify.'],
      ['I forgot my password — now what?', 'The forgot-password page sends a single-use reset link valid for 15 minutes. It expires after one use; request a fresh one any time.'],
      ['Can I log in with my phone number?', 'Yes — the login field accepts your email or your BD mobile number, whichever the account carries.'],
    ],
  },
];

export default function Page() {
  useSEO('faq', {
    title: 'FAQ — Orders, Payments, Returns, Warranty',
    description: 'arixgear.tech customer FAQ — delivery times and fees across Bangladesh, bKash/Nagad/Rocket payments, the 7-day return window, warranty registration and account help.',
  });
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const norm = (s) => s.toLowerCase();
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return GROUPS;
    return GROUPS
      .map((g) => ({ ...g, items: g.items.filter(([qa, a]) => norm(qa).includes(needle) || norm(a).includes(needle)) }))
      .filter((g) => g.items.length);
  }, [q]);

  const toggle = (k) => setOpen((cur) => (cur === k ? null : k));

  return (
    <section id="page-faq" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%] max-w-4xl">
        <Eyebrow>{t('SUPPORT DESK')}</Eyebrow>
        <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
          {t('Frequently Asked Questions')}
        </h2>
        <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
          {t('The numbers here — fees, windows, timelines — are the same ones the backend enforces. Nothing aspirational.')}
        </p>

        <div className="mt-8 flex items-center gap-[.6rem] border border-line bg-panel px-[.9rem] py-[.7rem] ring-1 ring-inset ring-line2 focus-within:ring-acc">
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] flex-none fill-none stroke-[2] stroke-dim"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            id="faqFilter" type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('Search the FAQ — COD, delivery, warranty, refund…')}
            aria-label="Search FAQ"
            className="w-full border-0 bg-transparent text-[.9rem] text-txt outline-none placeholder:text-dim"
          />
        </div>

        <div className="mt-10">
          {filtered.length === 0 ? (
            <div className="border border-dashed border-line2 px-6 py-14 text-center text-muted">
              <h3 className="mb-2 font-disp text-[1.6rem] uppercase text-txt">{t('No answer matched')}</h3>
              <p>{t('The contact desk replies within one working day.')}</p>
              <Link to="/contact" className={`${miniBtn} mt-6 inline-flex`}>{t('Contact')}</Link>
            </div>
          ) : (
            filtered.map((g) => (
              <div key={g.id} className="mb-9">
                <h3 className="mb-3 flex items-center gap-3 font-disp text-[1.35rem] uppercase text-txt">
                  <i className="not-italic inline-block h-0.5 w-7 bg-acc" />{t(g.title)}
                </h3>
                {g.items.map(([qa, a], i) => {
                  const k = g.id + '-' + i;
                  const on = open === k;
                  return (
                    <div key={k} className="mb-2 border border-line bg-panel">
                      <button
                        id={'faq-' + k}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        aria-expanded={on}
                        onClick={() => toggle(k)}
                      >
                        <span className="text-[.95rem] font-semibold text-txt">{qa}</span>
                        <span className={'flex-none font-disp text-[1.2rem] text-acc transition-transform duration-200 ' + (on ? 'rotate-45' : '')}>+</span>
                      </button>
                      {on ? <p className="border-t border-line px-5 py-4 text-[.9rem] leading-relaxed text-muted">{a}</p> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[.85rem] text-muted">{t('Deeper reading:')}</span>
          <Link to="/help" className={miniBtn}>{t('Help Center')}</Link>
          <Link to="/policies/shipping" className={miniBtn}>{t('Shipping Policy')}</Link>
          <Link to="/policies/returns" className={miniBtn}>{t('Returns Policy')}</Link>
          <Link to="/service-center" className={miniBtn}>{t('Service Center')}</Link>
        </div>
      </div>
    </section>
  );
}
