/*ArixGear — "launching" panel for registered routes that ship in a later phase (see src/routes.jsx). Deliberately honest: says what it is, when it lands, and offers the live catalog paths instead of pretending to be a page.*/
import { Link } from 'react-router-dom';
import { PHASE_LABEL } from '../routes.jsx';

export default function SoonPage({ route }) {
  const label = PHASE_LABEL[route.phase] || 'an upcoming sprint';
  return (
    <section className="page py-24" id="page-soon">
      <div className="container mx-auto w-[92%] max-w-2xl text-center">
        <p className="font-cond text-[.82rem] font-semibold uppercase tracking-[.45em] text-acc">arixgear.tech</p>
        <h1 className="mt-4 font-disp text-[clamp(2rem,5vw,3.2rem)] uppercase leading-[.98] text-txt">
          {route.label}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[.95rem] leading-relaxed text-muted">
          This page is part of the conversion roadmap and ships in {label}. The catalog, cart and
          checkout are fully live right now.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/shop" className="bg-acc px-6 py-3 font-head text-[.78rem] font-extrabold uppercase tracking-[.18em] text-black transition hover:bg-acc2">Shop the catalog</Link>
          <Link to="/" className="border border-line px-6 py-3 font-head text-[.78rem] font-extrabold uppercase tracking-[.18em] text-silver transition hover:border-line2 hover:text-txt">Back home</Link>
        </div>
        <p className="mt-10 font-cond text-[.78rem] uppercase tracking-[.25em] text-dim">route registered · building soon</p>
      </div>
    </section>
  );
}
