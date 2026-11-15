/* ArixGear page — /product-registration (Phase 6d).
   Warranty registration desk: order number + checkout phone + optional serial
   → ARG-W record with the expiry pre-calculated server-side from the product's
   printed warranty months. Includes the lookup panel (reg number + phone). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { registerWarranty, lookupWarranty } from '../services/service.js';
import { useLang } from '../lib/i18n.jsx';
import { useSEO } from '../lib/seo.jsx';
import { Eyebrow, ErrStrip, OkStrip, inputCls, btnPrimary, labelCls, miniBtn, dFmt } from '../components/accountKit.jsx';

export default function Page() {
  useSEO('product-registration', {
    title: 'Product Registration — arixgear.tech',
    description: 'Register a delivered product for warranty — order number + checkout phone issues an ARG-W record with expiry pre-calculated.',
  });
  const { t } = useLang();

  /* register form */
  const [form, setForm] = useState({ orderNumber: '', phone: '', serial: '', email: '', notes: '' });
  const [regErr, setRegErr] = useState('');
  const [regOk, setRegOk] = useState(null); /* registration publicView on success */
  const [regBusy, setRegBusy] = useState(false);

  /* lookup panel */
  const [lk, setLk] = useState({ regNumber: '', phone: '' });
  const [lkErr, setLkErr] = useState('');
  const [lkRes, setLkRes] = useState(null); /* registration view */
  const [lkBusy, setLkBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setRegErr(''); setRegOk(null);
    if (!form.orderNumber.trim() || !form.phone.trim()) { setRegErr(t('Order number and the checkout phone are required.')); return; }
    setRegBusy(true);
    registerWarranty({
      orderNumber: form.orderNumber.trim().toUpperCase(),
      phone: form.phone.trim(),
      serial: form.serial.trim(),
      email: form.email.trim(),
      notes: form.notes.trim(),
    })
      .then((d) => { setRegOk(d.registration); })
      .catch((e2) => {
        if (e2.status === 409 && e2.data && e2.data.regNumber) {
          setRegErr(t('Already registered — warranty number {reg}.', { reg: e2.data.regNumber }));
        } else {
          setRegErr(e2.message || t('Registration failed — check the order number and phone.'));
        }
      })
      .finally(() => setRegBusy(false));
  };

  const doLookup = (e) => {
    e.preventDefault();
    setLkErr(''); setLkRes(null);
    if (!lk.regNumber.trim() || !lk.phone.trim()) { setLkErr(t('Warranty number and the registered phone are required.')); return; }
    setLkBusy(true);
    lookupWarranty(lk.regNumber.trim().toUpperCase(), lk.phone.trim())
      .then((d) => setLkRes(d.registration))
      .catch((e2) => setLkErr(e2.message || t('No warranty found with this number.')))
      .finally(() => setLkBusy(false));
  };

  const RegCard = ({ r }) => (
    <div className="mt-6 border border-ok/40 bg-ok/[.06] p-5" id="regResult">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-disp text-[1.25rem] tracking-[.08em] text-ok">{r.regNumber}</span>
        <span className={'ml-auto border px-2.5 py-1 font-cond text-[.7rem] font-bold uppercase tracking-[.22em] ' + (r.expired ? 'text-red border-red/40' : 'text-ok border-ok/40')}>
          {r.expired ? t('Expired') : t('Active')}
        </span>
      </div>
      <p className="mt-2 text-[.92rem] text-txt">{r.productName}{r.sku ? <span className="text-dim"> · {r.sku}</span> : null}</p>
      <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-[.85rem] text-muted sm:grid-cols-2">
        <div className="flex justify-between gap-4"><dt>{t('Order')}</dt><dd className="text-txt">{r.orderNumber}</dd></div>
        <div className="flex justify-between gap-4"><dt>{t('Purchase')}</dt><dd className="text-txt">{dFmt(r.purchaseDate)}</dd></div>
        <div className="flex justify-between gap-4"><dt>{t('Coverage')}</dt><dd className="text-txt">{r.warrantyMonths} {t('months')}</dd></div>
        <div className="flex justify-between gap-4"><dt>{t('Expires')}</dt><dd className="text-txt">{dFmt(r.expiresAt)}</dd></div>
        {r.serial ? <div className="flex justify-between gap-4 sm:col-span-2"><dt>{t('Serial')}</dt><dd className="font-disp text-txt">{r.serial}</dd></div> : null}
      </dl>
      <p className="mt-3 text-[.78rem] text-dim">{t('Keep this number — service tickets referencing an ARG-W record skip invoice re-verification.')}</p>
    </div>
  );

  return (
    <section id="page-product-registration" className="page py-16 lg:py-24">
      <div className="container mx-auto w-[92%] max-w-5xl">
        <Eyebrow>{t('WARRANTY DESK')}</Eyebrow>
        <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">
          {t('Product Registration')}
        </h2>
        <p className="mt-4 max-w-2xl text-[.95rem] leading-relaxed text-muted">
          {t('Turn a delivered order into an ARG-W warranty record — expiry comes from the product page’s printed months, calculated on the server, never typed by hand.')}
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          {/* register */}
          <form id="regForm" noValidate onSubmit={submit} className="h-fit border border-line bg-panel p-6 sm:p-7">
            <p className="mb-5 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Register a product')}</p>
            <ErrStrip>{regErr}</ErrStrip>
            {regOk ? <OkStrip>{t('Registered — your warranty record is live below.')}</OkStrip> : null}
            {!regOk ? (
              <>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="rgOrd">{t('ORDER NUMBER')}</label>
                    <input id="rgOrd" type="text" placeholder="ARG-XXXXXX" autoComplete="off" className={inputCls}
                      value={form.orderNumber} onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="rgPh">{t('CHECKOUT PHONE')}</label>
                    <input id="rgPh" type="tel" placeholder="01712-345678" className={inputCls}
                      value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="rgSerial">{t('SERIAL — OPTIONAL')}</label>
                    <input id="rgSerial" type="text" placeholder="SN / service tag" className={inputCls}
                      value={form.serial} onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="rgEmail">{t('EMAIL — OPTIONAL')}</label>
                    <input id="rgEmail" type="email" placeholder="you@arix.tech" className={inputCls}
                      value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div className="mb-6">
                  <label className={labelCls} htmlFor="rgNotes">{t('NOTES — OPTIONAL')}</label>
                  <input id="rgNotes" type="text" placeholder={t('Anything the service desk should know')} className={inputCls}
                    value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <button id="regSubmit" type="submit" disabled={regBusy} className={`${btnPrimary} w-full`}>
                  {regBusy ? t('Registering…') : t('Register warranty')}
                </button>
                <p className="mt-3 text-[.78rem] leading-relaxed text-dim">
                  {t('Multi-item orders register their first line — put the product slug in notes if you need a specific one, and the desk re-points the record.')}
                </p>
              </>
            ) : <RegCard r={regOk} />}
          </form>

          {/* lookup + help */}
          <div className="space-y-6">
            <form id="lkForm" noValidate onSubmit={doLookup} className="h-fit border border-line bg-panel p-6">
              <p className="mb-5 font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Look up a registration')}</p>
              <ErrStrip>{lkErr}</ErrStrip>
              <div className="mb-4">
                <label className={labelCls} htmlFor="lkReg">{t('WARRANTY NUMBER')}</label>
                <input id="lkReg" type="text" placeholder="ARG-W-XXXXXX" autoComplete="off" className={inputCls}
                  value={lk.regNumber} onChange={(e) => setLk((f) => ({ ...f, regNumber: e.target.value }))} />
              </div>
              <div className="mb-5">
                <label className={labelCls} htmlFor="lkPhone">{t('REGISTERED PHONE')}</label>
                <input id="lkPhone" type="tel" placeholder="last 6 digits OK" className={inputCls}
                  value={lk.phone} onChange={(e) => setLk((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <button id="lkSubmit" type="submit" disabled={lkBusy} className={`${miniBtn} w-full`}>
                {lkBusy ? t('Looking…') : t('Look up')}
              </button>
              {lkRes ? <RegCard r={lkRes} /> : null}
            </form>

            <div className="border border-line bg-panel p-6">
              <p className="font-cond text-[.82rem] font-semibold uppercase tracking-[.3em] text-acc">{t('Why register?')}</p>
              <ul className="mt-3 space-y-2 text-[.85rem] leading-relaxed text-muted">
                <li className="flex gap-2.5"><i className="not-italic mt-[.45em] h-1.5 w-1.5 flex-none bg-acc" />{t('Service tickets skip invoice re-verification — the ARG-W record is the proof.')}</li>
                <li className="flex gap-2.5"><i className="not-italic mt-[.45em] h-1.5 w-1.5 flex-none bg-acc" />{t('Expiry is printed on the record — no guessing months from memory.')}</li>
                <li className="flex gap-2.5"><i className="not-italic mt-[.45em] h-1.5 w-1.5 flex-none bg-acc" />{t('Walk-in centers pull the record up by number alone.')}</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/service-center" className={miniBtn}>{t('Service Centers')}</Link>
                <Link to="/policies/warranty" className={miniBtn}>{t('Warranty Policy')}</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
