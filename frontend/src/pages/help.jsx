/* ArixGear page — /help (Phase 6c).
   Help-center hub: every self-service surface as a link card, plus response
   times and the emergency strip (order issues → contact desk). */
import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow } from '../components/accountKit.jsx';

const CARDS = [
  ['/faq', 'FAQ', 'Delivery fees, payment verification, the 7-day return window, warranty terms — the quick answers, one page.'],
  ['/track-order', 'Track an Order', 'Order number + checkout phone shows live status, the full timeline and the PDF invoice.'],
  ['/account/orders', 'My Orders', 'Account history with details, self-cancel before dispatch and the return form on delivered orders.'],
  ['/account/returns', 'Returns & Refunds', 'Follow every RMA from request to refund — pickup within 48 hours, money back in 3–7 days.'],
  ['/product-registration', 'Product Registration', 'Turn an order into an ARG-W warranty record with the expiry date pre-calculated.'],
  ['/service-center', 'Service Centers', 'Walk-in diagnostics and repairs — addresses, hours, phone numbers, by city.'],
  ['/policies/shipping', 'Shipping Policy', 'Fees by division, the ৳15,000 free-shipping line, processing times and courier handoff.'],
  ['/policies/returns', 'Returns Policy', 'What qualifies, the 7-day window, condition rules and how refunds arrive.'],
  ['/policies/warranty', 'Warranty Policy', 'Panel vs shop warranty, what voids it, and how ARG-W registration speeds claims.'],
  ['/contact', 'Contact the Desk', 'Complaints, order issues, bulk quotes — one working day response, human replies.'],
];

export default function Page() {
  useSEO('help', {
    title: 'Help Center — arixgear.tech',
    description: 'Every self-service surface in one place: order tracking, returns, warranty registration, service centers and the full policy library.',
  });
  const { t } = useLang();
  return (
    <section id="page-help" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%] max-w-5xl">
        <Eyebrow>{t('SUPPORT DESK')}</Eyebrow>
        <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
          {t('Help Center')}
        </h2>
        <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
          {t('Start here before writing in — most order, payment and warranty questions are answered on one of these pages.')}
        </p>

        <div className="mt-10 grid gap-[.7rem] sm:grid-cols-2 lg:grid-cols-3" id="helpGrid">
          {CARDS.map(([to, lab, sub]) => (
            <Link
              key={to}
              to={to}
              className="group border border-line bg-panel px-5 py-5 transition duration-200 hover:border-line2 hover:bg-panel2"
            >
              <p className="flex items-center justify-between font-cond text-[.82rem] font-semibold uppercase tracking-[.24em] text-acc">
                {t(lab)}
                <span className="text-dim transition-transform duration-200 group-hover:translate-x-1">→</span>
              </p>
              <p className="mt-2.5 text-[.85rem] leading-relaxed text-muted">{sub}</p>
            </Link>
          ))}
        </div>

        {/* response-time strip */}
        <div className="mt-10 grid gap-[.7rem] sm:grid-cols-3" id="helpSla">
          {[
            [t('Order & payment issues'), t('Contact desk — reply within one working day'), '/contact'],
            [t('Live order status'), t('Tracking page — no login needed'), '/track-order'],
            [t('Warranty claims'), t('ARG-W registration + service ticket'), '/product-registration'],
          ].map(([lab, sub, to]) => (
            <Link key={to + lab} to={to} className="border border-line2 bg-panel px-5 py-4 transition-colors hover:border-acc/60">
              <p className="font-cond text-[.8rem] font-bold uppercase tracking-[.22em] text-txt">{lab}</p>
              <p className="mt-1.5 text-[.82rem] text-muted">{sub}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
