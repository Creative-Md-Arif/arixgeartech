/*shared display helpers: outline display title + section head*/
export function OutlineTitle({ text }) {
  /*port of legacy outlineTitle(): last word of every line gets the outline stroke*/
  const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  return (
    <>
      {lines.map((ln, i) => {
        const w = ln.split(' ');
        const last = w.pop();
        return (
          <span key={i} className="block">
            {w.length ? w.join(' ') + ' ' : ''}
            <span className="text-outline">{last}</span>
          </span>
        );
      })}
    </>
  );
}

export function SectionHead({ eyebrow, title, desc, right }) {
  return (
    <div className="sec-head mb-10 flex flex-col items-start gap-4 md:mb-[3.2rem] md:flex-row md:items-end md:justify-between md:gap-10">
      <div>
        <p className="eyebrow flex items-center gap-3 font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">
          <i className="not-italic h-0.5 w-9 flex-none bg-acc" />
          {eyebrow}
        </p>
        <h2 className="sec-title mt-[1.1rem] font-disp uppercase leading-[.96] tracking-[.01em] text-[clamp(2.4rem,5vw,4.1rem)]">{title}</h2>
      </div>
      {desc ? <p className="sec-desc max-w-[420px] pb-2 text-[.95rem] text-muted">{desc}</p> : null}
      {right || null}
    </div>
  );
}
