import { useState } from 'react';
import { sendMessage } from '../services/messages.js';
import { useContent } from '../store/content.jsx';
import { useUI } from '../store/ui.jsx';

const Eyebrow = ({ children }) => (
  <p className="font-cond font-semibold uppercase tracking-[.45em] text-acc text-[.82rem] flex items-center gap-3">
    <i className="not-italic inline-block h-0.5 w-9 bg-acc" />{children}
  </p>
);

const labelCls = 'mb-1.5 block font-cond font-semibold text-[.78rem] uppercase tracking-[.26em] text-silver2';
const inputCls = 'w-full border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc';
const errInputCls = 'border-red animate-shake';
const btnPrimary = 'inline-flex items-center justify-center gap-2.5 bg-acc px-8 py-4 font-head font-extrabold text-[.8rem] uppercase tracking-[.2em] text-black transition-all duration-300 clip-notch hover:bg-acc2 hover:-translate-y-0.5';

const TOPICS = ['Order & shipping', 'Returns — 30 days', 'Product question', 'Service & repair', 'Complaint', 'Wholesale'];  // fitness-era topics swapped for tech support flows

/*multi-line info cell text (legacy data-cs-type="lines")*/
const Lines = ({ text }) => (
  <>
    {String(text || '').split(/\n/).filter((l) => l.trim()).map((l, i) => <span key={i} className="block">{l}</span>)}
  </>
);

import { useSEO } from '../lib/seo.jsx';

