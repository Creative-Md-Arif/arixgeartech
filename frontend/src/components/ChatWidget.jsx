import { useEffect, useRef, useState } from 'react';
import { getChat } from '../services/settings.js';
import { sendMessage } from '../services/messages.js';
import { getConfig, ask } from '../services/ai.js';
import { useLang } from '../lib/i18n.jsx';
import { money } from '../lib/format.js';
import { useUI } from '../store/ui.jsx';

/* '01712-345678' | '+8801712345678' | '8801712…' → 8801XXXXXXXXX */
function waDigits(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return '880' + d.replace(/^0+/, '');
  return d;
}

const SESSION_KEY = 'arix_ai_session';
function sessionKey() {
  try {
    let k = localStorage.getItem(SESSION_KEY);
    if (!k) { k = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(SESSION_KEY, k); }
    return k;
  } catch (_) { return 'web-' + Date.now().toString(36); }
}

/* ---------- tiny product card (opens the real PDP) ---------- */
function ProductCard({ p, onOpen }) {
  return (
    <button onClick={() => onOpen(p.slug)} className="ai-card flex w-full items-center gap-3 rounded-xl border border-line bg-bg p-2.5 text-left transition hover:border-acc" data-slug={p.slug}>
      {p.image ? <img src={p.image} alt={p.name} className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover" loading="lazy" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[.82rem] font-semibold text-txt">{p.name}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[.78rem]">
          <b className="text-acc">{p.priceLabel || money(p.price)}</b>
          {p.comparePrice ? <s className="text-dim">{money(p.comparePrice)}</s> : null}
          <span className={(p.inStock ? 'text-ok' : 'text-red')}>{p.inStock ? 'In stock' : 'Out of stock'}</span>
        </span>
      </span>
      <span className="shrink-0 font-cond text-[.68rem] uppercase tracking-[.16em] text-dim">view →</span>
    </button>
  );
}

export default function ChatWidget() {
  const { isBn } = useLang();
  const { openPDP } = useUI();
  const [cfg, setCfg] = useState(null);          /* null = loading */
  const [aiCfg, setAiCfg] = useState(null);
  const [tab, setTab] = useState('ai');          /* ai | contact */
  const [open, setOpen] = useState(false);
  /* contact tab state */
  const [form, setForm] = useState({ name: '', message: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /* AI tab state */
  const [msgs, setMsgs] = useState([]);          /* [{role:'user'|'ai', text, products?}] */
  const [input, setInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const scRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let dead = false;
    getChat().then((d) => { if (!dead) setCfg(d.chat || {}); }).catch(() => { if (!dead) setCfg({}); });
    getConfig().then((d) => { if (!dead) setAiCfg(d); }).catch(() => { if (!dead) setAiCfg({ enabled: false }); });
    return () => { dead = true; };
  }, []);

  useEffect(() => { if (scRef.current) scRef.current.scrollTop = scRef.current.scrollHeight; }, [msgs, aiBusy, open]);

  const aiEnabled = Boolean(aiCfg && aiCfg.enabled);

  const askAI = async (text) => {
    const q = String(text || input).trim();
    if (!q || aiBusy) return;
    setInput('');
    setAiErr('');
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setAiBusy(true);
    try {
      const d = await ask({ message: q, sessionKey: sessionKey() });
      setMsgs((m) => [...m, { role: 'ai', text: d.reply, products: d.products || [], links: d.links || [], provider: d.provider, intent: d.intent }]);
    } catch (e) {
      setAiErr(e.message);
    } finally { setAiBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!form.name.trim() || form.message.trim().length < 2) { setErr('Name and a short message are required.'); return; }
    setBusy(true);
    try {
      await sendMessage({ name: form.name.trim(), topic: 'chat', message: form.message.trim(), email: '' });
      setSent(true);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  if (cfg && cfg.enabled === false && !aiEnabled) return null; // both channels off

  const digits = waDigits(cfg?.whatsapp);
  const waHref = digits ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent('Hi ArixGear! I have a question about ') : '';
  const tgRaw = String(cfg?.telegram || '').trim();
  const tgHref = tgRaw ? (/^https?:\/\//.test(tgRaw) ? tgRaw : 'https://t.me/' + tgRaw.replace(/^@/, '')) : '';

  const suggestions = isBn ? (aiCfg?.suggestionsBn?.length ? aiCfg.suggestionsBn : aiCfg?.suggestions || []) : (aiCfg?.suggestions || []);

  return (
    <div className="chat-widget fixed bottom-4 right-4 z-[900] flex flex-col items-end gap-2.5 md:bottom-6 md:right-6" id="chatWidget">

      {open ? (
        <div className="chat-panel w-in(92vw,340px)] border border-line bg-panel shadow-2xl shadow-black/60" id="chatPanel" ref={panelRef}>
          <div className="flex items-center justify-between border-b border-line bg-bg2 px-4 py-3">
            <div>
              <p className="font-head text-[.9rem] font-bold uppercase tracking-[.15em] text-txt">{tab === 'ai' ? '🤖 AI Assistant' : 'Live Chat'}</p>
              <p className="font-cond text-[.7rem] uppercase tracking-[.2em] text-ok">{tab === 'ai' ? '● database-grounded answers' : '● online — replies within an hour'}</p>
            </div>
            <button className="grid h-8 w-8 place-items-center text-muted transition-colors hover:text-acc" id="chatClose" aria-label="Close chat" onClick={() => setOpen(false)}>✕</button>
          </div>

          {aiEnabled ? (
            <div className="flex border-b border-line bg-bg2" id="chatTabs">
              <button onClick={() => setTab('ai')} className={'flex-1 py-2 font-cond text-[.72rem] font-bold uppercase tracking-[.18em] transition ' + (tab === 'ai' ? 'border-b-2 border-acc text-acc' : 'text-dim hover:text-txt')}>AI Help</button>
              <button onClick={() => setTab('contact')} className={'flex-1 py-2 font-cond text-[.72rem] font-bold uppercase tracking-[.18em] transition ' + (tab === 'contact' ? 'border-b-2 border-acc text-acc' : 'text-dim hover:text-txt')}>Message us</button>
            </div>
          ) : null}


          {tab === 'ai' && aiEnabled ? (
            <div className="flex h-[380px] flex-col" id="aiChat">
              <div ref={scRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
                {msgs.length === 0 ? (
                  <>
                    <p className="ai-greeting border border-line bg-bg2 px-3.5 py-3 text-[.85rem] leading-relaxed text-muted">{isBn ? aiCfg.greetingBn || aiCfg.greeting : aiCfg.greeting}</p>
                    {suggestions.length ? (
                      <div className="flex flex-wrap gap-1.5 pt-1" id="aiSuggestions">
                        {suggestions.slice(0, 4).map((s, i) => (
                          <button key={i} onClick={() => askAI(s)} className="rounded-full border border-line2 px-3 py-1.5 text-[.72rem] text-dim transition hover:border-acc hover:text-acc">{s}</button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  msgs.map((m, i) => (
                    <div key={i} className={'max-w-[92%] ' + (m.role === 'user' ? 'ml-auto' : '')}>
                      <div className={'rounded-xl px-3.5 py-2.5 text-[.85rem] leading-relaxed ' + (m.role === 'user' ? 'bg-acc/15 text-txt' : 'border border-line bg-bg2 text-txt')}>
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                      {m.products?.length ? (
                        <div className="mt-1.5 space-y-1.5">
                          {m.products.slice(0, 4).map((p) => <ProductCard key={p.slug} p={p} onOpen={(slug) => { setOpen(false); openPDP(slug); }} />)}
                        </div>
                      ) : null}
                      {m.links?.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {m.links.slice(0, 3).map((l, j) => <a key={j} href={l.url} className="rounded-full border border-acc/50 px-3 py-1 text-[.72rem] font-bold uppercase tracking-[.12em] text-acc">{l.label}</a>)}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                {aiBusy ? (
                  <div className="ai-typing flex items-center gap-1.5 px-2 py-1 text-dim">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-acc [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-acc [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-acc [animation-delay:240ms]" />
                    <span className="ml-1 text-[.72rem]">{isBn ? 'খুঁজে দেখছি…' : 'Checking the catalog…'}</span>
                  </div>
                ) : null}
                {aiErr ? <p className="px-1 text-[.78rem] text-red">{aiErr}</p> : null}
              </div>
              <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); askAI(); }} id="aiForm">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={isBn ? 'বাংলা বা English লিখুন…' : 'Ask in Bangla or English…'} aria-label="Ask the AI assistant"
                  className="min-w-0 flex-1 border border-line2 bg-bg px-3 py-2.5 text-[.85rem] text-txt outline-none focus:border-acc" id="aiInput" />
                <button type="submit" disabled={aiBusy || !input.trim()} aria-label="Send" id="aiSend"
                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-acc text-black transition hover:bg-acc2 disabled:opacity-50">
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-[18px] w-[18px] fill-current"><path d="M3.4 20.4 21.8 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
                </button>
              </form>
            </div>
          ) : null}


          {tab === 'contact' || !aiEnabled ? (
            <div className="px-4 py-4">
              <p className="chat-greeting border border-line bg-bg2 px-3.5 py-3 text-[.85rem] leading-relaxed text-muted" id="chatGreeting">{(isBn && cfg?.greetingBn) ? cfg.greetingBn : (cfg?.greeting || 'Assalamu alaikum! How can we help?')}</p>

              {sent ? (
                <div className="mt-4 border border-ok/40 bg-ok/10 px-3.5 py-4 text-center" id="chatSent">
                  <p className="font-head text-[.9rem] font-bold text-ok">Message received ✓</p>
                  <p className="mt-1.5 text-[.82rem] text-muted">Our team replies here and on your contact — usually within an hour (9am–10pm).</p>
                  <button className="mt-3 font-cond text-[.78rem] uppercase tracking-[.18em] text-acc hover:underline" id="chatAgain" onClick={() => { setSent(false); setForm({ name: '', message: '' }); }}>Send another</button>
                </div>
              ) : (
                <form className="mt-4 space-y-3" id="chatForm" onSubmit={submit}>
                  <input id="chatName" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" aria-label="Your name"
                    className="w-full border border-line2 bg-bg px-3.5 py-2.5 text-[.9rem] text-txt outline-none focus:border-acc" />
                  <textarea id="chatMsg" rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="Type your question…" aria-label="Your message"
                    className="w-full border border-line2 bg-bg px-3.5 py-2.5 text-[.9rem] text-txt outline-none focus:border-acc" />
                  {err ? <p className="text-[.8rem] text-red" id="chatErr">{err}</p> : null}
                  <button type="submit" id="chatSend" disabled={busy}
                    className="w-full bg-acc py-3 font-head text-[.75rem] font-extrabold uppercase tracking-[.2em] text-black transition hover:bg-acc2 disabled:opacity-60">
                    {busy ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              )}

              {/*direct channels — admin-managed WhatsApp / Telegram*/}
              {waHref || tgHref ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 font-cond text-[.7rem] uppercase tracking-[.2em] text-dim">Or chat directly</p>
                  <div className="flex gap-2">
                    {waHref ? (
                      <a href={waHref} target="_blank" rel="noopener noreferrer" id="waLink" className="flex flex-1 items-center justify-center gap-2 border border-[#25D366]/50 px-3 py-2.5 font-cond text-[.78rem] font-bold uppercase tracking-[.12em] text-[#25D366] transition hover:bg-[#25D366]/10">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.5-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.3.7-.2.3.1 1.6.8 1.9.9.3.2.5.2.5.3.1.1.1.7-.1 1.4z" /></svg>
                        WhatsApp
                      </a>
                    ) : null}
                    {tgHref ? (
                      <a href={tgHref} target="_blank" rel="noopener noreferrer" id="tgLink" className="flex flex-1 items-center justify-center gap-2 border border-[#229ED9]/50 px-3 py-2.5 font-cond text-[.78rem] font-bold uppercase tracking-[.12em] text-[#229ED9] transition hover:bg-[#229ED9]/10">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M21.9 4.6c.3-1.2-.9-2.2-2-1.7L2.7 9.6c-1.2.5-1.1 2.2.1 2.6l4.4 1.4 1.7 5.4c.3 1.1 1.7 1.4 2.5.6l2.4-2.4 4.5 3.3c.9.7 2.2.2 2.5-.9l3.1-15z" /></svg>
                        Telegram
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2.5">
        {waHref && !open ? (
          <a href={waHref} target="_blank" rel="noopener noreferrer" id="waBtn" aria-label="Chat on WhatsApp" title="WhatsApp"
            className="grid h-11 w-11 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/50 transition-transform hover:scale-110">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.5-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.3.7-.2.3.1 1.6.8 1.9.9.3.2.5.2.5.3.1.1.1.7-.1 1.4z" /></svg>
          </a>
        ) : null}
        {tgHref && !open ? (
          <a href={tgHref} target="_blank" rel="noopener noreferrer" id="tgBtn" aria-label="Chat on Telegram" title="Telegram"
            className="grid h-11 w-11 place-items-center rounded-full bg-[#229ED9] text-white shadow-lg shadow-black/50 transition-transform hover:scale-110">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M21.9 4.6c.3-1.2-.9-2.2-2-1.7L2.7 9.6c-1.2.5-1.1 2.2.1 2.6l4.4 1.4 1.7 5.4c.3 1.1 1.7 1.4 2.5.6l2.4-2.4 4.5 3.3c.9.7 2.2.2 2.5-.9l3.1-15z" /></svg>
          </a>
        ) : null}
        <button id="chatBtn" aria-label={open ? 'Close chat' : 'Open chat — AI assistant & live chat'} title={aiEnabled ? 'AI Assistant & Live Chat' : 'Live chat'}
          onClick={() => setOpen((o) => !o)}
          className={'relative grid h-13 w-13 h-[52px] w-[52px] place-items-center rounded-full shadow-lg shadow-black/50 transition-transform hover:scale-110 ' + (open ? 'bg-panel2 text-acc border border-line' : 'bg-acc text-black')}>
          {open ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 5l14 14M19 5L5 19" /></svg>
          ) : aiEnabled ? (
            /* sparkle-bot glyph when the AI is on */
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="8" width="16" height="11" rx="2.5" /><circle cx="9" cy="13.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="13.5" r="1.3" fill="currentColor" stroke="none" /><path d="M12 8V5M9 5h6" /><path d="M19.5 3.5l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" fill="currentColor" stroke="none" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5.5 w-5.5 h-[22px] w-[22px] fill-current"><path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.2 1 4.2 2.7 5.6-.1 1-.5 2.4-1.5 3.4 0 0 2.6-.2 4.5-1.5 1.1.4 2.3.6 3.5.6 5.1 0 9.2-3.6 9.2-8.1S17.1 3 12 3z" /></svg>
          )}
          {aiEnabled && !open ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-panel bg-ok" aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
}
