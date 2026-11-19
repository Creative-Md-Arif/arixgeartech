import { useSEO } from '../lib/seo.jsx';
import { API_BASE } from '../services/http.js';
import { useUI } from '../store/ui.jsx';

const GW_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

export default function Page() {
  useSEO('payment');
  const { toast } = useUI();
  const q = new URLSearchParams(window.location.search);
  const ono = String(q.get('order') || '').toUpperCase();
  const sim = String(q.get('sim') || '');
  const valid = /^ARG-[A-Z0-9]+$/.test(ono) && /^[a-f0-9]{32}$/.test(sim);

  const jump = (kind) => {
    if (kind === 'pay') {
      const val = 'SIM' + Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) + Date.now().toString(36).toUpperCase();
      window.location.href = `${GW_ORIGIN}/api/payments/validate/${ono}?sim=${sim}&val_id=${val}&card_type=VISA`;
      return;
    }
    window.location.href = `${GW_ORIGIN}/api/payments/${kind}/${ono}?sim=${sim}`;
  };

  return (
    <section className="py-16 md:py-24 bg-bg2 min-h-[70vh]">
      <div className="container mx-auto w-[92%]">
        <div className="max-w-[560px] mx-auto border border-line bg-panel px-5 py-10 sm:px-9 sm:py-12 animate-slideUp">
          <p className="font-cond font-semibold text-[.72rem] tracking-[.3em] uppercase text-acc mb-2">Simulated gateway · SSLCOMMERZ</p>
          <h1 className="font-disp text-3xl sm:text-4xl uppercase tracking-[.02em] text-txt mb-3">Checkout</h1>

          {!valid ? (
            <p className="text-[.9rem] text-muted">
              This simulated session link is incomplete or malformed. Start again from the checkout page.
            </p>
          ) : (
            <>
              <div className="border border-line2 bg-bg2 px-4 py-4 mb-6">
                <p className="text-[.7rem] text-dim tracking-[.18em] uppercase mb-1">Order</p>
                <p className="font-disp text-2xl tracking-[.05em] text-txt">{ono}</p>
                <p className="text-[.8rem] text-muted mt-1">Amount: your order grand total (BDT) — charged by the gateway in live mode.</p>
              </div>
              <p className="text-[.85rem] text-muted mb-6">
                This page replaces the real SSLCOMMERZ checkout while the gateway runs without store credentials.
                Pick an outcome — the backend treats each one exactly like the gateway redirect would.
              </p>
              <div className="grid gap-3">
                <button type="button" id="simPay" onClick={() => jump('pay')}
                  className="w-full bg-acc text-black font-head font-extrabold text-[.8rem] tracking-[.14em] uppercase px-5 py-4 transition-opacity hover:opacity-90">
                  Pay now — simulate success
                </button>
                <button type="button" id="simFail" onClick={() => { toast('Simulating failure', 'The gateway will bounce you back to checkout.'); jump('fail'); }}
                  className="w-full bg-transparent border border-line2 text-silver font-cond font-semibold text-[.75rem] tracking-[.18em] uppercase px-5 py-3.5 transition-colors hover:border-red hover:text-red">
                  Simulate payment failure
                </button>
                <button type="button" id="simCancel" onClick={() => jump('cancel')}
                  className="w-full bg-transparent border border-line2 text-dim font-cond font-semibold text-[.75rem] tracking-[.18em] uppercase px-5 py-3.5 transition-colors hover:border-silver hover:text-silver">
                  Cancel and go back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