export default function Page() {
  useSEO('contact');
  const { content } = useContent();
  const { toast } = useUI();
  const c = content.contact || {};

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState('');
  const [topic, setTopic] = useState(() => {/*quick-services deep links (?topic=Service & repair)*/ const t = new URLSearchParams(window.location.search).get('topic'); return TOPICS.includes(t) ? t : TOPICS[0]; }); const [message, setMessage] = useState(''); const [errs, setErrs] = useState({ name: false, email: false, msg: false }); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); /*FAQ accordion — one open at a time (legacy behavior)*/ const faqs = Array.isArray(content.faqs) ? content.faqs : []; const [openFaq, setOpenFaq] = useState(null); const done = () => { setSent(true); toast('Message sent', 'We answer like training partners — within one working day.'); setName(''); setEmail(''); setOrder(''); setMessage(''); setTimeout(() => setSent(false), 7000); }; const submit = async (e) => { e.preventDefault(); const badName = !name.trim(); const badEmail = !/^\S+@\S+\.\S+$/.test(email); const badMsg = message.trim().length < 10; setErrs({ name: badName, email: badEmail, msg: badMsg }); if (badName || badEmail || badMsg) { toast('Check the form', 'Name, a valid email and a 10+ character message.'); return; } setBusy(true); try { await sendMessage({ name: name.trim(), email: email.trim(), orderNo: order.trim(), topic, subject: topic + (order.trim() ? ' · ' + order.trim() : ''), message: message.trim(), }); done(); } catch (err) { if (err.offline) done();  else toast('Not sent', err.message || 'Something went wrong — try again.'); } finally { setBusy(false); } }; const conCell = (title, text) => ( <div className="border border-line bg-panel p-6"> <h4 className="mb-2 font-cond font-bold text-[.78rem] uppercase tracking-[.3em] text-acc">{title}</h4> <p className="text-[.9rem] text-muted"><Lines text={text} /></p> </div> ); return ( <> <section id="page-contact" className="py-16 md:py-24"> <div className="container mx-auto w-[92%]"> <div className="mb-10"> {c.eyebrow ? <Eyebrow>{c.eyebrow}</Eyebrow> : null} <h2 className="mt-4 font-disp uppercase leading-[.96] text-4xl md:text-6xl"> {c.heading ? String(c.heading).split(/\n/).filter((l) => l.trim()).map((ln, i) => { const w = ln.trim().split(' '); const last = w.pop(); return <span key={i} className="block">{w.join(' ')}{w.length ? ' ' : ''}<span className="text-outline">{last}</span></span>; }) : null} </h2> </div> <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
<div className="border border-line bg-panel p-6 sm:p-8">
              <h3 className="mb-6 font-disp text-[1.25rem] uppercase"><i className="not-italic text-acc">01</i> Send a Message</h3>
              <form id="ctForm" noValidate onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ctName" className={labelCls}>Name</label>
                    <input id="ctName" type="text" placeholder="Marcus Reed" className={`${inputCls} ${errs.name ? errInputCls : ''}`}
                      value={name} onChange={(e) => { setName(e.target.value); if (errs.name) setErrs((x) => ({ ...x, name: false })); }} />
                  </div>
                  <div>
                    <label htmlFor="ctEmail" className={labelCls}>Email</label>
                    <input id="ctEmail" type="email" placeholder="you@iron.house" className={`${inputCls} ${errs.email ? errInputCls : ''}`}
                      value={email} onChange={(e) => { setEmail(e.target.value); if (errs.email) setErrs((x) => ({ ...x, email: false })); }} />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ctOrder" className={labelCls}>Order number <span className="text-dim">(optional)</span></label>
                    <input id="ctOrder" type="text" placeholder="ARG-00000" className={inputCls}
                      value={order} onChange={(e) => setOrder(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="ctTopic" className={labelCls}>Topic</label>
                    <select id="ctTopic" className={`${inputCls} cursor-pointer`} value={topic} onChange={(e) => setTopic(e.target.value)}>
                      {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <label htmlFor="ctMsg" className={labelCls}>Message</label>
                  <textarea id="ctMsg" placeholder="Tell us what's going on — the more detail, the faster we fix it."
                    className={`min-h-[130px] w-full resize-y border border-line2 bg-bg2 px-4 py-3 text-[.92rem] text-txt outline-none transition-colors placeholder:text-dim focus:border-acc ${errs.msg ? errInputCls : ''}`}
                    value={message} onChange={(e) => { setMessage(e.target.value); if (errs.msg) setErrs((x) => ({ ...x, msg: false })); }} />
                </div>
                <button type="submit" disabled={busy}
                  className={`${btnPrimary} mt-6 ${busy ? 'pointer-events-none opacity-60' : ''}`}>Send Message</button>
                <p id="ctDone" hidden={!sent} className="mt-4 text-[.8rem] text-ok">Message locked in — we reply within one working day.</p>
              </form>
            </div>

            {/*---------- CONTACT INFO (admin → Content → Contact page) ----------*/}
            <div className="grid gap-5">
              {c.emails ? conCell('Email', c.emails) : null}
              {c.phone ? conCell('Phone', c.phone) : null}
              {c.responseTime ? conCell('Response Time', c.responseTime) : null}
              {c.hours ? conCell('Hours', c.hours) : null}
              {c.address ? conCell('The ArixGear HQ', c.address) : null}
            </div>
          </div>

          {/*---------- FAQ (admin → Content → FAQs; hidden when none defined) ----------*/}
          {faqs.length > 0 && (
          <div className="mt-14">
            <div className="mb-8">
              {c.faqEyebrow ? <Eyebrow>{c.faqEyebrow}</Eyebrow> : null}
              <h2 className="mt-4 font-disp uppercase leading-[.96] text-4xl md:text-6xl">
                {c.faqHeading
                  ? String(c.faqHeading).split(/\n/).filter((l) => l.trim()).map((ln, i) => {
                    const w = ln.trim().split(' '); const last = w.pop();
                    return <span key={i} className="block">{w.join(' ')}{w.length ? ' ' : ''}<span className="text-outline">{last}</span></span>;
                  })
                  : null}
              </h2>
            </div>
            <div id="faqItems">
              {faqs.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={i} className="mb-2.5 border border-line bg-panel">
                    <button className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left font-head font-bold text-[.92rem] uppercase tracking-[.06em] transition-colors hover:text-acc"
                      onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}>
                      {f.q}
                      <i className={`ml-auto flex-none font-disp text-[1.2rem] not-italic text-acc transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</i>
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-forge ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="min-h-0 overflow-hidden">
                        <p className="max-w-[75ch] px-5 pb-5 text-[.92rem] text-muted">{f.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

        </div>
      </section>

    </>
  );
}
